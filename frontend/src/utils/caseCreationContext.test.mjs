import test from 'node:test'
import assert from 'node:assert/strict'
import { requestedCaseRequirement, verifiedSourceRequirement,
  assertSourceCoverage } from './caseCreationContext.js'

const req = { id:4, versionId:6, requirementNo:'REQ-4', title:'验证完整链路' }
const options = [{ requirementId:4, versionId:6 }, { requirementId:5, versionId:6 }]
test('creation action accepts only valid canonical requirement id and exact create flag', () => {
  assert.equal(requestedCaseRequirement({ requirementId:'4',create:'1' }),4)
  for (const bad of [
    {}, { requirementId:'04',create:'1' }, { requirementId:['4'],create:'1' },
    { requirementId:'4',create:['1'] }, { requirementId:'4',create:'true' },
    { requirementId:'4',create:'0' }, { requirementId:'-4',create:'1' }
  ]) assert.equal(requestedCaseRequirement(bad),null)
})
test('source details must match current id and provide immutable parent version', () => {
  assert.deepEqual(verifiedSourceRequirement(req,4),
    { id:4, versionId:6, label:'REQ-4 · 验证完整链路' })
  for (const wrong of [
    {...req,id:9}, {...req,versionId:0}, {...req,versionId:'06'},
    {...req,title:''}, {...req,requirementNo:''}, null
  ]) assert.throws(()=>verifiedSourceRequirement(wrong,4))
  assert.throws(()=>verifiedSourceRequirement(req,'04'))
})
test('successful save must retain the exact source requirement in fully loaded options', () => {
  const source=verifiedSourceRequirement(req,4)
  assert.doesNotThrow(()=>assertSourceCoverage(source,[4,5],options,6))
  assert.doesNotThrow(()=>assertSourceCoverage(null,[],[],null))
  assert.throws(()=>assertSourceCoverage(source,[5],options,6),/不能移除/)
  assert.throws(()=>assertSourceCoverage(source,[4],options.filter(x=>x.requirementId===5),6),
    /未出现在/)
  assert.throws(()=>assertSourceCoverage(source,[4],options,7),/未出现在/)
  assert.throws(()=>assertSourceCoverage(source,[4],[],6),/未出现在/)
  assert.throws(()=>assertSourceCoverage(source,[4],null,6),/未出现在/)
})
