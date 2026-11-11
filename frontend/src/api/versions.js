import http from './http'

export const versionApi = {
  page: params => http.get('/versions', { params }),
  get: id => http.get(`/versions/${id}`),
  create: data => http.post('/versions', data),
  update: (id, data) => http.put(`/versions/${id}`, data)
}