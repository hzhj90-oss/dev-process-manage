// Batch 38: real headless Chrome task-action critical-section acceptance.
// All task data and mutations are browser-mocked. Unexpected writes are denied.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const origin = 'http://127.0.0.1:18090';
const respond = (route, payload, status = 200) => route.fulfill({
  status, contentType: 'application/json', body: JSON.stringify(payload)
});
const clone = obj => JSON.parse(JSON.stringify(obj));
const latch = () => {
  let arrived, release;
  return { started: new Promise(resolve => arrived = resolve),
    released: new Promise(resolve => release = resolve),
    begin: () => arrived(), end: () => release() };
};
const doubleClick = locator => locator.evaluate(el => { el.click(); el.click(); });
const item = (id, status, state, runner = 'MANUAL') => ({
  task: { id, taskNo: 'DPM-B38-' + id, taskType: 'EXECUTE_CASE',
    taskStatus: status, cycleId: 99701, cycleName: 'B38 browser-only',
    codeVersion: 'B38', environmentName: 'TEST', environmentCode: 'LOCAL',
    caseCount: 1, completedCount: 0, cycleCaseId: id + 1000 },
  executions: [{ id: id + 1000, attemptNo: 1, executionStatus: state,
    runnerType: runner, executionMode: runner === 'MANUAL' ? 'MANUAL' : 'AI',
    expectedResultSnapshot: 'Mock expected result', attachments: [], events: [] }]
});
const state = new Map([
  [99801, item(99801, 'PENDING', 'QUEUED')],
  [99802, item(99802, 'WAITING_HUMAN', 'WAITING_HUMAN', 'CHATGPT')],
  [99803, item(99803, 'WAITING_HUMAN', 'WAITING_HUMAN', 'CHATGPT')],
  [99804, item(99804, 'RECOVERY_REQUIRED', 'INTERRUPTED', 'HTTP')],
  [99805, item(99805, 'RECOVERY_REQUIRED', 'INTERRUPTED', 'CHATGPT')],
  [99806, item(99806, 'PENDING', 'QUEUED')],
  [99807, item(99807, 'RUNNING', 'RUNNING')],
  [99808, item(99808, 'WAITING_HUMAN', 'WAITING_HUMAN', 'CHATGPT')]
]);
const current = id => state.get(id);
const update = (id, taskStatus, executionStatus) => {
  const data = current(id);
  data.task.taskStatus = taskStatus;
  data.executions[0].executionStatus = executionStatus;
};
const counts = { start: 0, complete: 0, humanConfirm: 0, humanReject: 0,
  resume: 0, completeLost: 0, unexpected: [] };
const slowStart = latch(), slowComplete = latch(), slowConfirm = latch(),
  slowReject = latch(), slowResume = latch();
const reads = new Map();
const browser = await chromium.launch({ executablePath: process.env.DPM_CHROME_PATH,
  headless: true, args: ['--disable-extensions', '--no-first-run'] });
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/api/**', route => {
    if (['GET','HEAD','OPTIONS'].includes(route.request().method())) return route.continue();
    counts.unexpected.push(route.request().method() + ' ' +
      new URL(route.request().url()).pathname);
    return route.abort('blockedbyclient');
  });
  await page.route('**/api/runner/status', route => respond(route, {
    summary: [], runners: []
  }));
  await page.route(/\/api\/execution-tasks(?:\?|$)/, route => {
    const q = new URL(route.request().url()).searchParams;
    const status = q.get('status');
    const tasks = [...state.values()].map(data => clone(data.task))
      .filter(task => !status || task.taskStatus === status);
    return respond(route, { list: tasks, total: tasks.length,
      pageNum: Number(q.get('pageNum') || 1),
      pageSize: Number(q.get('pageSize') || 10) });
  });
  await page.route(/\/api\/execution-tasks\/9980\d(?:\?|$)/, route => {
    const id = Number(new URL(route.request().url()).pathname.split('/').at(-1));
    reads.set(id, (reads.get(id) || 0) + 1);
    if (id === 99806 && reads.get(id) >= 2) update(id, 'RUNNING', 'RUNNING');
    if (id === 99804 && reads.get(id) >= 4) update(id, 'PENDING', 'QUEUED');
    if (id === 99808 && reads.get(id) >= 2) update(id, 'COMPLETED', 'COMPLETED');
    return respond(route, clone(current(id)));
  });
  await page.route(/\/api\/execution-tasks\/99801\/executions\/100801\/start$/, async route => {
    counts.start++;
    const body = JSON.parse(route.request().postData());
    assert.equal(body.actor, 'MANUAL');
    slowStart.begin(); await slowStart.released;
    update(99801, 'RUNNING', 'RUNNING');
    return respond(route, clone(current(99801)));
  });
  await page.route(/\/api\/execution-tasks\/99801\/executions\/100801\/complete$/, async route => {
    counts.complete++;
    const body = JSON.parse(route.request().postData());
    assert.equal(body.result, 'FAIL');
    assert.equal(body.actualResult, '实际没有达到预期');
    slowComplete.begin(); await slowComplete.released;
    update(99801, 'COMPLETED', 'COMPLETED');
    return respond(route, clone(current(99801)));
  });
  await page.route(/\/api\/execution-tasks\/99802\/human-intervention$/, async route => {
    counts.humanConfirm++;
    assert.equal(JSON.parse(route.request().postData()).decision, 'CONFIRMED');
    slowConfirm.begin(); await slowConfirm.released;
    update(99802, 'PENDING', 'QUEUED');
    return respond(route, clone(current(99802)));
  });
  await page.route(/\/api\/execution-tasks\/99803\/human-intervention$/, async route => {
    counts.humanReject++;
    assert.equal(JSON.parse(route.request().postData()).decision, 'REJECTED');
    slowReject.begin(); await slowReject.released;
    update(99803, 'COMPLETED', 'COMPLETED');
    return respond(route, clone(current(99803)));
  });
  await page.route(/\/api\/execution-tasks\/99805\/resume$/, async route => {
    counts.resume++;
    slowResume.begin(); await slowResume.released;
    update(99805, 'PENDING', 'QUEUED');
    current(99805).executions.unshift({
      id: 100905, attemptNo: 2, executionStatus: 'QUEUED',
      runnerType: 'CHATGPT', attachments: [], events: []
    });
    return respond(route, clone(current(99805)));
  });
  await page.route(/\/api\/execution-tasks\/99807\/executions\/100807\/complete$/, route => {
    counts.completeLost++;
    update(99807, 'COMPLETED', 'COMPLETED');
    return respond(route, {message:'模拟结果已保存但响应丢失'},503);
  });

  await page.goto(origin + '/#/execution-tasks', {waitUntil:'domcontentloaded'});
  const row = id => page.locator('.el-table__body tr')
    .filter({hasText:'DPM-B38-' + id}).first();
  const details = () => page.locator('.el-dialog:visible')
    .filter({hasText:'执行任务详情'});
  const open = async id => {
    await row(id).getByRole('button',{name:'详情'}).click();
    await details().getByText('DPM-B38-' + id,{exact:false}).first()
      .waitFor({state:'visible'});
  };
  const close = async () => {
    await details().getByRole('button',{name:'关闭',exact:true}).click();
    await details().waitFor({state:'hidden'});
  };
  const prompt = () => page.locator('.el-message-box:visible');

  // Manual start: double click and slow POST must never claim twice.
  await open(99801);
  const start = details().getByRole('button',{name:'开始人工执行'});
  await doubleClick(start);
  await slowStart.started;
  assert.equal(counts.start,1);
  assert.equal(await details().getByRole('button',{name:'关闭',exact:true}).isDisabled(),true);
  slowStart.end();
  await details().getByRole('button',{name:'登记结果'}).waitFor({state:'visible'});
  assert.equal(counts.start,1);

  // Manual result: ensure captured FAIL/actual value and one complete POST.
  await details().getByRole('button',{name:'登记结果'}).click();
  const completeDialog = page.locator('.el-dialog:visible').filter({hasText:'登记执行结果'});
  await completeDialog.locator('.el-select').click();
  await page.locator('.el-select-dropdown__item:visible').filter({hasText:'失败'}).click();
  await page.keyboard.press('Escape');
  await completeDialog.getByPlaceholder('记录实际观察到的结果')
    .fill('实际没有达到预期');
  const submit = completeDialog.getByRole('button',{name:'提交结果'});
  await doubleClick(submit);
  await slowComplete.started;
  assert.equal(counts.complete,1);
  assert.equal(await completeDialog.getByRole('button',{name:'取消'}).isDisabled(),true);
  slowComplete.end();
  await completeDialog.waitFor({state:'hidden'});
  await details().getByText('已结束',{exact:true}).first().waitFor({state:'visible'});
  await close();

  // Stale queued attempt: server already started it between render and click.
  await open(99806);
  await doubleClick(details().getByRole('button',{name:'开始人工执行'}));
  await details().getByText('执行中',{exact:true}).first().waitFor({state:'visible'});
  assert.equal(counts.start,1);
  await close();

  // Human confirmation cancel -> 0, then double prompt -> one POST.
  await open(99802);
  await details().locator('.attempt-actions')
    .getByRole('button',{name:'确认继续'}).click();
  await prompt().getByRole('button',{name:'取消'}).click();
  await prompt().waitFor({state:'hidden'});
  assert.equal(counts.humanConfirm,0);
  await doubleClick(details().locator('.attempt-actions')
    .getByRole('button',{name:'确认继续'}));
  await prompt().getByRole('button',{name:'确认继续'}).click();
  await slowConfirm.started;
  assert.equal(counts.humanConfirm,1);
  assert.equal(await details().getByRole('button',{name:'关闭',exact:true}).isDisabled(),true);
  slowConfirm.end();
  await details().getByText('待执行',{exact:true}).first().waitFor({state:'visible'});
  await close();

  // Reject is an independent mutation; double click must not create two.
  await open(99803);
  await doubleClick(details().locator('.attempt-actions')
    .getByRole('button',{name:'拒绝'}));
  await prompt().locator('textarea').fill('人工明确拒绝');
  await prompt().getByRole('button',{name:'确认拒绝'}).click();
  await slowReject.started;
  assert.equal(counts.humanReject,1);
  slowReject.end();
  await details().getByText('已结束',{exact:true}).first().waitFor({state:'visible'});
  await close();

  // Resume: cancel leaves 0 POST; another actor changed the attempt during
  // confirmation -> pre-submit GET blocks a duplicate recovery.
  await open(99804);
  await details().getByRole('button',{name:'恢复执行'}).click();
  await prompt().locator('input').fill('恢复');
  await prompt().getByRole('button',{name:'取消'}).click();
  await prompt().waitFor({state:'hidden'});
  assert.equal(counts.resume,0);
  await details().getByRole('button',{name:'恢复执行'}).click();
  await prompt().locator('input').fill('恢复');
  await prompt().getByRole('button',{name:'确认恢复'}).click();
  await details().getByText('待执行',{exact:true}).first().waitFor({state:'visible'});
  assert.equal(counts.resume,0);
  await close();

  // Actual recovery: double click while confirmation and slow POST, only one
  // new execution attempt; original interrupted attempt remains preserved.
  await open(99805);
  await doubleClick(details().getByRole('button',{name:'恢复执行'}));
  await prompt().locator('input').fill('恢复');
  await prompt().getByRole('button',{name:'确认恢复'}).click();
  await slowResume.started;
  assert.equal(counts.resume,1);
  assert.equal(await details().getByRole('button',{name:'关闭',exact:true}).isDisabled(),true);
  slowResume.end();
  await details().getByText('Attempt 2', {exact:false}).first().waitFor({state:'visible'});
  assert.equal(current(99805).executions.length,2);
  await close();

  // Human prompt was confirmed, but a Runner completed the task meanwhile.
  await open(99808);
  await details().locator('.attempt-actions')
    .getByRole('button',{name:'确认继续'}).click();
  await prompt().getByRole('button',{name:'确认继续'}).click();
  await details().getByText('已结束',{exact:true}).first().waitFor({state:'visible'});
  assert.equal(counts.humanConfirm,1);
  await close();

  // Completion response lost, but server committed; user must not see
  // an editable result dialog for a terminal task or accidentally retry.
  await open(99807);
  await details().getByRole('button',{name:'登记结果'}).click();
  const lost = page.locator('.el-dialog:visible').filter({hasText:'登记执行结果'});
  await lost.getByRole('button',{name:'提交结果'}).click();
  await lost.waitFor({state:'hidden'});
  await details().getByText('已结束',{exact:true}).first().waitFor({state:'visible'});
  assert.equal(counts.completeLost,1);
  await close();

  assert.deepEqual(counts.unexpected,[],'Unexpected backend write');
  assert.deepEqual(pageErrors,[],'No page runtime errors');
  console.log('BROWSER_TASK_ACTION_SAFETY_PASS start=1 complete=1 humanConfirm=1'
    +' humanReject=1 resume=1 lostResponseComplete=1'
    +' staleStartBlocked=true staleResumeBlocked=true staleHumanBlocked=true'
    +' doubleClickBlocked=true backendWrites=0');
  await context.close();
} finally {
  await browser.close();
}
