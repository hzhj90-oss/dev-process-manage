// GET-only Playwright test: case editor and history dialogs must never accept
// stale responses after close/reopen or a different revision is selected.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const origin = 'http://127.0.0.1:18090';
const c = (id, name) => ({
  id, caseNo: 'DPM-' + name, title: name, status: 'ACTIVE',
  testType: 'FUNCTIONAL', priority: 'MEDIUM', executionMode: 'MANUAL',
  currentRevisionNo: 2, updatedAt: '2026-11-12T00:00:00'
});
const detail = (id, name) => ({
  ...c(id, name), requirements: [],
  currentRevision: {
    preconditions: '', steps: [{ stepNo: 1, action: 'Do something',
      expectedResult: 'PASS' }],
    expectedResult: 'PASS', testType: 'FUNCTIONAL', priority: 'MEDIUM',
    executionMode: 'MANUAL', scriptId: null
  }
});
const cases = [c(987671, 'DPM-EDITOR-OLD'), c(987672, 'DPM-EDITOR-NEW')];
const json = (route, body, status = 200) => route.fulfill({
  status, contentType: 'application/json', body: JSON.stringify(body)
});
function gate() {
  let markArrived, release, markCompleted;
  return {
    arrived: new Promise(resolve => { markArrived = resolve }),
    released: new Promise(resolve => { release = resolve }),
    completed: new Promise(resolve => { markCompleted = resolve }),
    markArrived: () => markArrived(),
    release: () => release(),
    markCompleted: () => markCompleted()
  };
}
const oldDetail = gate(), oldRequirements = gate(), oldHistory = gate(), oldRevision = gate();
const browser = await chromium.launch({
  executablePath: process.env.DPM_CHROME_PATH,
  headless: true, args: ['--disable-extensions', '--no-first-run']
});
let newDetailReads = 0, requirementsReads = 0, writes = 0, pageErrors = 0;
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('pageerror', () => pageErrors++);
  page.on('request', req => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) writes++;
  });
  await page.route(/\/api\/test-cases(?:\?|$)/, route => json(route, {
    list: cases, total: 2, pageNum: 1, pageSize: 10
  }));
  await page.route(/\/api\/test-cases\/available-requirements\/page(?:\?|$)/,
    async route => {
      requirementsReads++;
      if (requirementsReads === 1) {
        oldRequirements.markArrived();
        await oldRequirements.released;
        await json(route, { list: [], total: 0, pageNum: 1, pageSize: 100 });
        oldRequirements.markCompleted();
      } else {
        await json(route, {
          list: [{
            requirementId: 900501, projectCode: 'DPM', versionNo: 'v1',
            requirementNo: 'DPM-LINK-NEW', title: 'New requirement'
          }], total: 1, pageNum: 1, pageSize: 100
        });
      }
    });
  await page.route(/\/api\/test-scripts(?:\?|$)/, async route => {
    const u = new URL(route.request().url());
    if (u.searchParams.get('enabled') === 'true') {
      await json(route, { list: [], total: 0, pageNum: 1, pageSize: 100 });
    } else await route.continue();
  });
  await page.route(/\/api\/test-cases\/987671(?:\?|$)/, async route => {
    oldDetail.markArrived();
    await oldDetail.released;
    await json(route, detail(987671, 'DPM-EDITOR-OLD'));
    oldDetail.markCompleted();
  });
  await page.route(/\/api\/test-cases\/987672(?:\?|$)/, async route => {
    newDetailReads++;
    if (newDetailReads === 1) {
      await json(route, { message: '模拟编辑详情读取失败' }, 503);
    } else {
      await json(route, detail(987672, 'DPM-EDITOR-NEW'));
    }
  });

  await page.goto(origin + '/#/test-cases', { waitUntil: 'domcontentloaded' });
  const firstRow = page.locator('.el-table__body tr').filter({
    hasText: 'DPM-EDITOR-OLD'
  }).first();
  await firstRow.getByRole('button', { name: '编辑' }).click();
  await Promise.all([oldDetail.arrived, oldRequirements.arrived]);
  const edit = page.locator('.el-dialog:visible').filter({ hasText: '编辑测试用例' });
  await edit.getByRole('button', { name: '保存并生成新修订' })
    .waitFor({ state: 'visible' });
  assert.equal(await edit.getByRole('button', {
    name: '保存并生成新修订'
  }).isDisabled(), true, 'Cannot save while detail is pending');
  await edit.getByRole('button', { name: '取消' }).click();
  await edit.waitFor({ state: 'hidden', timeout: 10000 });

  await page.locator('.el-table__body tr').filter({
    hasText: 'DPM-EDITOR-NEW'
  }).first().getByRole('button', { name: '编辑' }).click();
  const fresh = page.locator('.el-dialog:visible').filter({ hasText: '编辑测试用例' });
  const error = fresh.locator('.el-alert').filter({
    hasText: '模拟编辑详情读取失败'
  });
  await error.waitFor({ state: 'visible', timeout: 12000 });
  assert.equal(await fresh.getByRole('button', {
    name: '保存并生成新修订'
  }).isDisabled(), true, 'Cannot save after detail failure');
  await error.getByRole('button', { name: '重试读取用例详情' }).click();
  await fresh.getByPlaceholder('例如 TC-LOGIN-001')
    .waitFor({ state: 'visible', timeout: 12000 });
  await page.waitForFunction(() => {
    const element = document.querySelector(
      'input[placeholder="例如 TC-LOGIN-001"]'
    );
    return element?.value === 'DPM-DPM-EDITOR-NEW';
  });
  oldDetail.release();
  oldRequirements.release();
  await Promise.all([oldDetail.completed, oldRequirements.completed]);
  await page.waitForTimeout(250);
  assert.equal(await fresh.getByPlaceholder('例如 TC-LOGIN-001').inputValue(),
    'DPM-DPM-EDITOR-NEW', 'Late A result must never overwrite B');
  await fresh.locator('.el-form-item').filter({
    hasText: '关联需求'
  }).locator('.el-select').first().click();
  await page.locator('.el-select-dropdown__item:visible').filter({
    hasText: 'DPM-LINK-NEW'
  }).first().waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await fresh.getByRole('button', { name: '取消' }).click();
  await fresh.waitFor({ state: 'hidden' });

  await page.route(/\/api\/test-cases\/987671\/revisions(?:\?|$)/,
    async route => {
      oldHistory.markArrived();
      await oldHistory.released;
      await json(route, [{ id: 9851, revisionNo: 1 }]);
      oldHistory.markCompleted();
    });
  await page.route(/\/api\/test-cases\/987672\/revisions(?:\?|$)/,
    route => json(route, [
      { id: 9853, revisionNo: 2 },
      { id: 9852, revisionNo: 1 }
    ]));
  await page.route(/\/api\/test-cases\/987672\/revisions\/9853(?:\?|$)/,
    async route => {
      oldRevision.markArrived();
      await oldRevision.released;
      await json(route, { id: 9853, revisionNo: 2, expectedResult: 'DPM-OLD-REVISION',
        steps: [{ stepNo: 1, action: 'OLD', expectedResult: 'OLD' }] });
      oldRevision.markCompleted();
    });
  await page.route(/\/api\/test-cases\/987672\/revisions\/9852(?:\?|$)/,
    route => json(route, { id: 9852, revisionNo: 1, expectedResult: 'DPM-NEW-REVISION',
      steps: [{ stepNo: 1, action: 'NEW', expectedResult: 'NEW' }] }));

  await firstRow.getByRole('button', { name: '修订历史' }).click();
  await oldHistory.arrived;
  let history = page.locator('.el-dialog:visible').filter({
    hasText: '测试用例修订历史'
  });
  await history.getByRole('button', { name: '关闭' }).click();
  await history.waitFor({ state: 'hidden', timeout: 10000 });
  await page.locator('.el-table__body tr').filter({
    hasText: 'DPM-EDITOR-NEW'
  }).first().getByRole('button', { name: '修订历史' }).click();
  history = page.locator('.el-dialog:visible').filter({
    hasText: '测试用例修订历史'
  });
  await oldRevision.arrived;
  await history.locator('.history-item').filter({ hasText: 'V1' }).click();
  await history.getByText('DPM-NEW-REVISION', { exact: true })
    .waitFor({ state: 'visible', timeout: 12000 });
  oldHistory.release();
  oldRevision.release();
  await Promise.all([oldHistory.completed, oldRevision.completed]);
  await page.waitForTimeout(250);
  const visibleHistory = await history.innerText();
  assert.ok(visibleHistory.includes('DPM-NEW-REVISION'));
  assert.ok(!visibleHistory.includes('DPM-OLD-REVISION'));
  assert.ok(visibleHistory.includes('DPM-EDITOR-NEW'));
  assert.ok(!visibleHistory.includes('DPM-EDITOR-OLD'));
  await history.getByRole('button', { name: '关闭' }).click();
  await history.waitFor({ state: 'hidden' });

  assert.equal(newDetailReads, 2);
  assert.equal(writes, 0, 'No test request should write business data');
  assert.equal(pageErrors, 0, 'No Vue/Chrome runtime errors');
  console.log('BROWSER_CASE_EDITOR_RACE_PASS staleEditorIgnored=true'
    + ' detailRetry=true incompleteSaveBlocked=true staleOptionsIgnored=true'
    + ' historyCloseIgnored=true latestRevisionWins=true backendWrites=0');
  await context.close();
} finally {
  oldDetail.release();
  oldRequirements.release();
  oldHistory.release();
  oldRevision.release();
  await browser.close();
}
