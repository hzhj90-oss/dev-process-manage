// Real Chrome download of read-only CSV for an existing cycle. No test DB mutations.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const origin = 'http://127.0.0.1:18090';
const response = await fetch(origin + '/api/test-cycles?pageNum=1&pageSize=10', {
  signal: AbortSignal.timeout(10000)
});
assert.equal(response.status, 200);
const list = (await response.json()).list ?? [];
const cycle = list.find(item => Number(item.caseCount) > 0);
assert.ok(cycle, 'A seeded cycle with test cases is required');
const detailResponse = await fetch(origin + '/api/test-cycles/' + cycle.id, {
  signal: AbortSignal.timeout(10000)
});
assert.equal(detailResponse.status, 200);
const detail = await detailResponse.json();
const browser = await chromium.launch({
  executablePath: process.env.DPM_CHROME_PATH,
  headless: true, args: ['--disable-extensions', '--no-first-run']
});
try {
  const context = await browser.newContext({ acceptDownloads: true, serviceWorkers: 'block' });
  const page = await context.newPage();
  let writeRequests = 0;
  page.on('request', req => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) writeRequests++;
  });
  await page.goto(origin + '/#/test-reports', { waitUntil: 'domcontentloaded' });
  // Match an existing first-page cycle: no database writes or mock API rows.
  const target = page.locator('.el-table__body tr').filter({
    has: page.getByText('编号 #' + cycle.id, { exact: false })
  });
  await target.waitFor({ state: 'visible', timeout: 12000 });
  const waiting = page.waitForEvent('download');
  await target.getByRole('button', { name: '下载 CSV' }).click();
  const download = await waiting;
  assert.equal(download.suggestedFilename(), 'test-cycle-' + cycle.id + '-report.csv');
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const piece of stream) chunks.push(piece);
  const csv = Buffer.concat(chunks).toString('utf8');
  assert.ok(csv.startsWith('\uFEFF"项目","版本","测试轮次"'));
  assert.ok(csv.endsWith('\r\n'), 'CSV must end in CRLF');
  const rowCount = csv.split('\r\n').length - 2;
  assert.equal(rowCount, detail.cases.length, 'One row per case must be exported');
  for (const forbidden of ['requestSnapshotJson', 'checkpointJson',
    'eventContent', 'logExcerpt', 'sourceContent']) {
    assert.ok(!csv.includes(forbidden), forbidden + ' leaked into CSV');
  }
  assert.equal(writeRequests, 0, 'Report download is read-only');
  console.log('BROWSER_REPORT_CSV_PASS cycle=' + cycle.id
    + ' cases=' + rowCount + ' writeRequests=' + writeRequests);
  await context.close();
} finally {
  await browser.close();
}
