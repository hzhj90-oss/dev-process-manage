import http from './http'

export const environmentApi = {
  list: params => http.get('/environments', { params }),
  get: id => http.get(`/environments/${id}`),
  create: data => http.post('/environments', data),
  update: (id, data) => http.put(`/environments/${id}`, data)
}
