// Real browser failure triage -> read-only execution detail. Never creates tasks.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const origin = 'http://127.0.0.1:18090';
const cycleResponse = await fetch(origin + '/api/test-cycles?pageNum=1&pageSize=10', {
  signal: AbortSignal.timeout(10000)
});
assert.equal(cycleResponse.status, 200);
const cycles = (await cycleResponse.json()).list || [];
const cycle = cycles.find(row => Number(row.failCount) > 0);
assert.ok(cycle, 'Need an existing cycle with a failed case in the first page');
const reviewResponse = await fetch(origin + '/api/test-cycles/' + cycle.id + '/report/review', {
  signal: AbortSignal.timeout(10000)
});
assert.equal(reviewResponse.status, 200);
const review = await reviewResponse.json();
assert.equal(review.cycleId, cycle.id);
const failed = review.rows.find(row => row.latestResult === 'FAIL' && row.taskId);
assert.ok(failed, 'Need an existing failed case associated with a task');
const clean = JSON.stringify(review);
for (const forbidden of ['requestSnapshotJson', 'checkpointJson', 'eventContent',
  'logExcerpt', 'sourceContent', 'credentialRef', 'environmentSnapshotJson']) {
  assert.ok(!clean.includes(forbidden), forbidden + ' should never appear in review');
}
const detailResponse = await fetch(origin + '/api/execution-tasks/' + failed.taskId, {
  signal: AbortSignal.timeout(10000)
});
assert.equal(detailResponse.status, 200);
const expectedTask = (await detailResponse.json()).task;
assert.equal(expectedTask.cycleCaseId, failed.cycleCaseId);
assert.equal(expectedTask.cycleId, cycle.id);

const browser = await chromium.launch({
  executablePath: process.env.DPM_CHROME_PATH,
  headless: true,
  args: ['--disable-extensions', '--no-first-run']
});
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  let writeRequests = 0;
  page.on('request', request => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writeRequests++;
  });
  await page.goto(origin + '/#/test-reports', { waitUntil: 'domcontentloaded' });
  const row = page.locator('.el-table__body tr')
    .filter({ has: page.getByText('编号 #' + cycle.id, { exact: false }) });
  await row.waitFor({ state: 'visible', timeout: 12000 });
  await row.getByRole('button', { name: '结果复核' }).click();
  const modal = page.locator('.el-dialog:visible').filter({
    has: page.locator('.review-cycle-name')
  });
  await modal.locator('.review-cycle-name').waitFor({ state: 'visible' });
  const failedRow = modal.locator('.el-table__body tr').filter({ hasText: failed.caseNo });
  await failedRow.waitFor({ state: 'visible', timeout: 12000 });
  assert.ok((await failedRow.innerText()).includes('失败'));
  await failedRow.getByRole('button', { name: '查看执行' }).click();
  await page.waitForFunction(({ id, taskId }) => {
    const hash = location.hash;
    return hash.startsWith('#/execution-tasks?') &&
      new URLSearchParams(hash.split('?')[1]).get('cycleId') === String(id) &&
      new URLSearchParams(hash.split('?')[1]).get('taskId') === String(taskId);
  }, { id: cycle.id, taskId: failed.taskId }, { timeout: 12000 });
  await page.getByPlaceholder('测试轮次 ID').waitFor({ state: 'visible' });
  assert.equal(await page.getByPlaceholder('测试轮次 ID').inputValue(), String(cycle.id));
  await page.locator('.task-detail-heading strong').first().waitFor({
    state: 'visible', timeout: 12000
  });
  assert.equal((await page.locator('.task-detail-heading strong').first().innerText()).trim(),
    expectedTask.taskNo);

  // An inconsistent cycle-case URL must not open a different task.
  await page.goto(origin + '/#/execution-tasks?cycleId=' + cycle.id
    + '&taskId=' + failed.taskId + '&cycleCaseId=999999999', {
    waitUntil: 'domcontentloaded'
  });
  await page.getByPlaceholder('测试轮次 ID').waitFor({ state: 'visible' });
  await page.waitForTimeout(750);
  assert.equal(await page.locator('.task-detail-heading').count(), 0,
    'Mismatched case ID must not open task details');
  assert.equal(writeRequests, 0, 'Review and deep links must remain read-only');
  console.log('BROWSER_REPORT_REVIEW_PASS cycle=' + cycle.id
    + ' case=' + failed.cycleCaseId + ' task=' + failed.taskId
    + ' mismatchRejected=true writeRequests=' + writeRequests);
  await context.close();
} finally {
  await browser.close();
}
