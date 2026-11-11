// Non-destructive check that dashboard counters equal live API totals.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const origin = 'http://127.0.0.1:18090';
const paths = [
  '/api/projects?pageNum=1&pageSize=1',
  '/api/versions?pageNum=1&pageSize=1',
  '/api/environments?activeOnly=false',
  '/api/test-cases?pageNum=1&pageSize=1',
  '/api/test-cycles?pageNum=1&pageSize=1',
  '/api/execution-tasks?pageNum=1&pageSize=1'
];
const responses = await Promise.all(paths.map(async path => {
  const response = await fetch(origin + path, { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200, path);
  return response.json();
}));
const expected = responses.map((value, i) => String(i === 2 ? value.length : value.total));
const browser = await chromium.launch({
  executablePath: process.env.DPM_CHROME_PATH,
  headless: true, args: ['--disable-extensions', '--no-first-run']
});
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.goto(origin + '/#/', { waitUntil: 'domcontentloaded' });
  const cards = page.locator('.stats-grid .stat-card');
  await cards.first().locator('strong').waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const values = [...document.querySelectorAll('.stats-grid .stat-card strong')]
      .map(element => element.textContent.trim());
    return values.length === 6 && values.every(value => value !== '—');
  }, null, { timeout: 10000 });
  const actual = await cards.locator('strong').allInnerTexts();
  assert.deepEqual(actual.map(text => text.trim()), expected, 'Dashboard totals should equal the live APIs');
  assert.equal(await page.locator('.module-grid .module-card').count(), 8);
  for (const path of ['/projects', '/versions', '/requirements', '/test-cases',
    '/test-scripts', '/test-cycles', '/execution-tasks', '/test-reports']) {
    assert.equal(await page.locator('.module-grid a[href="#' + path + '"]').count(), 1,
      'Missing dashboard module navigation: ' + path);
  }
  assert.equal(await page.locator('.dashboard-load-error').count(), 0);
  console.log('DASHBOARD_LIVE_STATS_PASS counts=' + actual.join(',') + ' modules=8');
  await context.close();
} finally {
  await browser.close();
}
