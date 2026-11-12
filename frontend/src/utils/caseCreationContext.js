import { contextId } from './contextNavigation.js'

// The URL selects only a target to verify; it cannot supply the requirement
// title, version or coverage metadata used in the saved test case.
export function requestedCaseRequirement(query) {
  return query?.create === '1' ? contextId(query.requirementId) : null
}

export function verifiedSourceRequirement(detail, requestedId) {
  const id = contextId(requestedId)
  if (!id || contextId(detail?.id) !== id) {
    throw new Error('来源需求与当前操作目标不一致，请重试读取')
  }
  const versionId = contextId(detail?.versionId)
  const requirementNo = String(detail?.requirementNo || '').trim()
  const title = String(detail?.title || '').trim()
  if (!versionId || !requirementNo || !title) {
    throw new Error('来源需求信息不完整，已禁止创建未关联的用例')
  }
  return { id, versionId, label: requirementNo + ' · ' + title }
}

// Validate after asynchronous option loading and again just before POST.
export function assertSourceCoverage(source, selectedIds, options, versionId) {
  if (!source) return
  if (contextId(versionId) !== source.versionId
      || !Array.isArray(options)
      || !options.some(row => contextId(row?.requirementId) === source.id)) {
    throw new Error('来源需求未出现在完整的关联候选中，请重新加载来源需求')
  }
  if (!Array.isArray(selectedIds) || !selectedIds.some(value => contextId(value) === source.id)) {
    throw new Error('不能移除来源需求的关联；如需创建独立用例，请返回全部用例')
  }
}
