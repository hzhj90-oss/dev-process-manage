// UI regression for task attention alerts and typed recovery confirmation.
// All failure/recovery records are browser-mocked; no database writes.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const origin = 'http://127.0.0.1:18090';
const browser = await chromium.launch({
  executablePath: process.env.DPM_CHROME_PATH,
  headless: true, args: ['--disable-extensions', '--no-first-run']
});
let resumePosts = 0;
let resumed = false;
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const counts = { PENDING: 5, WAITING_HUMAN: 1, RECOVERY_REQUIRED: 2 };

  await page.route('**/api/runner/status', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      observedAt: '2026-11-11T00:00:00Z', offlineAfterSeconds: 30,
      summary: [
        { runnerType: 'HTTP', knownCount: 1, onlineCount: 0 },
        { runnerType: 'NODE', knownCount: 1, onlineCount: 1 },
        { runnerType: 'BROWSER', knownCount: 0, onlineCount: 0 }
      ],
      runners: [
        { runnerType: 'HTTP', runnerId: 'http-offline', online: false, secondsSinceLastSeen: 45 },
        { runnerType: 'NODE', runnerId: 'node-online', online: true, secondsSinceLastSeen: 2 }
      ]
    })
  }));
  await page.route('**/api/execution-tasks/999999/resume', async route => {
    resumePosts++;
    resumed = true;
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({
        task: {id:999999, taskNo:'DPM-MOCK-RECOVERY',taskType:'EXECUTE_CASE',
          taskStatus:'PENDING'},
        executions: [
          {id:778,attemptNo:2,executionStatus:'QUEUED',runnerType:'HTTP'},
          {id:777,attemptNo:1,executionStatus:'INTERRUPTED',runnerType:'HTTP'}
        ]
      }) });
  });
  await page.route('**/api/execution-tasks/999999', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      task: { id: 999999, taskNo: 'DPM-MOCK-RECOVERY', taskType: 'EXECUTE_CASE',
        taskStatus: resumed ? 'PENDING' : 'RECOVERY_REQUIRED' },
      executions: resumed ? [
        { id: 778, attemptNo: 2, executionStatus: 'QUEUED', runnerType: 'HTTP' },
        { id: 777, attemptNo: 1, executionStatus: 'INTERRUPTED', runnerType: 'HTTP' }
      ] : [{ id: 777, attemptNo: 1, executionStatus: 'INTERRUPTED',
        runnerType: 'HTTP', result: null }]
    })
  }));
  await page.route('**/api/execution-tasks?**', async route => {
    const url = new URL(route.request().url());
    const status = url.searchParams.get('status');
    const size = Number(url.searchParams.get('pageSize'));
    if (size === 1 && Object.hasOwn(counts, status)) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ list: [], total: counts[status], pageNum: 1, pageSize: 1 })
      });
    }
    if (status === 'RECOVERY_REQUIRED') {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ list: [{
          id: 999999, taskNo: 'DPM-MOCK-RECOVERY', taskType: 'EXECUTE_CASE',
          taskStatus: 'RECOVERY_REQUIRED', cycleName: 'UI-only mock test',
          environmentName: 'TEST', environmentCode: 'UI-MOCK', caseCount: 1
        }], total: 1, pageNum: 1, pageSize: 10 })
      });
    }
    return route.continue();
  });

  await page.goto(origin + '/#/execution-tasks', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const text = document.querySelector('.attention-summary')?.textContent || '';
    return text.includes('5') && text.includes('1') && text.includes('2');
  }, null, { timeout: 12000 });
  const values = await page.locator('.attention-item strong').allInnerTexts();
  assert.deepEqual(values.map(value => value.trim()), ['5','1','2']);
  const alerts = await page.locator('.attention-card .el-alert').allInnerTexts();
  assert.ok(alerts.some(value => value.includes('人工确认恢复')));
  assert.ok(alerts.some(value => value.includes('等待人工确认')));
  assert.ok(alerts.some(value => value.includes('HTTP Runner')));

  await page.locator('.attention-item').filter({ hasText: '待恢复' })
    .getByRole('button', { name: '查看任务' }).click();
  await page.locator('.el-table__row').filter({ hasText: 'DPM-MOCK-RECOVERY' })
    .waitFor({ state: 'visible', timeout: 10000 });
  await page.getByRole('button', { name: '人工恢复' }).click();
  const dialog = page.locator('.el-message-box');
  await dialog.getByText('人工确认恢复执行').waitFor({ state: 'visible' });
  assert.match(await dialog.innerText(), /从第一步重新执行/);
  await dialog.locator('input').fill('错误');
  await dialog.getByRole('button', { name: '确认恢复' }).click();
  await dialog.getByText('请输入“恢复”以确认已核查风险').waitFor({ state: 'visible' });
  assert.equal(resumePosts, 0, 'Invalid confirmation must never submit a recovery');
  await dialog.locator('input').fill('恢复');
  await dialog.getByRole('button', { name: '取消' }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(resumePosts, 0, 'Cancelling confirmation must not call the recovery API');
  await page.getByRole('button', { name: '人工恢复' }).click();
  await dialog.locator('input').fill('恢复');
  const confirmed = page.waitForResponse(response => response.url().endsWith('/999999/resume'));
  await dialog.getByRole('button', { name: '确认恢复' }).click();
  const submitted = await confirmed;
  assert.equal(submitted.status(), 200);
  assert.equal(resumePosts, 1, 'Only a typed confirmation may call the recovery API');
  assert.deepEqual(pageErrors, []);
  console.log('BROWSER_ATTENTION_UI_PASS counters=5/1/2 alerts=3 recovery-posts=1-after-confirmation');
  await context.close();
} finally {
  await browser.close();
}
