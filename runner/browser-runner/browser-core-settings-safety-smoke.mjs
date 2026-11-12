// Browser-only acceptance: project/version/environment UI save safety and stale-result recovery.
// All PUT/POST requests are intercepted by Playwright. Never writes to actual MySQL.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const origin = 'http://127.0.0.1:18090';
function latch() {
  let resolveStarted, resolveRelease, resolveDone;
  return {
    started: new Promise(r => { resolveStarted = r; }),
    released: new Promise(r => { resolveRelease = r; }),
    done: new Promise(r => { resolveDone = r; }),
    start() { resolveStarted(); }, release() { resolveRelease(); },
    finish() { resolveDone(); }
  };
}
const gateProjectPut = latch();
const gateVersionPut = latch();
const gateEnvironmentPut = latch();
const gateOldEnvironmentList = latch();
const project = (id, code, status = 'ACTIVE') => ({
  id, projectCode: code, projectName: 'Name ' + code, status,
  repositoryUrl: 'https://example.com/mock.git', mainBranch: 'main',
  versionCount: 1, updatedAt: '2026-11-12T00:00:00'
});
const version = (id, projectRow, no) => ({
  id, projectId: projectRow.id, projectCode: projectRow.projectCode,
  projectName: projectRow.projectName, versionNo: no,
  versionName: 'Mock release', status: 'DEVELOPING',
  plannedStartDate: '2026-11-01', plannedReleaseDate: '2026-11-30',
  requirementCount: 0, cycleCount: 0, updatedAt: '2026-11-12T00:00:00'
});
const environment = (id, code, active = true) => ({
  id, environmentCode: code, environmentName: code,
  environmentType: 'TEST', baseUrl: 'http://127.0.0.1:18090',
  apiBaseUrl: '', authType: 'NONE', credentialRef: active ? '' : 'STALE-REFERENCE',
  configJson: '{"timeoutMs":15000}', description: 'Test only',
  active, sortOrder: 50
});
const p1 = project(900101, 'DPM-CORE-PROJECT');
const p2 = project(900102, 'DPM-ARCHIVED-PROJECT', 'INACTIVE');
const v1 = version(900201, p2, 'DPM-CORE-VERSION');
const e1 = environment(900301, 'DPM_CORE_ACTIVE');
const e2 = environment(900302, 'DPM_CORE_INACTIVE', false);
const pageResult = (list, params) => ({
  list, total: list.length,
  pageNum: Number(params.get('pageNum') || '1'),
  pageSize: Number(params.get('pageSize') || '10')
});
const fulfill = (route, data, status=200) => route.fulfill({
  status, contentType: 'application/json', body: JSON.stringify(data)
});
const browser = await chromium.launch({
  executablePath: process.env.DPM_CHROME_PATH,
  headless: true, args: ['--disable-extensions', '--no-first-run']
});
let projectPutCount=0, versionPutCount=0, environmentPutCount=0;
let backendWrites=0, runtimeErrors=0, inactiveListCount=0;
let versionProjectFirstError=true, environmentListFail=false;
let currentProject={...p1}, currentVersion={...v1}, currentEnvironment={...e2};

async function doubleClick(button) {
  await button.evaluate(node => { node.click(); node.click(); });
}
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('pageerror', () => runtimeErrors++);
  // Fail closed: forbid any unmocked write from ever reaching local MySQL.
  // Specific per-ID PUT mocks below override this guard in Playwright's LIFO routing.
  await page.route('**/api/**', route => {
    if (['GET','HEAD','OPTIONS'].includes(route.request().method())) {
      return route.continue();
    }
    backendWrites++;
    return route.abort('blockedbyclient');
  });
  page.on('request', request => {
    if (!['GET','HEAD','OPTIONS'].includes(request.method())) {
      if (!(request.method() === 'PUT' &&
            /^\/api\/(projects\/900101|versions\/900201|environments\/900302)$/
              .test(new URL(request.url()).pathname))) {
        backendWrites++;
      }
    }
  });
  await page.route(/\/api\/projects(?:\?|$)/, route => {
    const params = new URL(route.request().url()).searchParams;
    const keyword = params.get('keyword') || '';
    const status = params.get('status');
    const list = [currentProject, p2].filter(r =>
      (!keyword || r.projectCode.includes(keyword) || r.projectName.includes(keyword)) &&
      (!status || r.status === status));
    return fulfill(route, pageResult(list, params));
  });
  await page.route(/\/api\/projects\/900101(?:\?|$)/, async route => {
    assert.equal(route.request().method(), 'PUT');
    projectPutCount++;
    const body = JSON.parse(route.request().postData() || '{}');
    assert.equal(body.projectCode, p1.projectCode);
    assert.equal(body.projectName, 'Name UPDATED PROJECT');
    gateProjectPut.start();
    await gateProjectPut.released;
    currentProject={...currentProject,...body};
    await fulfill(route, currentProject);
    gateProjectPut.finish();
  });
  await page.route(/\/api\/versions(?:\?|$)/, route => {
    const params = new URL(route.request().url()).searchParams;
    return fulfill(route, pageResult([currentVersion], params));
  });
  await page.route(/\/api\/versions\/900201(?:\?|$)/, async route => {
    assert.equal(route.request().method(), 'PUT');
    versionPutCount++;
    const body = JSON.parse(route.request().postData() || '{}');
    assert.equal(body.projectId, p2.id, 'Inactive owner must not be erased');
    assert.equal(body.versionNo, 'DPM-CORE-VERSION');
    assert.equal(body.versionName, 'UPDATED VERSION');
    gateVersionPut.start();
    await gateVersionPut.released;
    currentVersion={...currentVersion,...body};
    await fulfill(route, currentVersion);
    gateVersionPut.finish();
  });
  // Override active-project options for version screen but not project manager search.
  await page.route(/\/api\/projects\?.*status=ACTIVE/, async route => {
    if (versionProjectFirstError) {
      versionProjectFirstError=false;
      await fulfill(route, { message: '模拟项目选项暂不可用' }, 503);
    } else {
      const params = new URL(route.request().url()).searchParams;
      await fulfill(route, pageResult([currentProject], params));
    }
  });

  // Project: synchronous double-click must not cause two PUT requests.
  await page.goto(origin + '/#/projects', { waitUntil: 'domcontentloaded' });
  await page.locator('.el-table__body tr').filter({ hasText: p1.projectCode })
    .first().getByRole('button', { name: '编辑' }).click();
  const projectDialog = page.locator('.el-dialog:visible').filter({hasText:'编辑项目'});
  await projectDialog.getByPlaceholder('请输入项目名称').fill('Name UPDATED PROJECT');
  const projectSave=projectDialog.getByRole('button',{name:'保存',exact:true});
  await doubleClick(projectSave);
  await gateProjectPut.started;
  assert.equal(await projectDialog.getByRole('button',{name:'取消'}).isDisabled(),true);
  assert.equal(projectPutCount,1,'Double-click must issue only one project update');
  gateProjectPut.release();
  await gateProjectPut.done;
  await projectDialog.waitFor({state:'hidden',timeout:12000});
  await page.locator('.el-table__body').getByText('Name UPDATED PROJECT')
    .waitFor({state:'visible'});

  // Version: show persistent options error, retry, preserve disabled project's label.
  await page.goto(origin + '/#/versions', {waitUntil:'domcontentloaded'});
  const optionAlert=page.locator('.el-alert').filter({hasText:'项目下拉选项加载失败'});
  await optionAlert.waitFor({state:'visible',timeout:10000});
  assert.match(await optionAlert.innerText(),/模拟项目选项暂不可用/);
  await page.getByRole('button',{name:'新增版本'}).click();
  assert.equal(await page.locator('.el-dialog:visible').count(),0,
    'Cannot create a version with missing project options');
  await optionAlert.getByRole('button',{name:'重试加载项目'}).click();
  await optionAlert.waitFor({state:'hidden'});
  await page.locator('.el-table__body tr').filter({hasText:v1.versionNo})
    .first().getByRole('button',{name:'编辑'}).click();
  const versionDialog=page.locator('.el-dialog:visible').filter({hasText:'编辑版本'});
  await versionDialog.locator('.el-form-item').filter({hasText:'所属项目'})
    .locator('.el-select').first().click();
  await page.locator('.el-select-dropdown__item:visible')
    .filter({hasText:p2.projectCode}).first().waitFor({state:'visible'});
  await page.keyboard.press('Escape');
  await versionDialog.getByPlaceholder('可选，例如：11月迭代版本')
    .fill('UPDATED VERSION');
  await doubleClick(versionDialog.getByRole('button',{name:'保存',exact:true}));
  await gateVersionPut.started;
  assert.equal(versionPutCount,1,'Double-click must issue only one version update');
  assert.equal(await versionDialog.getByRole('button',{name:'取消'}).isDisabled(),true);
  gateVersionPut.release();
  await gateVersionPut.done;
  await versionDialog.waitFor({state:'hidden',timeout:12000});

  // Environment: old "show inactive" result must not overwrite latest active-only view.
  await page.route(/\/api\/environments(?:\?|$)/, async route => {
    const params=new URL(route.request().url()).searchParams;
    const activeOnly=params.get('activeOnly') === 'true';
    if (environmentListFail) {
      environmentListFail=false;
      await fulfill(route,{message:'模拟环境列表不可用'},503);
      return;
    }
    if (!activeOnly) {
      inactiveListCount++;
      if (inactiveListCount === 1) {
        gateOldEnvironmentList.start();
        await gateOldEnvironmentList.released;
        await fulfill(route,[e1,currentEnvironment]);
        gateOldEnvironmentList.finish();
        return;
      }
    }
    await fulfill(route,activeOnly?[e1]:[e1,currentEnvironment]);
  });
  await page.route(/\/api\/environments\/900302(?:\?|$)/,async route => {
    assert.equal(route.request().method(),'PUT');
    environmentPutCount++;
    const body=JSON.parse(route.request().postData() || '{}');
    assert.equal(body.environmentCode,e2.environmentCode);
    assert.equal(body.credentialRef,'','NONE auth must clear stale credentials');
    assert.equal(body.environmentName,'UPDATED ENVIRONMENT');
    gateEnvironmentPut.start();
    await gateEnvironmentPut.released;
    currentEnvironment={...currentEnvironment,...body};
    await fulfill(route,currentEnvironment);
    gateEnvironmentPut.finish();
  });
  await page.goto(origin + '/#/environments', {waitUntil:'domcontentloaded'});
  await page.getByText(e1.environmentCode,{exact:true}).first()
    .waitFor({state:'visible',timeout:12000});
  const toggle=page.locator('.table-toolbar .el-checkbox').first();
  await toggle.click();
  await gateOldEnvironmentList.started;
  await toggle.click();
  await page.waitForFunction(() => {
    const body = document.querySelector('.el-table__body');
    return body && !body.innerText.includes('DPM_CORE_INACTIVE');
  });
  gateOldEnvironmentList.release();
  await gateOldEnvironmentList.done;
  await page.waitForTimeout(250);
  assert.equal(await page.locator('.el-table__body').getByText(e2.environmentCode).count(),0);

  environmentListFail=true;
  await toggle.click();
  const envAlert=page.locator('.el-alert').filter({hasText:'环境列表加载失败'});
  await envAlert.waitFor({state:'visible'});
  assert.match(await envAlert.innerText(),/模拟环境列表不可用/);
  assert.equal(await page.locator('.el-table__body').getByText(e1.environmentCode).count(),0);
  await envAlert.getByRole('button',{name:'重试加载环境'}).click();
  await envAlert.waitFor({state:'hidden'});
  await page.locator('.el-table__body').getByText(e2.environmentCode)
    .first().waitFor({state:'visible'});

  await page.locator('.el-table__body tr').filter({hasText:e2.environmentCode})
    .first().getByRole('button',{name:'配置'}).click();
  const envDialog=page.locator('.el-dialog:visible').filter({hasText:'配置测试环境'});
  // Invalid JSON must be rejected, without an API write.
  await envDialog.getByPlaceholder('例如 LOCAL / TEST3 / PRE / PROD')
    .waitFor({state:'visible'});
  await envDialog.locator('.el-form-item').filter({hasText:'非敏感配置 JSON'})
    .locator('textarea').fill('{not-json');
  await envDialog.getByRole('button',{name:'保存配置'}).click();
  await page.waitForTimeout(200);
  assert.equal(environmentPutCount,0,'Invalid JSON must prevent save');
  await envDialog.locator('.el-form-item').filter({hasText:'非敏感配置 JSON'})
    .locator('textarea').fill('{"timeoutMs":15000}');
  await envDialog.locator('.el-form-item').filter({hasText:'环境名称'})
    .locator('input').fill('UPDATED ENVIRONMENT');
  await doubleClick(envDialog.getByRole('button',{name:'保存配置'}));
  await gateEnvironmentPut.started;
  assert.equal(environmentPutCount,1,'Double-click must issue only one environment update');
  assert.equal(await envDialog.getByRole('button',{name:'取消'}).isDisabled(),true);
  gateEnvironmentPut.release();
  await gateEnvironmentPut.done;
  await envDialog.waitFor({state:'hidden',timeout:12000});

  assert.equal(runtimeErrors,0,'No Vue browser errors');
  assert.equal(backendWrites,0,'All mutation APIs must be intercepted');
  console.log('BROWSER_CORE_SETTINGS_SAFETY_PASS projectDoubleSubmit=1 versionDoubleSubmit=1'
    +' environmentDoubleSubmit=1 inactiveProjectPreserved=true'
    +' projectOptionsRetry=true environmentStaleIgnored=true'
    +' environmentRetry=true invalidJsonBlocked=true backendWrites=0');
  await context.close();
} finally {
  gateProjectPut.release();
  gateVersionPut.release();
  gateEnvironmentPut.release();
  gateOldEnvironmentList.release();
  await browser.close();
}
