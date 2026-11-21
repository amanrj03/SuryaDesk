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
  const result = await response.json()
  if (!response.ok || !result.success) {
    throw new Error(result.error?.message ?? 'The request could not be completed.')
  }
  return result
}
