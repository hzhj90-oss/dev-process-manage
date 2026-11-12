// Batch 40: real data, real headless Chrome, strictly GET-only end-user journey.
// Traverses existing, tagged DPM-VERIFY-FLOW fixture; no mutation/cleanup.
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const base = 'http://127.0.0.1:18090'
const api = async path => {
  const res = await fetch(base + path, { signal: AbortSignal.timeout(20000) })
  assert.equal(res.status, 200, 'Read API ' + path)
  return res.json()
}
const projects = await api('/api/projects?pageNum=1&pageSize=100')
const project = projects.list.find(item => item.projectCode?.startsWith('DPM-VERIFY-FLOW-'))
assert.ok(project, 'An existing tagged verification fixture is required; never create one implicitly')
const versions = await api('/api/versions?projectId=' + project.id + '&pageNum=1&pageSize=100')
const version = versions.list.find(item => item.projectId === project.id)
assert.ok(version)
const requirements = await api('/api/requirements?versionId=' + version.id + '&pageNum=1&pageSize=100')
const req = requirements.list.find(item => item.requirementNo?.startsWith('REQ-FLOW-'))
assert.ok(req)
const cycles = await api('/api/test-cycles?versionId=' + version.id + '&pageNum=1&pageSize=100')
const cycle = cycles.list.find(item => item.status === 'COMPLETED')
assert.ok(cycle)
const snapshot = await api('/api/test-cycles/' + cycle.id)
assert.equal(snapshot.caseCount, 1)
assert.equal(snapshot.passCount, 1)
assert.equal(snapshot.cases[0].requirements[0].requirementId, req.id)
const flowCase = snapshot.cases[0]
const casePage = await api('/api/test-cases?requirementId=' + req.id + '&pageNum=1&pageSize=10')
assert.equal(casePage.total, 1)
assert.equal(casePage.list[0].caseNo, flowCase.caseNo)
const review = await api('/api/test-cycles/' + cycle.id + '/report/review')
assert.equal(review.counts.PASS, 1)
const taskId = review.rows[0].taskId
assert.ok(taskId)

const browser = await chromium.launch({
  executablePath: process.env.DPM_CHROME_PATH,
  headless: true, args: ['--disable-extensions','--no-first-run']
})
try {
  const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true })
  const page = await context.newPage()
  page.setDefaultTimeout(14000)
  const jsErrors = []
  const unexpectedWrites = []
  page.on('pageerror', error => jsErrors.push(error.message))
  // Fail closed, even if a test click accidentally triggers a business save.
  await page.route('**/api/**', route => {
    if (['GET','HEAD','OPTIONS'].includes(route.request().method())) return route.continue()
    unexpectedWrites.push(route.request().method() + ' ' + route.request().url())
    return route.abort('blockedbyclient')
  })
  const trace = []
  const step = name => { trace.push(name); console.log('REAL_WORKFLOW_STEP ' + name) }
  const row = text => page.locator('.el-table__body tr').filter({ hasText: text }).first()
  const dialog = title => page.locator('.el-dialog:visible').filter({ hasText: title }).last()
  const goto = async route => page.goto(base + '/#/' + route, {waitUntil:'domcontentloaded'})
  const waitRoute = async (path,key,id) => page.waitForFunction(
    ({path,key,id}) => {
      const [current,search] = location.hash.slice(1).split('?')
      return current===path && new URLSearchParams(search).get(key)===String(id)
    }, {path,key,id}, {timeout:15000}
  )

  await goto('projects')
  await row(project.projectCode).waitFor()
  assert.ok((await row(project.projectCode).innerText()).includes(project.projectName))
  step('project')
  await row(project.projectCode).getByRole('button',{name:'查看版本'}).click()
  await waitRoute('/versions','projectId',project.id)
  await row(version.versionNo).waitFor()
  step('version')

  await row(version.versionNo).getByRole('button',{name:'查看需求'}).click()
  await waitRoute('/requirements','versionId',version.id)
  await row(req.requirementNo).waitFor()
  assert.ok((await row(req.requirementNo).innerText()).includes(req.title))
  step('requirement')

  await row(req.requirementNo).getByRole('button',{name:'设计',exact:true}).click()
  const design = dialog('详细设计')
  await design.getByText('完整链路详细设计',{exact:false}).first().waitFor()
  await design.getByRole('button',{name:'关闭',exact:true}).click()
  await design.waitFor({state:'hidden'})
  step('design')

  // The real tagged requirement must preload the genuine requirement and
  // version in a new case form. No POST is allowed; cancel after inspection.
  await row(req.requirementNo).getByRole('button',{name:'新增用例'}).click()
  await waitRoute('/test-cases','requirementId',req.id)
  const createDialog = dialog('新建测试用例')
  await createDialog.getByText('来源需求已预选',{exact:false}).waitFor()
  assert.ok((await createDialog.innerText()).includes(req.requirementNo))
  await createDialog.getByRole('button',{name:'取消',exact:true}).click()
  await createDialog.waitFor({state:'hidden'})
  step('real-requirement-case-prefill')

  // An existing linked case can open the same-version placement wizard.
  // This tagged version has only a completed round, so the UI must lead to
  // a new round and preselect the source case without writing anything.
  await row(flowCase.caseNo).getByRole('button',{name:'加入轮次'}).click()
  await waitRoute('/test-cycles','caseId',flowCase.testCaseId)
  const placementDialog = dialog('将测试用例加入轮次')
  await placementDialog.waitFor()
  await placementDialog.getByText('当前没有符合版本约束的计划中轮次',{exact:false}).waitFor()
  await placementDialog.getByRole('button',{name:'新建轮次并预选用例'}).click()
  const draftCycleDialog = dialog('新建测试轮次')
  await draftCycleDialog.waitFor()
  await draftCycleDialog.getByText(version.versionNo,{exact:false}).first().waitFor()
  await draftCycleDialog.getByText(flowCase.caseNo,{exact:false}).first().waitFor()
  await draftCycleDialog.getByRole('button',{name:'取消',exact:true}).click()
  await draftCycleDialog.waitFor({state:'hidden'})
  step('linked-case-to-new-cycle-prefill')

  await goto('requirements?versionId=' + version.id)
  await row(req.requirementNo).waitFor()
  await row(req.requirementNo).getByRole('button',{name:/1 条/}).click()
  await waitRoute('/test-cases','requirementId',req.id)
  const contextBanner = page.locator('.el-alert').filter({hasText:'关联的测试用例'})
  await contextBanner.waitFor()
  await row(flowCase.caseNo).waitFor()
  assert.ok((await row(flowCase.caseNo).innerText()).includes(flowCase.caseNo))
  await page.waitForFunction(() =>
    document.querySelector('.muted-count')?.textContent?.includes('共 1 条')
  )
  step('requirement-to-case')

  // A user must be able to remove the requirement scope without losing their case list.
  await contextBanner.getByRole('button',{name:'返回全部用例'}).click()
  await page.waitForFunction(() => !location.hash.includes('requirementId='))
  const unfiltered = await api('/api/test-cases?pageNum=1&pageSize=10')
  await page.waitForFunction(total =>
    document.querySelector('.muted-count')?.textContent?.includes('共 ' + total + ' 条'),
    unfiltered.total)
  assert.ok(unfiltered.total >= casePage.total)
  step('clear-case-context')

  // A malformed ID is not coerced to the requirement ID and cannot filter.
  await goto('test-cases?requirementId=0' + req.id)
  await page.waitForFunction(total =>
    document.querySelector('.muted-count')?.textContent?.includes('共 ' + total + ' 条'),
    unfiltered.total)
  assert.equal(await page.locator('.el-alert').filter({hasText:'关联的测试用例'}).count(),0)
  step('invalid-link-rejected')

  await goto('versions?projectId=' + project.id)
  await row(version.versionNo).waitFor()
  await row(version.versionNo).getByRole('button',{name:'测试轮次'}).click()
  await waitRoute('/test-cycles','versionId',version.id)
  await row(cycle.cycleName).waitFor()
  await row(cycle.cycleName).getByRole('button',{name:'详情'}).click()
  const cycleDialog = dialog('测试轮次详情')
  await cycleDialog.getByText(flowCase.caseNo,{exact:false}).first().waitFor()
  const frozenCoverage = cycleDialog.locator('.cycle-coverage-panel')
  await frozenCoverage.getByText('本轮需求覆盖汇总（冻结快照）').waitFor()
  await frozenCoverage.getByText(req.requirementNo,{exact:false}).first().waitFor()
  assert.equal(await frozenCoverage.locator('.el-table__body tr').count(),1)
  step('frozen-requirement-coverage')
  await cycleDialog.locator('.el-table__expand-icon').first().click()
  await cycleDialog.getByText(req.requirementNo,{exact:false}).first().waitFor()
  await cycleDialog.getByText('完整链路详细设计',{exact:false}).first().waitFor()
  await cycleDialog.getByRole('button',{name:'关闭',exact:true}).click()
  await cycleDialog.waitFor({state:'hidden'})
  step('cycle-and-immutable-snapshots')

  await goto('test-reports')
  const keyword = page.getByPlaceholder('搜索轮次名称、代码版本')
  await keyword.fill(cycle.cycleName)
  await page.getByRole('button',{name:'查询',exact:true}).click()
  await row(cycle.cycleName).waitFor()
  const reportRow = row(cycle.cycleName)
  assert.match(await reportRow.innerText(), /通过 1/)
  await reportRow.getByRole('button',{name:'结果复核'}).click()
  const reviewDialog = dialog('测试结果复核')
  await reviewDialog.getByText('全部用例',{exact:true}).click()
  await reviewDialog.getByText(flowCase.caseNo,{exact:false}).first().waitFor()
  await reviewDialog.getByRole('button',{name:'查看执行'}).click()
  await waitRoute('/execution-tasks','taskId',taskId)
  const taskDialog = dialog('执行任务详情')
  await taskDialog.getByText('Attempt 1',{exact:false}).first().waitFor()
  await taskDialog.getByText('通过',{exact:false}).first().waitFor()
  step('report-review-to-execution')

  // Direct UI report download must remain a UTF-8 report and never call a write endpoint.
  await goto('test-reports')
  await keyword.fill(cycle.cycleName)
  await page.getByRole('button',{name:'查询',exact:true}).click()
  await row(cycle.cycleName).waitFor()
  const download = page.waitForEvent('download')
  await row(cycle.cycleName).getByRole('button',{name:'下载 CSV'}).click()
  const downloaded = await download
  assert.ok(downloaded.suggestedFilename().endsWith('.csv'))
  step('csv-download')

  // Real two-round comparison: same environment but changed deployed code.
  // Never infer regression cause merely from changed execution results.
  const comparisonSource = await api('/api/test-cycles/46')
  const comparable = await api('/api/test-cycles/46/report/compare')
  assert.equal(comparable.previousCycleId,45)
  assert.equal(comparable.environmentChanged,false)
  assert.equal(comparable.codeVersionChanged,true)
  await goto('test-reports')
  await keyword.fill(comparisonSource.cycleName)
  await page.getByRole('button',{name:'查询',exact:true}).click()
  await row(comparisonSource.cycleName).waitFor()
  await row(comparisonSource.cycleName).getByRole('button',{name:'轮次对比'}).click()
  const compareDialog = dialog('测试轮次结果对比')
  await compareDialog.getByText('两轮代码版本或 Git Commit 不同',{exact:false}).waitFor()
  await compareDialog.getByText('上一轮：',{exact:false}).waitFor()
  await compareDialog.getByText('本轮：',{exact:false}).waitFor()
  assert.ok((await compareDialog.innerText()).includes(comparable.previousCodeVersion))
  assert.ok((await compareDialog.innerText()).includes(comparable.codeVersion))
  await compareDialog.getByRole('button',{name:'关闭',exact:true}).click()
  await compareDialog.waitFor({state:'hidden'})
  step('real-multi-round-code-difference')

  assert.deepEqual(jsErrors,[])
  assert.deepEqual(unexpectedWrites,[])
  console.log('BROWSER_REAL_WORKFLOW_PASS project=' + project.id
    + ' version=' + version.id + ' requirement=' + req.id + ' cycle=' + cycle.id
    + ' case=' + flowCase.id + ' task=' + taskId
    + ' checkpoints=' + trace.length + ' writes=0')
  await context.close()
} finally {
  await browser.close()
}
