import test from 'node:test'
import assert from 'node:assert/strict'
import { readCasePlacement, eligiblePlannedCycles, validateCasePlacement,
  validatePlacementResponse } from './caseCyclePlacement.js'

const sourceCase={id:68,caseNo:'TC-68',title:'登录流程',status:'ACTIVE',
  currentRevisionId:176,requirements:[
    {requirementId:4,versionId:6},{requirementId:5,versionId:6},
    {requirementId:9,versionId:7}
  ]}
const cycles=[
  {id:101,versionId:6,status:'PLANNED',cycleName:'本地验证'},
  {id:102,versionId:7,status:'PLANNED',cycleName:'测试环境'},
  {id:103,versionId:8,status:'PLANNED',cycleName:'另一个项目'},
  {id:104,versionId:6,status:'RUNNING',cycleName:'已开始'},
  {id:105,versionId:6,status:'COMPLETED',cycleName:'已完成'}
]
test('linked case only displays planned rounds with the same version ID',()=>{
  const source=readCasePlacement(sourceCase,68)
  assert.deepEqual(source.versionIds,[6,7])
  assert.equal(source.generic,false)
  assert.equal(source.revisionId,176)
  assert.deepEqual(eligiblePlannedCycles(source,cycles).map(c=>c.id),[101,102])
})
test('generic case is explicitly marked and may choose any planned version',()=>{
  const generic=readCasePlacement({...sourceCase,requirements:[]},68)
  assert.equal(generic.generic,true)
  assert.deepEqual(eligiblePlannedCycles(generic,cycles).map(c=>c.id),[101,102,103])
})
test('rejects missing IDs, inactive case, missing revision or malformed requirement ownership',()=>{
  const wrong=[
    {...sourceCase,id:69}, {...sourceCase,status:'INACTIVE'},
    {...sourceCase,currentRevisionId:null},{...sourceCase,requirements:null},
    {...sourceCase,requirements:[{requirementId:4,versionId:null}]},
    {...sourceCase,requirements:[{requirementId:'04',versionId:6}]}
  ]
  for(const item of wrong) assert.throws(()=>readCasePlacement(item,68))
  assert.throws(()=>readCasePlacement(sourceCase,'068'))
})
test('checks latest server round state, matching version and duplicate case before POST',()=>{
  const source=readCasePlacement(sourceCase,68)
  const summary=cycles[0]
  const detail={id:101,versionId:6,status:'PLANNED',cases:[]}
  assert.equal(validateCasePlacement(source,summary,detail),101)
  for(const invalid of [
    {...detail,id:102}, {...detail,status:'RUNNING'},
    {...detail,cases:[{testCaseId:68}]},
    {...detail,versionId:8}, {...detail,cases:null}
  ])assert.throws(()=>validateCasePlacement(source,summary,invalid))
  assert.throws(()=>validateCasePlacement(source,cycles[2],
    {id:103,versionId:8,status:'PLANNED',cases:[]}))
})
test('verifies response snapshot actually contains target case and correct cycle ID',()=>{
  const source=readCasePlacement(sourceCase,68)
  assert.equal(validatePlacementResponse(source,101,
    {id:101,cases:[{testCaseId:68}]}),true)
  assert.throws(()=>validatePlacementResponse(source,101,
    {id:999,cases:[{testCaseId:68}]}))
  assert.throws(()=>validatePlacementResponse(source,101,
    {id:101,cases:[{testCaseId:70}]}))
})
