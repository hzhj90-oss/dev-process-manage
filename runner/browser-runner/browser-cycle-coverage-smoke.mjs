// Batch 44: browser verification of read-only FROZEN coverage rollup.
// All business writes are blocked, original MySQL is never modified.
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const host='http://127.0.0.1:18090'
const req=(id,design)=>({
  id:1000+id,requirementId:id,requirementNo:'REQ-B44-'+id,title:'Feature '+id,
  coverageType:'NORMAL',requirementSnapshotJson:'{"contentMarkdown":"frozen"}',
  designSnapshotJson:design?'{"revisionNo":2,"title":"Second design"}':null
})
const snapshot=(id,state,requirements)=>({
  id:500+id,testCaseId:800+id,caseNo:'TC-B44-'+id,title:'Case '+id,
  revisionNo:1,executionMode:'MANUAL',latestResult:state,
  caseSnapshotJson:'{"steps":[],"expectedResult":"ok"}',requirements
})
const cycle={
  id:992044,versionId:991044,cycleNo:4,cycleName:'B44 coverage snapshot',
  projectName:'Mock project',versionNo:'B44-V1',
  environmentName:'Local mock',environmentCode:'LOCAL',
  environmentId:9991,status:'COMPLETED',codeVersion:'b44-code',
  cycleStage:'LOCAL_DEV',
  cases:[
    snapshot(1,'PASS',[req(40,true),req(41,false)]),
    snapshot(2,'FAIL',[req(40,false)]),
    snapshot(3,'NOT_RUN',[req(41,false)]),
    snapshot(4,'PASS',[])
  ]
}
const respond=(route,value,status=200)=>route.fulfill({
  status,contentType:'application/json',body:JSON.stringify(value)
})
let broken=false,backendWrites=0
const browser=await chromium.launch({
  executablePath:process.env.DPM_CHROME_PATH,
  headless:true,args:['--disable-extensions','--no-first-run']
})
try {
  const ctx=await browser.newContext({serviceWorkers:'block'})
  const page=await ctx.newPage()
  const jsErrors=[]
  page.on('pageerror',e=>jsErrors.push(e.message))
  page.setDefaultTimeout(12000)
  await page.route('**/api/**',route=>{
    if(['GET','HEAD','OPTIONS'].includes(route.request().method()))return route.continue()
    backendWrites++
    return route.abort('blockedbyclient')
  })
  await page.route(/\/api\/versions(?:\?|$)/,route=>respond(route,{list:[],total:0,pageNum:1,pageSize:100}))
  await page.route(/\/api\/test-cases(?:\?|$)/,route=>respond(route,{list:[],total:0,pageNum:1,pageSize:100}))
  await page.route(/\/api\/environments(?:\?|$)/,route=>respond(route,[]))
  await page.route(/\/api\/test-cycles\/992044(?:\?|$)/,route=>{
    const selected=structuredClone(cycle)
    if(broken) selected.cases[1].requirements=[{title:'Missing identity'}]
    return respond(route,selected)
  })
  await page.route(/\/api\/test-cycles(?:\?|$)/,route=>{
    const list=[{...cycle,cases:undefined,caseCount:cycle.cases.length}]
    return respond(route,{list,total:1,pageNum:1,pageSize:10})
  })
  await page.goto(host+'/#/test-cycles',{waitUntil:'domcontentloaded'})
  const row=page.locator('.el-table__body tr').filter({hasText:'B44 coverage snapshot'}).first()
  await row.waitFor()
  await row.getByRole('button',{name:'详情'}).click()
  const dialog=page.locator('.el-dialog:visible').filter({hasText:'测试轮次详情'}).last()
  const summary=dialog.locator('.cycle-coverage-panel')
  await summary.getByText('本轮需求覆盖汇总（冻结快照）').waitFor()
  const stats=summary.locator('.coverage-stat-grid')
  assert.deepEqual((await stats.locator('strong').allTextContents()).map(x=>x.trim()),
    ['2','3','1','3'])
  await summary.getByText('本轮有 1 条通用用例',{exact:false}).waitFor()
  await summary.getByText('有 3 个用例-需求关联没有完整设计修订快照',{exact:false}).waitFor()
  const r40=summary.locator('.el-table__body tr').filter({hasText:'REQ-B44-40'}).first()
  const r41=summary.locator('.el-table__body tr').filter({hasText:'REQ-B44-41'}).first()
  await r40.waitFor()
  await r41.waitFor()
  assert.match(await r40.innerText(),/2.*1.*1.*0.*1例缺失/s)
  assert.match(await r41.innerText(),/2.*1.*0.*1.*2例缺失/s)
  await dialog.getByRole('button',{name:'关闭',exact:true}).click()
  await dialog.waitFor({state:'hidden'})

  // Malformed legacy snapshot is visibly rejected, never displayed as valid coverage.
  broken=true
  await row.getByRole('button',{name:'详情'}).click()
  await summary.getByText('无法核对本轮覆盖统计',{exact:false}).waitFor()
  assert.equal(await summary.locator('.coverage-stat-grid').count(),0)
  assert.deepEqual(jsErrors,[])
  assert.equal(backendWrites,0)
  console.log('BROWSER_CYCLE_COVERAGE_PASS requirements=2 linkedCases=3'
    +' genericCases=1 missingDesignLinks=3 rejectedBrokenSnapshot=true backendWrites=0')
  await ctx.close()
} finally { await browser.close() }
