import { hostname } from 'node:os';
import { executeNodeScript } from './sandbox.mjs';

const managerUrl = (process.env.DPM_MANAGER_URL || 'http://127.0.0.1:18090').replace(/\/+$/, '');
const runnerId = process.env.DPM_RUNNER_ID || ('node-' + hostname().toLowerCase());
const runnerToken = process.env.DPM_RUNNER_TOKEN || '';
const pollIntervalMs = Number(process.env.DPM_RUNNER_POLL_MS || 2000);
const heartbeatIntervalMs = 15000;
const scriptTimeoutMs = 5000;
let stopping = false;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function redact(value) {
  return String(value ?? '')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/((?:password|passwd|token|authorization|cookie|secret|api[_-]?key|credential)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[REDACTED]')
    .replace(/([?&](?:access_token|refresh_token|token|api_key|secret)=)[^&\s]+/gi, '$1[REDACTED]');
}

function log(level, message, details = '') {
  const suffix = details ? ' ' + redact(details) : '';
  process.stdout.write(new Date().toISOString() + ' [' + level + '] '
    + redact(message) + suffix + String.fromCharCode(10));
}

async function apiRequest(path, body, headers = {}) {
  const response = await fetch(managerUrl + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  });
  const text = await response.text();
  let payload = {};
  if (text) {
    try { payload = JSON.parse(text); }
    catch { throw new Error('Runner API returned non-JSON HTTP ' + response.status); }
  }
  if (!response.ok) {
    const message = payload.message || payload.error || 'HTTP ' + response.status;
    throw new Error('Runner API ' + path + ' failed: ' + String(message).slice(0, 300));
  }
  return payload;
}

function leaseHeaders(job) {
  return {
    'X-DPM-Runner-Id': job.runnerId,
    'X-DPM-Lease-Token': job.leaseToken
  };
}

async function claimTask() {
  return apiRequest('/api/runner/claim', {
    runnerId,
    runnerType: 'NODE'
  }, { 'X-DPM-Runner-Token': runnerToken });
}

async function sendEvent(job, eventType, eventKey, eventContent, eventData = null) {
  return apiRequest('/api/runner/tasks/' + job.task.id + '/events', {
    eventKey,
    eventType,
    eventContent: redact(eventContent).slice(0, 2000),
    eventDataJson: eventData == null ? null : JSON.stringify(eventData),
    createdBy: job.runnerId
  }, leaseHeaders(job));
}

async function heartbeat(job) {
  return apiRequest('/api/runner/tasks/' + job.task.id + '/heartbeat', {}, leaseHeaders(job));
}

async function complete(job, result, actualResult, logExcerpt, errorMessage = null) {
  return apiRequest('/api/runner/tasks/' + job.task.id + '/complete', {
    result,
    actualResult: String(actualResult ?? '').slice(0, 10000),
    logExcerpt: redact(logExcerpt ?? '').slice(0, 20000),
    errorMessage: errorMessage == null ? null : redact(errorMessage).slice(0, 4000),
    executorName: job.runnerId
  }, leaseHeaders(job));
}

async function fail(job, errorMessage, logExcerpt = '') {
  return apiRequest('/api/runner/tasks/' + job.task.id + '/fail', {
    errorMessage: redact(errorMessage).slice(0, 4000),
    logExcerpt: redact(logExcerpt).slice(0, 20000)
  }, leaseHeaders(job));
}

function buildScriptInput(job, snapshot, script) {
  const environmentSnapshot = snapshot.environmentSnapshot ?? {};
  return {
    cycleId: snapshot.cycleId ?? job.task.cycleId ?? null,
    cycleCaseId: snapshot.cycleCaseId ?? job.task.cycleCaseId ?? null,
    codeVersion: snapshot.codeVersion ?? job.task.codeVersion ?? null,
    case: snapshot.caseSnapshot ?? {},
    environment: {
      code: job.task.environmentCode ?? null,
      name: job.task.environmentName ?? null,
      type: job.task.environmentType ?? environmentSnapshot.environmentType ?? null
    },
    args: script.arguments ?? {}
  };
}

async function executeClaimed(payload) {
  const job = {
    runnerId: payload.runnerId || runnerId,
    leaseToken: payload.leaseToken,
    task: payload.task,
    execution: payload.execution
  };
  const snapshot = job.execution?.requestSnapshot;
  const script = snapshot?.scriptSnapshot;
  if (!job.task?.id || !job.execution?.id || !job.leaseToken) {
    throw new Error('Claim response is missing task, execution or lease information');
  }
  if (job.execution.runnerType !== 'NODE'
      || String(script?.language).toUpperCase() !== 'NODE'
      || String(script?.sourceType).toUpperCase() !== 'INLINE'
      || typeof script?.sourceContent !== 'string') {
    await fail(job, 'Claimed task is not a supported inline NODE script');
    return;
  }

  await heartbeat(job);
  let heartbeatBusy = false;
  let leaseLost = false;
  const heartbeatTimer = setInterval(async () => {
    if (heartbeatBusy || leaseLost || stopping) return;
    heartbeatBusy = true;
    try {
      await heartbeat(job);
    } catch (error) {
      leaseLost = true;
      log('ERROR', 'Lease lost for task ' + job.task.id, error.message);
    } finally {
      heartbeatBusy = false;
    }
  }, heartbeatIntervalMs);
  heartbeatTimer.unref?.();

  const stopHeartbeats = async () => {
    clearInterval(heartbeatTimer);
    while (heartbeatBusy) await sleep(25);
  };
  const logLines = [];
  try {
    await sendEvent(job, 'STEP_STARTED', 'node-' + job.execution.id + '-started',
      'Node JavaScript 沙箱开始执行', {
        runtime: 'quickjs-wasm',
        entryPoint: script.entryPoint || 'main',
        timeoutMs: scriptTimeoutMs,
        memoryLimitBytes: 32 * 1024 * 1024
      });
    const result = await executeNodeScript({
      sourceContent: script.sourceContent,
      entryPoint: script.entryPoint || 'main',
      input: buildScriptInput(job, snapshot, script),
      timeoutMs: scriptTimeoutMs,
      memoryLimitBytes: 32 * 1024 * 1024,
      maxStackSizeBytes: 512 * 1024
    });
    if (leaseLost) return;

    for (let i = 0; i < result.logs.length; i++) {
      const item = result.logs[i];
      const line = '[' + item.level + '] ' + item.message;
      logLines.push(line);
      await sendEvent(job, 'LOG', 'node-' + job.execution.id + '-log-' + i,
        line, { level: item.level, message: item.message });
    }
    for (let i = 0; i < result.assertions.length; i++) {
      const item = result.assertions[i];
      const eventType = item.passed ? 'ASSERTION_PASSED' : 'ASSERTION_FAILED';
      const content = item.description + ': ' + (item.passed ? 'PASS' : 'FAIL');
      logLines.push(content);
      await sendEvent(job, eventType, 'node-' + job.execution.id + '-assert-' + i,
        content, item);
    }
    await sendEvent(job, 'STEP_COMPLETED', 'node-' + job.execution.id + '-completed',
      'Node JavaScript 沙箱执行结束：' + result.result, {
        result: result.result,
        durationMs: result.durationMs,
        assertionCount: result.assertions.length,
        logCount: result.logs.length,
        errorMessage: result.errorMessage
      });
    if (leaseLost) return;

    const passedCount = result.assertions.filter(item => item.passed).length;
    const failedCount = result.assertions.length - passedCount;
    // Assertion details are already persisted as individual events. Keep the
    // aggregate result compact so it always fits ExecutionCompleteRequest limits.
    const actualResult = {
      runtime: 'quickjs-wasm',
      durationMs: result.durationMs,
      assertionCount: result.assertions.length,
      passedCount,
      failedCount
    };
    await stopHeartbeats();
    await complete(job, result.result, JSON.stringify(actualResult),
      logLines.join(String.fromCharCode(10)), result.errorMessage);
    log('INFO', 'Task ' + job.task.id + ' completed',
      result.result + '; assertions=' + result.assertions.length);
  } catch (error) {
    if (leaseLost) return;
    await stopHeartbeats();
    log('ERROR', 'Task ' + job.task.id + ' execution engine error', error.message);
    try {
      await fail(job, error.message, logLines.join(String.fromCharCode(10)));
    } catch (reportError) {
      log('ERROR', 'Could not report task ' + job.task.id + ' failure', reportError.message);
    }
  } finally {
    clearInterval(heartbeatTimer);
  }
}

async function main() {
  if (runnerToken.length < 32) throw new Error('DPM_RUNNER_TOKEN is missing or too short');
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(runnerId)) throw new Error('DPM_RUNNER_ID is invalid');
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 500 || pollIntervalMs > 30000) {
    throw new Error('DPM_RUNNER_POLL_MS must be between 500 and 30000');
  }
  log('INFO', 'Node Runner started', 'id=' + runnerId + '; manager=' + managerUrl);
  while (!stopping) {
    try {
      const payload = await claimTask();
      if (!payload.claimed) {
        await sleep(pollIntervalMs);
        continue;
      }
      log('INFO', 'Claimed NODE task ' + payload.task?.id,
        'cycle=' + payload.task?.cycleId);
      await executeClaimed(payload);
    } catch (error) {
      log('ERROR', 'Node Runner polling failed', error.message);
      await sleep(5000);
    }
  }
  log('INFO', 'Node Runner stopped');
}

process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });
main().catch(error => {
  log('FATAL', error.message);
  process.exitCode = 1;
});
