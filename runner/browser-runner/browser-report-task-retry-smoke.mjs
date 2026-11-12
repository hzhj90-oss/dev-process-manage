// GET-only Chrome verification: report and task lists reject stale results,
// show persistent error/retry, and task/review details recover without writing.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const origin = 'http://127.0.0.1:18090';
const browser = await chromium.launch({
  executablePath: process.env.DPM_CHROME_PATH,
  headless: true, args: ['--disable-extensions', '--no-first-run']
});
const report = {
  id: 987650, cycleNo: 1, cycleName: 'DPM-REPORT-NEW',
  codeVersion: 'local', projectName: 'DPM mock', versionNo: 'test-v1',
  environmentName: 'local', environmentCode: 'LOCAL',
  status: 'COMPLETED', caseCount: 1, passCount: 1,
  failCount: 0, blockedCount: 0, skippedCount: 0, notRunCount: 0
};
const task = {
  id: 987651, taskNo: 'DPM-TASK-RETRY',
  taskType: 'EXECUTE_CASE', taskStatus: 'COMPLETED',
  cycleId: 987650, cycleName: 'DPM-REPORT-NEW',
  environmentName: 'local', environmentCode: 'LOCAL',
  codeVersion: 'local', projectName: 'DPM mock',
  versionNo: 'test-v1', caseCount: 1, completedCount: 1,
  passCount: 1, failCount: 0, blockedCount: 0, skippedCount: 0
};
const pageData = list => ({ list, total: list.length, pageNum: 1, pageSize: 10 });
const fulfill = (route, data, status = 200) => route.fulfill({
  status, contentType: 'application/json', body: JSON.stringify(data)
});
let releaseOld;
const oldBlocked = new Promise(resolve => { releaseOld = resolve; });
let oldArrived;
const oldRequested = new Promise(resolve => { oldArrived = resolve; });
let oldDone;
const oldFulfilled = new Promise(resolve => { oldDone = resolve; });
let reviewAttempts = 0;
let taskDetailAttempts = 0;
let reportRetry = false;
let taskRetry = false;
let writeRequests = 0;
let exceptions = 0;
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('pageerror', () => exceptions++);
  page.on('request', request => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writeRequests++;
  });
  await page.route(/\/api\/test-cycles(?:\?|$)/, async route => {
    const keyword = new URL(route.request().url()).searchParams.get('keyword');
    if (keyword === 'DPM-REPORT-OLD') {
      oldArrived();
      await oldBlocked;
      await fulfill(route, pageData([{ ...report, id: 987649, cycleName: keyword }]));
      oldDone();
    } else if (keyword === 'DPM-REPORT-NEW') {
      await fulfill(route, pageData([report]));
    } else if (keyword === 'DPM-REPORT-ERROR') {
      await fulfill(route, reportRetry ? pageData([report]) :
        { message: '模拟报告列表失败' }, reportRetry ? 200 : 503);
    } else await route.continue();
  });
  await page.route(/\/api\/test-cycles\/987650\/report\/review(?:\?|$)/, async route => {
    reviewAttempts++;
    await fulfill(route, reviewAttempts === 1 ?
      { message: '模拟复核加载失败' } : {
        cycleId: 987650, cycleName: report.cycleName, cycleStatus: 'COMPLETED',
        total: 0, counts: { PASS: 0, FAIL: 0, BLOCKED: 0, SKIPPED: 0, NOT_RUN: 0 },
        rows: []
      }, reviewAttempts === 1 ? 503 : 200);
  });

  await page.goto(origin + '/#/test-reports', { waitUntil: 'domcontentloaded' });
  const reportSearch = page.getByPlaceholder('搜索轮次名称、代码版本');
  await page.locator('.el-table__body tr').first().waitFor();
  await reportSearch.fill('DPM-REPORT-OLD');
  await page.getByRole('button', { name: '查询' }).click();
  await oldRequested;
  await reportSearch.fill('DPM-REPORT-NEW');
  await page.getByRole('button', { name: '查询' }).click();
  await page.getByText('DPM-REPORT-NEW', { exact: false }).first()
    .waitFor({ state: 'visible', timeout: 12000 });
  releaseOld();
  await oldFulfilled;
  await page.waitForTimeout(250);
  const listText = await page.locator('.el-table__body').innerText();
  assert.ok(listText.includes('DPM-REPORT-NEW'));
  assert.ok(!listText.includes('DPM-REPORT-OLD'));

  await reportSearch.fill('DPM-REPORT-ERROR');
  await page.getByRole('button', { name: '查询' }).click();
  const reportAlert = page.locator('.el-alert').filter({ hasText: '报告列表加载失败' });
  await reportAlert.waitFor({ state: 'visible' });
  assert.match(await reportAlert.innerText(), /模拟报告列表失败/);
  assert.equal(await page.locator('.el-table__body tr').filter({
    hasText: 'DPM-REPORT-NEW'
  }).count(), 0);
  reportRetry = true;
  await reportAlert.getByRole('button', { name: '重试加载' }).click();
  await page.getByText('DPM-REPORT-NEW', { exact: false }).first()
    .waitFor({ state: 'visible' });
  await reportAlert.waitFor({ state: 'hidden' });

  await page.locator('.el-table__body tr').first().getByRole('button', {
    name: '结果复核'
  }).click();
  const reviewDialog = page.locator('.el-dialog:visible').filter({
    hasText: '测试结果复核'
  });
  const reviewError = reviewDialog.locator('.el-alert').filter({
    hasText: '模拟复核加载失败'
  });
  await reviewError.waitFor({ state: 'visible' });
  await reviewDialog.getByRole('button', { name: '重试读取复核数据' }).click();
  await reviewDialog.getByText('DPM-REPORT-NEW', { exact: false }).first()
    .waitFor({ state: 'visible', timeout: 12000 });
  assert.equal(reviewAttempts, 2);
  await reviewDialog.getByRole('button', { name: '关闭' }).click();
  await reviewDialog.waitFor({ state: 'hidden' });

  await page.route(/\/api\/execution-tasks(?:\?|$)/, async route => {
    const keyword = new URL(route.request().url()).searchParams.get('keyword');
    if (keyword === 'DPM-TASK-ERROR') {
      await fulfill(route, taskRetry ? pageData([task]) :
        { message: '模拟任务列表失败' }, taskRetry ? 200 : 503);
    } else await route.continue();
  });
  await page.route(/\/api\/execution-tasks\/987651(?:\?|$)/, async route => {
    taskDetailAttempts++;
    await fulfill(route, taskDetailAttempts === 1 ?
      { message: '模拟任务详情失败' } :
      { task, executions: [], children: [] }, taskDetailAttempts === 1 ? 503 : 200);
  });
  await page.goto(origin + '/#/execution-tasks', { waitUntil: 'domcontentloaded' });
  const taskSearch = page.getByPlaceholder('搜索任务编号、轮次名称、代码版本');
  await taskSearch.waitFor({ state: 'visible' });
  await taskSearch.fill('DPM-TASK-ERROR');
  await page.getByRole('button', { name: '查询' }).click();
  const taskAlert = page.locator('.el-alert').filter({
    hasText: '执行任务列表加载失败'
  });
  await taskAlert.waitFor({ state: 'visible' });
  assert.match(await taskAlert.innerText(), /模拟任务列表失败/);
  taskRetry = true;
  await taskAlert.getByRole('button', { name: '重试加载' }).click();
  await page.getByText('DPM-TASK-RETRY', { exact: false }).first()
    .waitFor({ state: 'visible' });
  await taskAlert.waitFor({ state: 'hidden' });

  await page.locator('.el-table__body tr').filter({
    hasText: 'DPM-TASK-RETRY'
  }).first().getByRole('button', { name: '详情' }).click();
  const taskDialog = page.locator('.el-dialog:visible').filter({
    hasText: '执行任务详情'
  });
  await taskDialog.locator('.el-alert').filter({
    hasText: '模拟任务详情失败'
  }).waitFor({ state: 'visible' });
  await taskDialog.getByRole('button', { name: '重试读取任务详情' }).click();
  await taskDialog.getByText('DPM-TASK-RETRY', { exact: false }).first()
    .waitFor({ state: 'visible' });
  assert.equal(taskDetailAttempts, 2);
  assert.equal(writeRequests, 0, 'No simulated request may write to the backend');
  assert.equal(exceptions, 0);
  console.log('BROWSER_REPORT_TASK_RETRY_PASS reportStaleIgnored=true'
    + ' reportRetry=true reviewRetry=true taskRetry=true'
    + ' taskDetailRetry=true backendWrites=' + writeRequests);
  await context.close();
} finally {
  releaseOld();
  await browser.close();
}
