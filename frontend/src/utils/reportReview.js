// Shared metadata-only navigation policy between report triage and task details.
export function positiveId(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const text = String(value)
  if (!/^[1-9]\d{0,14}$/.test(text)) return null
  const id = Number(text)
  return Number.isSafeInteger(id) ? id : null
}

export function readReviewTarget(query) {
  if (!query || typeof query !== 'object') return null
  const cycleId = positiveId(query.cycleId)
  const taskId = positiveId(query.taskId)
  const cycleCaseId = query.cycleCaseId == null ? null : positiveId(query.cycleCaseId)
  if (!cycleId || !taskId || (query.cycleCaseId != null && !cycleCaseId)) return null
  return { cycleId, taskId, cycleCaseId }
}

export function matchesReviewTask(task, target) {
  if (!task || !target || task.taskType !== 'EXECUTE_CASE') return false
  if (positiveId(task.id) !== target.taskId
    || positiveId(task.cycleId) !== target.cycleId) return false
  return target.cycleCaseId == null || positiveId(task.cycleCaseId) === target.cycleCaseId
}

export function filteredReviewRows(rows, filter) {
  const values = Array.isArray(rows) ? rows : []
  if (filter === 'ALL') return values
  if (filter === 'ISSUES') return values.filter(row => ['FAIL', 'BLOCKED'].includes(row.latestResult))
  if (['PASS', 'FAIL', 'BLOCKED', 'SKIPPED', 'NOT_RUN'].includes(filter)) {
    return values.filter(row => row.latestResult === filter)
  }
  return []
}
