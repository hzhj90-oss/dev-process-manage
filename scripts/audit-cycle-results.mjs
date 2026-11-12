// Read-only cross-module consistency audit for local test cycles.
// Uses only GET against the fixed loopback manager; never creates tasks or edits data.
const origin = 'http://127.0.0.1:18090';
const RESULTS = ['PASS', 'FAIL', 'BLOCKED', 'SKIPPED', 'NOT_RUN'];
const TERMINAL_CASE = new Set(['COMPLETED', 'CANCELLED']);
const MAX_CYCLES = 500;
const BATCH_SIZE = 4;
const errors = [];
const warnings = [];
let cycleCount = 0;
let caseCount = 0;
let attempts = 0;

function nonnegative(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}
function error(id, code) {
  errors.push('cycle=' + id + ' check=' + code);
}
function warning(id, code) {
  warnings.push('cycle=' + id + ' check=' + code);
}
async function get(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(origin + path, {
      method: 'GET', signal: controller.signal,
      headers: { accept: 'application/json' }
    });
    if (!response.ok) throw new Error('HTTP ' + response.status + ' from ' + path.split('?')[0]);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}
function computeCounts(cases, id) {
  const counts = Object.fromEntries(RESULTS.map(result => [result, 0]));
  for (const item of cases) {
    if (!RESULTS.includes(item.latestResult)) {
      error(id, 'invalid-latest-result');
      continue;
    }
    counts[item.latestResult]++;
    const status = item.executionStatus;
    if (!['PENDING', 'RUNNING', 'WAITING_HUMAN', 'RECOVERY_REQUIRED', 'COMPLETED',
      'CANCELLED'].includes(status)) error(id, 'invalid-case-status');
    if (status === 'COMPLETED' && item.latestResult === 'NOT_RUN') {
      error(id, 'completed-without-result');
    }
    if (status !== 'COMPLETED' && item.latestResult !== 'NOT_RUN') {
      // Older rows may predate the new-task result reset. Report them as warnings
      // rather than rewriting historical execution data.
      warning(id, 'stale-result-on-nonterminal-case');
    }
  }
  return counts;
}
async function verifyCycle(summary) {
  const id = nonnegative(summary.id);
  if (!id || id > Number.MAX_SAFE_INTEGER) {
    error('invalid', 'cycle-id');
    return;
  }
  const [detail, review] = await Promise.all([
    get('/api/test-cycles/' + id),
    get('/api/test-cycles/' + id + '/report/review')
  ]);
  cycleCount++;
  const cases = Array.isArray(detail.cases) ? detail.cases : [];
  caseCount += cases.length;
  const counts = computeCounts(cases, id);
  if (nonnegative(summary.caseCount) !== cases.length
      || nonnegative(detail.caseCount) !== cases.length
      || nonnegative(review.total) !== cases.length
      || !Array.isArray(review.rows) || review.rows.length !== cases.length) {
    error(id, 'case-total');
  }
  if (nonnegative(review.cycleId) !== id || review.cycleStatus !== summary.status
      || detail.status !== summary.status) error(id, 'cycle-metadata');

  const fieldNames = {
    PASS: 'passCount', FAIL: 'failCount', BLOCKED: 'blockedCount',
    SKIPPED: 'skippedCount', NOT_RUN: 'notRunCount'
  };
  for (const [result, field] of Object.entries(fieldNames)) {
    if (nonnegative(summary[field]) !== counts[result]
      || nonnegative(detail[field]) !== counts[result]
      || nonnegative(review.counts?.[result]) !== counts[result]) {
      error(id, 'result-count-' + result.toLowerCase());
    }
  }
  const reviewById = new Map();
  for (const row of review.rows || []) {
    if (reviewById.has(row.cycleCaseId)) error(id, 'duplicate-review-case');
    reviewById.set(row.cycleCaseId, row);
    const count = nonnegative(row.attemptCount);
    if (count === null) error(id, 'bad-attempt-count');
    else attempts += count;
    if ((row.taskId == null) !== (row.executionId == null)
      || (row.taskId == null && count > 0)
      || (row.executionId != null && count === 0)) {
      error(id, 'attempt-reference');
    }
  }
  for (const item of cases) {
    const row = reviewById.get(item.id);
    if (!row || row.latestResult !== item.latestResult
      || row.executionStatus !== item.executionStatus
      || row.executionMode !== item.executionMode) {
      error(id, 'review-case-metadata');
    }
  }
  if (summary.status === 'COMPLETED'
      && cases.some(item => !TERMINAL_CASE.has(item.executionStatus))) {
    error(id, 'completed-cycle-has-nonterminal-case');
  }
  if (summary.status === 'RUNNING' && cases.length > 0
      && cases.every(item => TERMINAL_CASE.has(item.executionStatus))) {
    warning(id, 'running-cycle-all-terminal');
  }
}

async function main() {
  const limit = nonnegative(process.argv[2] ?? MAX_CYCLES);
  if (limit === null || limit < 1 || limit > MAX_CYCLES) {
    throw new Error('Audit limit must be between 1 and 500');
  }
  const health = await get('/api/health');
  if (health.status !== 'UP') throw new Error('Local manager is not healthy');
  const list = [];
  let total = null;
  for (let page = 1; list.length < limit; page++) {
    const data = await get('/api/test-cycles?pageNum=' + page + '&pageSize=100');
    if (total == null) total = nonnegative(data.total);
    if (!Array.isArray(data.list)) throw new Error('Cycle page list is invalid');
    list.push(...data.list);
    if (data.list.length < 100 || list.length >= total) break;
    if (page > 5) throw new Error('Exceeded bounded cycle pagination');
  }
  if (total == null) throw new Error('Cycle page total is invalid');
  const selected = list.slice(0, limit);
  for (let i = 0; i < selected.length; i += BATCH_SIZE) {
    const current = selected.slice(i, i + BATCH_SIZE);
    await Promise.all(current.map(verifyCycle));
  }
  // When the scan covers the whole dataset, the SQL diagnostic and the
  // case-by-case API audit must identify the same historical drift candidates.
  // Skip this comparison for partial scans to avoid misleading differences.
  if (total <= limit && total <= 200) {
    const diagnosis = await get('/api/test-cycles/diagnostics?limit=200');
    const flagged = new Set(warnings
      .filter(item => item.endsWith('check=running-cycle-all-terminal'))
      .map(item => Number(item.split(' ')[0].slice('cycle='.length))));
    const diagnosed = new Set((diagnosis.items || []).map(item => Number(item.cycleId)));
    if (diagnosis.readOnly !== true || diagnosis.truncated !== false
        || diagnosis.count !== diagnosed.size || flagged.size !== diagnosed.size
        || [...flagged].some(id => !diagnosed.has(id))) {
      error('audit', 'diagnostic-api-disagrees-with-case-statuses');
    }
  }
  if (total > limit) warning('audit', 'limited-to-' + limit + '-of-' + total);
  console.log('CYCLE_RESULT_AUDIT cycles=' + cycleCount
    + ' cases=' + caseCount + ' attempts=' + attempts
    + ' errors=' + errors.length + ' warnings=' + warnings.length);
  if (warnings.length) console.log('WARNINGS ' + [...new Set(warnings)].slice(0, 20).join('; '));
  if (errors.length) {
    console.error('ERRORS ' + [...new Set(errors)].slice(0, 20).join('; '));
    process.exitCode = 1;
  } else {
    console.log('CYCLE_RESULT_AUDIT_PASS=true (GET-only, no task mutations)');
  }
}
main().catch(error => {
  console.error('CYCLE_RESULT_AUDIT_FAILED: ' + error.message.slice(0, 220));
  process.exitCode = 1;
});
