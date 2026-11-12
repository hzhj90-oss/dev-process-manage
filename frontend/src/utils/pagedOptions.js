// Load every page for select options, never silently presenting only page one.
// Fail closed for missing pages, duplicate IDs or concurrent total changes.
export async function loadPagedOptions(fetchPage, filters = {}, {
  pageSize = 100,
  maxRows = 5000
} = {}) {
  if (typeof fetchPage !== 'function') throw new Error('选项加载接口不可用')
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100
      || !Number.isSafeInteger(maxRows) || maxRows < pageSize || maxRows > 10000) {
    throw new Error('选项分页配置无效')
  }
  const items = []
  const seen = new Set()
  let expectedTotal = null
  const limit = Math.ceil(maxRows / pageSize)
  for (let pageNum = 1; pageNum <= limit; pageNum++) {
    const response = await fetchPage({ ...filters, pageNum, pageSize })
    if (!response || !Array.isArray(response.list)
        || !Number.isSafeInteger(response.total) || response.total < 0) {
      throw new Error('选项接口返回的数据格式不正确，请重试')
    }
    if (expectedTotal === null) {
      expectedTotal = response.total
      if (expectedTotal > maxRows) {
        throw new Error('选项数量超过 ' + maxRows + ' 条，请联系管理员缩小范围')
      }
    } else if (expectedTotal !== response.total) {
      throw new Error('选项在加载期间发生变化，请重新加载')
    }
    if (response.list.length > pageSize || items.length + response.list.length > expectedTotal) {
      throw new Error('选项分页数量异常，请重新加载')
    }
    for (const entry of response.list) {
      const id = entry?.id
      if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) {
        throw new Error('选项包含无效或重复的记录，请重新加载')
      }
      seen.add(id)
      items.push(entry)
    }
    if (items.length === expectedTotal) return items
    if (response.list.length === 0 || response.list.length < pageSize) {
      throw new Error('选项缺少部分分页数据，请重新加载')
    }
  }
  throw new Error('选项页数超出上限，请联系管理员')
}
