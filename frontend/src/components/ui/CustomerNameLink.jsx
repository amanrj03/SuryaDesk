import { Link } from 'react-router-dom'

export const customerDetailsCapabilities = ['leads:write', 'tickets:create', 'reports:view', 'orders:create']

export function CustomerNameLink({ customer, capabilities }) {
  if (!customer?.name) return '—'
  if (!customer.id || !customerDetailsCapabilities.some(capability => capabilities.includes(capability))) return customer.name

  return <Link
    className="font-medium underline decoration-gray-300 underline-offset-2 hover:text-emerald-800 hover:decoration-current"
    to={'/customers/' + encodeURIComponent(customer.id)}
    state={{ fromRecordList: true, backLabel: 'Back' }}
  >{customer.name}</Link>
}
