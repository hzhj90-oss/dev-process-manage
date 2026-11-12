import test from 'node:test'
import assert from 'node:assert/strict'
import { validateEvidenceFile, currentEvidence, attachmentByDigest,
  sha256Evidence, MAX_EVIDENCE_BYTES } from './attachmentSafety.js'

test('evidence file rejects empty, oversized, disallowed suffix before POST', () => {
  assert.throws(() => validateEvidenceFile(null), /非空/)
  assert.throws(() => validateEvidenceFile({ name: 'trace.log', size: 0 }), /非空/)
  assert.throws(() => validateEvidenceFile({ name: 'script.exe', size: 23 }), /格式/)
  assert.throws(() => validateEvidenceFile({
    name: 'trace.log', size: MAX_EVIDENCE_BYTES + 1
  }), /20 MB/)
  assert.equal(validateEvidenceFile({name:'proof.PNG',size:100}).type, 'SCREENSHOT')
  assert.equal(validateEvidenceFile({name:'request.json',size:100}).type, 'REQUEST')
  assert.equal(validateEvidenceFile({name:'response.csv',size:100}).type, 'RESPONSE')
  assert.equal(validateEvidenceFile({name:'trace.log',size:100}).type, 'LOG')
})

test('attachment lookup cannot mix two tasks, parent children or attempts', () => {
  const data={task:{id:10},children:[
    {id:11,executions:[{id:110,attachments:[{id:1}]},{id:111,attachments:[{id:2}]}]},
    {id:12,executions:[{id:120,attachments:[{id:3}]}]}
  ]}
  assert.equal(currentEvidence(data,11,110).attachments[0].id,1)
  assert.equal(currentEvidence(data,11,111).attachments[0].id,2)
  assert.equal(currentEvidence(data,12,120).attachments[0].id,3)
  assert.equal(currentEvidence(data,11,120),null)
  assert.equal(currentEvidence(data,12,110),null)
  assert.equal(currentEvidence(data,13,110),null)
  assert.equal(currentEvidence({task:{id:13},executions:[{id:131}]},13,131).id,131)
})

test('after timeout only exactly one new metadata row with same digest confirms upload', () => {
  const digest='a'.repeat(64)
  const before=[{id:1}]
  const after=[
    {id:1,sha256:digest,fileSize:10,attachmentType:'LOG'},
    {id:2,sha256:digest,fileSize:10,attachmentType:'LOG'}
  ]
  assert.equal(attachmentByDigest(before,after,digest,10,'LOG').id,2)
  assert.equal(attachmentByDigest(before,after,digest,10,'OTHER'),null)
  assert.equal(attachmentByDigest(before,[after[0]],digest,10,'LOG'),null)
  assert.equal(attachmentByDigest(before,after.concat({id:3,sha256:digest,
    fileSize:10,attachmentType:'LOG'}),digest,10,'LOG'),null)
  assert.equal(attachmentByDigest(before,after,'invalid',10,'LOG'),null)
})

test('browser SHA-256 digest is stable and cannot use invalid file input', async () => {
  const bytes = new TextEncoder().encode('abc')
  const file={arrayBuffer:async()=>bytes.buffer}
  const digest=await sha256Evidence(file)
  assert.equal(digest,'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})
