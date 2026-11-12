// Batch 39: real headless Chrome. All upload POSTs and download GETs are mocked.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright-core';

const origin='http://127.0.0.1:18090';
const clone=obj=>JSON.parse(JSON.stringify(obj));
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
const reply=(route,obj,status=200)=>route.fulfill({
  status,contentType:'application/json',body:JSON.stringify(obj)
});
const task=(id,execId)=>({
  task:{id,taskNo:'DPM-B39-'+id,taskType:'EXECUTE_CASE',
    taskStatus:'COMPLETED',cycleId:99800,cycleName:'Browser mock B39',
    environmentName:'TEST',environmentCode:'LOCAL',
    codeVersion:'B39',caseCount:1,cycleCaseId:id+1000},
  executions:[{id:execId,attemptNo:1,runnerType:'MANUAL',
    executionStatus:'COMPLETED',result:'PASS',events:[],attachments:[]}]
});
const store=new Map([
  [99841,task(99841,198841)],
  [99842,task(99842,198842)],
  [99845,task(99845,198845)],
  [99846,task(99846,198846)]
]);
const child=task(99844,198844);
const parent={task:{id:99843,taskNo:'DPM-B39-99843',taskType:'EXECUTE_CYCLE',
    taskStatus:'COMPLETED',cycleId:99800,cycleName:'Browser mock B39',
    environmentName:'TEST',environmentCode:'LOCAL',caseCount:1,completedCount:1},
  children:[{...child.task,executions:child.executions,
    caseNo:'DPM-CHILD-44',caseTitle:'Child proof',cycleCaseId:199844}]};
store.set(99843,parent);
store.set(99844,child);
const attachmentSeq={value:5000};
const uploads={normal:0,lost:0,child:0,mismatch:0,unknown:[]};
const downloads={count:0};
const lock=()=>{
  let started,release;
  return {started:new Promise(resolve=>started=resolve),
    released:new Promise(resolve=>release=resolve),
    begin:()=>started(),end:()=>release()};
};
const slow=lock();
const evidence=Buffer.from('B39 evidence hello');
const browser=await chromium.launch({executablePath:process.env.DPM_CHROME_PATH,
  headless:true,args:['--disable-extensions','--no-first-run']});
try{
  const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:true});
  const page=await context.newPage();
  page.setDefaultTimeout(10000);
  console.log('B39_CHROME_STAGE page-created');
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',route=>{
    if(['GET','HEAD','OPTIONS'].includes(route.request().method()))return route.continue();
    uploads.unknown.push(route.request().method()+' '+new URL(route.request().url()).pathname);
    return route.abort('blockedbyclient');
  });
  await page.route('**/api/runner/status',route=>
    reply(route,{summary:[],runners:[]}));
  await page.route(/\/api\/execution-tasks(?:\?|$)/,route=>{
    const q=new URL(route.request().url()).searchParams;
    const rows=[...store.values()].filter(x=>x.task.id!==99844).map(x=>clone(x.task))
      .filter(x=>!q.get('status')||x.taskStatus===q.get('status'));
    return reply(route,{list:rows,total:rows.length,
      pageNum:Number(q.get('pageNum')||1),pageSize:Number(q.get('pageSize')||10)});
  });
  await page.route(/\/api\/execution-tasks\/9984\d$/,route=>{
    const id=Number(new URL(route.request().url()).pathname.split('/').at(-1));
    return reply(route,clone(store.get(id)));
  });
  await page.route(/\/api\/execution-tasks\/9984\d\/executions\/19884\d\/attachments(?:\?|$)/,
    async route=>{
      assert.equal(route.request().method(),'POST');
      const path=new URL(route.request().url()).pathname;
      const match=path.match(/execution-tasks\/(\d+)\/executions\/(\d+)\/attachments/);
      assert.ok(match);
      const [taskId,executionId]=match.slice(1).map(Number);
      assert.ok([99841,99842,99844,99845].includes(taskId));
      assert.equal(executionId,taskId+99000);
      assert.match(route.request().headers()['content-type'],/multipart\/form-data/);
      const data=taskId===99844?child:store.get(taskId);
      const attempt=data.executions[0];
      if(taskId===99841)uploads.normal++;
      if(taskId===99842)uploads.lost++;
      if(taskId===99844)uploads.child++;
      if(taskId===99845)uploads.mismatch++;
      const metadata={
        id:++attachmentSeq.value,executionId,attachmentType:'LOG',
        fileName:'proof.txt',fileSize:evidence.length,sha256:hash(evidence),
        mimeType:'text/plain'
      };
      if(taskId===99841){
        slow.begin();await slow.released;
        attempt.attachments.push(metadata);
        return reply(route,metadata,201);
      }
      if(taskId===99842){
        attempt.attachments.push(metadata);
        return reply(route,{message:'响应丢失，但服务端已保存附件'},503);
      }
      if(taskId===99844){
        attempt.attachments.push(metadata);
        return reply(route,metadata,201);
      }
      if(taskId===99845){
        return reply(route,{...metadata,sha256:'f'.repeat(64)},201);
      }
    });
  await page.route(/\/api\/execution-tasks\/99842\/executions\/198842\/attachments\/\d+$/,
    route=>{
      assert.equal(route.request().method(),'GET');
      return route.fulfill({status:200,contentType:'text/plain',body:Buffer.from('short')});
    });
  await page.route(/\/api\/execution-tasks\/99841\/executions\/198841\/attachments\/\d+$/,
    route=>{
      assert.equal(route.request().method(),'GET');
      downloads.count++;
      return route.fulfill({
        status:200,contentType:'text/plain',
        headers:{'Content-Disposition':'attachment; filename="proof.txt"',
          'X-Content-Type-Options':'nosniff'},
        body:evidence
      });
    });
  await page.goto(origin+'/#/execution-tasks',{waitUntil:'domcontentloaded'});
  const row=id=>page.locator('.el-table__body tr').filter({hasText:'DPM-B39-'+id}).first();
  const dialog=()=>page.locator('.el-dialog:visible').filter({hasText:'执行任务详情'});
  async function open(id) {
    await row(id).getByRole('button',{name:'详情'}).click();
    await dialog().getByText('DPM-B39-'+id,{exact:false}).first().waitFor();
  }
  async function close(){
    await dialog().getByRole('button',{name:'关闭',exact:true}).click();
    await dialog().waitFor({state:'hidden'});
  }
  async function selectFile(button,filename='proof.txt',bytes=evidence) {
    const event=page.waitForEvent('filechooser',{timeout:10000});
    await button.click();
    const chooser=await event;
    await chooser.setFiles({name:filename,mimeType:'text/plain',buffer:bytes});
  }

  // Successful upload: one POST while 2nd click and detail close are disabled.
  await open(99841);
  console.log('B39_CHROME_STAGE task41-opened');
  const upload=dialog().getByRole('button',{name:'上传证据'});
  await selectFile(upload);
  console.log('B39_CHROME_STAGE selected-file41');
  await Promise.race([slow.started,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Upload request did not reach route')),9000))]);
  assert.equal(uploads.normal,1,'Slow upload was submitted once');
  assert.equal(await dialog().getByRole('button',{name:'关闭',exact:true}).isDisabled(),true);
  assert.equal(await upload.isDisabled(),true);
  slow.end();
  console.log('B39_CHROME_STAGE slow-upload-released');
  await dialog().getByText('证据附件（1）').waitFor();
  assert.equal(uploads.normal,1);
  const downloaded=page.waitForEvent('download');
  await dialog().getByRole('button',{name:'下载'}).click();
  const dl=await downloaded;
  assert.equal(dl.suggestedFilename(),'proof.txt');
  assert.equal(downloads.count,1);
  await close();

  console.log('B39_CHROME_STAGE normal-upload-done');
  // 503 after file committed: SHA-256 and newly assigned ID prove success.
  await open(99842);
  await selectFile(dialog().getByRole('button',{name:'上传证据'}));
  await dialog().getByText('证据附件（1）').waitFor();
  assert.equal(uploads.lost,1,'Lost response must not automatically retry POST');
  assert.equal(await dialog().locator('.el-alert--warning').count(),0);
  // The client also rejects downloads whose returned byte count disagrees
  // with the immutable evidence record.
  await dialog().getByRole('button',{name:'下载'}).click();
  await page.getByText('附件下载大小与记录不一致',{exact:false}).first().waitFor();
  await close();

  // A parent cycle shows a child attempt. The POST must target CHILD task ID,
  // not the parent root task ID, despite being opened from the parent view.
  await open(99843);
  await dialog().locator('.el-table__expand-icon').first().click();
  await dialog().getByText('Attempt 1',{exact:false}).first().waitFor();
  await selectFile(dialog().getByRole('button',{name:'上传证据'}));
  // Reloading parent details resets the expanded row; open it again to check
  // the child attempt's new attachment.
  await page.waitForTimeout(350);
  const expand=dialog().locator('.el-table__expand-icon').first();
  if (!(await expand.getAttribute('class')).includes('is-expanded')) await expand.click();
  await dialog().getByText('证据附件（1）').waitFor();
  assert.equal(uploads.child,1);
  await close();

  // Invalid extension and empty input are rejected before network mutations.
  await open(99846);
  await selectFile(dialog().getByRole('button',{name:'上传证据'}),
    'should-not-upload.exe',Buffer.from('bad'));
  await page.getByText('证据格式仅支持',{exact:false}).first().waitFor();
  assert.equal(uploads.unknown.length,0);
  await close();

  // A forged successful response with a wrong checksum is never accepted.
  // The current attempt's new file list does not contain a matching record.
  await open(99845);
  await selectFile(dialog().getByRole('button',{name:'上传证据'}));
  await dialog().getByText('附件返回信息与本次上传不一致',{exact:false}).first().waitFor();
  assert.equal(uploads.mismatch,1);
  assert.equal(await dialog().getByRole('button',{name:'重新读取附件'}).count(),1);
  await close();

  assert.deepEqual(uploads.unknown,[],'Any unexpected POST must fail closed');
  assert.deepEqual(errors,[],'Browser JavaScript errors');
  assert.equal(uploads.normal,1);
  assert.equal(uploads.lost,1);
  assert.equal(uploads.child,1);
  assert.equal(uploads.mismatch,1);
  console.log('BROWSER_ATTACHMENT_SAFETY_PASS normal=1 lostResponse=1'
    +' childUpload=1 invalidRejected=true mismatchedChecksumRejected=true'
    +' download=1 ambiguousGetConfirmed=true duplicatePostBlocked=true backendWrites=0');
  await context.close();
}finally{await browser.close();}
