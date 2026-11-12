// Batch 37: cycle start/abort, cycle/case task creation and lost-response idempotency.
// Real headless Chrome; all POSTs intercepted and all unrecognised writes are denied.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

const origin='http://127.0.0.1:18090';
const reply=(route,body,status=200)=>route.fulfill({
  status,contentType:'application/json',body:JSON.stringify(body)
});
const pageOf=(route,list)=>({
  list,total:list.length,
  pageNum:Number(new URL(route.request().url()).searchParams.get('pageNum')||1),
  pageSize:Number(new URL(route.request().url()).searchParams.get('pageSize')||10)
});
const latch=()=>{
  let arrive,release;
  return {started:new Promise(r=>arrive=r),released:new Promise(r=>release=r),
    begin:()=>arrive(),end:()=>release()};
};
const dbl=button=>button.evaluate(el=>{el.click();el.click()});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const version={id:997100,versionNo:'B37',versionName:'Browser mock',
  projectId:1,projectName:'Safe mock',projectCode:'DPM',status:'DEVELOPING'};
const env={id:997101,environmentName:'Local mock',environmentCode:'LOCAL',
  environmentType:'TEST',authType:'NONE',active:true,baseUrl:origin};
const caseOf=id=>({id:id+1000,testCaseId:id+1000,caseNo:'DPM-B37-'+id,
  title:'Test '+id,revisionNo:1,executionMode:'MANUAL',
  latestResult:'NOT_RUN',requirements:[]});
const fixture=(id,status)=>({
  id,cycleNo:id,cycleName:'DPM-B37-CYCLE-'+id,
  versionId:version.id,versionNo:version.versionNo,projectName:'Safe mock',
  environmentId:env.id,environmentName:env.environmentName,
  environmentCode:env.environmentCode,codeVersion:'B37',
  cycleStage:'LOCAL_DEV',status,cases:[caseOf(id)]
});
const all=new Map([
  fixture(997201,'PLANNED'),fixture(997202,'RUNNING'),
  fixture(997203,'RUNNING'),fixture(997204,'RUNNING'),
  fixture(997205,'PLANNED'),fixture(997206,'RUNNING'),
  fixture(997207,'RUNNING'),fixture(997208,'RUNNING')
].map(item=>[item.id,item]));
const clone=id=>{
  const c=all.get(id);
  return {...c,cases:[...c.cases],
    caseCount:c.cases.length,passCount:0,failCount:0,
    blockedCount:0,skippedCount:0,notRunCount:c.cases.length};
};
const startGate=latch(),abortGate=latch(),caseGate=latch(),cycleGate=latch();
const sent={start:0,abort:0,case:0,cycle:0,unexpected:[]};
let staleStart=false,staleAbort=false,staleCase=false;
let originalCaseKey=null,actualCaseCreations=0;
let reloadCaseKey=null,reloadTaskCreates=0,reloadCalls=0;
const tasks=[];
const browser=await chromium.launch({
  executablePath:process.env.DPM_CHROME_PATH,headless:true,
  args:['--disable-extensions','--no-first-run']
});
try {
  const context=await browser.newContext({serviceWorkers:'block'});
  const page=await context.newPage();
  const runtimeErrors=[];
  page.on('pageerror',e=>runtimeErrors.push(e.message));
  await page.route('**/api/**',r=>{
    if(['GET','HEAD','OPTIONS'].includes(r.request().method())) return r.continue();
    sent.unexpected.push(r.request().method()+' '+new URL(r.request().url()).pathname);
    return r.abort('blockedbyclient');
  });
  await page.route(/\/api\/versions(?:\?|$)/,r=>reply(r,pageOf(r,[version])));
  await page.route(/\/api\/environments(?:\?|$)/,r=>reply(r,[env]));
  await page.route(/\/api\/test-cases(?:\?|$)/,r=>reply(r,pageOf(r,[])));
  await page.route(/\/api\/test-cycles(?:\?|$)/,r=>
    reply(r,pageOf(r,[...all.keys()].map(clone))));
  await page.route(/\/api\/test-cycles\/99720\d(?:\?|$)/,r=>{
    const id=Number(new URL(r.request().url()).pathname.split('/').at(-1));
    if(id===997205&&staleStart){all.get(id).status='RUNNING';staleStart=false;}
    if(id===997206&&staleAbort){all.get(id).status='ABORTED';staleAbort=false;}
    if(id===997207&&staleCase){all.get(id).cases=[];staleCase=false;}
    return reply(r,clone(id));
  });
  await page.route(/\/api\/test-cycles\/997201\/start(?:\?|$)/,async r=>{
    assert.equal(r.request().method(),'POST');
    sent.start++;
    startGate.begin();await startGate.released;
    all.get(997201).status='RUNNING';
    return reply(r,clone(997201));
  });
  await page.route(/\/api\/test-cycles\/997202\/abort(?:\?|$)/,async r=>{
    assert.equal(r.request().method(),'POST');
    sent.abort++;
    abortGate.begin();await abortGate.released;
    // Server committed, but the client only received a 503. Reconciliation
    // must show ABORTED and prevent any second POST.
    all.get(997202).status='ABORTED';
    return reply(r,{message:'模拟响应丢失：服务端已终止'},503);
  });
  await page.route(/\/api\/test-cycles\/997203\/cycle-cases\/998203\/execution-tasks(?:\?|$)/,
    async r=>{
      assert.equal(r.request().method(),'POST');
      const header=r.request().headers()['idempotency-key'];
      const body=JSON.parse(r.request().postData());
      assert.equal(body.idempotencyKey,header);
      assert.equal(body.triggerSource,'USER');
      sent.case++;
      if(!originalCaseKey){
        originalCaseKey=header;
        actualCaseCreations++;
        tasks.push({id:997701,taskType:'EXECUTE_CASE',taskStatus:'PENDING',
          cycleId:997203,cycleCaseId:998203,taskNo:'DPM-B37-CASE-TASK',
          cycleName:'DPM-B37-CYCLE-997203'});
        return reply(r,{message:'模拟接收成功但响应失败'},503);
      }
      assert.equal(header,originalCaseKey,'Retry MUST reuse the idempotency key');
      caseGate.begin();await caseGate.released;
      return reply(r,{task:tasks[0],executions:[]},201);
    });
  await page.route(/\/api\/test-cycles\/997208\/cycle-cases\/998208\/execution-tasks(?:\?|$)/,
    async r=>{
      assert.equal(r.request().method(),'POST');
      const header=r.request().headers()['idempotency-key'];
      reloadCalls++;
      if(!reloadCaseKey){
        reloadCaseKey=header;
        reloadTaskCreates++;
        tasks.push({id:997703,taskType:'EXECUTE_CASE',taskStatus:'PENDING',
          cycleId:997208,cycleCaseId:998208,taskNo:'DPM-B37-RELOAD-TASK',
          cycleName:'DPM-B37-CYCLE-997208'});
        return reply(r,{message:'模拟响应丢失，刷新网页后重试'},503);
      }
      assert.equal(header,reloadCaseKey,'Key must survive a browser page reload');
      return reply(r,{task:tasks.find(item=>item.id===997703),executions:[]},201);
    });
  await page.route(/\/api\/test-cycles\/997204\/execution-tasks(?:\?|$)/,async r=>{
    assert.equal(r.request().method(),'POST');
    const header=r.request().headers()['idempotency-key'];
    const body=JSON.parse(r.request().postData());
    assert.equal(body.idempotencyKey,header);
    assert.ok(header.startsWith('web-'));
    sent.cycle++;
    cycleGate.begin();await cycleGate.released;
    const task={id:997702,taskType:'EXECUTE_CYCLE',taskStatus:'PENDING',
      cycleId:997204,taskNo:'DPM-B37-CYCLE-TASK',
      cycleName:'DPM-B37-CYCLE-997204'};
    tasks.push(task);
    return reply(r,{task,children:[]},201);
  });
  await page.route(/\/api\/execution-tasks(?:\?|$)/,r=>reply(r,pageOf(r,tasks)));
  await page.goto(origin+'/#/test-cycles',{waitUntil:'domcontentloaded'});
  const rowOf=id=>page.locator('.el-table__body tr')
    .filter({hasText:'DPM-B37-CYCLE-'+id}).first();
  const visibleDialog=title=>page.locator('.el-dialog:visible').filter({hasText:title});
  const message=()=>page.locator('.el-message-box:visible');

  // Cancel the confirmation, then double-click start. The two clicks must
  // create only one confirm and one POST even when the server is slow.
  await rowOf(997201).getByRole('button',{name:'开始',exact:true}).click();
  await message().getByRole('button',{name:'再检查一下'}).click();
  await message().waitFor({state:'hidden'});
  assert.equal(sent.start,0,'Cancelled start must have no POST');
  await dbl(rowOf(997201).getByRole('button',{name:'开始',exact:true}));
  await message().getByRole('button',{name:'开始测试'}).click();
  await startGate.started;
  assert.equal(sent.start,1,'Start double-click must have one POST');
  assert.equal(await rowOf(997201).getByRole('button',{name:'开始',exact:true}).isDisabled(),true);
  startGate.end();
  await rowOf(997201).getByRole('button',{name:'终止'}).waitFor({state:'visible'});
  assert.equal(sent.start,1);

  // A second browser changed PLANNED -> RUNNING while confirm was open.
  // The preflight GET must reject the stale start.
  staleStart=true;
  await rowOf(997205).getByRole('button',{name:'开始',exact:true}).click();
  await message().getByRole('button',{name:'开始测试'}).click();
  await rowOf(997205).getByRole('button',{name:'终止'}).waitFor({state:'visible'});
  assert.equal(sent.start,1,'Stale cycle must not issue start POST');

  staleAbort=true;
  await rowOf(997206).getByRole('button',{name:'终止',exact:true}).click();
  await message().getByRole('button',{name:'确认终止'}).click();
  await rowOf(997206).getByText('已终止').waitFor({state:'visible'});
  assert.equal(sent.abort,0,'Stale cycle must not issue abort POST');

  // The confirmation cancellation is harmless; later the server commits an
  // abort but the response is lost. Refresh must reconcile without retrying.
  await rowOf(997202).getByRole('button',{name:'终止',exact:true}).click();
  await message().getByRole('button',{name:'取消'}).click();
  await message().waitFor({state:'hidden'});
  assert.equal(sent.abort,0);
  await dbl(rowOf(997202).getByRole('button',{name:'终止',exact:true}));
  await message().getByRole('button',{name:'确认终止'}).click();
  await abortGate.started;
  assert.equal(sent.abort,1);
  assert.equal(await rowOf(997202).getByRole('button',{name:'终止',exact:true}).isDisabled(),true);
  abortGate.end();
  await rowOf(997202).getByText('已终止').waitFor({state:'visible'});
  assert.equal(sent.abort,1,'Lost response must not auto-resubmit abort');

  // A case disappears between clicking and the latest-cycle GET.
  await rowOf(997207).getByRole('button',{name:'详情'}).click();
  let detail=visibleDialog('测试轮次详情');
  await detail.getByText('DPM-B37-997207',{exact:false}).first().waitFor();
  staleCase=true;
  await detail.getByRole('button',{name:'单独执行'}).click();
  await detail.getByText('当前轮次尚未选择测试用例').waitFor({state:'visible'});
  assert.equal(sent.case,0,'Stale case must not be executed');
  await detail.getByRole('button',{name:'关闭'}).click();
  await detail.waitFor({state:'hidden'});

  // First case creation commits on server but client receives 503.
  // Manually retrying the same button must use EXACTLY the same key.
  await rowOf(997203).getByRole('button',{name:'详情'}).click();
  detail=visibleDialog('测试轮次详情');
  const caseButton=detail.getByRole('button',{name:'单独执行'});
  await caseButton.click();
  await page.waitForFunction(()=>document.body.textContent.includes('模拟接收成功但响应失败'));
  await caseButton.waitFor({state:'visible'});
  await page.waitForTimeout(150);
  assert.equal(sent.case,1);
  await dbl(caseButton);
  await caseGate.started;
  assert.equal(sent.case,2,'Manual retry double click must issue a single POST');
  assert.equal(actualCaseCreations,1,'Only one actual task must exist');
  assert.equal(await caseButton.isDisabled(),true);
  caseGate.end();
  await page.waitForURL('**/#/execution-tasks');
  assert.equal(sent.case,2);
  assert.equal(tasks.length,1);

  // Even after an explicit browser reload, the same tab must keep the original
  // key for a task that may already exist after a lost HTTP response.
  await page.goto(origin+'/#/test-cycles',{waitUntil:'domcontentloaded'});
  await rowOf(997208).getByRole('button',{name:'详情'}).click();
  detail=visibleDialog('测试轮次详情');
  await detail.getByRole('button',{name:'单独执行'}).click();
  await page.waitForFunction(()=>
    document.body.textContent.includes('模拟响应丢失，刷新网页后重试'));
  assert.equal(reloadCalls,1);
  assert.equal(await page.evaluate(()=>
    sessionStorage.getItem('dpm:execution-request:case:997208:998208')),reloadCaseKey);
  await page.reload({waitUntil:'domcontentloaded'});
  await rowOf(997208).getByRole('button',{name:'详情'}).click();
  detail=visibleDialog('测试轮次详情');
  await detail.getByRole('button',{name:'单独执行'}).click();
  await page.waitForURL('**/#/execution-tasks');
  assert.equal(reloadCalls,2);
  assert.equal(reloadTaskCreates,1,'Page reload must not create a second task');
  assert.equal(await page.evaluate(()=>
    sessionStorage.getItem('dpm:execution-request:case:997208:998208')),null);

  // Whole-cycle task confirmation: cancel -> no POST, double click -> one POST.
  await page.goto(origin+'/#/test-cycles',{waitUntil:'domcontentloaded'});
  await rowOf(997204).getByRole('button',{name:'详情'}).click();
  detail=visibleDialog('测试轮次详情');
  const cycleButton=detail.getByRole('button',{name:'创建整轮执行任务'});
  await cycleButton.click();
  await message().getByRole('button',{name:'取消'}).click();
  await message().waitFor({state:'hidden'});
  assert.equal(sent.cycle,0);
  await dbl(cycleButton);
  await message().getByRole('button',{name:'创建任务'}).click();
  await cycleGate.started;
  assert.equal(sent.cycle,1,'Double click must issue exactly one cycle-task POST');
  assert.equal(await detail.getByRole('button',{name:'关闭'}).isDisabled(),true);
  cycleGate.end();
  await page.waitForURL('**/#/execution-tasks');
  assert.equal(sent.cycle,1);
  assert.equal(tasks.length,3);

  assert.deepEqual(sent.unexpected,[],'Unexpected API writes must be denied');
  assert.deepEqual(runtimeErrors,[],'No Vue runtime errors');
  console.log('BROWSER_CYCLE_ACTION_SAFETY_PASS startPosts=1 abortPosts=1'
    +' caseCreatePosts=2 caseActualCreates=1 cycleCreatePosts=1'
    +' staleStartBlocked=true staleAbortBlocked=true missingCaseBlocked=true'
    +' retryReusedKey=true reloadReusedKey=true backendWrites=0');
  await context.close();
}finally{await browser.close();}
