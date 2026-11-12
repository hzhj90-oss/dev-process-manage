import test from 'node:test'
import assert from 'node:assert/strict'
import { contextId, contextLink } from './contextNavigation.js'

test('context IDs accept only scalar canonical positive integers', () => {
  for (const value of ['1', 6, '999999999999999', 6]) {
    assert.equal(contextId(value), Number(value))
  }
  for (const value of [null, undefined, [], ['6'], ['6', '7'], 0, '0', '06',
    '-6', ' 6', '6 ', '6.0', '+6', '1e2', {}, true, '1234567890123456']) {
    assert.equal(contextId(value), null)
  }
})
test('context links cannot target unrelated modules or query keys', () => {
  assert.deepEqual(contextLink('versions', 'projectId', 6), {
    name: 'versions', query: { projectId: '6' }
  })
  assert.deepEqual(contextLink('requirements', 'versionId', '6'), {
    name: 'requirements', query: { versionId: '6' }
  })
  assert.deepEqual(contextLink('test-cycles', 'versionId', 6), {
    name: 'test-cycles', query: { versionId: '6' }
  })
  assert.deepEqual(contextLink('test-cases', 'requirementId', 4), {
    name: 'test-cases', query: { requirementId: '4' }
  })
  for (const args of [
    ['versions', 'versionId', 6], ['requirements', 'projectId', 6],
    ['test-cases', 'versionId', 6],
    ['test-cases', 'projectId', 6], ['test-cases', 'requirementId', ['4']],
    ['test-cases', 'requirementId', '04'], ['test-cases', 'requirementId', '-4'], ['versions', 'projectId', ['6']],
    ['test-cycles', 'versionId', '1/../../x'], ['versions', 'projectId', 0]
  ]) assert.equal(contextLink(...args), null)
})
