import http from './http'

export const requirementApi = {
  page: params => http.get('/requirements', { params }),
  get: id => http.get(`/requirements/${id}`),
  create: data => http.post('/requirements', data),
  update: (id, data) => http.put(`/requirements/${id}`, data),
  designs: id => http.get(`/requirements/${id}/designs`),
  getDesign: (id, designId) => http.get(`/requirements/${id}/designs/${designId}`),
  createDesign: (id, data) => http.post(`/requirements/${id}/designs`, data)
}