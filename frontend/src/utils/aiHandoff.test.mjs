import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAiExecutionPrompt, summarizeAiTask } from './aiHandoff.js'

function fixture() {
  return {
    task: { id: 29, taskNo: 'DPM-ET-29', taskType: 'EXECUTE_CASE',
      taskStatus: 'PENDING', cycleId: 13 },
    execution: { id: 21, taskId: 29, runnerType: 'CHATGPT',
      executionMode: 'AI', executionStatus: 'QUEUED',
      expectedResultSnapshot: 'Result UP',
      requestSnapshot: {
        environmentSnapshot: { credentialRef: 'DO-NOT-COPY-SECRET' },
        caseSnapshot: { caseNo: 'DPM-AI-01', title: 'Local health endpoint' }
      } }
  }
}

test('builds accurate instructions without copying sensitive snapshots', () => {
  const prompt = buildAiExecutionPrompt(fixture())
  assert.match(prompt, /taskId: 29/)
  assert.match(prompt, /executionId: 21/)
  assert.match(prompt, /actor.*CHATGPT/)
  assert.match(prompt, /chatgpt-task\.mjs/)
  assert.match(prompt, /inspect 29/)
  assert.match(prompt, /heartbeat 29 21/)
  assert.match(prompt, /CHECKPOINT/)
  assert.match(prompt, /WAITING_HUMAN/)
  assert.match(prompt, /complete/)
  assert.doesNotMatch(prompt, /DO-NOT-COPY-SECRET/)
  assert.doesNotMatch(prompt, /credentialRef/)
  assert.equal(summarizeAiTask(fixture()).caseNo, 'DPM-AI-01')
})

test('rejects stale, fixed runner or mismatched execution', () => {
  for (const change of [
    item => { item.task.taskStatus = 'RUNNING' },
    item => { item.execution.runnerType = 'BROWSER' },
    item => { item.execution.executionStatus = 'RUNNING' },
    item => { item.execution.taskId = 11 },
    item => { item.execution.requestSnapshot = null },
    item => { item.task.environmentType = 'PROD' }
  ]) {
    const value = fixture()
    change(value)
    assert.throws(() => buildAiExecutionPrompt(value), /不是可执行/)
  }
})
