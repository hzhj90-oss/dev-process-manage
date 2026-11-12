import test from 'node:test'
import assert from 'node:assert/strict'
import { loadPagedOptions } from './pagedOptions.js'

const items = Array.from({ length: 205 }, (_, i) => ({ id: i + 1, name: '选项 ' + (i + 1) }))
function pageSource(rows = items, total = rows.length) {
  return async ({ pageNum, pageSize, ...other }) => ({
    list: rows.slice((pageNum - 1) * pageSize, pageNum * pageSize),
    total, filters: other
  })
}
test('loads options across three pages, not just first 100', async () => {
  const requests = []
  const result = await loadPagedOptions(async params => {
    requests.push(params)
    return pageSource()(params)
  }, { status: 'ACTIVE' })
  assert.equal(result.length, 205)
  assert.equal(result[204].id, 205)
  assert.deepEqual(requests.map(r => r.pageNum), [1, 2, 3])
  assert.ok(requests.every(r => r.status === 'ACTIVE' && r.pageSize === 100))
})
test('accepts empty response and a full single page', async () => {
  assert.deepEqual(await loadPagedOptions(pageSource([])), [])
  assert.equal((await loadPagedOptions(pageSource(items.slice(0, 100)))).length, 100)
})
test('rejects missing final page rather than offering incomplete choices', async () => {
  const source = async ({ pageNum, pageSize }) => ({
    list: pageNum === 1 ? items.slice(0, pageSize) : [], total: 205
  })
  await assert.rejects(loadPagedOptions(source), /缺少/)
})
test('rejects repeated pages and invalid IDs instead of looping', async () => {
  const repeated = async ({ pageSize }) => ({ list: items.slice(0, pageSize), total: 205 })
  await assert.rejects(loadPagedOptions(repeated), /重复/)
  await assert.rejects(loadPagedOptions(async () => ({
    list: [{ id: 0 }], total: 1
  })), /无效/)
})
test('rejects count drift, malformed API response, and early short pages', async () => {
  await assert.rejects(loadPagedOptions(async ({ pageNum, pageSize }) => ({
    list: items.slice((pageNum - 1) * pageSize, pageNum * pageSize),
    total: pageNum === 1 ? 205 : 206
  })), /发生变化/)
  await assert.rejects(loadPagedOptions(async () => ({ list: {}, total: '205' })), /格式/)
  await assert.rejects(loadPagedOptions(async () => ({
    list: items.slice(0, 99), total: 205
  })), /缺少/)
})
test('checks an upper bound and rejects invalid pagination configuration', async () => {
  await assert.rejects(loadPagedOptions(async () => ({
    list: [], total: 5001
  })), /超过/)
  await assert.rejects(loadPagedOptions(pageSource(), {}, { pageSize: 101 }), /配置无效/)
})
