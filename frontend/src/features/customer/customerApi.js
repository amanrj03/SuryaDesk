import { api } from '../../lib/api.js'

export const customerApi = (path, options) => api('/customer-portal' + path, { ...options, credentials: 'include' })

export async function downloadCustomerFile(path, filename) {
  const file = await customerApi(path, { download: true })
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
