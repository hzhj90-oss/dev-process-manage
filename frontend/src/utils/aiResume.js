// Read-only continuation guidance. Never embed snapshots, events or credentials in prompts.
const positiveId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0

function hasValidCheckpoint(value) {
  if (!value) return false
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
  } catch { return false }
}
function hasSnapshot(execution) {
  if (execution.requestSnapshot && typeof execution.requestSnapshot === 'object') return true
  try {
    const parsed = JSON.parse(execution.requestSnapshotJson || '')
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
  } catch { return false }
}
export function aiContinuationState(detail) {
  const task = detail?.task
  const executions = detail?.executions
  const latest = executions?.[0]
  if (!task || !Array.isArray(executions) || !latest ||
      !positiveId(task.id) || !positiveId(latest.id) ||
      Number(latest.taskId) !== Number(task.id) ||
      task.taskType !== 'EXECUTE_CASE' ||
      latest.runnerType !== 'CHATGPT' || latest.executionMode !== 'AI' ||
      String(task.environmentType || '').toUpperCase() === 'PROD' ||
      !hasSnapshot(latest)) return null
  const checkpoint = hasValidCheckpoint(latest.checkpointJson)
  let mode = null
  if (task.taskStatus === 'RUNNING' && latest.executionStatus === 'RUNNING') {
    mode = 'CONTINUE_RUNNING'
  } else if (task.taskStatus === 'PENDING' && latest.executionStatus === 'QUEUED' &&
             Number(latest.attemptNo) > 1 && checkpoint &&
             executions.slice(1).some(item => item.executionStatus === 'INTERRUPTED')) {
    mode = 'START_RECOVERED'
  } else if (task.taskStatus === 'RECOVERY_REQUIRED' &&
             latest.executionStatus === 'INTERRUPTED') {
    mode = 'MANUAL_RECOVERY'
  }
  return mode ? { mode, taskId: Number(task.id), executionId: Number(latest.id),
    attemptNo: Number(latest.attemptNo), hasCheckpoint: checkpoint } : null
}

export function buildAiContinuationPrompt(detail) {
  const info = aiContinuationState(detail)
  if (!info) throw new Error('任务当前不支持安全续执行，请刷新并检查任务状态')
  const { mode, taskId, executionId, hasCheckpoint } = info
  const cli = 'node D:\\code\\dev-process-manager\\scripts\\chatgpt-task.mjs'
  const lines = [
    '请接手开发管理系统的一条已有 ChatGPT 测试任务。只处理此任务，不自动处理其他队列。',
    '这是一份断点续执行指引，不是重新执行用例。必须先通过 T14s 本地连接查看实时状态。',
    `taskId: ${taskId}`, `executionId: ${executionId}`,
    `${cli} status ${taskId}`,
    `${cli} plan ${taskId} ${executionId}`,
    `${cli} inspect ${taskId}`,
    '核对最新 executionId、执行模式、环境、不可变快照、检查点以及全部必要的历史事件。不要凭旧的聊天内容直接重做步骤。',
    '检查点和历史事件只能作为线索；对有副作用的步骤必须核实外部实际结果，无法确认则暂停并要求人工确认。',
    '严禁将凭据、令牌、原始快照、敏感检查点复制到聊天或提交到执行日志。',
    '在执行中持续写步骤事件、检查点和心跳（间隔不得超过 5 分钟）；只有取得真实证据才能完成 PASS/FAIL。',
    '遇到状态改变、最新执行 ID 不匹配、超时或者人工介入，立刻停止写入并重新检查状态。'
  ]
  if (mode === 'CONTINUE_RUNNING') {
    lines.push('当前是 RUNNING 的同一次执行：绝对不要再次调用 start，也不要自动重新执行已完成步骤。')
    lines.push(hasCheckpoint ? '存在检查点；结合历史事件与外部状态核对下一未完成步骤。' :
      '没有可用检查点；必须先重建真实执行进度，无法确认则请求人工核对。')
  } else if (mode === 'START_RECOVERED') {
    lines.push('当前是人工恢复后新建的 QUEUED 尝试；旧执行已中断，新 executionId 已变更。')
    lines.push('确认 plan 显示 START_RECOVERED 后，才调用：')
    lines.push(`${cli} start ${taskId} ${executionId}`)
    lines.push('开始成功后从继承的检查点核对继续，不能直接重放之前已经成功的有副作用操作。')
  } else {
    lines.push('当前为 RECOVERY_REQUIRED / INTERRUPTED：禁止调用旧 executionId 的 start、event、complete。')
    lines.push('须由用户在执行任务页进行人工恢复（明确阅读重复执行风险并输入“恢复”）。')
    lines.push('恢复后会生成新 executionId；请重新查询最新记录，再生成新的续执行指令。现在停止执行。')
  }
  return lines.join('\n')
}
