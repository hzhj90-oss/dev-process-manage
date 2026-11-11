// Opt-in real DB E2E: creates tagged test cycles in a DPM-VERIFY project only.
// NEVER runs against a production instance. No delete/cleanup of existing records.
import assert from 'node:assert/strict';
const BASE='http://127.0.0.1:18090';
const VERSION=Number(process.env.DPM_BROWSER_E2E_VERSION_ID);
if(process.env.DPM_BROWSER_E2E_ALLOW_WRITE!=='YES')
  throw Error('Explicit opt-in required: DPM_BROWSER_E2E_ALLOW_WRITE=YES');
if(!Number.isSafeInteger(VERSION)||VERSION<1)
  throw Error('Set DPM_BROWSER_E2E_VERSION_ID to a dedicated verification version');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function api(method,path,body,headers={}){
  const response=await fetch(BASE+path,{method,
    headers:{...(body==null?{}:{'content-type':'application/json'}),...headers},
    body:body==null?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
  const text=await response.text();
  let data=null;try{data=text?JSON.parse(text):null;}catch{throw Error('Non-JSON API response: '+path)}
  if(!response.ok)throw Error(method+' '+path+' HTTP '+response.status+' '+JSON.stringify(data).slice(0,800));
  return data;
}
const version=await api('GET','/api/versions/'+VERSION);
if(!String(version.projectCode||'').startsWith('DPM-VERIFY-'))
  throw Error('Refusing to change non-verification project '+version.projectCode);
const health=await api('GET','/api/health');
assert.equal(health.status,'UP');
const environments=await api('GET','/api/environments?activeOnly=false');
let environment=environments.find(x=>x.environmentCode==='BROWSER_E2E_20261111');
if(!environment){
  environment=await api('POST','/api/environments',{
    environmentCode:'BROWSER_E2E_20261111',environmentName:'Browser Runner Local E2E',
    environmentType:'TEST',baseUrl:BASE,apiBaseUrl:BASE,authType:'NONE',active:true,
    sortOrder:100,description:'Dedicated local Chrome test environment'});
}
if(environment.environmentType!=='TEST'||environment.authType!=='NONE'||environment.baseUrl!==BASE)
  throw Error('Existing Browser E2E environment is not a local unauthenticated test origin');
const scenarios=[
  {label:'PASS',code:'BROWSER-E2E-20261111',title:'Browser Runner real manager success',screenshot:'dpm-browser-real-e2e.png',
   steps:[{action:'GOTO',path:'/#/test-reports'},
    {action:'ASSERT_VISIBLE',selector:'h1'},
    {action:'ASSERT_TEXT',selector:'h1',expected:'测试报告'},
    {action:'SCREENSHOT',name:'dpm-browser-real-e2e.png'}]},
  {label:'FAIL',code:'BROWSER-E2E-FAIL-20261111',title:'Intentional Browser assertion failure',screenshot:'browser-failure.png',
   steps:[{action:'GOTO',path:'/#/test-reports'},
    {action:'ASSERT_TEXT',selector:'h1',expected:'intentionally-unmatched-title'}]}
];
async function ensureFixture(scenario){
  const page=await api('GET','/api/test-scripts?keyword='+scenario.code+'&pageNum=1&pageSize=100');
  let script=page.list.find(item=>item.scriptCode===scenario.code);
  if(!script){
    script=await api('POST','/api/test-scripts',{
      scriptCode:scenario.code,scriptName:scenario.title,scriptLanguage:'BROWSER',
      scriptVersion:'1.0.0',runtimeVersion:'Playwright Chrome',sourceType:'INLINE',
      sourceContent:JSON.stringify({version:1,timeoutMs:20000,steps:scenario.steps}),
      entryPoint:'steps',enabled:true,createdBy:'local-e2e'});
  }
  const detail=await api('GET','/api/test-scripts/'+script.id);
  if(detail.scriptLanguage!=='BROWSER'||detail.sourceType!=='INLINE'||!detail.enabled)
    throw Error('Fixture script was modified or disabled: '+scenario.code);
  const caseNo='TC-'+scenario.code;
  const cases=await api('GET','/api/test-cases?keyword='+caseNo+'&pageNum=1&pageSize=100');
  let testCase=cases.list.find(item=>item.caseNo===caseNo);
  if(!testCase){
    testCase=await api('POST','/api/test-cases',{
      caseNo,title:scenario.title,testType:'UI',priority:'MEDIUM',status:'ACTIVE',
      executionMode:'SCRIPT',scriptId:script.id,createdBy:'local-e2e',
      expectedResult:'Expected '+scenario.label+' and a screenshot attachment',
      steps:[{stepNo:1,action:'Execute dedicated Browser DSL',expectedResult:'Verify '+scenario.label}],
      requirementIds:[]});
  }
  const caseDetail=await api('GET','/api/test-cases/'+testCase.id);
  if(caseDetail.executionMode!=='SCRIPT'||caseDetail.scriptId!==script.id)
    throw Error('Fixture test case was modified: '+caseNo);
  return testCase.id;
}
async function run(scenario){
  const testCaseId=await ensureFixture(scenario);
  const cycle=await api('POST','/api/test-cycles',{
    versionId:VERSION,cycleName:'Browser E2E '+scenario.label+' '+Date.now().toString(36),
    cycleStage:'LOCAL_DEV',environmentId:environment.id,codeVersion:'local-browser-e2e',
    gitBranch:'main',caseIds:[testCaseId],createdBy:'local-e2e'});
  await api('POST','/api/test-cycles/'+cycle.id+'/start');
  const details=await api('GET','/api/test-cycles/'+cycle.id);
  const cycleCaseId=details.cases[0].id;
  const key='browser-e2e-'+cycle.id+'-'+cycleCaseId;
  const created=await api('POST','/api/test-cycles/'+cycle.id+'/cycle-cases/'+cycleCaseId+'/execution-tasks',{
    idempotencyKey:key,requestedBy:'local-e2e',triggerSource:'USER'
  },{'Idempotency-Key':key});
  const taskId=created.task?.id??created.id;
  assert.ok(taskId,'Runner task creation returned no id');
  let result;
  for(let attempt=0;attempt<40;attempt++){
    result=await api('GET','/api/execution-tasks/'+taskId);
    if(['COMPLETED','FAILED','CANCELLED','RECOVERY_REQUIRED'].includes(result.task?.taskStatus))break;
    await sleep(1000);
  }
  assert.equal(result.task?.taskStatus,'COMPLETED','Task did not finish');
  const execution=result.executions?.[0];
  assert.equal(execution?.result,scenario.label,'Wrong Browser result for '+scenario.label);
  const attachment=execution?.attachments?.find(x=>x.fileName===scenario.screenshot);
  assert.ok(attachment,'Screenshot missing for '+scenario.label);
  const response=await fetch(BASE+'/api/execution-tasks/'+taskId+'/executions/'+execution.id+'/attachments/'+attachment.id);
  assert.equal(response.status,200);
  const png=Buffer.from(await response.arrayBuffer());
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  if(scenario.label==='FAIL')
    assert.ok(execution.events?.some(x=>x.eventType==='ASSERTION_FAILED'),'Failure event not recorded');
  const report=await fetch(BASE+'/api/test-cycles/'+cycle.id+'/report');
  assert.equal(report.status,200);
  const html=await report.text();
  assert.ok(html.includes(scenario.screenshot)&&html.includes('/attachments/'),'Screenshot missing in HTML report');
  console.log('REAL_BROWSER_'+scenario.label+'_OK cycle='+cycle.id+' task='+taskId+' execution='+execution.id+' pngBytes='+png.length);
}
for(const scenario of scenarios)await run(scenario);
console.log('REAL_BROWSER_DATABASE_E2E_PASS both PASS/FAIL paths and evidence verified');
