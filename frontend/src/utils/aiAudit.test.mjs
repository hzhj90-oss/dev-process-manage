import test from 'node:test'
import assert from 'node:assert/strict'
import { aiAttemptAudit, buildAiDiagnosticSummary } from './aiAudit.js'

function fixture() {
  return {
    task: { id: 113, taskType: 'EXECUTE_CASE', taskStatus: 'COMPLETED' },
    executions: [
      { id: 78, taskId: 113, attemptNo: 2, runnerType: 'CHATGPT', executionMode: 'AI',
        executionStatus: 'COMPLETED', result: 'PASS', checkpointJson: '{"token":"SECRET-VALUE"}',
        events: [{ eventType: 'ASSERTION_PASSED', createdAt: '2026-11-11T17:42:00',
          eventContent: 'Bearer VERY_PRIVATE_TOKEN' }] },
      { id: 77, taskId: 113, attemptNo: 1, runnerType: 'CHATGPT', executionMode: 'AI',
        executionStatus: 'INTERRUPTED', checkpointJson: '{"password":"HIDDEN"}',
        events: [{ eventType: 'STEP_STARTED', createdAt: '2026-11-11T17:40:00',
          eventContent: 'password=HIDDEN' }, { eventType: 'EXECUTION_INTERRUPTED',
            createdAt: '2026-11-11T17:41:00', eventContent: 'connection lost' }] }
    ]
  }
}

test('shows bounded multi-attempt execution timeline without checkpoint data', () => {
  const attempts = aiAttemptAudit(fixture())
  assert.equal(attempts.length, 2)
  assert.equal(attempts[0].attemptNo, 2)
  assert.equal(attempts[0].result, 'PASS')
  assert.equal(attempts[1].status, 'INTERRUPTED')
  assert.equal(attempts[1].hasCheckpoint, true)
  assert.match(attempts[1].events[1].content, /\[REDACTED\]/)
  assert.match(attempts[0].events[0].content, /\[REDACTED\]/)
})
test('diagnostic handoff is read-only, includes both attempts but no raw events or secrets', () => {
  const summary = buildAiDiagnosticSummary(fixture())
  assert.match(summary, /taskId: 113/)
  assert.match(summary, /execution #78/)
  assert.match(summary, /execution #77/)
  assert.match(summary, /EXECUTION_INTERRUPTED/)
  assert.match(summary, /status 113/)
  for (const secret of ['VERY_PRIVATE_TOKEN', 'HIDDEN', 'SECRET-VALUE', 'connection lost']) {
    assert.equal(summary.includes(secret), false)
  }
})
test('ignores unrelated runners, task mismatches and caps history', () => {
  const value = fixture()
  value.executions.push({ id: 79, taskId: 999, runnerType: 'CHATGPT', executionMode: 'AI' })
  value.executions.push({ id: 80, taskId: 113, runnerType: 'NODE', executionMode: 'SCRIPT' })
  for (let i = 0; i < 10; i++) {
    value.executions.push({ ...value.executions[0], id: 100 + i, attemptNo: 10 + i })
  }
  assert.equal(aiAttemptAudit(value).length, 8)
  assert.deepEqual(aiAttemptAudit({ task: { id: 1, taskType: 'EXECUTE_CYCLE' }, executions: [] }), [])
  assert.throws(() => buildAiDiagnosticSummary({ task: {}, executions: [] }), /没有可供交接/)
})
