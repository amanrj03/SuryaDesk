import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ProjectTimeline } from '../../components/ui/ProjectTimeline.jsx'
import { Brand } from '../../components/ui/Brand.jsx'
import { BackToHome } from '../../components/ui/BackToHome.jsx'
import { StatusBadge } from '../../components/ui/Badge.jsx'
import { ErrorState } from '../../components/ui/States.jsx'
import { api } from '../../lib/api.js'
import { displayReference, formatDate, formatDateTime } from '../../lib/format.js'
import { tokenFromHash, trackingToken } from './trackingLocation.js'

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
    const value = new FormData(event.currentTarget).get('tracking').trim()
    const nextToken = trackingToken(value)
    if (!nextToken) {
      setInputError('Enter your tracking ID or paste the full tracking link.')
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
      <header className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2">
        <Link to="/" aria-label="SuryaDesk home"><Brand /></Link>
        <BackToHome />
      </header>
      <div className="mx-auto my-8 grid max-w-3xl gap-5">
        <h1 className="text-3xl font-bold tracking-tight">Track your order</h1>
        {token && !order && !current.error && <p role="status">Loading order status…</p>}
        {current.error && <ErrorState message={current.error} onRetry={() => setRetry(value => value + 1)} />}
        <form className="form rounded-2xl border border-gray-200 bg-white p-5" onSubmit={submit}>
          <p className="text-sm text-gray-600">Use the tracking ID from your quote request or paste your private tracking link.</p>
          <label>
            Tracking ID or link
            <input className="rounded-lg border border-gray-300 px-3 py-2" name="tracking" autoComplete="off" spellCheck={false} maxLength={2500} required />
          </label>
          {inputError && <p role="alert" className="text-sm text-red-700">{inputError}</p>}
          <button className="primary w-fit">Check status</button>
        </form>
        {order && (
          <>
            <section className="grid gap-4 rounded-2xl border border-gray-200 bg-white p-5" aria-labelledby="order-summary">
              <div className="flex flex-wrap items-center gap-3">
                <h2 id="order-summary" className="break-all text-lg font-semibold">{displayReference(order.orderNumber ?? order.trackingId)}</h2>
                <StatusBadge status={order.status === 'NEW' && !order.orderNumber ? 'ENQUIRY_RECEIVED' : order.status} />
              </div>
              {order.installation && order.status !== 'CANCELLED' && (
                <dl className="text-sm">
                  <dt className="font-semibold">Installation</dt>
                  <dd><StatusBadge status={order.installation.status} />{order.installation.scheduledAt && ' · ' + formatDate(order.installation.scheduledAt)}</dd>
                </dl>
              )}
            </section>
            {order.timeline?.length > 0 && <ProjectTimeline timeline={order.timeline} cancelled={['CANCELLED', 'LOST'].includes(order.status)} />}
            {order.orderNumber && order.installation?.status === 'COMPLETED' && <section className="rounded-2xl border border-gray-200 bg-white p-5" aria-labelledby="tracking-warranties">
              <h2 id="tracking-warranties" className="text-lg font-semibold">Equipment warranties</h2>
              {order.warranties.length ? (
                <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                  {order.warranties.map(warranty => <li key={warranty.serialNumber} className="min-w-0 rounded-xl border border-gray-200 px-3 py-2">
                    <p className="text-sm font-semibold">{warranty.product}</p>
                    <p className="break-all text-xs text-gray-600">{warranty.serialNumber}</p>
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                      <StatusBadge status={warranty.status} />{formatDateTime(warranty.startAt)} to {formatDateTime(warranty.endAt)}
                    </p>
                  </li>)}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-gray-600">
                  No equipment warranties are linked to this order.
                </p>
              )}
              <Link className="secondary mt-4" to={'/warranty#' + new URLSearchParams({ order: displayReference(order.orderNumber), token })}>Warranty status</Link>
            </section>}
          </>
        )}
      </div>
    </main>
  )
}
