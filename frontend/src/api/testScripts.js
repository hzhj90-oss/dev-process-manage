import http from './http'

export const testScriptApi = {
  page: params => http.get('/test-scripts', { params }),
  get: id => http.get(`/test-scripts/${id}`),
  create: data => http.post('/test-scripts', data),
  update: (id, data) => http.put(`/test-scripts/${id}`, data),
  setEnabled: (id, enabled) => http.put(`/test-scripts/${id}/enabled`, { enabled }),
  revisions: id => http.get(`/test-scripts/${id}/revisions`),
  getRevision: (id, revisionId) => http.get(`/test-scripts/${id}/revisions/${revisionId}`)
}
