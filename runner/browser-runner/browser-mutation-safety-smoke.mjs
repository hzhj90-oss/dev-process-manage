// Batch 36: real headless Chrome exercise of cycle-case edits, script toggle and task cancellation.
// Every mutation is intercepted in the browser; an unhandled POST/PUT/DELETE is aborted.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const origin='http://127.0.0.1:18090';
const json=(route,body,status=200)=>route.fulfill({
  status,contentType:'application/json',body:JSON.stringify(body)
});
const pageData=(route,list)=>({
  list,total:list.length,pageNum:Number(new URL(route.request().url()).searchParams.get('pageNum')||1),
  pageSize:Number(new URL(route.request().url()).searchParams.get('pageSize')||10)
});
function deferred(){
  let start, release;
  return {started:new Promise(r=>{start=r}), released:new Promise(r=>{release=r}),
    begin:()=>start(), end:()=>release()};
}
const dbl=locator=>locator.evaluate(el=>{el.click();el.click()});
const version={id:996101,projectId:1,projectCode:'DPM',projectName:'DPM mock',
  versionNo:'DPM36',status:'DEVELOPING'};
const env={id:996102,environmentCode:'LOCAL',environmentName:'Local',
  environmentType:'TEST',baseUrl:origin,active:true,authType:'NONE'};
const testCase=(id,code)=>({id,caseNo:code,title:code,status:'ACTIVE',
  testType:'FUNCTIONAL',priority:'MEDIUM',executionMode:'MANUAL',currentRevisionNo:1});
const first=testCase(996201,'DPM-36-FIRST');
const second=testCase(996202,'DPM-36-SECOND');
const snapshot=(row,id)=>({...row,id,testCaseId:row.id,revisionNo:1,
  latestResult:'NOT_RUN',requirements:[]});
const cycleBase={id:996301,cycleNo:36,versionId:version.id,versionNo:version.versionNo,
  projectName:'DPM mock',cycleName:'DPM36-CYCLE',status:'PLANNED',
  cycleStage:'LOCAL_DEV',environmentId:env.id,environmentName:env.environmentName,
  environmentCode:env.environmentCode,codeVersion:'DPM36'};
let cycleCases=[snapshot(first,996401)];
const cycle=()=>({...cycleBase,cases:cycleCases,caseCount:cycleCases.length,
  passCount:0,failCount:0,blockedCount:0,skippedCount:0,notRunCount:cycleCases.length});
const script={id:996501,scriptCode:'DPM36-SCRIPT',scriptName:'DPM36-SCRIPT',
  scriptLanguage:'NODE',sourceType:'INLINE',entryPoint:'main',
  revisionNo:1,scriptVersion:'1.0.0',enabled:true};
const task=(id,status,code)=>({id,taskNo:code,taskType:'EXECUTE_CASE',
  taskStatus:status,cycleId:cycleBase.id,cycleName:cycleBase.cycleName,
  environmentName:env.environmentName,environmentCode:env.environmentCode,
  codeVersion:'DPM36',caseCount:1,completedCount:0});
let task1=task(996601,'PENDING','DPM36-TASK-A');
const task2=task(996602,'PENDING','DPM36-TASK-B');
const addGate=deferred(),removeGate=deferred(),toggleGate=deferred(),cancelGate=deferred();
const calls={add:0,remove:0,toggle:0,cancel:0}, unexpected=[];
let addFailed=false,toggleFailed=false;
const browser=await chromium.launch({
  executablePath:process.env.DPM_CHROME_PATH,headless:true,
  args:['--disable-extensions','--no-first-run']
});
try{
  const context=await browser.newContext({serviceWorkers:'block'});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',route=>{
    if(['GET','HEAD','OPTIONS'].includes(route.request().method())) return route.continue();
    unexpected.push(route.request().method()+' '+new URL(route.request().url()).pathname);
    return route.abort('blockedbyclient');
  });
  await page.route(/\/api\/versions(?:\?|$)/,r=>json(r,pageData(r,[version])));
  await page.route(/\/api\/environments(?:\?|$)/,r=>json(r,[env]));
  await page.route(/\/api\/test-cases(?:\?|$)/,r=>json(r,pageData(r,[first,second])));
  await page.route(/\/api\/test-cycles(?:\?|$)/,r=>json(r,pageData(r,[cycle()])));
  await page.route(/\/api\/test-cycles\/996301(?:\?|$)/,r=>json(r,cycle()));
  await page.route(/\/api\/test-cycles\/996301\/cases(?:\?|$)/,async r=>{
    assert.equal(r.request().method(),'POST');
    calls.add++;
    assert.deepEqual(JSON.parse(r.request().postData()).caseIds,[second.id]);
    if(!addFailed){addFailed=true;return json(r,{message:'模拟添加失败'},503);}
    addGate.begin();await addGate.released;
    cycleCases=[...cycleCases,snapshot(second,996402)];
    return json(r,cycle());
  });
  await page.route(/\/api\/test-cycles\/996301\/cases\/996402(?:\?|$)/,async r=>{
    assert.equal(r.request().method(),'DELETE');
    calls.remove++;
    removeGate.begin();await removeGate.released;
    cycleCases=cycleCases.filter(x=>x.id!==996402);
    return json(r,cycle());
  });
  await page.route(/\/api\/test-scripts(?:\?|$)/,r=>json(r,pageData(r,[script])));
  await page.route(/\/api\/test-scripts\/996501\/enabled(?:\?|$)/,async r=>{
    assert.equal(r.request().method(),'PUT');
    assert.equal(JSON.parse(r.request().postData()).enabled,false);
    calls.toggle++;
    if(!toggleFailed){toggleFailed=true;return json(r,{message:'模拟切换失败'},503);}
    toggleGate.begin();await toggleGate.released;
    script.enabled=false;
    return json(r,script);
  });
  await page.route(/\/api\/execution-tasks(?:\?|$)/,r=>{
    const url=new URL(r.request().url());
    const status=url.searchParams.get('status');
    const all=[task1,task2];
    const items=status?all.filter(x=>x.taskStatus===status):all;
    return json(r,pageData(r,items));
  });
  await page.route(/\/api\/execution-tasks\/996601(?:\?|$)/,r=>json(r,{task:task1,executions:[]}));
  await page.route(/\/api\/execution-tasks\/996602(?:\?|$)/,r=>json(r,{
    task:{...task2,taskStatus:'COMPLETED'},executions:[]
  }));
  await page.route(/\/api\/execution-tasks\/996601\/cancel(?:\?|$)/,async r=>{
    assert.equal(r.request().method(),'POST');
    calls.cancel++;
    cancelGate.begin();await cancelGate.released;
    task1={...task1,taskStatus:'CANCELLED'};
    return json(r,task1);
  });

  await page.goto(origin+'/#/test-cycles',{waitUntil:'domcontentloaded'});
  const cycleRow=page.locator('.el-table__body tr')
    .filter({hasText:cycleBase.cycleName}).first();
  await cycleRow.getByRole('button',{name:'详情'}).click();
  const detail=page.locator('.el-dialog:visible').filter({hasText:'测试轮次详情'});
  await detail.getByText(first.caseNo,{exact:true}).first().waitFor({state:'visible'});
  await detail.getByRole('button',{name:'增加用例'}).click();
  const add=page.locator('.el-dialog:visible').filter({hasText:'增加测试用例'});
  await add.locator('.el-select').first().click();
  await page.locator('.el-select-dropdown__item:visible')
    .filter({hasText:second.caseNo}).first().click();
  await page.keyboard.press('Escape');
  const addButton=add.getByRole('button',{name:'加入本轮并固定当前修订'});
  await addButton.click();
  await page.waitForTimeout(200);
  assert.equal(calls.add,1);
  assert.equal(await add.isVisible(),true,'Failed add must leave the selection open');
  await dbl(addButton);
  await addGate.started;
  assert.equal(calls.add,2,'Only one retry after a single failed add');
  assert.equal(await add.getByRole('button',{name:'取消'}).isDisabled(),true);
  addGate.end();
  await add.waitFor({state:'hidden'});
  await detail.getByText(second.caseNo,{exact:true}).first().waitFor({state:'visible'});
  const secondRow=detail.locator('.el-table__body tr').filter({hasText:second.caseNo}).first();
  const removeButton=secondRow.getByRole('button',{name:'移除'});
  await removeButton.click();
  const confirm=page.locator('.el-message-box:visible');
  await confirm.getByRole('button',{name:'取消'}).click();
  await confirm.waitFor({state:'hidden'});
  assert.equal(calls.remove,0,'Cancelled remove prompt must not delete');
  await dbl(removeButton);
  await confirm.getByRole('button',{name:'确认移除'}).click();
  await removeGate.started;
  assert.equal(calls.remove,1,'Only one DELETE during slow response');
  assert.equal(await detail.getByRole('button',{name:'关闭'}).isDisabled(),true);
  removeGate.end();
  await detail.getByText(second.caseNo,{exact:true}).first().waitFor({state:'hidden'});
  await detail.getByRole('button',{name:'关闭'}).click();
  await detail.waitFor({state:'hidden'});

  await page.goto(origin+'/#/test-scripts',{waitUntil:'domcontentloaded'});
  const scriptRow=page.locator('.el-table__body tr')
    .filter({hasText:script.scriptCode}).first();
  const sw=scriptRow.locator('.el-switch');
  await sw.click(); // first PUT -> simulated 503, no optimistic change
  await page.waitForTimeout(200);
  assert.equal(calls.toggle,1);
  assert.equal(script.enabled,true);
  await dbl(sw);
  await toggleGate.started;
  assert.equal(calls.toggle,2,'Second double click must produce one PUT');
  assert.match(await sw.getAttribute('class') || '', /is-disabled/);
  toggleGate.end();
  await page.waitForFunction(()=>document.querySelector('.el-switch.is-checked')===null);
  assert.equal(script.enabled,false);

  await page.goto(origin+'/#/execution-tasks',{waitUntil:'domcontentloaded'});
  const taskRow=page.locator('.el-table__body tr').filter({hasText:task1.taskNo}).first();
  const cancel=taskRow.getByRole('button',{name:'取消',exact:true});
  await dbl(cancel);
  const prompt=page.locator('.el-message-box:visible');
  await prompt.getByRole('button',{name:'确认取消'}).click();
  await cancelGate.started;
  assert.equal(calls.cancel,1,'Double cancel must produce one POST');
  assert.equal(await cancel.isDisabled(),true);
  cancelGate.end();
  await taskRow.getByText('已取消',{exact:true}).waitFor({state:'visible'});
  assert.equal(calls.cancel,1);
  const staleRow=page.locator('.el-table__body tr').filter({hasText:task2.taskNo}).first();
  await staleRow.getByRole('button',{name:'取消',exact:true}).click();
  await prompt.getByRole('button',{name:'确认取消'}).click();
  await page.getByText('任务状态已变化',{exact:false}).first().waitFor({state:'visible'});
  assert.equal(calls.cancel,1,'Completed task must never be cancelled');

  assert.deepEqual(unexpected,[],'Unexpected mutation reached real backend');
  assert.deepEqual(errors,[],'Vue page errors');
  console.log('BROWSER_MUTATION_SAFETY_PASS addPosts=2 removeDeletes=1 scriptPuts=2'
    +' taskCancelPosts=1 retryAfterFailure=true staleTaskBlocked=true backendWrites=0');
  await context.close();
}finally{await browser.close();}
