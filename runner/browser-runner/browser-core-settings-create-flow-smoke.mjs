// Isolated browser mock: new project -> new version -> new environment,
// including transient save failure, JSON rejection and synchronous double-click safety.
// All writes are intercepted, no mutation reaches the actual Spring Boot backend.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const origin='http://127.0.0.1:18090';
const project={
  id: 900501, projectCode:'DPM-CREATE-PROJECT', projectName:'DPM browser only',
  status:'ACTIVE', mainBranch:'main', versionCount:0
};
const version={
  id:900502, projectId:project.id, projectCode:project.projectCode,
  projectName:project.projectName, versionNo:'DPM-CREATE-V1',
  versionName:'DPM version only', status:'PLANNING',
  plannedStartDate:'',plannedReleaseDate:'',requirementCount:0,cycleCount:0
};
const environment={
  id:900503, environmentCode:'DPM_CREATE_ENV',environmentName:'DPM environment only',
  environmentType:'TEST',authType:'NONE',credentialRef:'',
  active:true, sortOrder:50,configJson:'{"timeoutMs":12000}'
};
const pageResult=(list,query)=>({
  list,total:list.length,pageNum:Number(query.get('pageNum')||1),
  pageSize:Number(query.get('pageSize')||10)
});
const respond=(route,body,status=200)=>route.fulfill({
  contentType:'application/json',status,body:JSON.stringify(body)
});
let projects=[],versions=[],environments=[];
let projectPosts=0,versionPosts=0,environmentPosts=0,unmockedWrites=0,errors=0;
const browser=await chromium.launch({
  executablePath:process.env.DPM_CHROME_PATH,headless:true,
  args:['--disable-extensions','--no-first-run']
});
try{
  const context=await browser.newContext({serviceWorkers:'block'});
  const page=await context.newPage();
  page.on('pageerror',()=>errors++);
  // Register first: fail-closed fallback for any unexpected mutations.
  await page.route('**/api/**',route=>
    ['GET','HEAD','OPTIONS'].includes(route.request().method())
      ?route.continue():(unmockedWrites++,route.abort('blockedbyclient'))
  );
  await page.route(/\/api\/projects(?:\?|$)/,async route=>{
    if(route.request().method()==='POST'){
      projectPosts++;
      const body=JSON.parse(route.request().postData()||'{}');
      assert.equal(body.projectCode,project.projectCode);
      assert.equal(body.projectName,project.projectName);
      if(projectPosts===1){
        return respond(route,{message:'模拟项目保存失败，请重试'},503);
      }
      projects=[project];
      return respond(route,project);
    }
    const q=new URL(route.request().url()).searchParams;
    return respond(route,pageResult(projects.filter(p=>
      !q.get('status')||p.status===q.get('status')),q));
  });
  await page.route(/\/api\/versions(?:\?|$)/,async route=>{
    if(route.request().method()==='POST'){
      versionPosts++;
      const body=JSON.parse(route.request().postData()||'{}');
      assert.equal(body.projectId,project.id);
      assert.equal(body.versionNo,version.versionNo);
      versions=[version];
      return respond(route,version);
    }
    return respond(route,pageResult(versions,new URL(route.request().url()).searchParams));
  });
  await page.route(/\/api\/environments(?:\?|$)/,async route=>{
    if(route.request().method()==='POST'){
      environmentPosts++;
      const body=JSON.parse(route.request().postData()||'{}');
      assert.equal(body.environmentCode,environment.environmentCode);
      assert.equal(body.authType,'NONE');
      assert.equal(body.credentialRef,'');
      assert.deepEqual(JSON.parse(body.configJson),{timeoutMs:12000});
      environments=[environment];
      return respond(route,environment);
    }
    return respond(route,environments);
  });
  const doubleClick=async button=>button.evaluate(node=>{node.click();node.click();});

  await page.goto(origin+'/#/projects',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'新增项目'}).click();
  const pDialog=page.locator('.el-dialog:visible').filter({hasText:'新增项目'});
  await pDialog.getByPlaceholder('例如：SPV-GS').fill(project.projectCode);
  await pDialog.getByPlaceholder('请输入项目名称').fill(project.projectName);
  await doubleClick(pDialog.getByRole('button',{name:'保存',exact:true}));
  await page.waitForFunction(()=>!!document.querySelector('.el-message--error'));
  assert.equal(projectPosts,1);
  assert.equal(await pDialog.isVisible(),true,'Save failure must keep the form open');
  await doubleClick(pDialog.getByRole('button',{name:'保存',exact:true}));
  await pDialog.waitFor({state:'hidden',timeout:12000});
  assert.equal(projectPosts,2,'First failed + one retried create only');
  await page.locator('.el-table__body tr').filter({hasText:project.projectCode})
    .first().waitFor({state:'visible'});

  await page.goto(origin+'/#/versions',{waitUntil:'domcontentloaded'});
  await page.locator('.filter-card .el-select').first().click();
  await page.locator('.el-select-dropdown__item:visible')
    .filter({hasText:project.projectCode}).first().waitFor({state:'visible'});
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'新增版本'}).click();
  const vDialog=page.locator('.el-dialog:visible').filter({hasText:'新增版本'});
  await vDialog.locator('.el-form-item').filter({hasText:'所属项目'})
    .locator('.el-select').first().click();
  await page.locator('.el-select-dropdown__item:visible')
    .filter({hasText:project.projectCode}).first().click();
  await vDialog.getByPlaceholder('例如：GS.2026.11.1').fill(version.versionNo);
  await vDialog.getByPlaceholder('可选，例如：11月迭代版本').fill(version.versionName);
  await doubleClick(vDialog.getByRole('button',{name:'保存',exact:true}));
  await vDialog.waitFor({state:'hidden',timeout:12000});
  assert.equal(versionPosts,1,'Double-click must create only one version');
  await page.locator('.el-table__body tr').filter({hasText:version.versionNo})
    .first().waitFor({state:'visible'});

  await page.goto(origin+'/#/environments',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'新增环境'}).click();
  const eDialog=page.locator('.el-dialog:visible').filter({hasText:'新增测试环境'});
  await eDialog.getByPlaceholder('例如 LOCAL / TEST3 / PRE / PROD')
    .fill(environment.environmentCode);
  await eDialog.locator('.el-form-item').filter({hasText:'环境名称'})
    .locator('input').fill(environment.environmentName);
  const config=eDialog.locator('.el-form-item').filter({hasText:'非敏感配置 JSON'})
    .locator('textarea');
  await config.fill('not json');
  await eDialog.getByRole('button',{name:'保存配置'}).click();
  await page.waitForTimeout(150);
  assert.equal(environmentPosts,0,'Invalid JSON must block environment create');
  assert.equal(await eDialog.isVisible(),true);
  await config.fill(environment.configJson);
  await doubleClick(eDialog.getByRole('button',{name:'保存配置'}));
  await eDialog.waitFor({state:'hidden',timeout:12000});
  assert.equal(environmentPosts,1,'Double-click must create only one environment');
  await page.locator('.el-table__body tr')
    .filter({hasText:environment.environmentCode})
    .first().waitFor({state:'visible'});
  assert.equal(unmockedWrites,0,'No write may pass through to localhost');
  assert.equal(errors,0,'No Vue runtime exceptions');
  console.log('BROWSER_CORE_SETTINGS_CREATE_PASS projectFailureRetried=true'
    +' projectPosts=2 versionPosts=1 environmentPosts=1'
    +' invalidJsonBlocked=true backendWrites=0');
  await context.close();
}finally{
  await browser.close();
}
