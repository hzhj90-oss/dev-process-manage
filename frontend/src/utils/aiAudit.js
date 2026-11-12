// Read-only, bounded ChatGPT execution history. Never copy request snapshots or checkpoint JSON.
const positiveId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0
const safeTime = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)
  ? value.slice(0, 19).replace('T', ' ') : '—'

function safeEventType(value) {
  return typeof value === 'string' && /^[A-Z_]{2,40}$/.test(value) ? value : 'UNKNOWN'
}
function redact(value) {
  if (typeof value !== 'string') return '（无说明）'
  return value.slice(0, 240)
    .replace(/Bearer\s+[^\s,;'"]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(password|passwd|secret|token|access[_-]?token|refresh[_-]?token|api[_-]?key|authorization|cookie|credential|private[_-]?key)\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1=[REDACTED]')
    .replace(/"((?:password|passwd|secret|token|authorization|cookie|credential|apiKey|accessToken|privateKey))"\s*:\s*"[^"]*"/gi, '"$1":"[REDACTED]"')
}
export function aiAttemptAudit(detail) {
  if (detail?.task?.taskType !== 'EXECUTE_CASE' || !positiveId(detail?.task?.id) ||
      !Array.isArray(detail?.executions)) return []
  return detail.executions.filter(x => x.runnerType === 'CHATGPT' &&
    x.executionMode === 'AI' && Number(x.taskId) === Number(detail.task.id))
    .slice(0, 8).map(x => {
      const events = Array.isArray(x.events) ? x.events : []
      return {
        executionId: Number(x.id), attemptNo: Number(x.attemptNo),
        status: String(x.executionStatus || 'UNKNOWN'), result: x.result || '—',
        hasCheckpoint: Boolean(x.checkpointJson),
        eventCount: events.length,
        events: events.slice(-6).reverse().map(e => ({
          type: safeEventType(e.eventType), at: safeTime(e.createdAt),
          content: redact(e.eventContent)
        }))
      }
    }).filter(x => positiveId(x.executionId) && positiveId(x.attemptNo))
}
export function buildAiDiagnosticSummary(detail) {
  const task = detail?.task
  const attempts = aiAttemptAudit(detail)
  if (!attempts.length) throw new Error('没有可供交接的 ChatGPT 执行历史')
  const rows = [
    'DPM ChatGPT 任务诊断摘要（只读，脱敏，不等于执行授权）',
    'taskId: ' + Number(task.id),
    'taskStatus: ' + String(task.taskStatus || 'UNKNOWN'),
    'latestExecutionId: ' + attempts[0].executionId,
    '注意：必须重新读取最新状态与实际业务结果，不得根据这份摘要自动重放步骤。',
    '本摘要不包含用例快照、事件正文、检查点 JSON 或环境凭据。'
  ]
  for (const item of attempts) {
    rows.push('attempt #' + item.attemptNo + ' execution #' + item.executionId +
      ' status=' + item.status + ' result=' + item.result +
      ' checkpoint=' + (item.hasCheckpoint ? 'YES' : 'NO') +
      ' events=' + item.eventCount)
    for (const event of item.events) rows.push('  ' + event.at + ' ' + event.type)
  }
  rows.push('执行前只读核对：node D:\\code\\dev-process-manager\\scripts\\chatgpt-task.mjs status ' + Number(task.id))
  rows.push('如需继续，先运行 plan TASK_ID 最新_EXEC_ID，核对检查点及全部必要事件。')
  return rows.join('\n')
}
