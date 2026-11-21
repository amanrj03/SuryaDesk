import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Brand } from '../../components/ui/Brand.jsx'
import { Notice } from '../../components/ui/Notice.jsx'
import { customerApi } from '../customer/customerApi.js'
import { CodeField, CodeNotice, NewPasswordFields } from '../customer/CustomerAuthFields.jsx'
import { useResend } from '../customer/useResend.js'

export default function Enquiry({ profile, onSubmitted }) {
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(null)
  const [remaining, cooldown] = useResend()
  const Container = profile ? 'section' : 'main'

  async function resend() {
    setBusy(true)
    setError('')
    try {
      await customerApi('/enquiries/resend', { method: 'POST', body: pending })
      cooldown()
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const form = new FormData(event.currentTarget)
    const body = Object.fromEntries([...form].filter(([, value]) => value !== ''))
    try {
      if (pending) {
        setResult((await customerApi('/enquiries/verify', { method: 'POST', body: { ...pending, code: body.code } })).data)
      } else {
        if (body.desiredKw) body.desiredKw = Number(body.desiredKw)
        body.subsidyInterest = form.has('subsidyInterest')
        const response = await customerApi(profile ? '/enquiries' : '/enquiries/start', { method: 'POST', body })
        if (profile) {
          setResult(response.data)
          onSubmitted?.()
        }
        else {
          setPending({ email: body.email, requestId: response.data.requestId })
          cooldown()
        }
      }
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Container className={profile
      ? 'flex items-center justify-center text-gray-900'
      : 'public-screen flex min-h-screen items-center justify-center bg-[#FAF9F6] p-3 text-[#2D2D2E] antialiased sm:p-6'}>
      <div className="w-full max-w-2xl rounded-[22px] border border-gray-200/80 bg-white p-6 shadow-xl sm:p-8">
        {!profile && <Brand />}
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
              <div className="flex flex-wrap gap-2">
                <Link className="primary" to="/customer">Open customer portal</Link>
                <Link className="secondary" to={'/track#' + new URLSearchParams({ token: result.leadNumber })}>Track your request</Link>
              </div>
            </div>
          ) : pending ? (
            <form className="form mt-6" onSubmit={submit}>
              <h2 className="text-lg font-semibold">Verify your email address</h2>
              <p className="break-all text-sm text-gray-600">{pending.email}</p>
              <CodeNotice remaining={remaining} resend={() => !busy && resend()} />
              <CodeField />
              <Notice>{error}</Notice>
              <div className="flex flex-wrap gap-2">
                <button className="primary" disabled={busy}>Verify and submit request</button>
                <button type="button" className="secondary" onClick={() => { setPending(null); setError('') }} disabled={busy}>Start over</button>
              </div>
            </form>
          ) : (
            <form className="form mt-6 grid gap-4" onSubmit={submit}>
              <div className="form-grid grid gap-3 sm:grid-cols-2">
                {!profile && <>
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
                  Email address
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="name@example.com"
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-black/10 focus:outline-hidden"
                  />
                </label>
                <NewPasswordFields />
                </>}
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
                  defaultValue={profile?.address ?? ''}
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
                {busy ? 'Submitting…' : profile ? 'Submit enquiry' : 'Send verification code'}
              </button>
            </form>
          )}

          <div className="mt-6 border-t border-gray-200/60 pt-4 text-center">
            <Link to={profile ? '/customer' : '/customer/login'} className="text-sm font-semibold text-gray-600 transition hover:text-black">
              {profile ? 'Return to customer portal' : 'Already have an account? Sign in'}
            </Link>
          </div>
        </div>
    </Container>
  )
}
