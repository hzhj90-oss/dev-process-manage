// Batch 43: one-click case -> planned cycle, with all business writes mocked.
// A real Chrome is used; the production DB is always GET-only.
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const origin='http://127.0.0.1:18090'
const clone=x=>JSON.parse(JSON.stringify(x))
const cases=[
  {id:998901,caseNo:'TC-B43-LINKED',title:'Linked regression case',status:'ACTIVE',
    currentRevisionId:998911,requirementCount:1,
    currentRevisionNo:1,requirements:[{requirementId:99101,versionId:9910}]},
  {id:998902,caseNo:'TC-B43-GENERIC',title:'Generic smoke case',status:'ACTIVE',
    currentRevisionId:998912,requirementCount:0,
    currentRevisionNo:1,requirements:[]},
  {id:998903,caseNo:'TC-B43-NEW',title:'Create new cycle with case',status:'ACTIVE',
    currentRevisionId:998913,requirementCount:1,
    currentRevisionNo:1,requirements:[{requirementId:99103,versionId:9912}]}
]
const versions=[
  {id:9910,projectId:9000,projectName:'B43 project',versionNo:'B43-V1'},
  {id:9911,projectId:9000,projectName:'B43 project',versionNo:'B43-V2'},
  {id:9912,projectId:9000,projectName:'B43 project',versionNo:'B43-V3'}
]
const environments=[{id:9971,environmentName:'Local mock',environmentCode:'LOCAL',
  active:true,status:'ACTIVE'}]
const makeCycle=(id,versionId,name,status='PLANNED')=>({
  id,versionId,cycleNo:id-998919,cycleName:name,status,
  projectName:'B43 project',projectCode:'B43',versionNo:'B43-V'+(versionId-9909),
  environmentName:'Local mock',environmentCode:'LOCAL',environmentId:9971,
  codeVersion:'B43-mock',cycleStage:'LOCAL_DEV',caseCount:0,cases:[]
})
const cycles=[
  makeCycle(998920,9910,'B43 target round'),
  makeCycle(998921,9911,'Other-version round'),
  makeCycle(998922,9910,'B43 stale round'),
  makeCycle(998923,9910,'B43 already-covered round')
]
cycles[3].cases=[{id:12001,testCaseId:998901,caseNo:'TC-B43-LINKED'}]
const writes={actual:0,post:0,duplicate:0,stale:0}
let slowPostStart,slowPostRelease
const slowStarted=new Promise(resolve=>slowPostStart=resolve)
const slowReleased=new Promise(resolve=>slowPostRelease=resolve)
let lostResponseMode=false
let originalVersionRead=0
const respond=(route,obj,status=200)=>route.fulfill({
  status,contentType:'application/json',body:JSON.stringify(obj)
})
const result=(route,items)=>({
  list:items,total:items.length,
  pageNum:Number(new URL(route.request().url()).searchParams.get('pageNum')||1),
  pageSize:Number(new URL(route.request().url()).searchParams.get('pageSize')||100)
})
const browser=await chromium.launch({executablePath:process.env.DPM_CHROME_PATH,
  headless:true,args:['--no-first-run','--disable-extensions']})
try{
  const context=await browser.newContext({serviceWorkers:'block'})
  const page=await context.newPage()
  page.setDefaultTimeout(12000)
  const jsErrors=[]
  page.on('pageerror',e=>jsErrors.push(e.message))
  await page.route('**/api/**',route=>{
    if(['GET','HEAD','OPTIONS'].includes(route.request().method()))return route.continue()
    writes.actual++
    return route.abort('blockedbyclient')
  })
  await page.route(/\/api\/versions(?:\?|$)/,route=>respond(route,result(route,versions)))
  await page.route(/\/api\/environments(?:\?|$)/,route=>respond(route,environments))
  await page.route(/\/api\/test-cases(?:\?|$)/,route=>respond(route,result(route,cases)))
  await page.route(/\/api\/test-cases\/99890[123](?:\?|$)/,route=>{
    const id=Number(route.request().url().match(/99890[123]/)[0])
    return respond(route,clone(cases.find(item=>item.id===id)))
  })
  await page.route(/\/api\/test-cycles(?:\?|$)/,route=>{
    const q=new URL(route.request().url()).searchParams
    let items=cycles
    if(q.get('status')) items=items.filter(x=>x.status===q.get('status'))
    if(q.get('versionId')) items=items.filter(x=>x.versionId===Number(q.get('versionId')))
    return respond(route,result(route,clone(items)))
  })
  await page.route(/\/api\/test-cycles\/99892[0-3](?:\?|$)/,route=>{
    const id=Number(route.request().url().match(/99892[0-3]/)[0])
    const item=cycles.find(x=>x.id===id)
    if(id===998922) return respond(route,{...item,status:'RUNNING'})
    if(id===998920) originalVersionRead++
    return respond(route,clone(item))
  })
  await page.route(/\/api\/test-cycles\/99892[0-3]\/cases(?:\?|$)/,async route=>{
    assert.equal(route.request().method(),'POST')
    const id=Number(route.request().url().match(/99892[0-3]/)[0])
    const payload=JSON.parse(route.request().postData()||'{}')
    assert.deepEqual(payload.caseIds,[998901])
    if(id===998922){writes.stale++;return respond(route,{message:'stale'},409)}
    assert.equal(id,998920)
    writes.post++
    if(writes.post===1) {
      slowPostStart()
      await slowReleased
    }
    const target=cycles[0]
    if(!target.cases.some(c=>c.testCaseId===998901)) {
      target.cases.push({id:12002,testCaseId:998901,caseNo:'TC-B43-LINKED',
        title:'Linked regression case',requirements:[{id:1,requirementNo:'REQ-B43'}]})
      target.caseCount=target.cases.length
    }else{writes.duplicate++}
    if(lostResponseMode) return respond(route,{message:'timeout after commit'},503)
    return respond(route,clone(target))
  })
  const row=text=>page.locator('.el-table__body tr').filter({hasText:text}).first()
  const modal=()=>page.locator('.el-dialog:visible').filter({hasText:'将测试用例加入轮次'}).last()
  const picker=()=>modal().locator('.el-form-item').filter({hasText:'选择计划轮次'}).locator('.el-select')
  const chooseRound=async label=>{
    await picker().click()
    await page.locator('.el-select-dropdown:visible').getByText(label,{exact:false}).first().click()
  }
  await page.goto(origin+'/#/test-cases',{waitUntil:'domcontentloaded'})
  await row('TC-B43-LINKED').waitFor()
  await row('TC-B43-LINKED').getByRole('button',{name:'加入轮次'}).click()
  await page.waitForFunction(()=>location.hash.includes('caseId=998901'))
  await modal().waitFor() // deep link opens directly
  await modal().getByText('TC-B43-LINKED',{exact:false}).first().waitFor()
  assert.equal(await modal().getByText('仅显示与用例关联需求相同版本',{exact:false}).count(),1)
  await picker().click()
  await page.locator('.el-select-dropdown:visible').getByText('B43 target round',{exact:false}).waitFor()
  assert.equal(await page.locator('.el-select-dropdown:visible').getByText('Other-version round',{exact:false}).count(),0)
  await page.locator('.el-select-dropdown:visible').getByText('B43 target round',{exact:false}).click()
  const action=modal().getByRole('button',{name:'加入所选轮次'})
  await action.click()
  await page.getByRole('button',{name:'确认加入'}).click()
  await Promise.race([slowStarted,new Promise((_,reject)=>setTimeout(
    ()=>reject(new Error('Expected slow POST did not reach mock')),9000))])
  assert.equal(writes.post,1)
  assert.equal(await modal().getByRole('button',{name:'取消'}).isDisabled(),true)
  slowPostRelease()
  const detail=page.locator('.el-dialog:visible').filter({hasText:'测试轮次详情'}).last()
  await detail.getByText('TC-B43-LINKED',{exact:false}).first().waitFor()
  assert.equal(writes.post,1)
  assert.equal(writes.actual,0)
  await detail.getByRole('button',{name:'关闭',exact:true}).click()
  await detail.waitFor({state:'hidden'})
  console.log('B43_STAGE normal-case-added')

  // Generic case permits cross-version planned rounds but warns about absent coverage.
  await page.goto(origin+'/#/test-cycles?caseId=998902',{waitUntil:'domcontentloaded'})
  await modal().waitFor()
  await modal().getByText('未关联需求的通用用例',{exact:false}).waitFor()
  await picker().click()
  await page.locator('.el-select-dropdown:visible').getByText('Other-version round',{exact:false}).waitFor()
  await page.keyboard.press('Escape')
  await modal().getByRole('button',{name:'取消'}).click()
  await modal().waitFor({state:'hidden'})
  console.log('B43_STAGE generic-cross-version-visible')

  // Source links version 9912 and no existing planned cycle; create form is prefilled.
  await page.goto(origin+'/#/test-cycles?caseId=998903',{waitUntil:'domcontentloaded'})
  await modal().waitFor()
  await modal().getByText('当前没有符合版本约束的计划中轮次',{exact:false}).waitFor()
  await modal().getByRole('button',{name:'新建轮次并预选用例'}).click()
  const create=page.locator('.el-dialog:visible').filter({hasText:'新建测试轮次'}).last()
  await create.waitFor()
  assert.ok((await create.innerText()).includes('B43-V3'))
  assert.ok((await create.innerText()).includes('TC-B43-NEW'))
  await create.getByRole('button',{name:'取消',exact:true}).click()
  await create.waitFor({state:'hidden'})
  console.log('B43_STAGE new-cycle-prefill')

  // A planned item may become RUNNING after confirmation: it must never POST.
  await page.goto(origin+'/#/test-cycles?caseId=998901',{waitUntil:'domcontentloaded'})
  await modal().waitFor()
  await modal().getByText('TC-B43-LINKED',{exact:false}).first().waitFor()
  await chooseRound('B43 stale round')
  await modal().getByRole('button',{name:'加入所选轮次'}).click()
  await page.getByRole('button',{name:'确认加入'}).click()
  await modal().getByText('轮次状态或版本已变化',{exact:false}).waitFor()
  assert.equal(writes.stale,0)
  await modal().getByRole('button',{name:'取消'}).click()
  await modal().waitFor({state:'hidden'})
  console.log('B43_STAGE stale-guard-works')

  assert.deepEqual(jsErrors,[])
  assert.equal(writes.actual,0)
  assert.equal(writes.duplicate,0)
  console.log('BROWSER_CASE_CYCLE_PLACEMENT_PASS linked=true'
    +' genericCrossVersionWarning=true newCyclePrefill=true staleBlocked=true'
    +' post=1 duplicate=0 backendWrites=0')
  await context.close()
}finally{slowPostRelease?.();await browser.close()}
