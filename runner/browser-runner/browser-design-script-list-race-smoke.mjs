// GET-only local browser regression, except one intercepted create-design POST.
// All simulated requirement/script records remain in Chrome route mocks.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const origin = 'http://127.0.0.1:18090';
const req = (id, name) => ({
  id, requirementNo: 'DPM-' + name, title: 'Test ' + name,
  versionId: 6, projectCode: 'DPM', projectName: 'DPM mock',
  versionNo: 'E2E', status: 'DRAFT', priority: 'MEDIUM',
  designCount: 2, linkedCaseCount: 0
});
const script = (id, name) => ({
  id, scriptCode: 'DPM-' + name, scriptName: name,
  scriptLanguage: 'NODE', runtimeVersion: 'QuickJS WASM',
  scriptVersion: '1.0.0', revisionNo: 1, sourceType: 'INLINE',
  enabled: true, entryPoint: 'main'
});
const mocked = (route, payload, status = 200) => route.fulfill({
  status, contentType: 'application/json', body: JSON.stringify(payload)
});
const deferred = () => {
  let started, proceed, finished;
  return {
    started: new Promise(resolve => { started = resolve; }),
    proceed: new Promise(resolve => { proceed = resolve; }),
    finished: new Promise(resolve => { finished = resolve; }),
    start: () => started(), release: () => proceed(), end: () => finished()
  };
};
const oldDesign = deferred(), oldList = deferred();
const browser = await chromium.launch({
  executablePath: process.env.DPM_CHROME_PATH,
  headless: true,
  args: ['--disable-extensions', '--no-first-run']
});
let designBReads = 0, oldListReads = 0, listErrorRetried = false;
let interceptedDesignWrites = 0, backendWrites = 0, runtimeErrors = 0;
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('pageerror', () => runtimeErrors++);
  page.on('request', request => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) &&
        !(request.method() === 'POST' &&
          /\/api\/requirements\/987702\/designs$/.test(new URL(request.url()).pathname))) {
      backendWrites++;
    }
  });
  await page.route(/\/api\/requirements(?:\?|$)/, route => mocked(route, {
    list: [req(987701, 'DESIGN-OLD'), req(987702, 'DESIGN-NEW')],
    total: 2, pageNum: 1, pageSize: 10
  }));
  await page.route(/\/api\/requirements\/987701\/designs(?:\?|$)/, async route => {
    oldDesign.start();
    await oldDesign.proceed;
    await mocked(route, [{ id: 988701, requirementId: 987701, revisionNo: 1,
      title: 'DPM-OLD-DESIGN', contentMarkdown: 'OLD', status: 'DRAFT' }]);
    oldDesign.end();
  });
  await page.route(/\/api\/requirements\/987702\/designs(?:\?|$)/, async route => {
    if (route.request().method() === 'POST') {
      interceptedDesignWrites++;
      const content = JSON.parse(route.request().postData() || '{}');
      assert.equal(content.title, 'DPM-NEW-DESIGN-SAVED');
      assert.equal(content.contentMarkdown, 'Verified browser-only mock design');
      await mocked(route, { id: 988703, requirementId: 987702, revisionNo: 3,
        title: content.title, contentMarkdown: content.contentMarkdown,
        status: 'DRAFT', designType: 'GENERAL' });
      return;
    }
    designBReads++;
    if (designBReads === 1) {
      await mocked(route, { message: '模拟设计列表503' }, 503);
    } else {
      await mocked(route, [
        { id: 988702, requirementId: 987702, revisionNo: 2,
          title: 'DPM-NEW-DESIGN', contentMarkdown: 'NEW-DESIGN-CONTENT',
          status: 'APPROVED', designType: 'GENERAL' }
      ]);
    }
  });
  await page.goto(origin + '/#/requirements', { waitUntil: 'domcontentloaded' });
  const reqRows = page.locator('.el-table__body tr');
  await reqRows.filter({ hasText: 'DPM-DESIGN-OLD' }).first()
    .getByRole('button', { name: '设计', exact: true }).click();
  await oldDesign.started;
  let dialog = page.locator('.el-dialog:visible').filter({ hasText: '详细设计' });
  await dialog.getByRole('button', { name: '新增修订' }).waitFor();
  assert.equal(await dialog.getByRole('button', { name: '新增修订' }).isDisabled(),
    true, 'Add design must be disabled while loading');
  await dialog.getByRole('button', { name: '关闭' }).click();
  await dialog.waitFor({ state: 'hidden' });
  await reqRows.filter({ hasText: 'DPM-DESIGN-NEW' }).first()
    .getByRole('button', { name: '设计', exact: true }).click();
  dialog = page.locator('.el-dialog:visible').filter({ hasText: '详细设计' });
  const designError = dialog.locator('.el-alert').filter({ hasText: '模拟设计列表503' });
  await designError.waitFor({ state: 'visible' });
  assert.equal(await dialog.getByRole('button', { name: '新增修订' }).isDisabled(), true);
  await designError.getByRole('button', { name: '重试加载详细设计' }).click();
  await dialog.getByText('DPM-NEW-DESIGN', { exact: true })
    .waitFor({ state: 'visible' });
  oldDesign.release();
  await oldDesign.finished;
  await page.waitForTimeout(200);
  const designText = await dialog.innerText();
  assert.ok(designText.includes('DPM-NEW-DESIGN'));
  assert.ok(!designText.includes('DPM-OLD-DESIGN'));
  assert.ok(designText.includes('DPM-DESIGN-NEW'));
  await dialog.getByRole('button', { name: '新增修订' }).click();
  const create = page.locator('.el-dialog:visible').filter({ hasText: '新增详细设计修订' });
  await create.getByPlaceholder('例如：后端详细设计 V2').fill('DPM-NEW-DESIGN-SAVED');
  await create.getByPlaceholder('使用 Markdown 记录接口、数据结构、流程、异常处理和影响范围')
    .fill('Verified browser-only mock design');
  await create.getByRole('button', { name: '保存新修订' }).click();
  await create.waitFor({ state: 'hidden', timeout: 12000 });
  await dialog.getByText('DPM-NEW-DESIGN-SAVED', { exact: true })
    .first().waitFor({ state: 'visible' });
  assert.equal(interceptedDesignWrites, 1);
  await dialog.getByRole('button', { name: '关闭' }).click();
  await dialog.waitFor({ state: 'hidden' });

  await page.route(/\/api\/test-scripts(?:\?|$)/, async route => {
    const params = new URL(route.request().url()).searchParams;
    const keyword = params.get('keyword');
    if (keyword === 'DPM-LIST-OLD') {
      oldListReads++;
      oldList.start();
      await oldList.proceed;
      await mocked(route, { list: [script(989701, 'LIST-OLD')],
        total: 1, pageNum: 1, pageSize: 10 });
      oldList.end();
    } else if (keyword === 'DPM-LIST-NEW') {
      await mocked(route, { list: [script(989702, 'LIST-NEW')],
        total: 1, pageNum: 1, pageSize: 10 });
    } else if (keyword === 'DPM-LIST-ERROR' && !listErrorRetried) {
      await mocked(route, { message: '模拟脚本列表503' }, 503);
    } else if (keyword === 'DPM-LIST-ERROR') {
      await mocked(route, { list: [script(989703, 'LIST-RECOVERED')],
        total: 1, pageNum: 1, pageSize: 10 });
    } else {
      await mocked(route, { list: [], total: 0, pageNum: 1, pageSize: 10 });
    }
  });
  await page.goto(origin + '/#/test-scripts', { waitUntil: 'domcontentloaded' });
  const search = page.getByPlaceholder('搜索脚本编号、名称');
  await search.fill('DPM-LIST-OLD');
  await page.getByRole('button', { name: '查询' }).click();
  await oldList.started;
  await search.fill('DPM-LIST-NEW');
  await page.getByRole('button', { name: '查询' }).click();
  await page.getByText('DPM-LIST-NEW', { exact: true })
    .first().waitFor({ state: 'visible' });
  oldList.release();
  await oldList.finished;
  await page.waitForTimeout(200);
  let listText = await page.locator('.el-table__body').innerText();
  assert.ok(listText.includes('DPM-LIST-NEW'));
  assert.ok(!listText.includes('DPM-LIST-OLD'));
  await search.fill('DPM-LIST-ERROR');
  await page.getByRole('button', { name: '查询' }).click();
  const listError = page.locator('.el-alert').filter({ hasText: '脚本列表加载失败' });
  await listError.waitFor({ state: 'visible' });
  assert.match(await listError.innerText(), /模拟脚本列表503/);
  assert.equal(await page.locator('.el-table__body tr').filter({
    hasText: 'DPM-LIST-NEW'
  }).count(), 0, 'Stale rows must be removed after new-list failure');
  listErrorRetried = true;
  await listError.getByRole('button', { name: '重试加载' }).click();
  await page.getByText('DPM-LIST-RECOVERED', { exact: true })
    .first().waitFor({ state: 'visible' });
  await listError.waitFor({ state: 'hidden' });

  assert.equal(oldListReads, 1);
  assert.equal(designBReads, 2);
  assert.equal(backendWrites, 0, 'All mutating requests must be intercepted by Chrome');
  assert.equal(runtimeErrors, 0, 'Vue runtime must not report page errors');
  console.log('BROWSER_DESIGN_SCRIPT_LIST_RACE_PASS'
    + ' oldDesignRejected=true designRetry=true correctDesignTarget=true'
    + ' staleScriptListIgnored=true listRetry=true'
    + ' interceptedDesignWrites=' + interceptedDesignWrites
    + ' backendWrites=' + backendWrites);
  await context.close();
} finally {
  oldDesign.release();
  oldList.release();
  await browser.close();
}
