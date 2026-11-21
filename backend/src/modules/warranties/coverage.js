const indiaOffset = 330 * 60_000

export function warrantyEnd(startAt, months) {
  const local = new Date(startAt.getTime() + indiaOffset)
  const day = local.getUTCDate()
  local.setUTCDate(1)
  local.setUTCMonth(local.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0)).getUTCDate()
  local.setUTCDate(Math.min(day, lastDay))
  return new Date(local.getTime() - indiaOffset)
}

export function isCovered(warranty, asOf) {
  return Boolean(warranty && !['VOID', 'REPLACED'].includes(warranty.status) &&
    warranty.startAt <= asOf && asOf < warranty.endAt)
}
