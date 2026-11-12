import http from './http'

export const testCaseApi = {
  page: params => http.get('/test-cases', { params }),
  get: id => http.get(`/test-cases/${id}`),
  create: data => http.post('/test-cases', data),
  update: (id, data) => http.put(`/test-cases/${id}`, data),
  revisions: id => http.get(`/test-cases/${id}/revisions`),
  getRevision: (id, revisionId) => http.get(`/test-cases/${id}/revisions/${revisionId}`),
  availableRequirements: params => http.get('/test-cases/available-requirements', { params }),
  availableRequirementsPage: params => http.get('/test-cases/available-requirements/page', { params }),
  scripts: () => http.get('/test-cases/scripts')
}