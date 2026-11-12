// Batch 35: browser-only double-submit safety of requirement, design, script, case and cycle editors.
// Every write is mocked; an unexpected mutation is blocked before it can reach the real server.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const origin = 'http://127.0.0.1:18090';
const respond = (route, body, status = 200) => route.fulfill({
  status, contentType: 'application/json', body: JSON.stringify(body)
});
const pageOf = (rows, route) => {
  const q = new URL(route.request().url()).searchParams;
  return {list: rows, total: rows.length, pageNum: Number(q.get('pageNum') || 1),
    pageSize: Number(q.get('pageSize') || 10)};
};
function latch() {
  let begin, release;
  return { started: new Promise(r => { begin = r; }),
    released: new Promise(r => { release = r; }),
    start: () => begin(), end: () => release() };
}
async function within(promise, name) {
  let timeout;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('Timed out: ' + name)), 10000);
    })]);
  } finally { clearTimeout(timeout); }
}
const doubleClick = button => button.evaluate(el => { el.click(); el.click(); });
const req = {id: 990101, requirementNo: 'DPM-LOCK-REQ', title: 'Lock requirement',
  versionId: 990102, projectCode: 'DPM', projectName: 'Mock project',
  versionNo: 'V1', status: 'DRAFT', priority: 'MEDIUM', designCount: 0};
const version = {id: 990102, projectId: 1, projectCode: 'DPM',
  projectName: 'Mock project', versionNo: 'V1', versionName: 'Batch 35',
  status: 'DEVELOPING'};
const env = {id: 990103, environmentCode: 'DPM_LOCAL', environmentName: 'Mock local',
  environmentType: 'TEST', baseUrl: origin, authType: 'NONE', active: true};
const testCase = {id: 990104, caseNo: 'DPM-LOCK-CASE', title: 'Lock case',
  status: 'ACTIVE', priority: 'MEDIUM', testType: 'FUNCTIONAL',
  currentRevisionNo: 1, executionMode: 'MANUAL'};
const script = {id: 990105, scriptCode: 'DPM-LOCK-SCRIPT', scriptName: 'Lock script',
  scriptLanguage: 'NODE', sourceType: 'INLINE', scriptVersion: '1.0.0',
  enabled: true, revisionNo: 1, entryPoint: 'main'};
const cycle = {id: 990106, versionId: version.id, environmentId: env.id,
  cycleName: 'Batch 35 cycle', codeVersion: 'DPM35', status: 'PLANNED'};
const gates = Object.fromEntries(['requirement','design','script','case','cycle']
  .map(key => [key, latch()]));
const writes = {requirement: 0, design: 0, script: 0, case: 0, cycle: 0};
let unexpectedWrites = 0, runtimeErrors = 0;
let requirements = [{...req}], scripts = [], cases = [testCase], cycles = [];
const browser = await chromium.launch({
  executablePath: process.env.DPM_CHROME_PATH,
  headless: true, args: ['--disable-extensions', '--no-first-run']
});
try {
  const context = await browser.newContext({serviceWorkers:'block'});
  const page = await context.newPage();
  page.on('pageerror', error => { runtimeErrors++; console.error('BROWSER_ERROR', error.message); });
  // Register first so specific route handlers override this fail-closed guard.
  await page.route('**/api/**', route => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) return route.continue();
    unexpectedWrites++;
    return route.abort('blockedbyclient');
  });
  await page.route(/\/api\/versions(?:\?|$)/, route => respond(route, pageOf([version], route)));
  await page.route(/\/api\/environments(?:\?|$)/, route => respond(route, [env]));
  await page.route(/\/api\/requirements(?:\?|$)/, route =>
    respond(route, pageOf(requirements, route)));
  await page.route(/\/api\/requirements\/990101(?:\?|$)/, async route => {
    assert.equal(route.request().method(), 'PUT');
    writes.requirement++;
    const body = JSON.parse(route.request().postData());
    assert.equal(body.requirementNo, req.requirementNo);
    assert.equal(body.title, 'Lock requirement updated');
    gates.requirement.start();
    await gates.requirement.released;
    requirements = [{...req, ...body}];
    return respond(route, requirements[0]);
  });
  await page.route(/\/api\/requirements\/990101\/designs(?:\?|$)/, async route => {
    if (route.request().method() !== 'POST') return respond(route, []);
    writes.design++;
    const body = JSON.parse(route.request().postData());
    assert.equal(body.title, 'Batch 35 design revision');
    gates.design.start();
    await gates.design.released;
    return respond(route, {id:990201, requirementId:req.id, revisionNo:1,
      title:body.title, contentMarkdown:body.contentMarkdown,
      status:'DRAFT', designType:'GENERAL'});
  });
  await page.route(/\/api\/test-scripts(?:\?|$)/, async route => {
    if (route.request().method() !== 'POST') return respond(route, pageOf(scripts, route));
    writes.script++;
    const body = JSON.parse(route.request().postData());
    assert.equal(body.scriptCode, script.scriptCode);
    gates.script.start();
    await gates.script.released;
    scripts = [script];
    return respond(route, script);
  });
  await page.route(/\/api\/test-cases\/available-requirements\/page(?:\?|$)/,
    route => respond(route, pageOf([], route)));
  await page.route(/\/api\/test-cases(?:\?|$)/, async route => {
    if (route.request().method() !== 'POST') return respond(route, pageOf(cases, route));
    writes.case++;
    const body = JSON.parse(route.request().postData());
    assert.equal(body.caseNo, 'DPM-LOCK-CASE-NEW');
    assert.equal(body.steps.length, 1);
    gates.case.start();
    await gates.case.released;
    cases = [...cases, {...testCase, ...body, id:990107}];
    return respond(route, cases[1]);
  });
  await page.route(/\/api\/test-cycles(?:\?|$)/, async route => {
    if (route.request().method() !== 'POST') return respond(route, pageOf(cycles, route));
    writes.cycle++;
    const body = JSON.parse(route.request().postData());
    assert.equal(body.versionId, version.id);
    assert.deepEqual(body.caseIds, [testCase.id]);
    gates.cycle.start();
    await gates.cycle.released;
    cycles = [cycle];
    return respond(route, cycle);
  });

  // Existing requirement edit: a rapid double click must send exactly one PUT.
  await page.goto(origin + '/#/requirements', {waitUntil:'domcontentloaded'});
  const requirementRow = page.locator('.el-table__body tr').filter({hasText:req.requirementNo}).first();
  // On resource-constrained Windows a page's initial GET may be interrupted.
  // Exercise the visible user retry once; never fabricate an editor row.
  try {
    await requirementRow.waitFor({state:'visible',timeout:12000});
  } catch (_) {
    console.log('BROWSER_SAVE_EDITOR_INITIAL_GET_RETRY');
    await page.getByRole('button',{name:'查询',exact:true}).click();
    await requirementRow.waitFor({state:'visible',timeout:16000});
  }
  await requirementRow.getByRole('button', {name:'编辑'}).click();
  const reqDialog = page.locator('.el-dialog:visible').filter({hasText:'编辑需求'});
  await reqDialog.locator('.el-form-item').filter({hasText:'需求标题'})
    .locator('input').fill('Lock requirement updated');
  await doubleClick(reqDialog.getByRole('button', {name:'保存', exact:true}));
  await within(gates.requirement.started, 'requirement PUT');
  assert.equal(await reqDialog.getByRole('button', {name:'取消'}).isDisabled(), true);
  assert.equal(writes.requirement, 1);
  gates.requirement.end();
  await reqDialog.waitFor({state:'hidden'});
  await page.locator('.el-table__body tr').filter({hasText:'Lock requirement updated'})
    .first().waitFor({state:'visible'});

  // A new immutable design revision cannot be created twice by one double click.
  await page.locator('.el-table__body tr').filter({hasText:req.requirementNo}).first()
    .getByRole('button', {name:'设计', exact:true}).click();
  const designDialog = page.locator('.el-dialog:visible').filter({hasText:'详细设计'});
  await designDialog.getByRole('button', {name:'新增修订'}).click();
  const revisionDialog = page.locator('.el-dialog:visible').filter({hasText:'新增详细设计修订'});
  await revisionDialog.getByPlaceholder('例如：后端详细设计 V2')
    .fill('Batch 35 design revision');
  await revisionDialog.getByPlaceholder('使用 Markdown 记录接口、数据结构、流程、异常处理和影响范围')
    .fill('Batch 35 mock-only revision body');
  await doubleClick(revisionDialog.getByRole('button', {name:'保存新修订'}));
  await within(gates.design.started, 'design revision POST');
  assert.equal(await revisionDialog.getByRole('button', {name:'取消'}).isDisabled(), true);
  assert.equal(writes.design, 1);
  gates.design.end();
  await revisionDialog.waitFor({state:'hidden'});
  await designDialog.getByRole('button', {name:'关闭'}).click();
  await designDialog.waitFor({state:'hidden'});

  // Script create: invalid form sends nothing; corrected double click sends one POST.
  await page.goto(origin + '/#/test-scripts', {waitUntil:'domcontentloaded'});
  await page.getByRole('button', {name:'新建脚本'}).click();
  const scriptDialog = page.locator('.el-dialog:visible').filter({hasText:'新建脚本配置'});
  await scriptDialog.getByPlaceholder('例如 API-LOGIN-CHECK').fill(script.scriptCode);
  await scriptDialog.locator('.el-form-item').filter({hasText:'脚本名称'})
    .locator('input').fill(script.scriptName);
  await scriptDialog.getByRole('button', {name:'创建脚本'}).click();
  assert.equal(writes.script, 0);
  await scriptDialog.locator('.el-form-item').filter({hasText:'脚本内容'})
    .locator('textarea').fill('function main(){ return {pass:true}; }');
  await doubleClick(scriptDialog.getByRole('button', {name:'创建脚本'}));
  await within(gates.script.started, 'script POST');
  assert.equal(await scriptDialog.getByRole('button', {name:'取消'}).isDisabled(), true);
  assert.equal(writes.script, 1);
  gates.script.end();
  await scriptDialog.waitFor({state:'hidden'});

  // Case create: required step validation then one guarded POST.
  await page.goto(origin + '/#/test-cases', {waitUntil:'domcontentloaded'});
  await page.getByRole('button', {name:'新建测试用例'}).click();
  const caseDialog = page.locator('.el-dialog:visible').filter({hasText:'新建测试用例'});
  await caseDialog.getByPlaceholder('例如 TC-LOGIN-001').fill('DPM-LOCK-CASE-NEW');
  await caseDialog.locator('.el-form-item').filter({hasText:'用例名称'})
    .locator('input').first().fill('Batch 35 test case');
  await caseDialog.getByRole('button', {name:'创建用例'}).click();
  assert.equal(writes.case, 0);
  await caseDialog.getByPlaceholder('具体操作或需要 ChatGPT 执行的动作').fill('Execute mock');
  await caseDialog.getByPlaceholder('本步骤完成后应观察到的结果').fill('Mock passes');
  await caseDialog.getByPlaceholder('整个用例执行成功的判定标准').fill('Case passes');
  await doubleClick(caseDialog.getByRole('button', {name:'创建用例'}));
  await within(gates.case.started, 'case POST');
  assert.equal(await caseDialog.getByRole('button', {name:'取消'}).isDisabled(), true);
  assert.equal(writes.case, 1);
  gates.case.end();
  await caseDialog.waitFor({state:'hidden'});

  // Cycle create: select complete version/environment/case and forbid duplicate snapshots.
  await page.goto(origin + '/#/test-cycles', {waitUntil:'domcontentloaded'});
  await page.getByRole('button', {name:'新建测试轮次'}).click();
  const cycleDialog = page.locator('.el-dialog:visible').filter({hasText:'新建测试轮次'});
  const choose = async (label, expected) => {
    await cycleDialog.locator('.el-form-item').filter({hasText:label})
      .locator('.el-select').first().click();
    await page.locator('.el-select-dropdown__item:visible')
      .filter({hasText:expected}).first().click();
  };
  await choose('所属版本', version.versionNo);
  await choose('测试环境', env.environmentName);
  await cycleDialog.getByPlaceholder('例如：本地开发自测 / test3 第一轮')
    .fill(cycle.cycleName);
  await cycleDialog.getByPlaceholder('例如 GS.202611.1-SNAPSHOT / v1.2.0')
    .fill(cycle.codeVersion);
  await choose('测试用例', testCase.caseNo);
  await doubleClick(cycleDialog.getByRole('button', {name:'创建轮次并生成快照'}));
  await within(gates.cycle.started, 'cycle POST');
  assert.equal(await cycleDialog.getByRole('button', {name:'取消'}).isDisabled(), true);
  assert.equal(writes.cycle, 1);
  gates.cycle.end();
  await cycleDialog.waitFor({state:'hidden'});

  assert.deepEqual(writes, {requirement:1, design:1, script:1, case:1, cycle:1});
  assert.equal(unexpectedWrites, 0, 'Unexpected API mutation reached fallback');
  assert.equal(runtimeErrors, 0, 'Vue runtime errors');
  console.log('BROWSER_SAVE_CRITICAL_SECTION_PASS requirement=1 design=1'
    + ' script=1 case=1 cycle=1 invalidFormsBlocked=true backendWrites=0');
  await context.close();
} finally {
  await browser.close();
}
