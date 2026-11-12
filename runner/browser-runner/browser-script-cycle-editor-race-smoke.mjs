// GET-only, real Chrome acceptance for script and cycle editing race conditions.
// No fake record is ever written to the local manager.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const origin = 'http://127.0.0.1:18090';
const script = (id, tag) => ({
  id, scriptCode: 'DPM-' + tag, scriptName: 'DPM-' + tag,
  scriptLanguage: 'NODE', runtimeVersion: 'QuickJS WASM',
  scriptVersion: '1.0.0', revisionNo: 2,
  sourceType: 'INLINE', sourceContent: 'function main() { return true; }',
  enabled: true, entryPoint: 'main', argumentsJson: '', description: '',
  updatedAt: '2026-11-12T00:00:00'
});
const cycle = (id, tag) => ({
  id, cycleNo: id, cycleName: 'DPM-' + tag, cycleStage: 'LOCAL_DEV',
  versionId: 6, versionNo: 'E2E', projectName: 'DPM verification',
  environmentId: 6, environmentName: 'Local',
  environmentCode: 'LOCAL', codeVersion: 'main', status: 'PLANNED',
  caseCount: 0, passCount: 0, failCount: 0, blockedCount: 0,
  skippedCount: 0, notRunCount: 0, cases: []
});
const json = (route, payload, status = 200) => route.fulfill({
  status, contentType: 'application/json', body: JSON.stringify(payload)
});
function gate() {
  let arrived, release, complete;
  return {
    arrived: new Promise(resolve => { arrived = resolve; }),
    released: new Promise(resolve => { release = resolve; }),
    complete: new Promise(resolve => { complete = resolve; }),
    notify: () => arrived(),
    release: () => release(),
    done: () => complete()
  };
}
const scriptOld = gate(), cycleOld = gate(), historyOld = gate(), revisionOld = gate();
const browser = await chromium.launch({
  executablePath: process.env.DPM_CHROME_PATH,
  headless: true, args: ['--disable-extensions', '--no-first-run']
});
let scriptNewReads = 0, cycleNewReads = 0, writes = 0, errors = 0;
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('pageerror', () => errors++);
  page.on('request', request => {
    if (!['GET','HEAD','OPTIONS'].includes(request.method())) writes++;
  });
  await page.route(/\/api\/test-scripts(?:\?|$)/, route => json(route, {
    list: [script(987681, 'SCRIPT-OLD'), script(987682, 'SCRIPT-NEW')],
    total: 2, pageNum: 1, pageSize: 10
  }));
  await page.route(/\/api\/test-scripts\/987681(?:\?|$)/, async route => {
    scriptOld.notify();
    await scriptOld.released;
    await json(route, script(987681, 'SCRIPT-OLD'));
    scriptOld.done();
  });
  await page.route(/\/api\/test-scripts\/987682(?:\?|$)/, async route => {
    scriptNewReads++;
    await json(route, scriptNewReads === 1
      ? { message: '模拟脚本详情503' } : script(987682, 'SCRIPT-NEW'),
      scriptNewReads === 1 ? 503 : 200);
  });
  await page.goto(origin + '/#/test-scripts', { waitUntil: 'domcontentloaded' });
  const rows = page.locator('.el-table__body tr');
  await rows.filter({ hasText: 'DPM-SCRIPT-OLD' }).first()
    .getByRole('button', { name: '编辑' }).click();
  await scriptOld.arrived;
  const editing = page.locator('.el-dialog:visible').filter({ hasText: '编辑脚本配置' });
  const saveScript = editing.getByRole('button', { name: '保存并生成新修订' });
  assert.equal(await saveScript.isDisabled(), true);
  await editing.getByRole('button', { name: '取消' }).click();
  await editing.waitFor({ state: 'hidden' });
  await rows.filter({ hasText: 'DPM-SCRIPT-NEW' }).first()
    .getByRole('button', { name: '编辑' }).click();
  const next = page.locator('.el-dialog:visible').filter({ hasText: '编辑脚本配置' });
  const alert = next.locator('.el-alert').filter({ hasText: '模拟脚本详情503' });
  await alert.waitFor({ state: 'visible' });
  assert.equal(await next.getByRole('button', { name: '保存并生成新修订' }).isDisabled(), true);
  await alert.getByRole('button', { name: '重试读取脚本详情' }).click();
  const codeInput = next.getByPlaceholder('例如 API-LOGIN-CHECK');
  await page.waitForFunction(() =>
    document.querySelector('input[placeholder="例如 API-LOGIN-CHECK"]')?.value === 'DPM-SCRIPT-NEW'
  );
  scriptOld.release();
  await scriptOld.complete;
  await page.waitForTimeout(150);
  assert.equal(await codeInput.inputValue(), 'DPM-SCRIPT-NEW', 'Stale script details overwrote new script');
  await next.getByRole('button', { name: '取消' }).click();
  await next.waitFor({ state: 'hidden' });

  await page.route(/\/api\/test-scripts\/987681\/revisions(?:\?|$)/, async route => {
    historyOld.notify();
    await historyOld.released;
    await json(route, [{ id: 9921, revisionNo: 1, scriptVersion: 'old' }]);
    historyOld.done();
  });
  await page.route(/\/api\/test-scripts\/987682\/revisions(?:\?|$)/,
    route => json(route, [
      { id: 9923, revisionNo: 2, scriptVersion: 'v2' },
      { id: 9922, revisionNo: 1, scriptVersion: 'v1' }
    ]));
  await page.route(/\/api\/test-scripts\/987682\/revisions\/9923(?:\?|$)/,
    async route => {
      revisionOld.notify();
      await revisionOld.released;
      await json(route, { id: 9923, revisionNo: 2, scriptVersion: 'v2',
        sourceType: 'INLINE', sourceContent: 'DPM-STALE-V2' });
      revisionOld.done();
    });
  await page.route(/\/api\/test-scripts\/987682\/revisions\/9922(?:\?|$)/,
    route => json(route, { id: 9922, revisionNo: 1, scriptVersion: 'v1',
      sourceType: 'INLINE', sourceContent: 'DPM-LATEST-V1' }));
  await rows.filter({ hasText: 'DPM-SCRIPT-OLD' }).first()
    .getByRole('button', { name: '修订历史' }).click();
  await historyOld.arrived;
  let history = page.locator('.el-dialog:visible').filter({ hasText: '脚本修订历史' });
  await history.getByRole('button', { name: '关闭' }).click();
  await history.waitFor({ state: 'hidden' });
  await rows.filter({ hasText: 'DPM-SCRIPT-NEW' }).first()
    .getByRole('button', { name: '修订历史' }).click();
  history = page.locator('.el-dialog:visible').filter({ hasText: '脚本修订历史' });
  await revisionOld.arrived;
  await history.locator('.history-item').filter({ hasText: 'V1' }).click();
  await history.getByText('DPM-LATEST-V1', { exact: false })
    .waitFor({ state: 'visible' });
  historyOld.release();
  revisionOld.release();
  await Promise.all([historyOld.complete, revisionOld.complete]);
  await page.waitForTimeout(150);
  const historyText = await history.innerText();
  assert.ok(historyText.includes('DPM-LATEST-V1'));
  assert.ok(!historyText.includes('DPM-STALE-V2'));
  assert.ok(!historyText.includes('DPM-SCRIPT-OLD'));
  await history.getByRole('button', { name: '关闭' }).click();
  await history.waitFor({ state: 'hidden' });

  await page.route(/\/api\/test-cycles(?:\?|$)/, route => json(route, {
    list: [cycle(987691, 'CYCLE-OLD'), cycle(987692, 'CYCLE-NEW')],
    total: 2, pageNum: 1, pageSize: 10
  }));
  await page.route(/\/api\/test-cycles\/987691(?:\?|$)/, async route => {
    cycleOld.notify();
    await cycleOld.released;
    await json(route, cycle(987691, 'CYCLE-OLD'));
    cycleOld.done();
  });
  await page.route(/\/api\/test-cycles\/987692(?:\?|$)/, async route => {
    cycleNewReads++;
    await json(route, cycleNewReads === 1
      ? { message: '模拟轮次配置503' } : cycle(987692, 'CYCLE-NEW'),
      cycleNewReads === 1 ? 503 : 200);
  });
  await page.goto(origin + '/#/test-cycles', { waitUntil: 'domcontentloaded' });
  const cycleRows = page.locator('.el-table__body tr');
  await cycleRows.filter({ hasText: 'DPM-CYCLE-OLD' }).first()
    .getByRole('button', { name: '编辑' }).click();
  await cycleOld.arrived;
  const cycleDialog = page.locator('.el-dialog:visible').filter({ hasText: '编辑测试轮次' });
  assert.equal(await cycleDialog.getByRole('button', { name: '保存轮次配置' }).isDisabled(), true);
  await cycleDialog.getByRole('button', { name: '取消' }).click();
  await cycleDialog.waitFor({ state: 'hidden' });
  await cycleRows.filter({ hasText: 'DPM-CYCLE-NEW' }).first()
    .getByRole('button', { name: '编辑' }).click();
  const freshCycle = page.locator('.el-dialog:visible').filter({ hasText: '编辑测试轮次' });
  const errorCycle = freshCycle.locator('.el-alert').filter({ hasText: '模拟轮次配置503' });
  await errorCycle.waitFor({ state: 'visible' });
  assert.equal(await freshCycle.getByRole('button', { name: '保存轮次配置' }).isDisabled(), true);
  await errorCycle.getByRole('button', { name: '重试读取轮次配置' }).click();
  const cycleName = freshCycle.getByPlaceholder('例如：本地开发自测 / test3 第一轮');
  await page.waitForFunction(() =>
    document.querySelector('input[placeholder="例如：本地开发自测 / test3 第一轮"]')?.value === 'DPM-CYCLE-NEW'
  );
  cycleOld.release();
  await cycleOld.complete;
  await page.waitForTimeout(150);
  assert.equal(await cycleName.inputValue(), 'DPM-CYCLE-NEW');
  await freshCycle.getByRole('button', { name: '取消' }).click();
  await freshCycle.waitFor({ state: 'hidden' });

  assert.equal(scriptNewReads, 2);
  assert.equal(cycleNewReads, 2);
  assert.equal(writes, 0, 'No mutation request may reach the backend');
  assert.equal(errors, 0, 'No browser runtime errors');
  console.log('BROWSER_SCRIPT_CYCLE_EDITOR_RACE_PASS'
    + ' scriptStaleRejected=true scriptRetry=true historyCurrentRevision=true'
    + ' cycleStaleRejected=true cycleRetry=true backendWrites=0');
  await context.close();
} finally {
  for (const g of [scriptOld, historyOld, revisionOld, cycleOld]) g.release();
  await browser.close();
}
