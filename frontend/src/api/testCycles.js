import http from './http'

export const testCycleApi = {
  page: params => http.get('/test-cycles', { params }),
  get: id => http.get(`/test-cycles/${id}`),
  diagnostics: (limit = 100) => http.get('/test-cycles/diagnostics', { params: { limit } }),
  review: id => http.get(`/test-cycles/${id}/report/review`),
  compare: id => http.get(`/test-cycles/${id}/report/compare`),
  create: data => http.post('/test-cycles', data),
  update: (id, data) => http.put(`/test-cycles/${id}`, data),
  addCases: (id, caseIds) => http.post(`/test-cycles/${id}/cases`, { caseIds }),
  removeCase: (id, cycleCaseId) => http.delete(`/test-cycles/${id}/cases/${cycleCaseId}`),
  start: id => http.post(`/test-cycles/${id}/start`),
  abort: id => http.post(`/test-cycles/${id}/abort`)
}
