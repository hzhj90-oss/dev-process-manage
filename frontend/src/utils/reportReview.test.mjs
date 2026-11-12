import test from 'node:test'
import assert from 'node:assert/strict'
import {
  positiveId, readReviewTarget, matchesReviewTask, filteredReviewRows
} from './reportReview.js'

test('task navigation accepts only strict positive integer identifiers', () => {
  for (const value of ['1', 3, '100000000000000']) assert.ok(positiveId(value) > 0)
  for (const value of [null, undefined, [], ['45'], 0, -1, '0', '01', '45.1',
    '1e2', ' 5', '5 ', '+5', '2/../x', '1234567890123456', 'abc']) {
    assert.equal(positiveId(value), null)
  }
})
test('report-to-task deep links reject missing, invalid and cross-case references', () => {
  const target = readReviewTarget({ cycleId: '45', taskId: '112', cycleCaseId: '75' })
  assert.deepEqual(target, { cycleId: 45, taskId: 112, cycleCaseId: 75 })
  assert.deepEqual(readReviewTarget({ cycleId: 45, taskId: '112' }),
    { cycleId: 45, taskId: 112, cycleCaseId: null })
  assert.equal(readReviewTarget({ cycleId: '45', taskId: ['112'] }), null)
  assert.equal(readReviewTarget({ cycleId: '45', taskId: '112', cycleCaseId: '-1' }), null)
  assert.equal(readReviewTarget({ taskId: '112' }), null)
  assert.equal(readReviewTarget({ cycleId: '45' }), null)
})
test('navigation refuses wrong task, cycle, case or parent task type', () => {
  const target = readReviewTarget({ cycleId: '45', taskId: '112', cycleCaseId: '75' })
  const task = { id: 112, cycleId: 45, cycleCaseId: 75, taskType: 'EXECUTE_CASE' }
  assert.ok(matchesReviewTask(task, target))
  assert.ok(!matchesReviewTask({ ...task, cycleId: 44 }, target))
  assert.ok(!matchesReviewTask({ ...task, id: 113 }, target))
  assert.ok(!matchesReviewTask({ ...task, cycleCaseId: 76 }, target))
  assert.ok(!matchesReviewTask({ ...task, taskType: 'EXECUTE_CYCLE' }, target))
})
test('failure triage filters only the requested results, preserving original rows', () => {
  const rows = ['FAIL', 'BLOCKED', 'PASS', 'NOT_RUN', 'SKIPPED']
    .map((latestResult, i) => ({ cycleCaseId: i + 1, latestResult }))
  assert.deepEqual(filteredReviewRows(rows, 'ISSUES').map(row => row.latestResult),
    ['FAIL', 'BLOCKED'])
  assert.equal(filteredReviewRows(rows, 'ALL').length, 5)
  assert.equal(filteredReviewRows(rows, 'NOT_RUN')[0].cycleCaseId, 4)
  assert.deepEqual(filteredReviewRows(rows, 'INVALID'), [])
  assert.deepEqual(filteredReviewRows(null, 'ALL'), [])
  assert.equal(rows.length, 5)
})
