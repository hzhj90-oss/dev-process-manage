import http from './http'

export const executionTaskApi = {
  page: params => http.get('/execution-tasks', { params }),
  get: id => http.get(`/execution-tasks/${id}`),
  chatGptQueue: (limit = 20) => http.get('/execution-tasks/claimable/chatgpt', { params: { limit } }),
  chatGptAudit: params => http.get('/execution-tasks/audit/chatgpt', { params }),
  createCycle: (cycleId, data) => http.post(`/test-cycles/${cycleId}/execution-tasks`, data, {
    headers: { 'Idempotency-Key': data.idempotencyKey }
  }),
  createCase: (cycleId, cycleCaseId, data) => http.post(
    `/test-cycles/${cycleId}/cycle-cases/${cycleCaseId}/execution-tasks`, data,
    { headers: { 'Idempotency-Key': data.idempotencyKey } }
  ),
  cancel: (id, data) => http.post(`/execution-tasks/${id}/cancel`, data),
  resume: id => http.post(`/execution-tasks/${id}/resume`),
  humanIntervention: (id, data) => http.post(`/execution-tasks/${id}/human-intervention`, data),
  start: (id, executionId, data) => http.post(
    `/execution-tasks/${id}/executions/${executionId}/start`, data
  ),
  event: (id, executionId, data) => http.post(
    `/execution-tasks/${id}/executions/${executionId}/events`, data
  ),
  complete: (id, executionId, data) => http.post(
    `/execution-tasks/${id}/executions/${executionId}/complete`, data
  ),
  uploadAttachment: (id, executionId, file, type = 'OTHER') => {
    const form = new FormData()
    form.append('file', file)
    return http.post(`/execution-tasks/${id}/executions/${executionId}/attachments`, form, {
      params: { type, createdBy: 'local-user' },
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000
    })
  },
  downloadAttachment: (id, executionId, attachmentId) => http.get(
    `/execution-tasks/${id}/executions/${executionId}/attachments/${attachmentId}`,
    { responseType: 'blob', timeout: 120000 }
  )
}
