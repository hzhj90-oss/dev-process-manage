// Stable comparison categories; a FAIL->PASS is an observed result change,
// not a claim that the underlying defect was causally fixed.
export const compareCategories = Object.freeze({
  FIXED: '失败已转通过',
  REGRESSION: '新增回归失败',
  STILL_FAIL: '仍失败/阻塞',
  STILL_PASS: '持续通过',
  FIRST_PASS: '首次通过',
  CHANGED: '其他状态变化',
  NEW_CASE: '本轮新增用例',
  REMOVED_CASE: '本轮移出用例'
})

export function readComparison(result, cycleId, versionId) {
  if (Number(result?.cycleId) !== Number(cycleId)
      || Number(result?.versionId) !== Number(versionId)
      || !Array.isArray(result?.rows)
      || !Number.isSafeInteger(result?.total)
      || result.total !== result.rows.length
      || !result?.counts || typeof result.counts !== 'object') {
    throw new Error('轮次对比数据与当前轮次不一致，已拒绝展示')
  }
  const previousId = result.previousCycleId
  if (previousId == null) {
    if (result.total !== 0 || result.previousCycleNo != null) {
      throw new Error('无上轮结果时不应返回对比明细')
    }
  } else if (!Number.isSafeInteger(Number(previousId)) || Number(previousId) <= 0
      || !Number.isSafeInteger(Number(result.previousCycleNo))
      || Number(result.previousCycleNo) >= Number(result.cycleNo)
      || Number(result.previousCycleNo) < 1) {
    throw new Error('上一轮编号不合法或不是当前版本的历史轮次')
  }
  let count = 0
  for (const key of Object.keys(compareCategories)) {
    const num = result.counts[key]
    if (!Number.isSafeInteger(num) || num < 0) throw new Error('轮次对比统计格式不合法')
    count += num
  }
  if (count !== result.total) throw new Error('轮次对比统计与行数不一致')
  for (const row of result.rows) {
    if (!Object.hasOwn(compareCategories, row?.change)
        || typeof row.caseNo !== 'string' || typeof row.title !== 'string') {
      throw new Error('轮次对比明细格式不合法')
    }
  }
  return result
}

export function filteredComparisonRows(rows, filter) {
  if (!Array.isArray(rows)) return []
  if (filter === 'REGRESSION' || filter === 'FIXED' || filter === 'STILL_FAIL') {
    return rows.filter(row => row.change === filter)
  }
  if (filter === 'SCOPE') {
    return rows.filter(row => row.change === 'NEW_CASE' || row.change === 'REMOVED_CASE')
  }
  return filter === 'ALL' ? rows : rows.filter(row =>
    ['REGRESSION', 'STILL_FAIL'].includes(row.change))
}

// Context must be shown alongside result changes. It is NOT a comparable
// benchmark if the environment identity or deployed code is unknown/changed.
export function comparisonContextWarnings(data) {
  if (!data?.previousCycleId) return []
  const notes = []
  if (data.environmentChanged === true) {
    notes.push({
      type: 'warning',
      text: '两轮测试环境不同：' + (data.previousEnvironmentName || '未记录')
        + ' → ' + (data.environmentName || '未记录') + '。结果变化可能受到环境影响。'
    })
  } else if (data.environmentChanged !== false) {
    notes.push({type:'warning',text:'缺少完整的环境标识，无法确认两轮环境是否相同。'})
  }
  if (data.codeVersionChanged === true) {
    notes.push({
      type: 'warning',
      text: '两轮代码版本或 Git Commit 不同：'
        + (data.previousCodeVersion || '未记录') + ' → '
        + (data.codeVersion || '未记录') + '。请结合代码差异判断回归原因。'
    })
  } else if (data.codeVersionChanged !== false) {
    notes.push({type:'warning',text:'缺少完整代码版本信息，无法确认两轮构建是否相同。'})
  }
  return notes
}
