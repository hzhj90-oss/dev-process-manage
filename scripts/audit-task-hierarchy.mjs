// GET-only integrity audit of parent/child execution task state and attempt lifecycle.
// Fixed loopback target, bounded pagination, no script/credential/event output.
const origin = 'http://127.0.0.1:18090';
const MAX_ROOTS = 500;
const PAGE_SIZE = 100;
const BATCH = 5;
const expectedAttemptStatus = {
  PENDING: 'QUEUED',
  RUNNING: 'RUNNING',
  WAITING_HUMAN: 'WAITING_HUMAN',
  RECOVERY_REQUIRED: 'INTERRUPTED',
  COMPLETED: 'COMPLETED',
  FAILED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
};
const terminal = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);
const priority = [
  'RUNNING', 'RECOVERY_REQUIRED', 'WAITING_HUMAN',
  'PENDING', 'FAILED', 'CANCELLED'
];
let rootCount = 0;
let parentCount = 0;
let childCount = 0;
let attemptCount = 0;
const errors = [];

function validId(id) {
  return Number.isSafeInteger(Number(id)) && Number(id) > 0;
}
function fault(taskId, code) {
  errors.push('task=' + taskId + ' check=' + code);
}
async function get(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(origin + path, {
      method: 'GET', signal: controller.signal,
      headers: { accept: 'application/json' }
    });
    if (!response.ok) {
      throw new Error('GET ' + path.split('?')[0] + ' HTTP ' + response.status);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}
function assertExecution(task, executions) {
  const id = Number(task.id);
  if (!Array.isArray(executions) || executions.length === 0) {
    fault(id, 'missing-execution-history');
    return;
  }
  attemptCount += executions.length;
  const latest = executions[0];
  const status = expectedAttemptStatus[task.taskStatus];
  if (!status) {
    fault(id, 'unknown-task-status');
  } else if (latest.executionStatus !== status) {
    fault(id, 'latest-attempt-status-disagrees');
  }
  if (Number(latest.taskId) !== id) fault(id, 'attempt-task-reference');
  if (validId(task.cycleCaseId)
      && Number(latest.cycleCaseId) !== Number(task.cycleCaseId)) {
    fault(id, 'attempt-cycle-case-reference');
  }
  if (task.taskStatus === 'FAILED' && latest.result !== 'BLOCKED') {
    fault(id, 'runner-failure-must-be-blocked');
  }
  if (task.taskStatus === 'COMPLETED'
      && !['PASS', 'FAIL', 'BLOCKED', 'SKIPPED'].includes(latest.result)) {
    fault(id, 'completed-without-final-result');
  }
}
async function auditRoot(root) {
  const id = Number(root.id);
  if (!validId(id)) {
    fault('unknown', 'invalid-root-id');
    return;
  }
  const detail = await get('/api/execution-tasks/' + id);
  if (!detail?.task || Number(detail.task.id) !== id
      || detail.task.taskStatus !== root.taskStatus
      || Number(detail.task.cycleId) !== Number(root.cycleId)
      || detail.task.taskType !== root.taskType
      || detail.task.parentTaskId != null) {
    fault(id, 'root-task-metadata');
    return;
  }
  rootCount++;
  if (root.taskType === 'EXECUTE_CASE') {
    assertExecution(detail.task, detail.executions);
    return;
  }
  if (root.taskType !== 'EXECUTE_CYCLE') {
    fault(id, 'unknown-root-task-type');
    return;
  }
  parentCount++;
  const children = detail.children;
  if (!Array.isArray(children) || children.length === 0) {
    fault(id, 'parent-has-no-children');
    return;
  }
  if (Number(root.caseCount) !== children.length) fault(id, 'parent-case-count');
  const seenCaseIds = new Set();
  const statuses = [];
  for (const child of children) {
    childCount++;
    if (!validId(child.id) || !validId(child.cycleCaseId)
      || child.taskType !== 'EXECUTE_CASE') {
      fault(id, 'invalid-child-reference');
      continue;
    }
    if (seenCaseIds.has(child.cycleCaseId)) fault(id, 'duplicate-cycle-case');
    seenCaseIds.add(child.cycleCaseId);
    statuses.push(child.taskStatus);
    assertExecution(child, child.executions);
  }
  if (root.taskStatus === 'CANCELLED') {
    if (statuses.some(status => !terminal.has(status))) {
      fault(id, 'cancelled-parent-with-active-child');
    }
    return;
  }
  const derived = priority.find(status => statuses.includes(status)) || 'COMPLETED';
  if (root.taskStatus !== derived) {
    fault(id, 'parent-aggregate-status-disagrees');
  }
}
async function main() {
  const requestedLimit = Number(process.argv[2] ?? MAX_ROOTS);
  if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1
      || requestedLimit > MAX_ROOTS) throw new Error('Root limit must be 1 to 500');
  const health = await get('/api/health');
  if (health.status !== 'UP') throw new Error('Local service is unhealthy');
  const roots = [];
  let total = 0;
  for (let page = 1; roots.length < requestedLimit; page++) {
    const data = await get('/api/execution-tasks?pageNum=' + page
      + '&pageSize=' + PAGE_SIZE);
    if (page === 1) total = Number(data.total);
    if (!Array.isArray(data.list)) throw new Error('Invalid root task page');
    roots.push(...data.list);
    if (!data.list.length || data.list.length < PAGE_SIZE || roots.length >= total) break;
    if (page > 5) throw new Error('Task page bound exceeded');
  }
  for (let i = 0; i < Math.min(roots.length, requestedLimit); i += BATCH) {
    await Promise.all(roots.slice(i, i + BATCH)
      .slice(0, requestedLimit - i).map(auditRoot));
  }
  console.log('TASK_HIERARCHY_AUDIT roots=' + rootCount
    + ' parents=' + parentCount + ' children=' + childCount
    + ' attempts=' + attemptCount
    + ' errors=' + errors.length
    + ' truncated=' + (total > requestedLimit));
  if (errors.length) {
    console.error('ERRORS ' + [...new Set(errors)].slice(0, 20).join('; '));
    process.exitCode = 1;
  } else {
    console.log('TASK_HIERARCHY_AUDIT_PASS=true (GET-only)');
  }
}
main().catch(error => {
  console.error('TASK_HIERARCHY_AUDIT_FAILED: ' + error.message.slice(0, 200));
  process.exitCode = 1;
});
