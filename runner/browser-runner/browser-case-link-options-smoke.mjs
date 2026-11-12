// Browser-only fake records verify 101st linked requirement/script is selectable.
// Mock every added record in route handlers; never post/put to the local manager.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const origin = 'http://127.0.0.1:18090';
const requirements = Array.from({ length: 101 }, (_, i) => ({
  requirementId: 70001 + i, requirementNo: 'DPM-REQ-' + String(i + 1).padStart(3, '0'),
  title: 'Requirement option ' + (i + 1), projectCode: 'DPM',
  projectName: 'DPM test', versionNo: 'main'
}));
const scripts = Array.from({ length: 101 }, (_, i) => ({
  id: 80001 + i, scriptCode: 'DPM-SCRIPT-' + String(i + 1).padStart(3, '0'),
  scriptName: 'DPM-SCRIPT-' + String(i + 1).padStart(3, '0'),
  enabled: true, scriptLanguage: 'NODE'
}));
let requirementPage2 = 0, scriptPage2 = 0, failedOnce = false;
let writes = 0, exceptions = 0, legacyCalls = 0;
const browser = await chromium.launch({
  executablePath: process.env.DPM_CHROME_PATH,
  headless: true, args: ['--disable-extensions', '--no-first-run']
});
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('pageerror', () => exceptions++);
  page.on('request', request => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes++;
  });
  await page.route('**/api/test-cases/available-requirements**', async route => {
    const url = new URL(route.request().url());
    if (!url.pathname.endsWith('/page')) {
      legacyCalls++;
      await route.fulfill({ status: 500, contentType: 'application/json',
        body: JSON.stringify({ message: 'legacy unbounded endpoint must not be called' }) });
      return;
    }
    const n = Number(url.searchParams.get('pageNum'));
    const size = Number(url.searchParams.get('pageSize'));
    if (n === 2) requirementPage2++;
    if (n === 2 && !failedOnce) {
      failedOnce = true;
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ list: [], total: 101, pageNum: n, pageSize: size }) });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      list: requirements.slice((n - 1) * size, n * size),
      total: requirements.length, pageNum: n, pageSize: size
    }) });
  });
  await page.route('**/api/test-cases/scripts**', async route => {
    legacyCalls++;
    await route.fulfill({ status: 500, contentType: 'application/json',
      body: JSON.stringify({ message: 'legacy all-scripts endpoint must not be called' }) });
  });
  await page.route('**/api/test-scripts?**', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('enabled') !== 'true') return route.continue();
    const n = Number(url.searchParams.get('pageNum'));
    const size = Number(url.searchParams.get('pageSize'));
    if (n === 2) scriptPage2++;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      list: scripts.slice((n - 1) * size, n * size),
      total: scripts.length, pageNum: n, pageSize: size
    }) });
  });
  await page.goto(origin + '/#/test-cases', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '新建测试用例' }).click();
  const dialog = page.locator('.el-dialog:visible').first();
  const alert = dialog.locator('.el-alert').filter({ hasText: '关联需求选项加载失败' });
  await alert.waitFor({ state: 'visible', timeout: 16000 });
  assert.match(await alert.innerText(), /缺少部分分页数据/);
  const save = dialog.getByRole('button', { name: '创建用例' });
  assert.equal(await save.isDisabled(), true, 'Saving with incomplete links must be blocked');
  await alert.getByRole('button', { name: '重试加载关联需求' }).click();
  await alert.waitFor({ state: 'hidden', timeout: 16000 });
  const reqSelect = dialog.locator('.el-form-item').filter({ hasText: '关联需求' })
    .locator('.el-select').first();
  await reqSelect.click();
  await page.locator('.el-select-dropdown__item:visible').filter({
    hasText: 'DPM-REQ-101'
  }).first().waitFor({ state: 'visible', timeout: 12000 });
  await page.keyboard.press('Escape');
  const execSelect = dialog.locator('.el-form-item').filter({ hasText: '执行方式' })
    .locator('.el-select').first();
  await execSelect.click();
  await page.locator('.el-select-dropdown__item:visible').filter({
    hasText: '关联固定脚本'
  }).first().click();
  const scriptSelect = dialog.locator('.el-form-item').filter({ hasText: '关联脚本' })
    .locator('.el-select').first();
  await scriptSelect.click();
  await page.locator('.el-select-dropdown__item:visible').filter({
    hasText: 'DPM-SCRIPT-101'
  }).first().waitFor({ state: 'visible', timeout: 12000 });
  await page.keyboard.press('Escape');
  assert.ok(requirementPage2 >= 2, 'Requirements second page and retry not reached');
  assert.ok(scriptPage2 >= 1, 'Scripts second page not reached');
  assert.equal(legacyCalls, 0, 'Old unbounded option APIs must not be used by editor');
  assert.equal(writes, 0, 'No writes may reach local manager');
  assert.equal(exceptions, 0, 'No browser runtime errors');
  console.log('BROWSER_CASE_LINK_OPTIONS_PASS requirement101=true script101=true'
    + ' missingPageRejected=true retry=true legacyCalls=' + legacyCalls
    + ' backendWrites=' + writes);
  await context.close();
} finally {
  await browser.close();
}
