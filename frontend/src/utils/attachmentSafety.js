// Browser-side checks are usability guards; the Java service validates again.
export const MAX_EVIDENCE_BYTES = 20 * 1024 * 1024
const EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf', 'txt', 'log', 'json', 'csv'])

export function validateEvidenceFile(file) {
  if (!file || typeof file.name !== 'string' || !Number.isSafeInteger(file.size)
      || file.size <= 0) throw new Error('请选择非空的证据文件')
  if (file.size > MAX_EVIDENCE_BYTES) throw new Error('单个证据文件不能超过 20 MB')
  const name = file.name.replaceAll('\\', '/').split('/').pop()
  const extension = name?.split('.').pop()?.toLowerCase()
  if (!EXTENSIONS.has(extension)) {
    throw new Error('证据格式仅支持 PNG/JPG/GIF/WEBP/PDF/TXT/LOG/JSON/CSV')
  }
  const type = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extension) ? 'SCREENSHOT'
    : ['txt', 'log'].includes(extension) ? 'LOG'
      : name.toLowerCase().startsWith('request') ? 'REQUEST'
        : name.toLowerCase().startsWith('response') ? 'RESPONSE' : 'OTHER'
  return { type, name }
}

export function currentEvidence(taskDetail, taskId, executionId) {
  const id = Number(taskId)
  const attemptId = Number(executionId)
  if (!Number.isSafeInteger(id) || id <= 0
      || !Number.isSafeInteger(attemptId) || attemptId <= 0
      || !taskDetail?.task) return null
  if (Number(taskDetail.task.id) === id) {
    return (taskDetail.executions || []).find(item => Number(item.id) === attemptId) || null
  }
  const child = (taskDetail.children || []).find(item => Number(item.id) === id)
  return child?.executions?.find(item => Number(item.id) === attemptId) || null
}

export function attachmentByDigest(before, after, digest, size, type) {
  if (!Array.isArray(before) || !Array.isArray(after) || !/^[a-f0-9]{64}$/.test(digest)) return null
  const existingIds = new Set(before.map(item => Number(item.id)))
  const matches = after.filter(item => Number.isSafeInteger(Number(item.id))
    && Number(item.id) > 0 && !existingIds.has(Number(item.id))
    && item.sha256 === digest && Number(item.fileSize) === size
    && item.attachmentType === type)
  return matches.length === 1 ? matches[0] : null
}

export async function sha256Evidence(file) {
  if (!globalThis.crypto?.subtle) throw new Error('当前浏览器无法安全核对附件摘要，已阻止上传')
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')
}
