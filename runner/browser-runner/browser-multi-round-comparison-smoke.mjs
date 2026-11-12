// Batch 41: real headless Chrome, fully mocked cycle list/comparison, fail-closed writes.
// Tests two rounds of PASS/FAIL/blocked, no earlier completed round,
// HTTP 503 recovery, stale async response, filters and zero backend mutations.
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const origin='http://127.0.0.1:18090'
const earlier={id:991001,cycleNo:1,cycleName:'DPM-MULTI-R1',
  versionId:9910,versionNo:'B41-VERIFY',projectName:'Browser mock project',
  projectCode:'DPM-VERIFY-MOCK',environmentName:'Local browser mock',
  environmentCode:'LOCAL',codeVersion:'mock-1',caseCount:6,
  status:'COMPLETED',passCount:2,failCount:3,blockedCount:0,
  skippedCount:1,notRunCount:0}
const newer={...earlier,id:991002,cycleNo:2,cycleName:'DPM-MULTI-R2',
  codeVersion:'mock-2',caseCount:6,passCount:4,failCount:1,
  blockedCount:1,skippedCount:0,notRunCount:0}
const kinds=['FIXED','REGRESSION','STILL_FAIL','STILL_PASS',
  'FIRST_PASS','CHANGED','NEW_CASE','REMOVED_CASE']
const noPrevious={cycleId:earlier.id,cycleName:earlier.cycleName,
  cycleNo:1,cycleStatus:'COMPLETED',versionId:9910,previousCycleId:null,
  previousCycleName:null,previousCycleNo:null,total:0,
  counts:Object.fromEntries(kinds.map(k=>[k,0])),rows:[]}
const comparison={cycleId:newer.id,cycleName:newer.cycleName,
  cycleNo:2,cycleStatus:'COMPLETED',versionId:9910,
  previousCycleId:earlier.id,previousCycleName:earlier.cycleName,previousCycleNo:1,
  environmentId:99102,environmentName:'test3 mock',codeVersion:'mock-2',
  previousEnvironmentId:99101,previousEnvironmentName:'local mock',
  previousCodeVersion:'mock-1',environmentChanged:true,codeVersionChanged:true,
  counts:{FIXED:1,REGRESSION:1,STILL_FAIL:1,STILL_PASS:1,
    FIRST_PASS:1,CHANGED:0,NEW_CASE:1,REMOVED_CASE:1},
  total:7,rows:[
    {testCaseId:1,caseNo:'B41-FIXED',title:'Previous fail becomes pass',
      previousResult:'FAIL',currentResult:'PASS',change:'FIXED'},
    {testCaseId:2,caseNo:'B41-REGRESSION',title:'New regression failure',
      previousResult:'PASS',currentResult:'FAIL',change:'REGRESSION'},
    {testCaseId:3,caseNo:'B41-STILL',title:'Persisting failure',
      previousResult:'FAIL',currentResult:'BLOCKED',change:'STILL_FAIL'},
    {testCaseId:4,caseNo:'B41-PASS',title:'Still passing',
      previousResult:'PASS',currentResult:'PASS',change:'STILL_PASS'},
    {testCaseId:5,caseNo:'B41-FIRST',title:'First observed pass',
      previousResult:'SKIPPED',currentResult:'PASS',change:'FIRST_PASS'},
    {testCaseId:6,caseNo:'B41-ADDED',title:'Added coverage',
      previousResult:null,currentResult:'PASS',change:'NEW_CASE'},
    {testCaseId:7,caseNo:'B41-REMOVED',title:'Removed coverage',
      previousResult:'FAIL',currentResult:null,change:'REMOVED_CASE'}
  ]}
const respond=(route,body,status=200)=>route.fulfill({
  status,contentType:'application/json',body:JSON.stringify(body)
})
let releaseSlow=()=>{}
let startSlow=()=>{}
const slowStart=new Promise(resolve=>{startSlow=resolve})
const slowDone=new Promise(resolve=>{releaseSlow=resolve})
let previousReads=0,laterReads=0,backendWrites=0
const jsErrors=[]
const browser=await chromium.launch({executablePath:process.env.DPM_CHROME_PATH,
  headless:true,args:['--disable-extensions','--no-first-run']})
try{
  const context=await browser.newContext({serviceWorkers:'block'})
  const page=await context.newPage()
  page.setDefaultTimeout(12500)
  page.on('pageerror',error=>jsErrors.push(error.message))
  await page.route('**/api/**',route=>{
    if(['GET','HEAD','OPTIONS'].includes(route.request().method()))return route.continue()
    backendWrites++
    return route.abort('blockedbyclient')
  })
  await page.route(/\/api\/test-cycles(?:\?|$)/,route=>{
    assert.equal(route.request().method(),'GET')
    const q=new URL(route.request().url()).searchParams
    const keyword=(q.get('keyword')||'').toUpperCase()
    const rows=[newer,earlier].filter(item=>
      (!keyword||item.cycleName.includes(keyword))
      &&(!q.get('status')||item.status===q.get('status')))
    return respond(route,{list:rows,total:rows.length,
      pageNum:Number(q.get('pageNum')||1),pageSize:Number(q.get('pageSize')||10)})
  })
  await page.route(/\/api\/test-cycles\/991001\/report\/compare(?:\?|$)/,async route=>{
    assert.equal(route.request().method(),'GET')
    previousReads++
    if(previousReads>=2){
      startSlow()
      await slowDone
    }
    return respond(route,noPrevious)
  })
  await page.route(/\/api\/test-cycles\/991002\/report\/compare(?:\?|$)/,route=>{
    assert.equal(route.request().method(),'GET')
    laterReads++
    if(laterReads===1)return respond(route,{message:'Simulation: intermittent report query error'},503)
    return respond(route,comparison)
  })
  const line=text=>page.locator('.el-table__body tr').filter({hasText:text}).first()
  const modal=()=>page.locator('.el-dialog:visible')
    .filter({hasText:'测试轮次结果对比'}).last()
  const chooseFilter=async label=>{
    await modal().locator('.el-radio-button').filter({hasText:label}).first().click()
  }
  await page.goto(origin+'/#/test-reports',{waitUntil:'domcontentloaded'})
  await line('DPM-MULTI-R1').waitFor()
  await line('DPM-MULTI-R2').waitFor()

  // The first finished round of the version cannot report invented improvements.
  await line('DPM-MULTI-R1').getByRole('button',{name:'轮次对比'}).click()
  await modal().getByText('同版本暂无更早的已完成测试轮次',{exact:false}).waitFor()
  assert.equal(await modal().getByText('失败转通过',{exact:false}).count(),0)
  await modal().getByRole('button',{name:'关闭',exact:true}).click()
  await modal().waitFor({state:'hidden'})

  // A failed GET must leave an actionable visible retry, never an empty false report.
  await line('DPM-MULTI-R2').getByRole('button',{name:'轮次对比'}).click()
  await modal().getByRole('button',{name:'重试读取轮次对比'}).waitFor()
  assert.equal(await modal().getByText('失败转通过',{exact:false}).count(),0)
  await modal().getByRole('button',{name:'重试读取轮次对比'}).click()
  await modal().getByText('失败转通过 1',{exact:false}).waitFor()
  await modal().getByText('新增回归失败 1',{exact:false}).waitFor()
  await modal().getByText('范围变化 2',{exact:false}).waitFor()
  await modal().getByText('两轮测试环境不同：local mock → test3 mock',{exact:false}).waitFor()
  await modal().getByText('两轮代码版本或 Git Commit 不同：mock-1 → mock-2',{exact:false}).waitFor()
  assert.equal(await line('B41-REGRESSION').count(),1)
  assert.equal(await line('B41-STILL').count(),1)
  assert.equal(await line('B41-FIXED').count(),0)

  await chooseFilter('已转通过')
  await line('B41-FIXED').waitFor()
  assert.equal(await line('B41-REGRESSION').count(),0)
  await chooseFilter('回归失败')
  await line('B41-REGRESSION').waitFor()
  assert.equal(await line('B41-FIXED').count(),0)
  await chooseFilter('范围变化')
  await line('B41-ADDED').waitFor()
  await line('B41-REMOVED').waitFor()
  assert.equal(await line('B41-REGRESSION').count(),0)
  await chooseFilter('全部')
  await line('B41-FIRST').waitFor()
  await modal().getByText('当前显示 7 / 7 条',{exact:false}).waitFor()
  assert.equal(await modal().getByRole('button',{name:'查看上一轮报告'}).count(),1)
  await modal().getByRole('button',{name:'关闭',exact:true}).click()
  await modal().waitFor({state:'hidden'})

  // A delayed old round GET cannot revive a previously closed comparison modal.
  await line('DPM-MULTI-R1').getByRole('button',{name:'轮次对比'}).click()
  await Promise.race([slowStart,new Promise((_,reject)=>setTimeout(
    ()=>reject(new Error('Delayed comparison GET did not reach mock')),9000))])
  await modal().getByRole('button',{name:'关闭',exact:true}).click()
  await modal().waitFor({state:'hidden'})
  await line('DPM-MULTI-R2').getByRole('button',{name:'轮次对比'}).click()
  await modal().getByText('失败转通过 1',{exact:false}).waitFor()
  releaseSlow()
  await page.waitForTimeout(220)
  assert.equal(await modal().getByText('同版本暂无更早',{exact:false}).count(),0)
  assert.equal(await modal().getByText('失败转通过 1',{exact:false}).count(),1)
  assert.deepEqual(jsErrors,[])
  assert.equal(backendWrites,0)
  assert.equal(previousReads,2)
  assert.equal(laterReads,3)
  console.log('BROWSER_MULTI_ROUND_COMPARISON_PASS noPrevious=true'
    +' retry503=true fixed=1 regression=1 stillFail=1 scope=2'
    +' staleResponseIgnored=true previousGets='+previousReads
    +' laterGets='+laterReads+' backendWrites=0')
  await context.close()
}finally{releaseSlow();await browser.close()}
