export function tokenFromHash(hash) {
  return new URLSearchParams(hash.slice(1)).get('token')
}

export function trackingToken(value) {
  const hashStart = value.indexOf('#')
  if (/^LEAD-/i.test(value)) return value.toUpperCase()
  return hashStart < 0 ? null : tokenFromHash(value.slice(hashStart))
}
