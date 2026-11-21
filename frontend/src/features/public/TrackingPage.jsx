import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CheckIcon } from '@heroicons/react/24/outline'
import { Brand } from '../../components/ui/Brand.jsx'
import { StatusBadge } from '../../components/ui/Badge.jsx'
import { ErrorState } from '../../components/ui/States.jsx'
import { api } from '../../lib/api.js'
import { displayReference, formatDate, formatDateTime, words } from '../../lib/format.js'

function tokenFromHash(hash) {
  return new URLSearchParams(hash.slice(1)).get('token')
}

function OrderTimeline({ timeline, cancelled }) {
  const latest = timeline.findLastIndex(event => event.at)
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5" aria-labelledby="order-timeline">
      <h2 id="order-timeline" className="text-lg font-semibold">Order timeline</h2>
      <ol className="mt-5">
        {timeline.map(({ stage, at }, index) => {
          const recorded = Boolean(at)
          const current = index === latest && !cancelled
          return (
            <li key={stage} aria-current={current ? 'step' : undefined} className="relative flex gap-3 pb-5 last:pb-0">
              {index < timeline.length - 1 && <span aria-hidden="true" className="absolute top-6 bottom-0 left-3 w-px bg-gray-200" />}
              <span aria-hidden="true" className={`relative grid size-6 shrink-0 place-items-center rounded-full border
                ${recorded ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-gray-300 bg-white'}`}>
                {recorded && <CheckIcon className="size-4" />}
              </span>
              <div>
                <p className="text-sm font-semibold">{words(stage)}</p>
                <p className="mt-0.5 text-xs text-gray-600">
                  {recorded ? <time dateTime={at}>{formatDateTime(at)}</time>
                    : index < latest ? 'Date unavailable' : cancelled ? 'Not reached' : 'Pending'}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

export default function TrackingPage() {
  const { hash } = useLocation()
  const navigate = useNavigate()
  const token = tokenFromHash(hash)
  const [result, setResult] = useState({})
  const [inputError, setInputError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!token) return
    const controller = new AbortController()
    api('/public/tracking', { method: 'POST', body: { token }, signal: controller.signal })
      .then(({ data }) => {
        if (!controller.signal.aborted) setResult({ token, retry, data })
      })
      .catch(error => {
        if (!controller.signal.aborted) setResult({ token, retry, error: error.message })
      })
    return () => controller.abort()
  }, [token, retry])

  function submit(event) {
    event.preventDefault()
    const link = new FormData(event.currentTarget).get('link').trim()
    const nextToken = tokenFromHash(link.includes('#') ? link.slice(link.indexOf('#')) : '')
    if (!nextToken) {
      setInputError('Paste the full tracking link your team shared.')
      return
    }
    setInputError('')
    setRetry(value => value + 1)
    navigate('/track#' + new URLSearchParams({ token: nextToken }), { replace: true })
  }

  const current = result.token === token && result.retry === retry ? result : {}
  const order = current.data
  return (
    <main className="min-h-screen bg-[#FAF9F6] px-4 py-6 text-gray-900 sm:px-8">
      <header className="mx-auto max-w-3xl">
        <Link to="/" aria-label="SuryaDesk home"><Brand /></Link>
      </header>
      <div className="mx-auto my-8 grid max-w-3xl gap-5">
        <h1 className="text-3xl font-bold tracking-tight">Track your order</h1>
        {token && !order && !current.error && <p role="status">Loading order status…</p>}
        {current.error && <ErrorState message={current.error} onRetry={() => setRetry(value => value + 1)} />}
        {(!token || current.error) && (
          <form className="form rounded-2xl border border-gray-200 bg-white p-5" onSubmit={submit}>
            <p className="text-sm text-gray-600">Paste the private link your SuryaDesk team shared. If you don’t have a link, ask the team handling your order.</p>
            <label>
              Tracking link
              <input className="rounded-lg border border-gray-300 px-3 py-2" name="link" autoComplete="off" maxLength={2500} required />
            </label>
            {inputError && <p role="alert" className="text-sm text-red-700">{inputError}</p>}
            <button className="primary w-fit">Check status</button>
          </form>
        )}
        {order && (
          <>
            <section className="grid gap-4 rounded-2xl border border-gray-200 bg-white p-5" aria-labelledby="order-summary">
              <div className="flex flex-wrap items-center gap-3">
                <h2 id="order-summary" className="break-all text-lg font-semibold">{displayReference(order.orderNumber)}</h2>
                <StatusBadge status={order.status} />
              </div>
              {order.installation && order.status !== 'CANCELLED' && (
                <dl className="text-sm">
                  <dt className="font-semibold">Installation</dt>
                  <dd><StatusBadge status={order.installation.status} />{order.installation.scheduledAt && ' · ' + formatDate(order.installation.scheduledAt)}</dd>
                </dl>
              )}
            </section>
            {order.timeline?.length > 0 && <OrderTimeline timeline={order.timeline} cancelled={order.status === 'CANCELLED'} />}
            <section className="rounded-2xl border border-gray-200 bg-white p-5" aria-labelledby="tracking-warranties">
              <h2 id="tracking-warranties" className="text-lg font-semibold">Equipment warranties</h2>
              {order.warranties.length ? (
                <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                  {order.warranties.map(warranty => <li key={warranty.serialNumber} className="min-w-0 rounded-xl border border-gray-200 px-3 py-2">
                    <p className="text-sm font-semibold">{warranty.product}</p>
                    <p className="break-all text-xs text-gray-600">{warranty.serialNumber}</p>
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                      <StatusBadge status={warranty.status} />{formatDate(warranty.startAt)} to {formatDate(warranty.endAt)}
                    </p>
                  </li>)}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-gray-600">
                  {order.status === 'CANCELLED' || order.dispatch?.deliveredAt
                    ? 'No equipment warranties are linked to this order.'
                    : 'Warranty details appear after delivery is confirmed for eligible equipment.'}
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  )
}
