import { randomBytes } from 'node:crypto';

const DEFAULT_BASE = 'http://127.0.0.1:18090';
const ACTOR = 'chatgpt-local';
const EVENT_TYPES = new Set(['STEP_STARTED', 'STEP_COMPLETED', 'ASSERTION_PASSED',
  'ASSERTION_FAILED', 'LOG', 'NOTE', 'HEARTBEAT', 'CHECKPOINT', 'WAITING_HUMAN']);
const SENSITIVE = /(password|passwd|secret|token|authorization|cookie|credential|private.?key|api.?key)/i;
const ASSIGNMENT = /(\b(?:password|passwd|secret|access_token|token|authorization|cookie|api_key)\b\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi;
const BEARER = /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi;

export function safeBase(raw = DEFAULT_BASE) {
  const url = new URL(raw);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' ||
      url.username || url.password || url.pathname !== '/' ||
      url.search || url.hash || !url.port || !/^\d{2,5}$/.test(url.port)) {
    throw new Error('仅允许通过 HTTP 连接 127.0.0.1 的明确端口');
  }
  return url.origin;
}
function id(value, label) {
  if (!/^[1-9]\d{0,14}$/.test(String(value || '')) ||
      !Number.isSafeInteger(Number(value))) {
    throw new Error(label + ' 必须为正整数');
  }
  return Number(value);
}
function scrubText(input, max = 2000) {
  if (input == null) return '';
  return String(input).slice(0, max).replace(BEARER, 'Bearer [REDACTED]')
    .replace(ASSIGNMENT, '$1[REDACTED]');
}
function scrubValue(input, depth = 0) {
  if (depth > 6) return '[TRUNCATED]';
  if (typeof input === 'string') return scrubText(input, 8000);
  if (Array.isArray(input)) return input.slice(0, 100).map(x => scrubValue(x, depth + 1));
  if (input && typeof input === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(input).slice(0, 100)) {
      result[key] = SENSITIVE.test(key) ? '[REDACTED]' : scrubValue(value, depth + 1);
    }
    return result;
  }
  return input;
}
function current(detail, taskId, executionId, taskState, executionState) {
  const task = detail?.task;
  const latest = detail?.executions?.[0];
  if (!task || Number(task.id) !== taskId || task.taskType !== 'EXECUTE_CASE' ||
      !latest || Number(latest.id) !== executionId ||
      Number(latest.taskId) !== taskId ||
      latest.runnerType !== 'CHATGPT' || latest.executionMode !== 'AI') {
    throw new Error('任务/执行 ID 与最新 ChatGPT 执行记录不匹配，请刷新队列');
  }
  if (String(task.environmentType || '').toUpperCase() === 'PROD') {
    throw new Error('禁止通过本工具操作生产环境任务');
  }
  if (taskState && task.taskStatus !== taskState) {
    throw new Error('任务状态已改变：' + scrubText(task.taskStatus, 50));
  }
  if (executionState && latest.executionStatus !== executionState) {
    throw new Error('执行记录状态已改变：' + scrubText(latest.executionStatus, 50));
  }
  return { task, latest };
}
async function readCheckpointFromStdin(stream = process.stdin) {
  let value = ''
  for await (const chunk of stream) {
    value += chunk.toString('utf8')
    if (Buffer.byteLength(value, 'utf8') > 50000) {
      throw new Error('标准输入检查点超过 50KB 上限')
    }
  }
  return value.trim()
}
function snapshotOf(execution) {
  if (execution.requestSnapshot && typeof execution.requestSnapshot === 'object') {
    return execution.requestSnapshot;
  }
  try { return JSON.parse(execution.requestSnapshotJson || '{}'); }
  catch { throw new Error('任务快照 JSON 损坏，禁止执行'); }
}
function safeSummary(task, execution) {
  return {
    taskId: Number(task.id), executionId: Number(execution.id),
    taskNo: scrubText(task.taskNo, 100),
    taskStatus: task.taskStatus, executionStatus: execution.executionStatus,
    runnerType: execution.runnerType, environmentType: task.environmentType,
    caseNo: scrubText(snapshotOf(execution)?.caseSnapshot?.caseNo, 100)
  };
}
async function http(base, path, method = 'GET', payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(base + path, {
      method, redirect: 'manual', signal: controller.signal,
      headers: { accept: 'application/json', ...(payload ? { 'content-type': 'application/json' } : {}) },
      ...(payload ? { body: JSON.stringify(payload) } : {})
    });
    if (response.status >= 300 && response.status < 400) {
      throw new Error('服务端返回重定向，已拒绝跟随');
    }
    const raw = await response.text();
    let body;
    try { body = raw ? JSON.parse(raw) : null; }
    catch { throw new Error('后端返回非 JSON 响应（HTTP ' + response.status + '）'); }
    if (!response.ok) {
      throw new Error('HTTP ' + response.status + ': ' + scrubText(body?.message || '请求失败', 220));
    }
    return body;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('本地后端响应超时，不能假定请求执行成功，请先重新检查任务');
    throw error;
  } finally { clearTimeout(timer); }
}
export async function runAiCommand(args, options = {}) {
  // The distributed CLI is fixed to the local DPM port; tests may inject a loopback mock.
  const base = safeBase(options.baseUrl || DEFAULT_BASE);
  const [action, taskArg, executionArg, ...rest] = args;
  if (action === 'queue') {
    const entries = await http(base, '/api/execution-tasks/claimable/chatgpt?limit=20');
    if (!Array.isArray(entries)) throw new Error('队列格式不正确');
    return { count: entries.length, tasks: entries.map(item =>
      safeSummary(item.task || {}, item.execution || {})) };
  }
  if (!['inspect', 'status', 'plan', 'start', 'event', 'checkpoint', 'heartbeat',
       'human', 'complete'].includes(action)) {
    throw new Error('用法：queue | inspect TASK_ID | status TASK_ID | plan TASK_ID EXEC_ID | start TASK_ID EXEC_ID | event TASK_ID EXEC_ID TYPE KEY CONTENT | checkpoint TASK_ID EXEC_ID KEY JSON | heartbeat TASK_ID EXEC_ID | human TASK_ID EXEC_ID KEY REASON | complete TASK_ID EXEC_ID RESULT ACTUAL_RESULT');
  }
  const taskId = id(taskArg, 'TASK_ID');
  const taskPath = '/api/execution-tasks/' + taskId;
  const detail = await http(base, taskPath);
  if (action === 'status') {
    const latest = detail?.executions?.[0];
    return { taskId, taskNo: scrubText(detail.task?.taskNo, 100),
      taskStatus: detail.task?.taskStatus, latestExecutionId: latest?.id,
      executionStatus: latest?.executionStatus, attemptNo: latest?.attemptNo,
      result: latest?.result || null,
      eventCount: Array.isArray(latest?.events) ? latest.events.length : 0 };
  }
  if (action === 'plan') {
    // Read-only recovery preflight: never mutate or auto-replay an unfinished task.
    const executionId = id(executionArg, 'EXEC_ID');
    const { task, latest } = current(detail, taskId, executionId);
    const snapshot = snapshotOf(latest);
    if (!snapshot || Array.isArray(snapshot) || typeof snapshot !== 'object') {
      throw new Error('任务快照不存在或已损坏');
    }
    let checkpoint = null;
    if (latest.checkpointJson) {
      try { checkpoint = JSON.parse(latest.checkpointJson); }
      catch { throw new Error('检查点 JSON 已损坏，禁止自动继续'); }
      if (!checkpoint || Array.isArray(checkpoint) || typeof checkpoint !== 'object') {
        throw new Error('检查点格式异常，禁止自动继续');
      }
    }
    const previousInterrupted = detail.executions.slice(1)
      .some(x => x.executionStatus === 'INTERRUPTED');
    let nextAction = 'STOP';
    if (task.taskStatus === 'RUNNING' && latest.executionStatus === 'RUNNING') {
      nextAction = 'CONTINUE_RUNNING';
    } else if (task.taskStatus === 'PENDING' && latest.executionStatus === 'QUEUED' &&
        Number(latest.attemptNo) > 1 && checkpoint && previousInterrupted) {
      nextAction = 'START_RECOVERED';
    } else if (task.taskStatus === 'RECOVERY_REQUIRED' &&
        latest.executionStatus === 'INTERRUPTED') {
      nextAction = 'MANUAL_RECOVERY';
    }
    const events = Array.isArray(latest.events) ? latest.events : [];
    return { ...safeSummary(task, latest), attemptNo: latest.attemptNo,
      nextAction, hasCheckpoint: Boolean(checkpoint),
      checkpoint: scrubValue(checkpoint),
      events: events.slice(-12).map(e => ({
        eventType: scrubText(e.eventType, 50),
        eventKey: scrubText(e.eventKey, 80),
        eventContent: scrubText(e.eventContent, 800)
      })),
      note: nextAction === 'CONTINUE_RUNNING' ? '继续当前执行，禁止重复 start 或盲目重放业务步骤' :
        nextAction === 'START_RECOVERED' ? '新尝试可 start，之后检查继承的检查点再继续' :
        nextAction === 'MANUAL_RECOVERY' ? '必须由用户人工恢复后重新获取新的 executionId' :
        '当前状态不可继续，不得写入任务' };
  }
  if (action === 'inspect') {
    if (detail?.task?.taskType !== 'EXECUTE_CASE') throw new Error('只能检查单用例任务');
    const latest = detail?.executions?.[0];
    const { task } = current(detail, taskId, Number(latest?.id));
    const snapshot = snapshotOf(latest);
    const testCase = snapshot?.caseSnapshot || {};
    const env = snapshot?.environmentSnapshot || {};
    return { ...safeSummary(task, latest),
      attemptNo: latest.attemptNo, result: latest.result || null,
      checkpoint: scrubValue(latest.checkpointJson ? JSON.parse(latest.checkpointJson) : null),
      case: scrubValue(Object.fromEntries(['title','testType','steps','testData',
        'preconditions','aiInstruction','expectedResult'].map(k => [k, testCase[k]]))),
      environment: { environmentType: env.environmentType,
        baseUrl: scrubText(env.baseUrl, 300), apiBaseUrl: scrubText(env.apiBaseUrl, 300),
        authType: env.authType } };
  }
  const executionId = id(executionArg, 'EXEC_ID');
  const executing = action !== 'start';
  current(detail, taskId, executionId,
    executing ? 'RUNNING' : 'PENDING', executing ? 'RUNNING' : 'QUEUED');
  const execPath = taskPath + '/executions/' + executionId;
  if (action === 'start') {
    await http(base, execPath + '/start', 'POST',
      { actor: 'CHATGPT', executorName: ACTOR });
  } else if (action === 'complete') {
    const [result, ...pieces] = rest;
    if (!['PASS','FAIL','BLOCKED','SKIPPED'].includes(result)) {
      throw new Error('RESULT 必须为 PASS/FAIL/BLOCKED/SKIPPED');
    }
    const actualResult = scrubText(pieces.join(' '), 9500);
    if (actualResult.trim().length < 8) throw new Error('必须提供真实执行观察证据（至少 8 字符）');
    await http(base, execPath + '/complete', 'POST',
      { result, actualResult, executorName: ACTOR });
  } else {
    let eventType, eventKey, content, eventDataJson;
    if (action === 'heartbeat') {
      if (rest.length) throw new Error('heartbeat 不接受附加参数');
      eventType = 'HEARTBEAT';
      eventKey = 'hb-' + Date.now() + '-' + randomBytes(4).toString('hex');
      content = 'ChatGPT execution heartbeat';
    } else if (action === 'checkpoint') {
      [eventKey] = rest;
      const raw = rest.slice(1).join(' ');
      // PowerShell alters quoted native-command arguments; '-' reads JSON from stdin exactly.
      const data = raw === '-' ? await readCheckpointFromStdin(options.stdin) : raw;
      if (data.length < 2 || data.length > 50000) throw new Error('CHECKPOINT JSON 长度不正确');
      let parsed;
      try { parsed = JSON.parse(data); }
      catch { throw new Error('CHECKPOINT 必须是合法 JSON'); }
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        throw new Error('CHECKPOINT 必须为 JSON 对象');
      }
      eventType = 'CHECKPOINT';
      eventDataJson = JSON.stringify(scrubValue(parsed));
      content = 'Progress checkpoint';
    } else if (action === 'human') {
      [eventKey] = rest;
      eventType = 'WAITING_HUMAN';
      content = scrubText(rest.slice(1).join(' '), 3500);
    } else {
      [eventType,eventKey] = rest;
      content = scrubText(rest.slice(2).join(' '), 3500);
    }
    if (!EVENT_TYPES.has(eventType)) throw new Error('事件类型不支持');
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(String(eventKey || ''))) {
      throw new Error('eventKey 只能为 1-64 位字母、数字、下划线、点或连字符');
    }
    if (eventType !== 'HEARTBEAT' && (!content || content.length < 4)) {
      throw new Error('事件内容至少需要 4 个字符');
    }
    await http(base, execPath + '/events', 'POST',
      { eventType, eventKey, eventContent: content, eventDataJson, createdBy: ACTOR });
  }
  const updated = await http(base, taskPath);
  if (!updated?.task || !Array.isArray(updated?.executions)) throw new Error('无法验证操作后的状态');
  const latest = updated.executions[0];
  if (Number(latest?.id) !== executionId) throw new Error('执行记录已变化，请检查并停止操作');
  if (action === 'start' && updated.task.taskStatus !== 'RUNNING') {
    throw new Error('开始接口已返回，但任务状态并非 RUNNING');
  }
  if (action === 'complete' && latest.executionStatus !== 'COMPLETED') {
    throw new Error('完成接口已返回，但执行状态并非 COMPLETED');
  }
  return { operation: action, ...safeSummary(updated.task, latest),
    eventCount: Array.isArray(latest.events) ? latest.events.length : 0,
    result: latest.result || null };
}
