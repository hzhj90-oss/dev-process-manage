import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCycleCoverage } from './cycleCoverage.js'

const req = (id, withDesign=true) => ({
  id:id*20,requirementId:id,requirementNo:'REQ-'+id,title:'需求 '+id,
  designSnapshotJson:withDesign?JSON.stringify({revisionNo:2,title:'设计第二版'}):null
})
const c=(id,state,...requirements)=>({
  id:100+id,testCaseId:300+id,caseNo:'TC-'+id,
  latestResult:state,requirements
})
const cycle=cases=>({id:48,versionId:6,cases})
test('aggregate same requirement across multiple cases without duplicate requirements',()=>{
  const data=buildCycleCoverage(cycle([
    c(1,'PASS',req(4),req(5)),
    c(2,'FAIL',req(4)),
    c(3,'BLOCKED',req(5)),
    c(4,'NOT_RUN',req(4)),
    c(5,'PASS')
  ]))
  assert.equal(data.requirementCount,2)
  assert.equal(data.linkedCases,4)
  assert.equal(data.genericCases,1)
  assert.equal(data.totalLinks,5)
  assert.equal(data.missingDesignLinks,0)
  assert.deepEqual(data.requirements.map(r=>r.requirementNo),['REQ-4','REQ-5'])
  assert.deepEqual(
    [data.requirements[0].caseCount,data.requirements[0].passCount,
      data.requirements[0].issueCount,data.requirements[0].pendingCount],[3,1,1,1])
  assert.deepEqual(
    [data.requirements[1].caseCount,data.requirements[1].passCount,
      data.requirements[1].issueCount,data.requirements[1].pendingCount],[2,1,1,0])
})
test('generic-only cycle clearly has no covered requirements',()=>{
  const data=buildCycleCoverage(cycle([c(1,'PASS'),c(2,'SKIPPED')]))
  assert.equal(data.requirementCount,0)
  assert.equal(data.linkedCases,0)
  assert.equal(data.genericCases,2)
  assert.deepEqual(data.requirements,[])
})
test('missing or partial design snapshots are counted per case and requirement',()=>{
  const data=buildCycleCoverage(cycle([
    c(1,'PASS',req(4,false)),
    c(2,'FAIL',req(4,true),req(5,false)),
    c(3,'SKIPPED',req(5,false))
  ]))
  assert.equal(data.missingDesignLinks,3)
  assert.deepEqual(data.requirements.map(x=>x.missingDesignCases),[1,2])
  assert.equal(data.requirements[0].issueCount,1)
  assert.equal(data.requirements[1].pendingCount,1)
})
test('rejects missing or duplicated case and requirement snapshots, never invent coverage',()=>{
  assert.throws(()=>buildCycleCoverage({id:48,versionId:6,cases:null}),/完整/)
  assert.throws(()=>buildCycleCoverage(cycle([c(1,'PASS'),c(1,'FAIL')])),/重复/)
  assert.throws(()=>buildCycleCoverage(cycle([c(1,'PASS',req(4),req(4))])),/重复/)
  assert.throws(()=>buildCycleCoverage(cycle([c(1,'PASS',{requirementNo:'REQ-1'})])),/缺失/)
  assert.throws(()=>buildCycleCoverage(cycle([c(1,'PASS',{requirementId:4,title:'missing number'})])),/缺失/)
})
test('bad design JSON is not misrepresented as a valid snapshot',()=>{
  const broken={...req(4),designSnapshotJson:'{corrupt'}
  const data=buildCycleCoverage(cycle([c(1,'PASS',broken)]))
  assert.equal(data.missingDesignLinks,1)
  assert.equal(data.requirements[0].missingDesignCases,1)
})
