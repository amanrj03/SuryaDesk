export async function api(path, { token, method = 'GET', body, signal } = {}) {
  const base = import.meta.env.VITE_API_BASE ?? '/api/v1'
  const response = await fetch(base + path, {
    method, signal,
    headers: {
      ...(token && { Authorization: 'Bearer ' + token }),
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const result = await response.json()
  if (!response.ok || !result.success) {
    throw new Error(result.error?.message ?? 'The request could not be completed.')
  }
  return result
}
