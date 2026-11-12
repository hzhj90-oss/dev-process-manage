import { contextId } from './contextNavigation.js'

// One source case may cover several versions; never silently invent a version
// from a mutable case title or a duplicate version number.
export function readCasePlacement(detail, expectedCaseId) {
  const id = contextId(expectedCaseId)
  if (!id || contextId(detail?.id) !== id
      || detail?.status !== 'ACTIVE'
      || !contextId(detail?.currentRevisionId)
      || !Array.isArray(detail?.requirements)) {
    throw new Error('用例已停用、缺失修订或详情不匹配，不能加入测试轮次')
  }
  const ids = new Set()
  for (const req of detail.requirements) {
    const versionId = contextId(req?.versionId)
    if (!versionId || !contextId(req?.requirementId)) {
      throw new Error('用例关联需求缺少真实版本 ID，请重新读取')
    }
    ids.add(versionId)
  }
  return { id, revisionId: contextId(detail.currentRevisionId),
    caseNo: String(detail.caseNo || ''), title: String(detail.title || ''),
    versionIds: [...ids], generic: ids.size === 0 }
}

export function eligiblePlannedCycles(source, cycles) {
  if (!source || !Array.isArray(cycles)) throw new Error('计划轮次列表加载不完整')
  return cycles.filter(c => {
    const cycleId = contextId(c?.id)
    const versionId = contextId(c?.versionId)
    return cycleId && versionId && c.status === 'PLANNED'
      && (source.generic || source.versionIds.includes(versionId))
  })
}

export function validateCasePlacement(source, summary, detail) {
  if (!source || !summary || !detail) throw new Error('轮次或来源用例信息不完整')
  const id = contextId(summary.id)
  if (!id || contextId(detail.id) !== id
      || contextId(detail.versionId) !== contextId(summary.versionId)
      || detail.status !== 'PLANNED' || summary.status !== 'PLANNED'
      || (!source.generic && !source.versionIds.includes(contextId(detail.versionId)))
      || !Array.isArray(detail.cases)) {
    throw new Error('轮次状态或版本已变化，未提交加入请求')
  }
  if (detail.cases.some(row => contextId(row?.testCaseId) === source.id)) {
    throw new Error('当前用例已属于此轮次，禁止重复加入')
  }
  return id
}

export function validatePlacementResponse(source, cycleId, response) {
  if (contextId(response?.id) !== contextId(cycleId)
      || !Array.isArray(response?.cases)
      || !response.cases.some(row => contextId(row?.testCaseId) === source?.id)) {
    throw new Error('加入轮次的返回结果与目标不一致，请重新读取轮次')
  }
  return true
}
