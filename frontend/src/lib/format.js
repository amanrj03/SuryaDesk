const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
})

const numberFormatter = new Intl.NumberFormat('en-IN')

/** ₹1,23,456.78 */
export const formatCurrency = (value) => (value == null ? '—' : currencyFormatter.format(Number(value)))

/** Splits money into whole and decimal parts so the UI can de-emphasise paise. */
export const splitCurrency = (value) => {
  if (value == null) return { whole: '₹0', fraction: '' }
  const formatted = currencyFormatter.format(Number(value))
  const separator = formatted.lastIndexOf('.')

  return separator === -1
    ? { whole: formatted, fraction: '' }
    : { whole: formatted.slice(0, separator), fraction: formatted.slice(separator) }
}

/** Compact money for tight card layouts: ₹5.3L, ₹28.4K. */
export const formatCompactCurrency = (value) => {
  if (value == null) return '—'
  const num = Number(value)
  const abs = Math.abs(num)

  if (abs >= 10_000_000) return `₹${(num / 10_000_000).toFixed(1)}Cr`
  if (abs >= 100_000) return `₹${(num / 100_000).toFixed(1)}L`
  if (abs >= 1_000) return `₹${(num / 1_000).toFixed(1)}K`

  return `₹${Math.round(num)}`
}

export const formatNumber = (value) => (value == null ? '0' : numberFormatter.format(Number(value)))

export const formatPercent = (value, digits = 1) =>
  `${Number(value).toFixed(digits)}%`

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
})

const dateTimeFormatter = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Kolkata',
})

export const formatDate = (value) =>
  value ? dateFormatter.format(new Date(value)) : '—'

export const formatDateTime = (value) =>
  value ? dateTimeFormatter.format(new Date(value)) : '—'

/** Two letter monogram used by avatars throughout the app. */
export const initials = (name) => {
  if (!name) return 'SD'
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
}

export const words = (value) =>
  value ? value.toLowerCase().replaceAll('_', ' ').replace(/^./, (first) => first.toUpperCase()) : '—'

export const displayReference = (value) => value?.replace(/^DEMO-/, '')

export const displaySupplierName = (supplier) =>
  supplier.code.startsWith('DEMO-SUP-') ? supplier.name.replace(/ \(Demo\)$/, '') : supplier.name

export const displayContactEmail = (value) => value?.replace(
  /^((?:customer|supplier)\d+)@demo\.suryadesk\.test$/,
  '$1@suryadesk.test',
)

export const displayPackageDescription = (value) => value?.replace(
  /^Demonstration package\. (?=Equipment and sizing are illustrative\.$)/,
  '',
)
