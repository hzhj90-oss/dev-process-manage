// Copy-only handoff. No credentials, raw snapshots, or automatic task claiming.
export function buildAiExecutionPrompt(item) {
  const task = item?.task
  const execution = item?.execution
  const snapshot = execution?.requestSnapshot
  const taskId = Number(task?.id)
  const executionId = Number(execution?.id)
  if (!Number.isSafeInteger(taskId) || taskId <= 0 ||
      !Number.isSafeInteger(executionId) || executionId <= 0 ||
      task?.taskType !== 'EXECUTE_CASE' || task?.taskStatus !== 'PENDING' ||
      execution?.runnerType !== 'CHATGPT' || execution?.executionMode !== 'AI' ||
      execution?.executionStatus !== 'QUEUED' || !snapshot ||
      Number(execution?.taskId) !== taskId ||
      String(task?.environmentType || '').toUpperCase() === 'PROD') {
    throw new Error('当前任务不是可执行的 ChatGPT 待执行用例，请刷新队列')
  }
  const base = 'http://127.0.0.1:18090'
  const caseNo = String(snapshot.caseSnapshot?.caseNo || '').slice(0, 100)
  const title = String(snapshot.caseSnapshot?.title || '').slice(0, 160)
  const cycleId = Number(task?.cycleId)
  return [
    '请使用已连接的本地工具执行开发管理系统 DPM 的一条 ChatGPT 测试用例。',
    '这是实际执行并回写结果的任务，不是仅编写测试方案。',
    '',
    '队列标识（仅供定位，任务尚未领取）：',
    `- taskId: ${taskId}`,
    `- executionId: ${executionId}`,
    `- cycleId: ${Number.isSafeInteger(cycleId) ? cycleId : '未知'}`,
    `- caseNo: ${caseNo || '未提供'}`,
    `- title: ${title || '未提供'}`,
    '',
    '推荐使用已经通过本地回归测试的任务工具（在连接的 T14s 终端中执行），避免手工拼接 HTTP JSON：',
    'node D:\\code\\dev-process-manager\\scripts\\chatgpt-task.mjs inspect ' + taskId,
    'node D:\\code\\dev-process-manager\\scripts\\chatgpt-task.mjs start ' + taskId + ' ' + executionId,
    '执行中每个步骤：node D:\\code\\dev-process-manager\\scripts\\chatgpt-task.mjs event ' + taskId + ' ' + executionId + ' STEP_STARTED step-1 "开始步骤"',
    '步骤完成时记录 STEP_COMPLETED / ASSERTION_PASSED / ASSERTION_FAILED，并为每次事件提供不同的 eventKey。',
    '长时间执行时（不要超过 5 分钟未联系）：node D:\\code\\dev-process-manager\\scripts\\chatgpt-task.mjs heartbeat ' + taskId + ' ' + executionId,
    '需要人工确认时：node D:\\code\\dev-process-manager\\scripts\\chatgpt-task.mjs human ' + taskId + ' ' + executionId + ' human-1 "请人工核对业务副作用"',
    '实际完成后：node D:\\code\\dev-process-manager\\scripts\\chatgpt-task.mjs complete ' + taskId + ' ' + executionId + ' PASS "实际观察到的测试证据"',
    '最终核对：node D:\\code\\dev-process-manager\\scripts\\chatgpt-task.mjs status ' + taskId,
    'CHECKPOINT 使用 checkpoint TASK_ID EXEC_ID 唯一事件键 JSON对象。Windows PowerShell 推荐先用 ConvertTo-Json -Compress 生成 JSON，再通过管道传给 checkpoint 命令最后一个参数“-”（标准输入），不要手写带引号的 JSON 参数。',
    '禁止记录凭据。接口超时先用 status 查询最新状态，不要盲目重复执行有副作用的业务操作。',
    '',
    '后端执行协议说明（当本地命令工具不可用时参考，不能绕过状态检查）：',
    `1. GET ${base}/api/execution-tasks/${taskId}，核对 taskStatus=PENDING、taskType=EXECUTE_CASE、最新 executionId=${executionId}、executionStatus=QUEUED、runnerType=CHATGPT。状态有变化则停止。`,
    '2. 阅读最新执行记录 requestSnapshot 中的用例、环境、步骤、AI 指令和预期结果。仅访问明确授权的非生产环境。工具无法连接本机时说明阻塞，不要编造执行。',
    `3. POST ${base}/api/execution-tasks/${taskId}/executions/${executionId}/start，JSON={"actor":"CHATGPT","executorName":"chatgpt-local"}。若发生冲突，重新核对任务，不能强行领取。`,
    `4. 逐步执行并 POST ${base}/api/execution-tasks/${taskId}/executions/${executionId}/events，写入 STEP_STARTED、STEP_COMPLETED、ASSERTION_PASSED 或 ASSERTION_FAILED，必须提供唯一 eventKey、eventType、eventContent 和 createdBy=chatgpt-local。日志不得包含凭据或其他敏感数据。`,
    '5. 耗时步骤可用 CHECKPOINT 事件保存无敏感信息的进度 JSON；如需要人工确认或存在重复操作风险，记录 WAITING_HUMAN 并停止，不要自动继续。',
    `6. POST ${base}/api/execution-tasks/${taskId}/executions/${executionId}/complete，JSON={"result":"PASS或FAIL或BLOCKED或SKIPPED","actualResult":"真实观察结果","logExcerpt":"脱敏执行日志","executorName":"chatgpt-local"}。仅依实际证据判定结果，不要伪造。`,
    '7. 再次 GET 任务详情，确认事件和结果确实保存；失败时明确报告真实状态。',
    '',
    '只处理这一条任务。不要自动执行队列中的其他任务。'
  ].join('\n')
}
export function summarizeAiTask(item) {
  const caseSnapshot = item?.execution?.requestSnapshot?.caseSnapshot || {}
  return {
    caseNo: typeof caseSnapshot.caseNo === 'string' ? caseSnapshot.caseNo : '—',
    title: typeof caseSnapshot.title === 'string' ? caseSnapshot.title : '未命名用例',
    expected: typeof item?.execution?.expectedResultSnapshot === 'string'
      ? item.execution.expectedResultSnapshot : '—'
  }
}
