import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Brand } from '../../components/ui/Brand.jsx'
import { Notice } from '../../components/ui/Notice.jsx'
import { api } from '../../lib/api.js'

export default function Enquiry() {
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const form = new FormData(event.currentTarget)
    const body = Object.fromEntries([...form].filter(([, value]) => value !== ''))
    if (body.desiredKw) body.desiredKw = Number(body.desiredKw)
    body.subsidyInterest = form.has('subsidyInterest')
    try {
      setResult((await api('/public/enquiries', { method: 'POST', body })).data)
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="public-screen flex min-h-screen items-center justify-center bg-[#FAF9F6] p-3 text-[#2D2D2E] antialiased sm:p-6">
      <div className="w-full max-w-2xl rounded-[22px] border border-gray-200/80 bg-white p-6 shadow-xl sm:p-8">
        <Brand />
        <h1 className="mt-6 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          Request a solar quote
        </h1>
          <p className="mt-1 text-xs text-gray-500">
            Tell us about your rooftop and power requirements. Our engineers will prepare an exact proposal.
          </p>

          {result ? (
            <div className="mt-6 space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 text-emerald-950" role="status">
              <h2 className="text-base font-bold">Enquiry received</h2>
              <p className="text-sm">Save your tracking ID or this private link to follow your request through installation.</p>
              <p className="text-sm font-semibold">Tracking ID</p>
              <strong className="block break-all text-lg text-emerald-900">{result.leadNumber}</strong>
              <Link className="primary" to={'/track#' + new URLSearchParams({ token: result.leadNumber })}>Track your request</Link>
            </div>
          ) : (
            <form className="form mt-6 grid gap-4" onSubmit={submit}>
              <div className="form-grid grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-semibold text-gray-700">
                  Full name
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    maxLength={120}
                    placeholder="E.g. Ramesh Patel"
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-black/10 focus:outline-hidden"
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-gray-700">
                  Phone
                  <input
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    required
                    maxLength={20}
                    placeholder="+91 98765 43210"
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-black/10 focus:outline-hidden"
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-gray-700">
                  Email
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="name@example.com"
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-black/10 focus:outline-hidden"
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-gray-700">
                  System size (kW)
                  <input
                    name="desiredKw"
                    type="number"
                    min="1"
                    max="5"
                    step="0.1"
                    placeholder="3.0"
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-black/10 focus:outline-hidden"
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-gray-700">
                  System type
                  <select
                    name="systemType"
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-black/10 focus:outline-hidden"
                  >
                    <option value="">Help me decide</option>
                    <option value="ON_GRID">On-grid</option>
                    <option value="OFF_GRID">Off-grid</option>
                    <option value="PANEL_SET">Panel set</option>
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-semibold text-gray-700">
                  Monthly bill (INR)
                  <input
                    name="monthlyBill"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="3500"
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-black/10 focus:outline-hidden"
                  />
                </label>
              </div>

              <label className="grid gap-1 text-xs font-semibold text-gray-700">
                Installation address
                <textarea
                  name="address"
                  autoComplete="street-address"
                  required
                  maxLength={500}
                  rows={2}
                  placeholder="Plot number, building name, locality, city and pin code"
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-black/10 focus:outline-hidden resize-y"
                />
              </label>

              <label className="grid gap-1 text-xs font-semibold text-gray-700">
                Anything else
                <textarea
                  name="notes"
                  maxLength={2000}
                  rows={2}
                  placeholder="Rooftop type, shading concerns, preferred appointment times…"
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-black/10 focus:outline-hidden resize-y"
                />
              </label>

              <label className="check flex items-center gap-2 text-xs font-medium text-gray-700">
                <input
                  name="subsidyInterest"
                  type="checkbox"
                  className="size-4 rounded-xs accent-black"
                />
                I’m interested in government solar subsidy options
              </label>

              <Notice>{error}</Notice>

              <button
                type="submit"
                className="primary w-full sm:w-auto py-2.5 px-6 rounded-full text-xs font-semibold shadow-xs"
                disabled={busy}
              >
                {busy ? 'Submitting…' : 'Submit enquiry'}
              </button>
            </form>
          )}

          <div className="mt-6 border-t border-gray-200/60 pt-4 text-center">
            <Link to="/login" className="text-xs font-semibold text-gray-600 transition hover:text-black">
              ← Return to staff sign in
            </Link>
          </div>
        </div>
    </main>
  )
}
