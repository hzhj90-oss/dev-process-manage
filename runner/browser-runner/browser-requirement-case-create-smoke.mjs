// Batch 42: requirement -> case authoring, in real headless Chrome with mocked data.
// Every POST is intercepted; any unexpected mutating request fails closed.
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const origin='http://127.0.0.1:18090'
const reqA={id:992041,versionId:992010,requirementNo:'REQ-B42-A',
  title:'需求 A：未覆盖测试',projectCode:'MOCK',projectName:'模拟项目',
  versionNo:'B42-V1',status:'CONFIRMED',linkedCaseCount:0,designCount:0,priority:'HIGH'}
const reqB={...reqA,id:992042,versionId:992011,requirementNo:'REQ-B42-B',
  title:'需求 B：另一版本',versionNo:'B42-V2'}
const versions=[
  {id:992010,projectId:992001,projectCode:'MOCK',projectName:'模拟项目',
    versionNo:'B42-V1',versionName:'本地模拟一',status:'PLANNING'},
  {id:992011,projectId:992001,projectCode:'MOCK',projectName:'模拟项目',
    versionNo:'B42-V2',versionName:'本地模拟二',status:'PLANNING'}
]
const respond=(route,body,status=200)=>route.fulfill({
  status,contentType:'application/json',body:JSON.stringify(body)
})
const pageResult=(list,route)=>({
  list,total:list.length,pageNum:Number(new URL(route.request().url()).searchParams.get('pageNum')||1),
  pageSize:Number(new URL(route.request().url()).searchParams.get('pageSize')||100)
})
const browser=await chromium.launch({
  executablePath:process.env.DPM_CHROME_PATH,headless:true,
  args:['--disable-extensions','--no-first-run']
})
let writes=0,created=0,detailA=0,detailB=0,optionsA=0,optionsB=0
const records=[]
const errors=[]
let releaseSlow=()=>{},startSlow=()=>{}
const slowStarted=new Promise(resolve=>{startSlow=resolve})
const slowReleased=new Promise(resolve=>{releaseSlow=resolve})
try{
  const context=await browser.newContext({serviceWorkers:'block'})
  const page=await context.newPage()
  page.setDefaultTimeout(12000)
  page.on('pageerror',error=>errors.push(error.message))
  await page.route('**/api/**',route=>{
    if(['GET','HEAD','OPTIONS'].includes(route.request().method())) return route.continue()
    writes++
    return route.abort('blockedbyclient')
  })
  await page.route(/\/api\/versions(?:\?|$)/,route=>
    respond(route,pageResult(versions,route)))
  await page.route(/\/api\/test-scripts(?:\?|$)/,route=>
    respond(route,pageResult([],route)))
  await page.route(/\/api\/requirements(?:\?|$)/,route=>
    respond(route,pageResult([reqA,reqB],route)))
  await page.route(/\/api\/requirements\/99204[12](?:\?|$)/,async route=>{
    const id=Number(route.request().url().match(/99204[12]/)[0])
    if(id===reqA.id){
      detailA++
      if(detailA===3){startSlow();await slowReleased}
    }else{
      detailB++
      if(detailB===1)return respond(route,{message:'模拟读取来源需求失败'},503)
    }
    return respond(route,id===reqA.id?reqA:reqB)
  })
  await page.route(/\/api\/test-cases\/available-requirements\/page(?:\?|$)/,route=>{
    const versionId=Number(new URL(route.request().url()).searchParams.get('versionId'))
    const source=versionId===reqA.versionId?reqA:reqB
    if(source.id===reqA.id)optionsA++;else optionsB++
    return respond(route,pageResult([{
      requirementId:source.id,versionId:source.versionId,projectCode:source.projectCode,
      projectName:source.projectName,versionNo:source.versionNo,
      requirementNo:source.requirementNo,title:source.title
    }],route))
  })
  await page.route(/\/api\/test-cases(?:\?|$)/,route=>{
    const request=route.request()
    if(request.method()==='POST'){
      created++
      const body=JSON.parse(request.postData()||'{}')
      assert.equal(body.caseNo,'TC-B42-CREATED')
      assert.equal(body.title,'关联来源需求的测试用例')
      assert.deepEqual(body.requirementIds,[reqA.id],
        'The source requirement must be preserved on creation')
      assert.equal(body.executionMode,'MANUAL')
      assert.equal(body.steps.length,1)
      assert.equal(body.steps[0].stepNo,1)
      records.push({id:992099,caseNo:body.caseNo,title:body.title,
        status:'ACTIVE',requirementCount:1,currentRevisionNo:1,executionMode:'MANUAL'})
      return respond(route,records[0])
    }
    const query=new URL(request.url()).searchParams
    const filtered=query.get('requirementId')===String(reqA.id)?records:[]
    return respond(route,pageResult(filtered,route))
  })

  const row=text=>page.locator('.el-table__body tr').filter({hasText:text}).first()
  const modal=()=>page.locator('.el-dialog:visible').filter({hasText:'新建测试用例'}).last()
  const loc=()=>new URLSearchParams(page.url().split('?')[1]||'')
  const doubleClick=button=>button.evaluate(el=>{el.click();el.click()})

  await page.goto(origin+'/#/requirements',{waitUntil:'domcontentloaded'})
  await row(reqA.requirementNo).waitFor()
  await row(reqA.requirementNo).getByRole('button',{name:'0 条'}).click()
  await page.waitForFunction(id=>location.hash.includes('requirementId='+id),reqA.id)
  await page.locator('.el-alert').filter({hasText:'关联的测试用例'}).waitFor()
  assert.equal(await row('TC-B42-CREATED').count(),0)
  await page.goto(origin+'/#/requirements',{waitUntil:'domcontentloaded'})
  await row(reqA.requirementNo).waitFor()
  await row(reqA.requirementNo).getByRole('button',{name:'新增用例'}).click()
  await page.waitForFunction(id=>location.hash.includes('requirementId='+id)
    &&location.hash.includes('create=1'),reqA.id)
  await modal().waitFor()
  await modal().getByText('来源需求已预选',{exact:false}).waitFor()
  assert.ok((await modal().innerText()).includes(reqA.requirementNo))
  const selected=modal().locator('.el-form-item').filter({hasText:'关联需求'}).last()
  assert.ok((await selected.innerText()).includes(reqA.requirementNo))
  const ver=modal().locator('.el-form-item').filter({hasText:'筛选版本'}).locator('.el-select')
  assert.match(await ver.locator('.el-select__wrapper').getAttribute('class') || '',/is-disabled/, 'The version selector wrapper must be disabled')
  assert.ok(optionsA>=1)
  assert.equal(created,0,'Navigating to create form must not write data')

  await modal().getByPlaceholder('例如 TC-LOGIN-001').fill('TC-B42-CREATED')
  await modal().locator('.el-form-item').filter({hasText:'用例名称'}).locator('input')
    .first().fill('关联来源需求的测试用例')
  await modal().getByPlaceholder('具体操作或需要 ChatGPT 执行的动作').fill('在本机执行只读核对')
  await modal().getByPlaceholder('本步骤完成后应观察到的结果').fill('返回真实结果')
  await modal().getByPlaceholder('整个用例执行成功的判定标准').fill('核对结果匹配')
  await doubleClick(modal().getByRole('button',{name:'创建用例'}))
  await modal().waitFor({state:'hidden'})
  assert.equal(created,1,'Double-click must create only one case')
  await page.waitForFunction(()=>!location.hash.includes('create=1'))
  await row('TC-B42-CREATED').waitFor()
  assert.equal(page.url().includes('requirementId='+reqA.id),true)

  // Reopening from the contextual list must still preload the correct source.
  await page.getByRole('button',{name:'为此需求新增用例'}).click()
  await modal().getByText('来源需求已预选',{exact:false}).waitFor()
  await modal().getByRole('button',{name:'取消',exact:true}).click()
  await modal().waitFor({state:'hidden'})
  assert.equal(created,1)

  // Requirement B temporarily fails; the form must stay open and block saves.
  await page.goto(origin+'/#/test-cases?requirementId='+reqB.id+'&create=1',
    {waitUntil:'domcontentloaded'})
  await modal().getByRole('button',{name:'重试读取关联需求'}).waitFor()
  assert.equal(await modal().getByRole('button',{name:'创建用例'}).isDisabled(),true)
  assert.equal(created,1)
  await modal().getByRole('button',{name:'重试读取关联需求'}).click()
  await modal().getByText(reqB.requirementNo,{exact:false}).first().waitFor()
  await modal().getByText('来源需求已预选',{exact:false}).waitFor()
  assert.ok(optionsB>=1)
  await modal().getByRole('button',{name:'取消',exact:true}).click()
  await modal().waitFor({state:'hidden'})

  // An invalid ID is never coerced to the source, even with create=1.
  await page.goto(origin+'/#/test-cases?requirementId=0'+reqA.id+'&create=1',
    {waitUntil:'domcontentloaded'})
  await page.waitForTimeout(400)
  assert.equal(await modal().count(),0)
  assert.equal(created,1)

  // A slow response for A cannot overwrite B's form after in-place route change.
  await page.goto(origin+'/#/test-cases?requirementId='+reqA.id+'&create=1',
    {waitUntil:'domcontentloaded'})
  await Promise.race([slowStarted,new Promise((_,reject)=>setTimeout(
    ()=>reject(new Error('Delayed source request not reached')),9000))])
  await page.evaluate(id=>{location.hash='#/test-cases?requirementId='+id+'&create=1'},
    reqB.id)
  await modal().getByText(reqB.requirementNo,{exact:false}).first().waitFor()
  releaseSlow()
  await page.waitForTimeout(200)
  assert.ok((await modal().innerText()).includes(reqB.requirementNo))
  assert.equal((await modal().innerText()).includes('来源需求已预选：'+reqA.requirementNo),false)
  assert.equal(created,1)
  assert.equal(writes,0)
  assert.deepEqual(errors,[])
  console.log('BROWSER_REQUIREMENT_CASE_CREATE_PASS zeroLinkedAccessible=true'
    +' autoCreate=true sourceSelected=true versionLocked=true'
    +' duplicateBlocked=true createPosts='+created
    +' failedSourceRetry=true invalidRouteRejected=true'
    +' staleSourceIgnored=true backendWrites='+writes)
  await context.close()
}finally{releaseSlow();await browser.close()}
