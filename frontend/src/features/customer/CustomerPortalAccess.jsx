import { useState } from 'react'
import { Notice } from '../../components/ui/Notice.jsx'
import { api } from '../../lib/api.js'

export function CustomerPortalAccess({ id, email, token }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function submit(event) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const approved = event.nativeEvent.submitter.value === 'grant'
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await api('/customer-portal/staff/customers/' + encodeURIComponent(id) + '/access', {
        token, method: 'PATCH', body: { email: fields.get('email'), approved },
      })
      setMessage(approved ? 'Access to existing records granted.' : 'Access to existing records revoked.')
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return <details className="rounded-xl border border-gray-200 p-4">
    <summary className="cursor-pointer font-semibold">Customer portal access</summary>
    <form className="form mt-3" onSubmit={submit}>
      <p className="text-sm text-gray-600">Confirm the account holder owns this customer record before granting access to its existing orders, invoices, and service history.</p>
      <label>Verified portal email<input name="email" type="email" defaultValue={email ?? ''} required /></label>
      <Notice>{error}</Notice>
      {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="secondary" value="revoke" disabled={busy}>Revoke access</button>
        <button className="primary" value="grant" disabled={busy}>Grant access</button>
      </div>
    </form>
  </details>
}
