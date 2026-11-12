// Opt-in end-to-end workflow acceptance. Creates ONLY tagged DPM-VERIFY-FLOW data.
// Fixed loopback target; no cleanup of existing records and no production endpoints.
import assert from 'node:assert/strict';

const BASE = 'http://127.0.0.1:18090';
const VERIFY = process.env.DPM_FLOW_E2E_ALLOW_WRITE === 'YES';
const uid = Date.now().toString(36).toUpperCase();
const owner = 'dpm-flow-e2e';
const projectCode = 'DPM-VERIFY-FLOW-' + uid;
const ids = {};

async function api(method, path, payload, extraHeaders = {}) {
  const response = await fetch(BASE + path, {
    method,
    headers: {
      ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
      ...extraHeaders
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    signal: AbortSignal.timeout(15000)
  });
  const content = await response.text();
  let json;
  try { json = content ? JSON.parse(content) : null; }
  catch { throw Error(method + ' ' + path.split('?')[0] + ': invalid JSON, HTTP ' + response.status); }
  if (!response.ok) {
    throw Error(method + ' ' + path.split('?')[0] + ' HTTP ' + response.status
      + ': ' + JSON.stringify(json).slice(0, 240));
  }
  return json;
}
async function checkedFetch(path, accept) {
  const res = await fetch(BASE + path, { signal: AbortSignal.timeout(15000) });
  assert.equal(res.status, 200, path);
  if (accept) assert.match(res.headers.get('content-type') || '', accept);
  return res.text();
}
function event(label, value) {
  console.log('FLOW_E2E ' + label + '=' + String(value));
}
async function main() {
  assert.equal((await api('GET', '/api/health')).status, 'UP');
  const environments = await api('GET', '/api/environments?activeOnly=false');
  const environment = environments.find(item => item.environmentCode === 'BROWSER_E2E_20261111');
  assert.ok(environment, 'Dedicated non-production local verification environment missing');
  assert.equal(environment.environmentType, 'TEST');
  assert.equal(environment.authType, 'NONE');
  assert.equal(environment.baseUrl, BASE);
  assert.equal(environment.active, true);
  event('HEALTH', 'UP');
  event('ENV_ID', environment.id);

  // Recheck a previously created fixture without adding a second project.
  const recheckIdRaw = process.env.DPM_FLOW_E2E_RECHECK_CYCLE_ID;
  if (recheckIdRaw !== undefined) {
    assert.match(recheckIdRaw, /^[1-9][0-9]{0,14}$/, 'Invalid recheck cycle ID');
    const id = Number(recheckIdRaw);
    assert.ok(Number.isSafeInteger(id));
    const cycle = await api('GET', '/api/test-cycles/' + id);
    assert.ok(String(cycle.projectCode || '').startsWith('DPM-VERIFY-FLOW-'),
      'Recheck is restricted to tagged verification projects');
    assert.equal(cycle.status, 'COMPLETED');
    assert.equal(cycle.caseCount, 1);
    assert.equal(cycle.passCount, 1);
    const caseRow = cycle.cases[0];
    assert.equal(caseRow.latestResult, 'PASS');
    assert.equal(caseRow.requirements.length, 1);
    assert.ok(JSON.parse(caseRow.requirements[0].requirementSnapshotJson).requirementNo
      .startsWith('REQ-FLOW-'));
    assert.ok(JSON.parse(caseRow.requirements[0].designSnapshotJson).title
      .includes('完整链路详细设计'));
    const review = await api('GET', '/api/test-cycles/' + id + '/report/review');
    assert.equal(review.counts.PASS, 1);
    assert.equal(review.rows[0].attemptCount, 1);
    const task = await api('GET', '/api/execution-tasks/' + review.rows[0].taskId);
    assert.equal(task.task.taskStatus, 'COMPLETED');
    assert.equal(task.executions[0].result, 'PASS');
    const html = await checkedFetch('/api/test-cycles/' + id + '/report', /text\/html/);
    assert.ok(html.includes(caseRow.caseNo));
    assert.ok(html.includes(caseRow.requirements[0].requirementNo));
    const response = await fetch(BASE + '/api/test-cycles/' + id + '/report.csv');
    assert.equal(response.status, 200);
    const csvBytes = Buffer.from(await response.arrayBuffer());
    assert.equal(csvBytes.subarray(0, 3).toString('hex'), 'efbbbf');
    assert.ok(csvBytes.subarray(3).toString('utf8').includes(caseRow.caseNo));
    event('RECHECK', id);
    console.log('FLOW_BUSINESS_E2E_RECHECK_PASS cycle=' + id
      + ' case=' + caseRow.id + ' task=' + task.task.id + ' writes=0');
    return;
  }

  if (!VERIFY) {
    event('MODE', 'READ_ONLY');
    event('PRECHECK_PASS', true);
    console.log('FLOW_E2E_WRITE_SKIPPED Set DPM_FLOW_E2E_ALLOW_WRITE=YES to create tagged test records.');
    return;
  }

  const project = await api('POST', '/api/projects', {
    projectCode, projectName: '验证项目 · 全业务链路 ' + uid,
    description: 'Isolated local E2E fixture; do not confuse with business projects',
    mainBranch: 'main', status: 'ACTIVE'
  });
  ids.projectId = project.id;
  assert.equal(project.projectCode, projectCode);

  const version = await api('POST', '/api/versions', {
    projectId: project.id, versionNo: 'FLOW-' + uid, versionName: '全链路验证版本',
    status: 'PLANNING', description: 'Local smoke, no production deployment'
  });
  ids.versionId = version.id;
  assert.equal(version.projectId, project.id);

  const reqNo = 'REQ-FLOW-' + uid;
  const requirement = await api('POST', '/api/requirements', {
    versionId: version.id, requirementNo: reqNo,
    title: '验证测试执行及报告形成闭环', requirementType: 'FUNCTIONAL',
    contentMarkdown: '## 目标\n从项目到测试报告全过程可追踪。\n\n验收：单用例通过且可回查设计快照。',
    status: 'DRAFT', priority: 'HIGH', ownerName: owner
  });
  ids.requirementId = requirement.id;
  assert.equal(requirement.versionId, version.id);

  const design = await api('POST', '/api/requirements/' + requirement.id + '/designs', {
    designType: 'GENERAL', title: '完整链路详细设计 ' + uid,
    contentMarkdown: '### 流程\n创建用例快照，启动人工测试，登记 PASS，校验报告。',
    status: 'DRAFT', authorName: owner
  });
  ids.designId = design.id;
  assert.equal((await api('GET', '/api/requirements/' + requirement.id + '/designs'))
    .some(row => row.id === design.id), true);

  const caseNo = 'TC-FLOW-' + uid;
  const testCase = await api('POST', '/api/test-cases', {
    caseNo, title: '手工执行结果及关联设计快照验证', status: 'ACTIVE',
    ownerName: owner, testType: 'FUNCTIONAL', priority: 'HIGH',
    executionMode: 'MANUAL', createdBy: owner,
    expectedResult: '完成执行，最终结果为 PASS，报告包含需求和设计快照',
    steps: [
      { action: '读取轮次详情及需求快照', expectedResult: '需求编号与设计修订一致' },
      { action: '登记人工 PASS 结果', expectedResult: '轮次及父子任务状态正确' }
    ],
    requirementIds: [requirement.id]
  });
  ids.testCaseId = testCase.id;
  assert.equal(testCase.caseNo, caseNo);

  const cycle = await api('POST', '/api/test-cycles', {
    versionId: version.id, cycleName: '本地全业务闭环验收 ' + uid,
    cycleStage: 'LOCAL_DEV', environmentId: environment.id,
    codeVersion: 'main-flow-' + uid, gitBranch: 'main',
    description: 'Dedicated verification data; keep for inspection',
    caseIds: [testCase.id], createdBy: owner
  });
  ids.cycleId = cycle.id;
  assert.equal(cycle.status, 'PLANNED');
  assert.equal(cycle.cases.length, 1);
  const cycleCase = cycle.cases[0];
  ids.cycleCaseId = cycleCase.id;
  assert.equal(cycleCase.caseNo, caseNo);
  assert.equal(cycleCase.executionMode, 'MANUAL');
  assert.equal(cycleCase.requirements.length, 1, 'Missing requirement snapshot');
  const snapshot = cycleCase.requirements[0];
  assert.equal(snapshot.requirementId, requirement.id);
  assert.equal(JSON.parse(snapshot.requirementSnapshotJson).requirementNo, reqNo);
  assert.equal(JSON.parse(snapshot.designSnapshotJson).id, design.id);

  const started = await api('POST', '/api/test-cycles/' + cycle.id + '/start');
  assert.equal(started.status, 'RUNNING');

  const key = 'flow-e2e-' + uid;
  const taskResponse = await api('POST',
    '/api/test-cycles/' + cycle.id + '/cycle-cases/' + cycleCase.id + '/execution-tasks',
    { idempotencyKey: key, requestedBy: owner, triggerSource: 'USER' },
    { 'Idempotency-Key': key });
  const taskId = taskResponse.task?.id ?? taskResponse.id;
  assert.ok(taskId);
  ids.taskId = taskId;
  const queued = await api('GET', '/api/execution-tasks/' + taskId);
  assert.equal(queued.task.taskType, 'EXECUTE_CASE');
  assert.equal(queued.task.cycleCaseId, cycleCase.id);
  assert.equal(queued.task.taskStatus, 'PENDING');
  assert.equal(queued.executions.length, 1);
  const executionId = queued.executions[0].id;
  ids.executionId = executionId;

  const rerunKey = await api('POST',
    '/api/test-cycles/' + cycle.id + '/cycle-cases/' + cycleCase.id + '/execution-tasks',
    { idempotencyKey: key, requestedBy: owner, triggerSource: 'USER' },
    { 'Idempotency-Key': key });
  assert.equal(rerunKey.task?.id ?? rerunKey.id, taskId, 'Idempotent request duplicated task');

  const running = await api('POST',
    '/api/execution-tasks/' + taskId + '/executions/' + executionId + '/start',
    { actor: 'MANUAL', executorName: owner });
  assert.equal(running.task.taskStatus, 'RUNNING');
  const complete = await api('POST',
    '/api/execution-tasks/' + taskId + '/executions/' + executionId + '/complete',
    { result: 'PASS', actualResult: 'E2E acceptance succeeded',
      executorName: owner, logExcerpt: 'Only fixed local verification data used' });
  assert.equal(complete.task.taskStatus, 'COMPLETED');
  assert.equal(complete.executions[0].result, 'PASS');

  const finalCycle = await api('GET', '/api/test-cycles/' + cycle.id);
  assert.equal(finalCycle.status, 'COMPLETED');
  assert.equal(finalCycle.caseCount, 1);
  assert.equal(finalCycle.passCount, 1);
  assert.equal(finalCycle.notRunCount, 0);
  assert.equal(finalCycle.cases[0].latestResult, 'PASS');

  const review = await api('GET', '/api/test-cycles/' + cycle.id + '/report/review');
  assert.equal(review.total, 1);
  assert.equal(review.counts.PASS, 1);
  assert.equal(review.rows[0].taskId, taskId);
  assert.equal(review.rows[0].executionId, executionId);
  assert.equal(review.rows[0].attemptCount, 1);
  assert.equal(review.rows[0].latestResult, 'PASS');

  const html = await checkedFetch('/api/test-cycles/' + cycle.id + '/report', /text\/html/);
  assert.ok(html.includes(reqNo), 'HTML report missing requirement number');
  assert.ok(html.includes(caseNo), 'HTML report missing case number');
  assert.ok(html.includes('PASS'), 'HTML report missing PASS result');
  const csvResponse = await fetch(BASE + '/api/test-cycles/' + cycle.id + '/report.csv', {
    signal: AbortSignal.timeout(15000)
  });
  assert.equal(csvResponse.status, 200);
  assert.match(csvResponse.headers.get('content-type') || '', /text\/csv/);
  const csvBytes = Buffer.from(await csvResponse.arrayBuffer());
  assert.equal(csvBytes.subarray(0, 3).toString('hex'), 'efbbbf', 'CSV missing UTF-8 BOM bytes');
  const csv = csvBytes.subarray(3).toString('utf8');
  assert.ok(csv.includes(caseNo), 'CSV missing case number');
  assert.ok(csv.includes('PASS'), 'CSV missing PASS result');

  const linkedRequirements = await api('GET', '/api/test-cases/' + testCase.id);
  assert.equal(linkedRequirements.requirements.some(item => item.requirementId === requirement.id), true);
  console.log('FLOW_BUSINESS_E2E_PASS ' + JSON.stringify({
    ...ids, cycleStatus: finalCycle.status, result: 'PASS',
    snapshots: true, idempotency: true, html: true, csv: true
  }));
}
main().catch(error => {
  console.error('FLOW_BUSINESS_E2E_FAILED stageIds=' + JSON.stringify(ids)
    + ' reason=' + error.message);
  process.exitCode = 1;
});
