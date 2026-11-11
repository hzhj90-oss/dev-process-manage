import http from './http'

export const projectApi = {
  page: params => http.get('/projects', { params }),
  get: id => http.get(`/projects/${id}`),
  create: data => http.post('/projects', data),
  update: (id, data) => http.put(`/projects/${id}`, data)
}