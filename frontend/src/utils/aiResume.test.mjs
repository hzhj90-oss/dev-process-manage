import test from 'node:test'
import assert from 'node:assert/strict'
import { aiContinuationState, buildAiContinuationPrompt } from './aiResume.js'

function running() {
  return {
    task: { id: 29, taskNo: 'DPM-AI-29', taskType: 'EXECUTE_CASE',
      taskStatus: 'RUNNING', environmentType: 'TEST' },
    executions: [{
      id: 21, taskId: 29, attemptNo: 1, runnerType: 'CHATGPT',
      executionMode: 'AI', executionStatus: 'RUNNING',
      requestSnapshotJson: JSON.stringify({
        caseSnapshot: { caseNo: 'AI-29', password: 'HIDDEN-CREDENTIAL' }
      }), checkpointJson: JSON.stringify({ step: 2, token: 'HIDDEN-CREDENTIAL' }),
      events: [{ eventType: 'STEP_COMPLETED', eventContent: 'password=HIDDEN-CREDENTIAL' }]
    }]
  }
}

test('running task continues existing attempt without second start or secrets', () => {
  const value = running()
  const info = aiContinuationState(value)
  assert.equal(info.mode, 'CONTINUE_RUNNING')
  assert.equal(info.hasCheckpoint, true)
  const prompt = buildAiContinuationPrompt(value)
  assert.match(prompt, /plan 29 21/)
  assert.match(prompt, /绝对不要再次调用 start/)
  assert.doesNotMatch(prompt, /HIDDEN-CREDENTIAL/)
  assert.match(prompt, /node D:\\code\\dev-process-manager\\scripts\\chatgpt-task.mjs/)
  assert.ok(prompt.includes('\n'))
})
test('after manual recovery only the new attempt can start', () => {
  const value = running()
  value.task.taskStatus = 'PENDING'
  const latest = value.executions[0]
  latest.id = 22
  latest.attemptNo = 2
  latest.executionStatus = 'QUEUED'
  value.executions.push({ id: 21, executionStatus: 'INTERRUPTED' })
  const info = aiContinuationState(value)
  assert.equal(info.mode, 'START_RECOVERED')
  const prompt = buildAiContinuationPrompt(value)
  assert.match(prompt, /plan 29 22/)
  assert.match(prompt, /start 29 22/)
  assert.doesNotMatch(prompt, /start 29 21/)
  latest.checkpointJson = null
  assert.equal(aiContinuationState(value), null)
})

test('interrupted task requires explicit manual recovery before any write', () => {
  const value = running()
  value.task.taskStatus = 'RECOVERY_REQUIRED'
  value.executions[0].executionStatus = 'INTERRUPTED'
  assert.equal(aiContinuationState(value).mode, 'MANUAL_RECOVERY')
  const prompt = buildAiContinuationPrompt(value)
  assert.match(prompt, /人工恢复/)
  assert.doesNotMatch(prompt, /start 29 21/)
})

test('rejects completed, paused, production, wrong runner, mismatched ID and corrupt snapshot', () => {
  for (const change of [
    x => { x.task.taskStatus = 'COMPLETED' },
    x => { x.task.taskStatus = 'WAITING_HUMAN' },
    x => { x.task.environmentType = 'PROD' },
    x => { x.executions[0].runnerType = 'NODE' },
    x => { x.executions[0].taskId = 999 },
    x => { x.executions[0].requestSnapshotJson = 'bad-json' }
  ]) {
    const value = running()
    change(value)
    assert.equal(aiContinuationState(value), null)
    assert.throws(() => buildAiContinuationPrompt(value), /不支持安全续执行/)
  }
})
