// Whitelisted, formula-safe CSV. Never export snapshots, checkpoint JSON, or event contents.
const integer = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : ''
const safeText = (value, limit = 160) => {
  if (value == null) return ''
  return String(value).slice(0, limit).replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/Bearer\s+[^\s,;'"]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(password|passwd|secret|token|access[_-]?token|refresh[_-]?token|api[_-]?key|authorization|cookie|credential|private[_-]?key)\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1=[REDACTED]')
}
const csvCell = value => {
  let s = safeText(value)
  // Excel/LibreOffice treat leading +-= @, tabs and full-width variants as formulas.
  if (/^\s*[=+\-@＝＋－＠]/u.test(s)) s = "'" + s
  return '"' + s.replace(/"/g, '""') + '"'
}
const csv = (headers, rows) => '\uFEFF' + [headers, ...rows]
  .map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'

export function chatGptAuditCsv(rows) {
  if (!Array.isArray(rows) || rows.length > 500) throw new Error('导出最多 500 条，请缩小筛选范围')
  const headers = ['任务ID', '任务编号', '用例编号', '项目', '测试轮次', '任务状态',
    '最新执行ID', '尝试次数', '执行状态', '执行结果', '检查点', '事件数量', '创建时间']
  return csv(headers, rows.map(r => [
    integer(r.taskId), r.taskNo, r.caseNo, r.projectName, r.cycleName, r.taskStatus,
    integer(r.executionId), integer(r.attemptNo), r.executionStatus, r.result,
    Number(r.hasCheckpoint) ? '有' : '无', Number.isSafeInteger(Number(r.eventCount))
      ? Math.max(0, Number(r.eventCount)) : 0, r.createdAt
  ]))
}
