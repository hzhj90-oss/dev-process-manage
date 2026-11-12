// Read-only operational alerts based on the latest ChatGPT attempt.
function ageMinutes(value, now) {
  if (!value) return null
  const epoch = Date.parse(value)
  if (!Number.isFinite(epoch) || epoch > now + 60000) return null
  return Math.max(0, Math.floor((now - epoch) / 60000))
}
export function aiAttention(detail, now = Date.now()) {
  const task = detail?.task
  const latest = detail?.executions?.[0]
  if (!task || !latest || task.taskType !== 'EXECUTE_CASE' ||
      latest.runnerType !== 'CHATGPT' || latest.executionMode !== 'AI') return null

  if (task.taskStatus === 'RECOVERY_REQUIRED' &&
      latest.executionStatus === 'INTERRUPTED') {
    return { type: 'warning', title: '任务已中断，等待人工确认恢复',
      description: '旧执行记录不可再写入；请前往执行任务页面核实步骤副作用后人工恢复，再用新执行 ID 继续。' }
  }
  if (task.taskStatus === 'WAITING_HUMAN' &&
      latest.executionStatus === 'WAITING_HUMAN') {
    const events = Array.isArray(latest.events) ? latest.events : []
    const waiting = [...events].reverse().find(e => e.eventType === 'WAITING_HUMAN')
    const age = ageMinutes(waiting?.createdAt, now)
    return { type: 'warning', title: age !== null && age >= 15
        ? `已等待人工确认约 ${age} 分钟` : '等待人工确认',
      description: '需要人工核对或批准后才能处理；不能把待确认状态当成 PASS，也不能直接重启旧 attempt。' }
  }
  if (task.taskStatus === 'RUNNING' && latest.executionStatus === 'RUNNING') {
    const age = ageMinutes(task.heartbeatAt || task.startedAt, now)
    if (age === null || age < 4) return null
    return { type: 'warning', title: age >= 5
        ? `最近心跳已超过 5 分钟（约 ${age} 分钟）`
        : `最近心跳约 ${age} 分钟前，接近超时阈值`,
      description: '请先检查真实任务状态。超过 5 分钟时恢复调度会尝试标记待恢复；不要在新会话盲目重新开始。' }
  }
  return null
}
