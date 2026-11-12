import http from './http'

export const runnerApi = {
  status: () => http.get('/runner/status')
}
