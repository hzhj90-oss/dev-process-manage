// Headless Chrome verifies the 101st project/version/case option and retry on missing pages.
// Every mutation is forbidden; mocked list APIs do not create persistent records.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const origin = 'http://127.0.0.1:18090';
const projects = Array.from({ length: 101 }, (_, i) => ({
  id: 10001 + i, projectCode: 'DPM-PROJECT-' + String(i + 1).padStart(3, '0'),
  projectName: 'DPM project ' + (i + 1), status: 'ACTIVE'
}));
const versions = Array.from({ length: 101 }, (_, i) => ({
  id: 20001 + i, projectId: 10001, projectName: 'DPM project',
  versionNo: 'DPM-VERSION-' + String(i + 1).padStart(3, '0'),
  versionName: 'DPM version ' + (i + 1), status: 'DEVELOPING'
}));
const cases = Array.from({ length: 101 }, (_, i) => ({
  id: 30001 + i, caseNo: 'DPM-CASE-' + String(i + 1).padStart(3, '0'),
  title: 'DPM case ' + (i + 1), status: 'ACTIVE', executionMode: 'MANUAL'
}));
const counts = { projectPage2: 0, versionPage2: 0, casePage2: 0 };
let missingSecondVersionPage = false;
let writes = 0;
let runtimeErrors = 0;
const browser = await chromium.launch({
  executablePath: process.env.DPM_CHROME_PATH,
  headless: true, args: ['--disable-extensions', '--no-first-run']
});
const pageData = (items, page, size, missing = false) => ({
  list: missing ? [] : items.slice((page - 1) * size, page * size),
  total: items.length, pageNum: page, pageSize: size
});
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('request', request => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes++;
  });
  page.on('pageerror', () => runtimeErrors++);
  await page.route('**/api/projects?**', async route => {
    const query = new URL(route.request().url()).searchParams;
    if (query.get('status') !== 'ACTIVE') return route.continue();
    const pg = Number(query.get('pageNum')), size = Number(query.get('pageSize'));
    if (pg === 2) counts.projectPage2++;
    await route.fulfill({
      contentType: 'application/json', body: JSON.stringify(pageData(projects, pg, size))
    });
  });
  await page.route('**/api/versions?**', async route => {
    const query = new URL(route.request().url()).searchParams;
    const pg = Number(query.get('pageNum')), size = Number(query.get('pageSize'));
    if (pg === 2) counts.versionPage2++;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(pageData(versions, pg, size,
        missingSecondVersionPage && pg === 2))
    });
  });
  await page.route('**/api/test-cases?**', async route => {
    const query = new URL(route.request().url()).searchParams;
    if (query.get('status') !== 'ACTIVE') return route.continue();
    const pg = Number(query.get('pageNum')), size = Number(query.get('pageSize'));
    if (pg === 2) counts.casePage2++;
    await route.fulfill({
      contentType: 'application/json', body: JSON.stringify(pageData(cases, pg, size))
    });
  });
  const lastOption = async label => {
    await page.locator('.filter-card .el-select').first().click();
    await page.locator('.el-select-dropdown__item').filter({ hasText: label })
      .first().waitFor({ state: 'visible', timeout: 10000 });
    await page.keyboard.press('Escape');
  };
  await page.goto(origin + '/#/versions', { waitUntil: 'domcontentloaded' });
  await lastOption('DPM-PROJECT-101');

  missingSecondVersionPage = true;
  await page.goto(origin + '/#/requirements', { waitUntil: 'domcontentloaded' });
  const alert = page.locator('.el-alert').filter({
    hasText: '版本下拉选项加载失败'
  });
  await alert.waitFor({ state: 'visible', timeout: 16000 });
  assert.match(await alert.innerText(), /缺少部分分页数据/);
  missingSecondVersionPage = false;
  await alert.getByRole('button', { name: '重试加载版本' }).click();
  await alert.waitFor({ state: 'hidden', timeout: 16000 });
  await lastOption('DPM-VERSION-101', '全部版本');

  await page.goto(origin + '/#/test-cases', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '新建测试用例' }).click();
  const caseDialog = page.locator('.el-dialog:visible').first();
  await caseDialog.locator('.el-form-item').filter({ hasText: '筛选版本' })
    .locator('.el-select').first().click();
  await page.locator('.el-select-dropdown__item')
    .filter({ hasText: 'DPM-VERSION-101' }).first()
    .waitFor({ state: 'visible', timeout: 16000 });
  await page.keyboard.press('Escape');
  await caseDialog.getByRole('button', { name: '取消' }).click();
  await caseDialog.waitFor({ state: 'hidden' });

  await page.goto(origin + '/#/test-cycles', { waitUntil: 'domcontentloaded' });
  await lastOption('DPM-VERSION-101', '全部版本');
  await page.getByRole('button', { name: '新建测试轮次' }).click();
  const cycleDialog = page.locator('.el-dialog:visible').first();
  await cycleDialog.locator('.el-form-item').filter({ hasText: '测试用例' })
    .locator('.el-select').first().click();
  await page.locator('.el-select-dropdown__item')
    .filter({ hasText: 'DPM-CASE-101' }).first()
    .waitFor({ state: 'visible', timeout: 16000 });
  await page.keyboard.press('Escape');
  await cycleDialog.getByRole('button', { name: '取消' }).click();
  await cycleDialog.waitFor({ state: 'hidden' });

  assert.ok(counts.projectPage2 > 0, 'Second project page never fetched');
  assert.ok(counts.versionPage2 >= 3, 'Second version page missing on one page');
  assert.ok(counts.casePage2 > 0, 'Second active test-case page never fetched');
  assert.equal(writes, 0, 'Never send writes during option verification');
  assert.equal(runtimeErrors, 0, 'No browser runtime error');
  console.log('BROWSER_PAGED_OPTIONS_PASS projects=101 versions=101 cases=101'
    + ' missingPageRejected=true retryWorks=true backendWrites=0');
  await context.close();
} finally {
  await browser.close();
}
