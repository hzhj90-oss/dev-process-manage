import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

// Non-destructive: verify real worker presence, then simulate mixed states in browser only.
const manager = 'http://127.0.0.1:18090';
const response = await fetch(manager + '/api/runner/status', { signal: AbortSignal.timeout(10000) });
assert.equal(response.status, 200);
const live = await response.json();
assert.equal(live.summary.length, 3);
for (const type of ['HTTP', 'NODE', 'BROWSER']) {
  const row = live.summary.find(item => item.runnerType === type);
  assert.ok(row, 'Missing Runner category ' + type);
  assert.ok(row.onlineCount >= 1, 'Expected a live local ' + type + ' Runner');
}
const browser = await chromium.launch({
  executablePath: process.env.DPM_CHROME_PATH,
  headless: true, args: ['--disable-extensions', '--no-first-run']
});
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.goto(manager + '/#/execution-tasks', { waitUntil: 'domcontentloaded' });
  const cards = page.locator('.runner-status-item');
  await page.waitForFunction(() => {
    const items = [...document.querySelectorAll('.runner-status-item .el-tag')];
    return items.length === 3 && items.every(item => item.textContent.includes('在线'));
  }, null, { timeout: 15000 });
  assert.equal(await cards.count(), 3);

  const mock = {
    observedAt: '2026-11-11T00:00:00Z', offlineAfterSeconds: 30,
    summary: [
      { runnerType: 'HTTP', onlineCount: 1, knownCount: 1 },
      { runnerType: 'NODE', onlineCount: 0, knownCount: 1 },
      { runnerType: 'BROWSER', onlineCount: 0, knownCount: 0 }
    ],
    runners: [
      { runnerType: 'HTTP', runnerId: 'http-live-1', online: true, secondsSinceLastSeen: 2 },
      { runnerType: 'NODE', runnerId: 'node-offline-1', online: false, secondsSinceLastSeen: 35 }
    ]
  };
  await page.route('**/api/runner/status', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(mock)
  }));
  await page.getByRole('button', { name: '刷新状态' }).click();
  await page.waitForFunction(() => {
    const labels = [...document.querySelectorAll('.runner-status-item .el-tag')]
      .map(item => item.textContent.trim());
    return labels.length === 3 && labels[0].includes('在线') &&
      labels[1].includes('离线') && labels[2].includes('未连接');
  }, null, { timeout: 10000 });
  assert.match(await cards.nth(1).innerText(), /node-offline-1/);
  assert.match(await cards.nth(2).innerText(), /暂无该类型执行器上报/);
  console.log('RUNNER_MONITOR_UI_PASS live=3 mocked=online/offline/unseen');
  await context.close();
} finally {
  await browser.close();
}
