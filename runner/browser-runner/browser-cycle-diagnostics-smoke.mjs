// Real Chrome/read-only status diagnosis of existing test cycles.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const origin = 'http://127.0.0.1:18090';
const api = await fetch(origin + '/api/test-cycles/diagnostics?limit=100', {
  signal: AbortSignal.timeout(12000)
});
assert.equal(api.status, 200);
assert.match(api.headers.get('cache-control') || '', /no-store/i);
const data = await api.json();
assert.equal(data.readOnly, true);
assert.equal(data.count, data.items.length);
assert.equal(data.count,
  data.activeRootCycles + data.noActiveRootCycles + data.noRootTaskCycles);
assert.equal(data.truncated, false, 'Seeded validation database should be below the limit');
for (const row of data.items) {
  assert.equal(row.cycleStatus, 'RUNNING');
  assert.ok(row.caseCount > 0);
  assert.equal(row.completedCases + row.cancelledCases, row.caseCount);
  assert.ok(['ACTIVE_ROOT_TASK', 'NO_ACTIVE_ROOT_TASK', 'NO_ROOT_TASK']
    .includes(row.diagnosticCategory));
  for (const forbidden of ['requestSnapshotJson', 'eventContent',
    'checkpointJson', 'credentialRef', 'leaseTokenHash', 'logExcerpt']) {
    assert.equal(Object.hasOwn(row, forbidden), false);
  }
}
const blocked = await fetch(origin + '/api/test-cycles/diagnostics?limit=0', {
  signal: AbortSignal.timeout(12000)
});
assert.equal(blocked.status, 400, 'Bounded query must reject zero limit');

const browser = await chromium.launch({
  executablePath: process.env.DPM_CHROME_PATH,
  headless: true, args: ['--disable-extensions', '--no-first-run']
});
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  let writeRequests = 0;
  let browserErrors = 0;
  page.on('request', request => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writeRequests++;
  });
  page.on('pageerror', () => browserErrors++);
  await page.goto(origin + '/#/test-cycles', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '轮次状态诊断' }).click();
  const modal = page.locator('.el-dialog:visible').filter({
    has: page.getByText('测试轮次状态诊断（只读）')
  });
  await modal.getByText('发现 ' + data.count + ' 个异常候选').waitFor({
    state: 'visible', timeout: 15000
  });
  const displayed = await modal.locator('.el-table__body tr').count();
  assert.equal(displayed, data.count, 'UI row count must match the API');
  assert.ok(await modal.getByText('仅列出', { exact: false }).count() > 0);
  if (data.count > 0) {
    const first = data.items[0];
    const firstRow = modal.locator('.el-table__body tr').first();
    assert.ok((await firstRow.innerText()).includes('#' + first.cycleId));
    await firstRow.getByRole('button', { name: '查看轮次' }).click();
    await page.locator('.cycle-detail-title').waitFor({ state: 'visible', timeout: 12000 });
    assert.ok((await page.locator('.cycle-detail-title').innerText())
      .includes(first.cycleName), 'Must open the selected cycle, not a different record');
  }
  assert.equal(writeRequests, 0, 'Diagnostics cannot change any task or cycle');
  assert.equal(browserErrors, 0, 'Chrome must not have uncaught errors');
  console.log('BROWSER_CYCLE_DIAGNOSTICS_PASS candidates=' + data.count
    + ' activeRootCycles=' + data.activeRootCycles
    + ' noActiveRootCycles=' + data.noActiveRootCycles
    + ' noRootTaskCycles=' + data.noRootTaskCycles
    + ' writeRequests=' + writeRequests);
  await context.close();
} finally {
  await browser.close();
}
