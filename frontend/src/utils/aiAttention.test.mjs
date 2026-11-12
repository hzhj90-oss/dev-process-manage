import test from 'node:test'
import assert from 'node:assert/strict'
import { aiAttention } from './aiAttention.js'

const now = Date.parse('2026-11-11T18:00:00+08:00')
function fixture(taskStatus = 'RUNNING', executionStatus = 'RUNNING') {
  return { task: { taskType: 'EXECUTE_CASE', taskStatus,
      heartbeatAt: '2026-11-11T17:56:00+08:00' },
    executions: [{ runnerType: 'CHATGPT', executionMode: 'AI',
      executionStatus, events: [] }] }
}
test('only warns when a running ChatGPT task approaches the heartbeat deadline', () => {
  assert.match(aiAttention(fixture(), now).title, /4 分钟/)
  const stale = fixture()
  stale.task.heartbeatAt = '2026-11-11T17:53:00+08:00'
  assert.match(aiAttention(stale, now).title, /超过 5 分钟/)
  const healthy = fixture()
  healthy.task.heartbeatAt = '2026-11-11T17:58:00+08:00'
  assert.equal(aiAttention(healthy, now), null)
})
test('interruption requires human review, waiting state shows elapsed age', () => {
  assert.match(aiAttention(fixture('RECOVERY_REQUIRED', 'INTERRUPTED'), now).description, /旧执行记录/)
  const waiting = fixture('WAITING_HUMAN', 'WAITING_HUMAN')
  waiting.executions[0].events.push({ eventType: 'WAITING_HUMAN',
    createdAt: '2026-11-11T17:43:00+08:00' })
  assert.match(aiAttention(waiting, now).title, /17 分钟/)
})
test('ignores terminal status, non-ChatGPT runners and invalid clocks', () => {
  assert.equal(aiAttention(fixture('COMPLETED', 'COMPLETED'), now), null)
  const other = fixture()
  other.executions[0].runnerType = 'BROWSER'
  assert.equal(aiAttention(other, now), null)
  const invalid = fixture()
  invalid.task.heartbeatAt = 'not-a-date'
  assert.equal(aiAttention(invalid, now), null)
})
