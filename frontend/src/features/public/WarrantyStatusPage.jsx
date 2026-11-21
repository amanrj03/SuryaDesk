import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Brand } from '../../components/ui/Brand.jsx'
import { BackToHome } from '../../components/ui/BackToHome.jsx'
import { StatusBadge } from '../../components/ui/Badge.jsx'
import { api } from '../../lib/api.js'
import { displayReference, formatDateTime } from '../../lib/format.js'

const duration = months => months + (months === 1 ? ' month' : ' months')

function unrecordedCoverage(product) {
  if (!product.catalogMonths) return 'No warranty listed'
  return 'No individual warranty record'
}

export default function WarrantyStatusPage() {
  const { hash } = useLocation()
  const navigate = useNavigate()
  const orderNumber = new URLSearchParams(hash.slice(1)).get('order')
  const [result, setResult] = useState({})
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!orderNumber) return
    const controller = new AbortController()
    api('/public/warranties', { method: 'POST', body: { orderNumber }, signal: controller.signal })
      .then(({ data }) => {
        if (!controller.signal.aborted) setResult({ orderNumber, attempt, data })
      })
      .catch(error => {
        if (!controller.signal.aborted) setResult({ orderNumber, attempt, error: error.message })
      })
    return () => controller.abort()
  }, [orderNumber, attempt])

  function submit(event) {
    event.preventDefault()
    const value = new FormData(event.currentTarget).get('orderNumber').trim().toUpperCase()
    if (!value) return
    setAttempt(previous => previous + 1)
    navigate('/warranty#' + new URLSearchParams({ order: value }), { replace: true })
  }

  const current = result.orderNumber === orderNumber && result.attempt === attempt ? result : {}
  const order = current.data
  return (
    <main className="min-h-screen bg-[#FAF9F6] px-4 py-6 text-gray-900 sm:px-8">
      <div className="mx-auto grid max-w-3xl gap-5">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <Link to="/" aria-label="SuryaDesk home"><Brand /></Link>
          <BackToHome />
        </header>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Warranty status</h1>
        <form className="form rounded-2xl border border-gray-200 bg-white p-5" onSubmit={submit}>
          <p className="text-sm text-gray-600">Enter the order ID from your invoice or tracking page.</p>
          <label>Order ID
            <input key={orderNumber} name="orderNumber" defaultValue={orderNumber ?? ''} placeholder="ORD-…" maxLength={80} required autoComplete="off" spellCheck={false} />
          </label>
          <button className="primary w-fit">Check warranties</button>
        </form>
        {orderNumber && !order && !current.error && <p role="status">Loading warranties…</p>}
        {current.error && <p role="alert" className="text-sm text-red-700">{current.error}</p>}
        {order && <section className="rounded-2xl border border-gray-200 bg-white p-5" aria-labelledby="warranty-order">
          <h2 id="warranty-order" className="break-all text-lg font-semibold">{displayReference(order.orderNumber)}</h2>
          {!order.signedAt ? <p className="mt-3 text-sm text-gray-600">
            {order.status === 'CANCELLED' ? 'This order was cancelled.' : 'Warranty details will appear after installation is completed and signed off.'}
          </p> : !order.products.length && <p className="mt-3 text-sm text-gray-600">No products are listed for this order.</p>}
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {order.products.map((product, index) => (
              <li key={index} className="rounded-xl border border-gray-200 p-4">
                <h3 className="font-semibold">{product.name}</h3>
                <p className="text-sm text-gray-600">Quantity {product.quantity}</p>
                {product.coverage.length > 0 && <ul className="mt-2 space-y-2">
                  {product.coverage.map((coverage, unit) => <li key={unit} className="text-sm">
                    <StatusBadge status={coverage.status} /> <span>{duration(coverage.months)}</span>
                    <p className="text-gray-600">{formatDateTime(coverage.startAt)} to {formatDateTime(coverage.endAt)}</p>
                  </li>)}
                </ul>}
                {product.coverage.length < product.quantity && <p className="mt-2 text-sm text-gray-600">
                  {product.coverage.length > 0 && (product.quantity - product.coverage.length) + ' remaining · '}
                  {unrecordedCoverage(product)}
                  {product.catalogMonths > 0 && order.status !== 'CANCELLED' && ' · Catalog term ' + duration(product.catalogMonths)}
                </p>}
              </li>
            ))}
          </ul>
        </section>}
      </div>
    </main>
  )
}
