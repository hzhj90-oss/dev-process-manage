import test from 'node:test'
import assert from 'node:assert/strict'
import { createLatestRequest } from './latestRequest.js'

test('out-of-order success cannot replace the newer selection', async () => {
  const gate = createLatestRequest()
  let resolveOld
  let resolveNew
  const old = new Promise(resolve => { resolveOld = resolve })
  const newer = new Promise(resolve => { resolveNew = resolve })
  let data = ''
  let loading = false
  const read = async source => {
    const token = gate.begin()
    loading = true
    try {
      const value = await source
      if (gate.isCurrent(token)) data = value
    } finally {
      if (gate.isCurrent(token)) loading = false
    }
  }
  const first = read(old)
  const second = read(newer)
  resolveNew('selected version 6')
  await second
  assert.equal(data, 'selected version 6')
  assert.equal(loading, false)
  resolveOld('wrong version 5')
  await first
  assert.equal(data, 'selected version 6')
  assert.equal(loading, false)
})
test('old failure is ignored while newest request still controls loading', async () => {
  const gate = createLatestRequest()
  let rejectOld
  let resolveNew
  const old = new Promise((_, reject) => { rejectOld = reject })
  const newer = new Promise(resolve => { resolveNew = resolve })
  let error = ''
  let loading = true
  const read = async source => {
    const token = gate.begin()
    try { await source } catch (e) {
      if (gate.isCurrent(token)) error = e.message
    } finally {
      if (gate.isCurrent(token)) loading = false
    }
  }
  const first = read(old)
  const second = read(newer)
  rejectOld(new Error('stale network error'))
  await first
  assert.equal(error, '')
  assert.equal(loading, true)
  resolveNew('fresh result')
  await second
  assert.equal(error, '')
  assert.equal(loading, false)
})
test('a new request and invalidation revoke all previous tokens', () => {
  const gate = createLatestRequest()
  const first = gate.begin()
  assert.ok(gate.isCurrent(first))
  const second = gate.begin()
  assert.ok(!gate.isCurrent(first))
  assert.ok(gate.isCurrent(second))
  gate.invalidate()
  assert.ok(!gate.isCurrent(second))
})
