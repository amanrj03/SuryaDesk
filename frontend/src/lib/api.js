export async function api(path, { token, download = false, method = 'GET', body, signal } = {}) {
  const base = import.meta.env.VITE_API_BASE ?? '/api/v1'
  const multipart = body instanceof FormData
  const response = await fetch(base + path, {
    method, signal,
    headers: {
      ...(token && { Authorization: 'Bearer ' + token }),
      ...(body !== undefined && !multipart && { 'Content-Type': 'application/json' }),
    },
    body: body === undefined || multipart ? body : JSON.stringify(body),
  })
  if (download && response.ok) return response.blob()
  if (response.status === 401 && token) window.dispatchEvent(new Event('suryadesk:session-expired'))
  const result = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null
  if (!response.ok || !result?.success) {
    throw new Error(result?.error?.message ?? 'The service is unavailable or returned an unexpected response. Try again.')
  }
  return result
}
