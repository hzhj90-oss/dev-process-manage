// Read-only aggregation of a cycle's FROZEN requirement/design snapshots.
// This never consults live requirements; current edits must not rewrite history.
const positive = value => Number.isSafeInteger(Number(value)) && Number(value) > 0
const result = value => ['PASS', 'FAIL', 'BLOCKED', 'SKIPPED'].includes(value) ? value : 'NOT_RUN'
const hasDesign = value => {
  if (value == null || value === '') return false
  if (typeof value === 'object') return Boolean(value?.revisionNo)
  if (typeof value !== 'string') return false
  try {
    const doc = JSON.parse(value)
    return Boolean(doc && typeof doc === 'object' && positive(doc.revisionNo))
  } catch (_) { return false }
}

export function buildCycleCoverage(cycle) {
  if (!positive(cycle?.id) || !positive(cycle?.versionId) || !Array.isArray(cycle?.cases)) {
    throw new Error('轮次详情缺少完整的冻结快照，无法统计需求覆盖')
  }
  const requirements = new Map()
  const caseIds = new Set()
  let genericCases = 0
  let linkedCases = 0
  let totalLinks = 0
  let missingDesignLinks = 0
  for (const item of cycle.cases) {
    if (!positive(item?.id) || !positive(item?.testCaseId) || caseIds.has(Number(item.id))
        || !Array.isArray(item?.requirements)) {
      throw new Error('轮次用例快照不完整或重复，不能生成可信覆盖统计')
    }
    caseIds.add(Number(item.id))
    if (!item.requirements.length) { genericCases++; continue }
    linkedCases++
    const seen = new Set()
    for (const req of item.requirements) {
      const reqId = Number(req?.requirementId)
      if (!positive(reqId) || seen.has(reqId) || !String(req?.requirementNo || '').trim()) {
        throw new Error('轮次需求覆盖快照缺失或重复，不能生成可信统计')
      }
      seen.add(reqId)
      totalLinks++
      const designExists = hasDesign(req.designSnapshotJson)
      if (!designExists) missingDesignLinks++
      if (!requirements.has(reqId)) requirements.set(reqId,{
        requirementId:reqId,requirementNo:String(req.requirementNo),
        title:String(req.title || ''),caseCount:0,passCount:0,
        issueCount:0,pendingCount:0,missingDesignCases:0
      })
      const row = requirements.get(reqId)
      row.caseCount++
      const state = result(item.latestResult)
      if (state === 'PASS') row.passCount++
      else if (state === 'FAIL' || state === 'BLOCKED') row.issueCount++
      else row.pendingCount++
      if (!designExists) row.missingDesignCases++
    }
  }
  const rows = [...requirements.values()].sort((a,b) =>
    a.requirementNo.localeCompare(b.requirementNo, 'zh-CN') ||
    a.requirementId-b.requirementId)
  return {
    cycleId:Number(cycle.id), versionId:Number(cycle.versionId),
    caseCount:cycle.cases.length, genericCases, linkedCases,
    requirementCount:rows.length, totalLinks, missingDesignLinks,
    requirements:rows
  }
}
