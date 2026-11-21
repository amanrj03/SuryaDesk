import { useState } from 'react'
import { words } from '../../lib/format.js'
import { Notice } from '../../components/ui/Notice.jsx'
import { api } from '../../lib/api.js'

export default function LeadEditor({ lead, token, onClose, onSaved }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const next = {
    NEW: ['CONTACTED', 'LOST'],
    CONTACTED: ['QUALIFIED', 'LOST'],
    QUALIFIED: ['LOST'],
  }
  const allowed = next[lead.status] ?? []

  async function save(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const body = {}
    for (const field of ['status', 'monthlyBill', 'notes']) {
      const value = form.get(field).trim()
      if (value) body[field] = value
    }
    if (form.get('roofArea')) body.roofArea = Number(form.get('roofArea'))
    if (form.get('gridSuitable')) body.gridSuitable = form.get('gridSuitable') === 'yes'
    if (!Object.keys(body).length) {
      setError('Enter an update before saving.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await api('/leads/' + lead.id, { method: 'PATCH', token, body })
      onSaved()
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="lead-editor p-4 mb-4" aria-labelledby="lead-editor-title">
      <div className="toolbar flex items-center justify-between border-b border-gray-100 pb-3">
        <h2 id="lead-editor-title" className="text-xs font-bold text-gray-900">
          Edit Enquiry · {lead.customer.name}
        </h2>
        <button
          type="button"
          className="secondary ml-auto"
          disabled={busy}
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <form className="form mt-3 grid gap-3" onSubmit={save}>
        <div className="form-grid grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-gray-700">
            Status
            <select
              name="status"
              className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs focus:outline-hidden focus:ring-2 focus:ring-black/10"
            >
              <option value="">{words(lead.status)}</option>
              {allowed.map((status) => (
                <option key={status} value={status}>
                  {words(status)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-gray-700">
            Shadow-free roof area (m²)
            <input
              name="roofArea"
              type="number"
              min="0.01"
              step="0.01"
              defaultValue={lead.roofArea ?? ''}
              className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs focus:outline-hidden focus:ring-2 focus:ring-black/10"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-gray-700">
            Monthly bill (INR)
            <input
              name="monthlyBill"
              type="number"
              min="0"
              step="0.01"
              defaultValue={lead.monthlyBill ?? ''}
              className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs focus:outline-hidden focus:ring-2 focus:ring-black/10"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-gray-700">
            Grid suitable
            <select
              name="gridSuitable"
              defaultValue={lead.gridSuitable == null ? '' : lead.gridSuitable ? 'yes' : 'no'}
              className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs focus:outline-hidden focus:ring-2 focus:ring-black/10"
            >
              <option value="">Unknown</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
        </div>
        <label className="grid gap-1 text-xs font-semibold text-gray-700">
          Notes
          <textarea
            name="notes"
            maxLength={2000}
            rows={2}
            defaultValue={lead.notes ?? ''}
            className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs focus:outline-hidden focus:ring-2 focus:ring-black/10 resize-y"
          />
        </label>
        <Notice>{error}</Notice>
        <div className="flex justify-end pt-1">
          <button
            type="submit"
            className="primary py-2 px-5 text-xs font-semibold"
            disabled={busy}
          >
            {busy ? 'Saving…' : 'Save enquiry'}
          </button>
        </div>
      </form>
    </section>
  )
}
