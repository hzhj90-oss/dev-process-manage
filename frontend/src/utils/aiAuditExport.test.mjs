import test from 'node:test'
import assert from 'node:assert/strict'
import { chatGptAuditCsv } from './aiAuditExport.js'

test('exports only allowed metadata with UTF-8 BOM and CRLF rows', () => {
  const csv = chatGptAuditCsv([{ taskId: 113, taskNo: 'DPM-113', caseNo: 'TC-1',
    projectName: '测试项目', cycleName: '恢复演练', taskStatus: 'COMPLETED',
    executionId: 78, attemptNo: 2, executionStatus: 'COMPLETED',
    result: 'PASS', hasCheckpoint: 1, eventCount: 5, createdAt: '2026-11-11T18:00:00',
    requestSnapshotJson: '{"accessToken":"SECRET-SNAPSHOT"}',
    checkpointJson: '{"password":"SECRET-CHECKPOINT"}',
    events: [{ eventContent: 'Bearer SECRET-EVENT' }] }])
  assert.ok(csv.startsWith('\uFEFF"任务ID"'))
  assert.ok(csv.endsWith('\r\n'))
  assert.match(csv, /"113","DPM-113"/)
  assert.match(csv, /"有","5"/)
  assert.doesNotMatch(csv, /SECRET-SNAPSHOT|SECRET-CHECKPOINT|SECRET-EVENT|requestSnapshotJson/)
})

test('neutralizes formula injection, CRLF and redacts assignment values', () => {
  const csv = chatGptAuditCsv([{ taskId: 7, executionId: 8, attemptNo: 1,
    caseNo: '=HYPERLINK("http://evil")', projectName: ' password=topsecret ',
    cycleName: 'Bearer sample_key', taskNo: '  +SUM(1,2)',
    taskStatus: 'RUNNING\r\nATTACK', executionStatus: '@test', result: 'PASS' }])
  assert.match(csv, /"'=HYPERLINK/)
  assert.match(csv, /"'  \+SUM/)
  assert.match(csv, /password=\[REDACTED\]/)
  assert.match(csv, /Bearer \[REDACTED\]/)
  assert.match(csv, /"'@test"/)
  assert.doesNotMatch(csv, /topsecret|sample_key|RUNNING\r\nATTACK/)
})
test('rejects exports beyond the hard limit', () => {
  assert.throws(() => chatGptAuditCsv(Array(501).fill({})), /500/)
})
