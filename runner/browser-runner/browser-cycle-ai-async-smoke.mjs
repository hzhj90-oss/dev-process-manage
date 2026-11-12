// GET-only Chrome regression for cycle details and ChatGPT async tracking.
// Mocked responses never modify real cycles, tasks, or execution histories.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const origin = 'http://127.0.0.1:18090';
const cycle = (id, name) => ({
  id, cycleNo: 1, cycleName: name, cycleStage: 'LOCAL_DEV',
  projectName: 'DPM verification', versionNo: 'E2E',
  environmentName: 'local', environmentCode: 'LOCAL',
  codeVersion: 'local', status: 'COMPLETED', caseCount: 0,
  passCount: 0, failCount: 0, blockedCount: 0, skippedCount: 0, notRunCount: 0,
  cases: []
});
const cycleList = { list: [
  cycle(987641, 'DPM-CYCLE-OLD'),
  cycle(987642, 'DPM-CYCLE-NEW')
], total: 2, pageNum: 1, pageSize: 10 };
const taskDetail = (id, no) => ({
  task: {
    id, taskNo: no, taskType: 'EXECUTE_CASE', taskStatus: 'COMPLETED',
    runnerType: 'CHATGPT', executionMode: 'AI'
  },
  executions: []
});
const fulfilled = (route, body, status = 200) => route.fulfill({
  status, contentType: 'application/json', body: JSON.stringify(body)
});
function gate() {
  let release, arrived, completed;
  return {
    wait: new Promise(resolve => { arrived = resolve; }),
    released: new Promise(resolve => { release = resolve; }),
    done: new Promise(resolve => { completed = resolve; }),
    arrive: () => arrived(),
    release: () => release(),
    complete: () => completed()
  };
}
const cycleGate = gate();
const queueGate = gate();
const taskGate = gate();
const browser = await chromium.launch({
  executablePath: process.env.DPM_CHROME_PATH,
  headless: true, args: ['--disable-extensions', '--no-first-run']
});
let writes = 0, exceptions = 0, cycleNewReads = 0, taskAReads = 0, queueReads = 0;
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('pageerror', () => exceptions++);
  page.on('request', request => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes++;
  });
  await page.route(/\/api\/test-cycles(?:\?|$)/, route =>
    fulfilled(route, cycleList));
  await page.route(/\/api\/test-cycles\/98764[12](?:\?|$)/, async route => {
    const id = Number(new URL(route.request().url()).pathname.split('/').at(-1));
    if (id === 987641) {
      cycleGate.arrive();
      await cycleGate.released;
      await fulfilled(route, cycle(id, 'DPM-CYCLE-OLD'));
      cycleGate.complete();
    } else {
      cycleNewReads++;
      await fulfilled(route, cycleNewReads === 1
        ? { message: '模拟轮次详情暂不可用' } : cycle(id, 'DPM-CYCLE-NEW'),
      cycleNewReads === 1 ? 503 : 200);
    }
  });
  await page.goto(origin + '/#/test-cycles', { waitUntil: 'domcontentloaded' });
  await page.locator('.el-table__body tr').filter({
    hasText: 'DPM-CYCLE-OLD'
  }).first().getByRole('button', { name: '详情' }).click();
  await cycleGate.wait;
  const dialog = page.locator('.el-dialog:visible').filter({
    hasText: '测试轮次详情'
  });
  await dialog.getByRole('button', { name: '关闭' }).click();
  await dialog.waitFor({ state: 'hidden', timeout: 12000 });
  await page.locator('.el-table__body tr').filter({
    hasText: 'DPM-CYCLE-NEW'
  }).first().getByRole('button', { name: '详情' }).click();
  const opened = page.locator('.el-dialog:visible').filter({
    hasText: '测试轮次详情'
  });
  await opened.locator('.el-alert').filter({
    hasText: '模拟轮次详情暂不可用'
  }).waitFor({ state: 'visible' });
  await opened.getByRole('button', { name: '重试读取轮次详情' }).click();
  await opened.getByText('DPM-CYCLE-NEW', { exact: false }).first()
    .waitFor({ state: 'visible' });
  cycleGate.release();
  await cycleGate.done;
  await page.waitForTimeout(200);
  const cycleText = await opened.innerText();
  assert.ok(cycleText.includes('DPM-CYCLE-NEW'));
  assert.ok(!cycleText.includes('DPM-CYCLE-OLD'));
  assert.equal(cycleNewReads, 2);
  await opened.getByRole('button', { name: '关闭' }).click();
  await opened.waitFor({ state: 'hidden' });

  await page.route(/\/api\/execution-tasks\/claimable\/chatgpt(?:\?|$)/, async route => {
    queueReads++;
    if (queueReads === 1) {
      queueGate.arrive();
      await queueGate.released;
      await fulfilled(route, [{
        task: { id: 999001, taskNo: 'DPM-STALE-QUEUE', cycleName: 'old',
          environmentName: 'test', environmentType: 'TEST' },
        execution: { id: 999002, requestSnapshot: {
          caseSnapshot: { caseNo: 'DPM-OLD', title: 'old' }
        }, expectedResultSnapshot: 'old' }
      }]);
      queueGate.complete();
    } else {
      await fulfilled(route, []);
    }
  });
  await page.route(/\/api\/execution-tasks\/987643(?:\?|$)/, async route => {
    taskAReads++;
    if (taskAReads === 1) {
      taskGate.arrive();
      await taskGate.released;
      await fulfilled(route, taskDetail(987643, 'DPM-A-OLD'));
      taskGate.complete();
    } else {
      await fulfilled(route, taskDetail(987643, 'DPM-A-NEW'));
    }
  });
  await page.route(/\/api\/execution-tasks\/987644(?:\?|$)/, route =>
    fulfilled(route, taskDetail(987644, 'DPM-B-NEW')));

  await page.goto(origin + '/#/ai-execution', { waitUntil: 'domcontentloaded' });
  await queueGate.wait;
  await page.getByRole('button', { name: '刷新队列' }).click();
  await page.locator('.queue-heading').first().getByText('当前显示 0 条', {
    exact: false
  }).waitFor({ state: 'visible' });
  queueGate.release();
  await queueGate.done;
  await page.waitForTimeout(200);
  assert.ok((await page.locator('.queue-heading').first().innerText()).includes('当前显示 0 条'));
  assert.equal(await page.getByText('DPM-STALE-QUEUE').count(), 0);

  const trackedInput = page.getByPlaceholder('输入任务 ID，或从上方选择');
  const trackSearch = page.getByRole('button', { name: '查询状态' });
  await trackedInput.fill('987643');
  await trackSearch.click();
  await taskGate.wait;
  await trackedInput.fill('987644');
  await trackSearch.click();
  await page.getByText('DPM-B-NEW', { exact: true })
    .waitFor({ state: 'visible' });
  await trackedInput.fill('987643');
  await trackSearch.click();
  await page.getByText('DPM-A-NEW', { exact: true })
    .waitFor({ state: 'visible' });
  taskGate.release();
  await taskGate.done;
  await page.waitForTimeout(250);
  assert.equal(await page.getByText('DPM-A-OLD', { exact: true }).count(), 0);
  assert.equal(await page.getByText('DPM-A-NEW', { exact: true }).count(), 1);
  assert.ok(taskAReads >= 2, 'Second A must be requested, not reused');

  assert.equal(writes, 0, 'No browser test request may write to the backend');
  assert.equal(exceptions, 0, 'No Vue runtime errors');
  console.log('BROWSER_CYCLE_AI_ASYNC_PASS cycleClosedStaleIgnored=true'
    + ' cycleRetry=true queueStaleIgnored=true trackingABAProtected=true'
    + ' backendWrites=' + writes);
  await context.close();
} finally {
  cycleGate.release();
  queueGate.release();
  taskGate.release();
  await browser.close();
}
