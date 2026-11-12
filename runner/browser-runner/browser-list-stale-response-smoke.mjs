// GET-only real Chrome concurrency test, with one intercepted PUT (never reaches server).
// Verifies latest-response-wins, persistent reload errors, retry, and fixed edit ID.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const origin = 'http://127.0.0.1:18090';
const fixture = (id, code) => ({
  id, projectCode: code, projectName: code,
  repositoryUrl: null, mainBranch: 'main', versionCount: 0,
  status: 'ACTIVE', updatedAt: '2026-11-12T08:00:00'
});
const list = (items) => ({
  list: items, total: items.length, pageNum: 1, pageSize: 10
});
let releaseOld;
const oldGate = new Promise(resolve => { releaseOld = resolve; });
let oldArrived;
const oldRequest = new Promise(resolve => { oldArrived = resolve; });
let oldCompleted;
const oldDone = new Promise(resolve => { oldCompleted = resolve; });
const browser = await chromium.launch({
  executablePath: process.env.DPM_CHROME_PATH,
  headless: true, args: ['--disable-extensions', '--no-first-run']
});
let mockedWrites = 0;
let actualWrites = 0;
let exceptions = 0;
let retryEnabled = false;
let editPageLoads = 0;
let phase = 'normal';
let updatedId = null;
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('pageerror', () => exceptions++);
  page.on('request', request => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())
      && !request.url().includes('/api/projects/987654')) actualWrites++;
  });
  await page.route(/\/api\/projects(?:\?|\/|$)/, async route => {
    const request = route.request();
    if (request.method() === 'PUT') {
      mockedWrites++;
      const match = new URL(request.url()).pathname.match(/\/api\/projects\/(\d+)$/);
      updatedId = Number(match?.[1] ?? 0);
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify(fixture(987654, 'DPM-RACE-EDIT'))
      });
      return;
    }
    const keyword = new URL(request.url()).searchParams.get('keyword') || '';
    if (phase === 'edit') {
      editPageLoads++;
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify(list(editPageLoads === 1
          ? [fixture(987654, 'DPM-RACE-EDIT')] : []))
      });
      return;
    }
    if (keyword === 'DPM-RACE-OLD') {
      oldArrived();
      await oldGate;
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify(list([fixture(111111, 'DPM-RACE-OLD')]))
      });
      oldCompleted();
    } else if (keyword === 'DPM-RACE-NEW') {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify(list([fixture(222222, 'DPM-RACE-NEW')]))
      });
    } else if (keyword === 'DPM-RACE-ERROR' && !retryEnabled) {
      await route.fulfill({
        status: 503, contentType: 'application/json',
        body: JSON.stringify({ message: '模拟服务不可用' })
      });
    } else if (keyword === 'DPM-RACE-ERROR') {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify(list([fixture(333333, 'DPM-RACE-RETRIED')]))
      });
    } else {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify(list([fixture(987654, 'DPM-RACE-EDIT')]))
      });
    }
  });

  await page.goto(origin + '/#/projects', { waitUntil: 'domcontentloaded' });
  const keywordInput = page.getByPlaceholder('搜索项目编码或名称');
  await page.locator('.el-table__body tr').first().waitFor();
  await keywordInput.fill('DPM-RACE-OLD');
  await page.getByRole('button', { name: '查询' }).click();
  await oldRequest;
  await keywordInput.fill('DPM-RACE-NEW');
  await page.getByRole('button', { name: '查询' }).click();
  await page.getByText('DPM-RACE-NEW', { exact: true }).first()
    .waitFor({ state: 'visible', timeout: 12000 });
  releaseOld();
  await oldDone;
  await page.waitForTimeout(400);
  const bodyAfterRace = await page.locator('.el-table__body').innerText();
  assert.ok(bodyAfterRace.includes('DPM-RACE-NEW'), 'Fresh result must remain');
  assert.ok(!bodyAfterRace.includes('DPM-RACE-OLD'), 'Stale result must be ignored');

  await keywordInput.fill('DPM-RACE-ERROR');
  await page.getByRole('button', { name: '查询' }).click();
  const alert = page.locator('.el-alert').filter({ hasText: '项目列表加载失败' });
  await alert.waitFor({ state: 'visible', timeout: 12000 });
  assert.ok((await alert.innerText()).includes('模拟服务不可用'));
  assert.equal(await page.locator('.el-table__body tr').filter({
    hasText: 'DPM-RACE-NEW'
  }).count(), 0, 'Failed search must not show the previous result');

  retryEnabled = true;
  await alert.getByRole('button', { name: '重试加载' }).click();
  await page.getByText('DPM-RACE-RETRIED', { exact: true }).first()
    .waitFor({ state: 'visible', timeout: 12000 });
  await alert.waitFor({ state: 'hidden', timeout: 12000 });

  phase = 'edit';
  await page.getByRole('button', { name: '重置' }).click();
  await page.getByText('DPM-RACE-EDIT', { exact: true }).first()
    .waitFor({ state: 'visible', timeout: 12000 });
  await page.locator('.el-table__body tr').first()
    .getByRole('button', { name: '编辑' }).click();
  const dialog = page.locator('.el-dialog:visible').filter({ hasText: '编辑项目' });
  await dialog.waitFor({ state: 'visible' });
  // Background list is changed after opening the form. The save must not
  // search the new list for the ID of the original record.
  await page.locator('.table-toolbar button').first().evaluate(element => element.click());
  await page.locator('.el-table__body tr').first().waitFor({ state: 'hidden' });
  await dialog.getByRole('button', { name: '保存' }).click();
  await dialog.waitFor({ state: 'hidden', timeout: 12000 });
  assert.equal(updatedId, 987654, 'Save must target the original record ID');
  assert.equal(mockedWrites, 1, 'Only one mocked PUT is allowed');
  assert.equal(actualWrites, 0, 'No writes may reach the real backend');
  assert.equal(exceptions, 0, 'No Vue/Chrome runtime errors');
  console.log('BROWSER_LIST_RACE_PASS staleIgnored=true latestErrorShown=true'
    + ' retryWorks=true editIdPreserved=true interceptedPut=1 backendWrites=0');
  await context.close();
} finally {
  releaseOld();
  await browser.close();
}
