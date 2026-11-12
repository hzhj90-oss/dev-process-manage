// Explicitly opt-in real-DB AI recovery test. Writes only new DPM-VERIFY fixtures.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { runAiCommand } from './chatgpt-task-client.mjs';

const BASE = 'http://127.0.0.1:18090';
const VERSION = Number(process.env.DPM_AI_RECOVERY_E2E_VERSION_ID);
if (process.env.DPM_AI_RECOVERY_E2E_ALLOW_WRITE !== 'YES') {
  throw new Error('Requires DPM_AI_RECOVERY_E2E_ALLOW_WRITE=YES (this creates test data)');
}
if (!Number.isSafeInteger(VERSION) || VERSION < 1) {
  throw new Error('Specify a dedicated DPM_AI_RECOVERY_E2E_VERSION_ID');
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function api(method, path, payload, headers = {}) {
  const res = await fetch(BASE + path, { method, redirect: 'manual',
    signal: AbortSignal.timeout(12000),
    headers: { ...(payload === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    body: payload === undefined ? undefined : JSON.stringify(payload) });
  if (res.status >= 300 && res.status < 400) throw Error('Refusing redirect: ' + path);
  let data;
  try { data = await res.json(); } catch { throw Error('Non-JSON response: ' + path); }
  if (!res.ok) throw Error(method + ' ' + path + ' HTTP ' + res.status +
    ' ' + String(data?.message || 'operation failed').slice(0, 200));
  return data;
}
const version = await api('GET', '/api/versions/' + VERSION);
if (!String(version.projectCode || '').startsWith('DPM-VERIFY-')) {
  throw Error('Refusing non-verification project: ' + version.projectCode);
}
assert.equal((await api('GET', '/api/health')).status, 'UP');
const environments = await api('GET', '/api/environments?activeOnly=false');
const env = environments.find(x => x.environmentCode === 'BROWSER_E2E_20261111');
if (!env || env.environmentType !== 'TEST' || env.authType !== 'NONE' ||
    env.baseUrl !== BASE || !env.active) {
  throw new Error('Dedicated local TEST/NONE environment not found');
}
const caseNo = 'TC-AI-RECOVERY-E2E-20261111';
const list = await api('GET', '/api/test-cases?keyword=' + caseNo + '&pageNum=1&pageSize=100');
let testCase = list.list.find(x => x.caseNo === caseNo);
if (!testCase) {
  testCase = await api('POST', '/api/test-cases', {
    caseNo, title: 'AI safe heartbeat interruption and checkpoint continuation',
    testType: 'FUNCTIONAL', priority: 'MEDIUM', status: 'ACTIVE', executionMode: 'AI',
    aiInstruction: 'Only request GET http://127.0.0.1:18090/api/health; assert status UP. No other effects.',
    preconditions: 'Only local TEST/NONE environment; no writes to systems under test',
    expectedResult: 'After recovery the new execution preserves checkpoint and GET /api/health is UP',
    steps: [{ stepNo: 1, action: 'Read local health', expectedResult: 'HTTP 200 with status UP' }],
    requirementIds: [], createdBy: 'ai-recovery-e2e'
  });
}
const detailCase = await api('GET', '/api/test-cases/' + testCase.id);
if (detailCase.executionMode !== 'AI' || detailCase.caseNo !== caseNo ||
    detailCase.status !== 'ACTIVE' ||
    !String(detailCase.currentRevision?.aiInstruction || '').includes('127.0.0.1:18090/api/health')) {
  throw new Error('Existing fixture case is not the approved read-only AI scenario');
}
const cycle = await api('POST', '/api/test-cycles', {
  versionId: VERSION, cycleName: 'AI Recovery E2E ' + Date.now().toString(36),
  cycleStage: 'LOCAL_DEV', environmentId: env.id, codeVersion: 'local-ai-recovery-e2e',
  gitBranch: 'main', caseIds: [testCase.id], createdBy: 'ai-recovery-e2e'
});
const cycleId = cycle.id;
console.log('AI_RECOVERY_FIXTURE cycle=' + cycleId);
await api('POST', '/api/test-cycles/' + cycleId + '/start');
const cycleDetail = await api('GET', '/api/test-cycles/' + cycleId);
assert.equal(cycleDetail.cases.length, 1);
const cycleCaseId = cycleDetail.cases[0].id;
const key = 'ai-recovery-' + cycleId + '-' + cycleCaseId;
const created = await api('POST',
  '/api/test-cycles/' + cycleId + '/cycle-cases/' + cycleCaseId + '/execution-tasks', {
    idempotencyKey: key, requestedBy: 'ai-recovery-e2e', triggerSource: 'USER'
  }, { 'Idempotency-Key': key });
const taskId = Number(created.task?.id ?? created.id);
assert.ok(Number.isSafeInteger(taskId) && taskId > 0);
async function read() { return api('GET', '/api/execution-tasks/' + taskId); }
let state = await read();
const firstId = Number(state.executions?.[0]?.id);
assert.equal(state.task?.taskStatus, 'PENDING');
assert.equal(state.executions?.[0]?.runnerType, 'CHATGPT');
assert.equal(state.executions?.[0]?.executionMode, 'AI');
console.log('AI_RECOVERY_CREATED task=' + taskId + ' execution=' + firstId);
try {
  const started = await runAiCommand(['start', String(taskId), String(firstId)]);
  assert.equal(started.taskStatus, 'RUNNING');
  await runAiCommand(['event', String(taskId), String(firstId),
    'STEP_STARTED', 'recovery-step-1', 'Local health read pending']);
  await runAiCommand(['checkpoint', String(taskId), String(firstId), 'recovery-cp-1',
    JSON.stringify({ completedSteps: [], nextStep: 'GET /api/health', attempt: 1 })]);
  state = await read();
  assert.equal(state.executions[0].checkpointJson.length > 0, true);
  assert.equal((await runAiCommand(['plan', String(taskId), String(firstId)])).nextAction,
    'CONTINUE_RUNNING');

  // Controlled timestamp change is scoped to this tagged cycle, not other tasks.
  const expired = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', new URL('./expire-ai-verification-task.ps1', import.meta.url).pathname.replace(
      /^\/(?=[A-Za-z]:)/, '').replaceAll('/', '\\'),
    '-TaskId', String(taskId), '-ExecutionId', String(firstId)],
    { env: process.env, encoding: 'utf8', timeout: 20000 });
  if (expired.status !== 0 || !expired.stdout.includes('VERIFICATION_HEARTBEAT_EXPIRED')) {
    throw Error('Scoped heartbeat helper failed (no further task action): ' +
      String(expired.stderr || expired.stdout).slice(0, 300));
  }
  console.log('AI_RECOVERY_HEARTBEAT_EXPIRED task=' + taskId);
  // Real Spring scheduler checks every minute, do not mutate its internals.
  const stopAt = Date.now() + 90000;
  do {
    state = await read();
    if (state.task.taskStatus === 'RECOVERY_REQUIRED') break;
    if (state.task.taskStatus !== 'RUNNING') throw Error('Unexpected scheduler state');
    await sleep(1500);
  } while (Date.now() < stopAt);
  assert.equal(state.task.taskStatus, 'RECOVERY_REQUIRED');
  assert.equal(state.executions[0].executionStatus, 'INTERRUPTED');
  assert.ok(state.executions[0].events.some(e => e.eventType === 'EXECUTION_INTERRUPTED'));
  console.log('AI_RECOVERY_INTERRUPTED task=' + taskId + ' oldExecution=' + firstId);
  const oldPlan = await runAiCommand(['plan', String(taskId), String(firstId)]);
  assert.equal(oldPlan.nextAction, 'MANUAL_RECOVERY');
  await assert.rejects(() => runAiCommand(['complete', String(taskId), String(firstId),
    'PASS', 'Cannot finish an interrupted attempt']), /任务状态已改变/);

  // Deliberate test-only equivalent of the user's confirmed recovery action.
  await api('POST', '/api/execution-tasks/' + taskId +
    '/resume?requestedBy=ai-recovery-e2e');
  state = await read();
  const next = state.executions[0];
  assert.equal(state.task.taskStatus, 'PENDING');
  assert.equal(next.executionStatus, 'QUEUED');
  assert.equal(next.attemptNo, state.executions[1].attemptNo + 1);
  assert.notEqual(next.id, firstId);
  assert.equal(state.executions[1].id, firstId);
  assert.equal(state.executions[1].executionStatus, 'INTERRUPTED');
  assert.deepEqual(JSON.parse(next.checkpointJson),
    JSON.parse(state.executions[1].checkpointJson));
  assert.equal(next.requestSnapshotJson, state.executions[1].requestSnapshotJson);
  assert.ok(next.events.some(e => e.eventType === 'EXECUTION_RESUMED'));
  const nextId = Number(next.id);
  const nextPlan = await runAiCommand(['plan', String(taskId), String(nextId)]);
  assert.equal(nextPlan.nextAction, 'START_RECOVERED');
  await assert.rejects(() => runAiCommand(['start', String(taskId), String(firstId)]),
    /不匹配/);
  console.log('AI_RECOVERY_NEW_ATTEMPT task=' + taskId + ' execution=' + nextId);

  await runAiCommand(['start', String(taskId), String(nextId)]);
  await runAiCommand(['event', String(taskId), String(nextId), 'STEP_STARTED',
    'recovery-resume-step-1', 'Verifying local health after checkpoint']);
  const healthResponse = await fetch(BASE + '/api/health',
    { signal: AbortSignal.timeout(5000) });
  assert.equal(healthResponse.status, 200);
  assert.equal((await healthResponse.json()).status, 'UP');
  await runAiCommand(['event', String(taskId), String(nextId), 'ASSERTION_PASSED',
    'recovery-health-up', 'Observed local GET health HTTP 200 and UP']);
  await runAiCommand(['complete', String(taskId), String(nextId), 'PASS',
    'Observed local GET /api/health HTTP 200; status UP after recovery']);
  state = await read();
  assert.equal(state.task.taskStatus, 'COMPLETED');
  assert.equal(state.executions[0].result, 'PASS');
  assert.equal(state.executions[1].executionStatus, 'INTERRUPTED');
  const report = await fetch(BASE + '/api/test-cycles/' + cycleId + '/report');
  assert.equal(report.status, 200);
  console.log('REAL_AI_RECOVERY_E2E_PASS cycle=' + cycleId +
    ' task=' + taskId + ' interrupted=' + firstId +
    ' resumed=' + nextId + ' result=PASS');
} catch (error) {
  console.error('REAL_AI_RECOVERY_E2E_INCOMPLETE cycle=' + cycleId +
    ' task=' + taskId + ' inspect before doing anything else: ' + error.message);
  process.exitCode = 1;
}
