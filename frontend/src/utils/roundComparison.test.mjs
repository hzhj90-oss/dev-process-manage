import test from 'node:test'
import assert from 'node:assert/strict'
import { compareCategories, readComparison, filteredComparisonRows }
  from './roundComparison.js'

const sample = () => ({
  cycleId: 20, versionId: 7, cycleNo: 2, cycleStatus: 'COMPLETED',
  previousCycleId: 19, previousCycleNo: 1,
  counts: { FIXED:1, REGRESSION:1, STILL_FAIL:1, STILL_PASS:0,
    FIRST_PASS:0, CHANGED:0, NEW_CASE:1, REMOVED_CASE:1 },
  rows: [
    {testCaseId:1,caseNo:'TC-1',title:'A',change:'FIXED',
      previousResult:'FAIL',currentResult:'PASS'},
    {testCaseId:2,caseNo:'TC-2',title:'B',change:'REGRESSION',
      previousResult:'PASS',currentResult:'FAIL'},
    {testCaseId:3,caseNo:'TC-3',title:'C',change:'STILL_FAIL',
      previousResult:'BLOCKED',currentResult:'FAIL'},
    {testCaseId:4,caseNo:'TC-4',title:'D',change:'NEW_CASE',
      previousResult:null,currentResult:'PASS'},
    {testCaseId:5,caseNo:'TC-5',title:'E',change:'REMOVED_CASE',
      previousResult:'FAIL',currentResult:null}
  ],
  total:5
})
test('keeps only previous and current cycle rows of same identity', () => {
  const result=readComparison(sample(),20,7)
  assert.equal(result.rows.length,5)
  assert.equal(compareCategories.REGRESSION,'新增回归失败')
  assert.equal(compareCategories.FIXED,'失败已转通过')
  assert.equal(compareCategories.NEW_CASE,'本轮新增用例')
})
test('offers actionable failure, recovery, scope and all filters', () => {
  const rows=sample().rows
  assert.deepEqual(filteredComparisonRows(rows,'ISSUES').map(x=>x.change),
    ['REGRESSION','STILL_FAIL'])
  assert.deepEqual(filteredComparisonRows(rows,'REGRESSION').map(x=>x.change),['REGRESSION'])
  assert.deepEqual(filteredComparisonRows(rows,'FIXED').map(x=>x.change),['FIXED'])
  assert.deepEqual(filteredComparisonRows(rows,'SCOPE').map(x=>x.change),
    ['NEW_CASE','REMOVED_CASE'])
  assert.equal(filteredComparisonRows(rows,'ALL').length,5)
  assert.deepEqual(filteredComparisonRows(null,'ALL'),[])
})
test('rejects mismatched cycle/version and counts that do not match rows', () => {
  const x=sample()
  assert.throws(()=>readComparison(x,21,7),/不一致/)
  assert.throws(()=>readComparison(x,20,8),/不一致/)
  assert.throws(()=>readComparison({...x,total:4},20,7),/不一致/)
  assert.throws(()=>readComparison({...x,counts:{...x.counts,FIXED:2}},20,7),/不一致/)
  assert.throws(()=>readComparison({...x,rows:[...x.rows,{caseNo:'x',title:'x',change:'BOGUS'}],total:6,
    counts:{...x.counts,NEW_CASE:2}},20,7),/不合法/)
})
test('no previous completed round must never pretend there are improvements', () => {
  const x={...sample(),previousCycleId:null,previousCycleNo:null,
    rows:[],total:0,counts:Object.fromEntries(Object.keys(compareCategories).map(k=>[k,0]))}
  assert.equal(readComparison(x,20,7).previousCycleId,null)
  assert.throws(()=>readComparison({...x,rows:sample().rows,total:5,counts:sample().counts},20,7),
    /无上轮/)
})
test('rejects same/future previous cycle and inconsistent classification', () => {
  const x=sample()
  assert.throws(()=>readComparison({...x,previousCycleNo:2},20,7),/不合法/)
  assert.throws(()=>readComparison({...x,previousCycleNo:3},20,7),/不合法/)
  assert.throws(()=>readComparison({...x,previousCycleId:0},20,7),/不合法/)
})

test('comparison notes warn about changed environment, code and missing identity', async () => {
  const { comparisonContextWarnings } = await import('./roundComparison.js')
  const changed = comparisonContextWarnings({
    previousCycleId:1,environmentChanged:true,previousEnvironmentName:'Local',
    environmentName:'test3',codeVersionChanged:true,previousCodeVersion:'dev-A',codeVersion:'dev-B'
  })
  assert.equal(changed.length,2)
  assert.match(changed[0].text,/Local.*test3/)
  assert.match(changed[1].text,/dev-A.*dev-B/)
  assert.equal(changed[0].type,'warning')
  const unknown = comparisonContextWarnings({previousCycleId:1})
  assert.equal(unknown.length,2)
  assert.match(unknown[0].text,/无法确认/)
  assert.deepEqual(comparisonContextWarnings({
    previousCycleId:1,environmentChanged:false,codeVersionChanged:false
  }),[])
  assert.deepEqual(comparisonContextWarnings({previousCycleId:null}),[])
})
