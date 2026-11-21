import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api.js'
import { displayReference, formatDateTime, words } from '../../lib/format.js'

const labels = {
  leads: 'Enquiry', surveys: 'Survey', quotes: 'Quotation', orders: 'Order',
  dispatches: 'Dispatch', installations: 'Installation', invoices: 'Invoice',
}

export const hasRelatedRecords = section => Object.hasOwn(labels, section)

export function RelatedRecords({ section, id, token }) {
  const [links, setLinks] = useState([])
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    api('/workflow/' + section + '/' + encodeURIComponent(id) + '/related', { token, signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setLinks(data) })
      .catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => controller.abort()
  }, [section, id, token, retry])

  if (failed) return <button type="button" className="secondary justify-self-start" onClick={() => {
    setFailed(false)
    setRetry(value => value + 1)
  }}>Retry loading related records</button>
  if (!links.length) return null

  return <nav aria-label="Related records" className="grid gap-2">
    <h2 className="text-sm font-semibold text-gray-700">Related records</h2>
    <ul className="flex flex-wrap gap-2">
      {links.map(row => <li key={row.section + '/' + row.id} className="min-w-0 max-w-full">
        <Link className="secondary inline-flex max-w-full flex-wrap gap-x-1.5 gap-y-0.5 text-left"
          to={'/' + row.section + '/' + encodeURIComponent(row.id)}>
          <span className="font-semibold">{labels[row.section]}</span>
          {row.reference && <span className="min-w-0 break-all whitespace-normal">{displayReference(row.reference)}</span>}
          {row.date && <span>{formatDateTime(row.date)}</span>}
          <span className="text-xs text-gray-600">{words(row.status)}</span>
        </Link>
      </li>)}
    </ul>
  </nav>
}
