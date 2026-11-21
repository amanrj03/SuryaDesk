import { useState } from 'react'
import { words } from '../../lib/format.js'
import { Notice } from '../../components/ui/Notice.jsx'
import { RecordDialog } from '../../components/ui/RecordDialog.jsx'
import { api } from '../../lib/api.js'

export default function LeadEditor({ lead, target, token, onClose, onSaved }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const contact = target === 'CONTACTED'
  const qualify = target === 'QUALIFIED'
  const canMarkLost = !target && ['NEW', 'CONTACTED', 'QUALIFIED'].includes(lead.status)
  const action = contact ? 'Mark contacted' : qualify ? 'Qualify enquiry' : 'Edit enquiry'

  async function save(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const value = field => form.get(field)?.trim()
    const status = target ?? value('status')
    const body = {}
    if (status) body.status = status
    if (value('contactNote')) body.contactNote = value('contactNote')
    if (value('notes')) body.notes = value('notes')
    if (value('monthlyBill')) body.monthlyBill = value('monthlyBill')
    if (value('roofArea')) body.roofArea = Number(value('roofArea'))
    if (value('gridSuitable')) body.gridSuitable = value('gridSuitable') === 'yes'
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
    <RecordDialog title={action + ' · ' + lead.customer.name} busy={busy} onClose={onClose}>
      <form className="form p-4" onSubmit={save}>
        {contact ? (
          <label>Follow-up note (optional)
            <textarea name="contactNote" maxLength={2000} rows={3} />
          </label>
        ) : (
          <>
            {qualify && <p className="text-sm text-gray-600">Enter the preliminary site and bill details. The surveyor will verify site suitability during the visit.</p>}
            <div className="form-grid">
              {canMarkLost && <label>Status
                <select name="status">
                  <option value="">{words(lead.status)}</option>
                  <option value="LOST">Lost</option>
                </select>
              </label>}
              <label>Shadow-free roof area estimate (m²)
                <input name="roofArea" type="number" min=".01" max="99999999" step=".01"
                  required={qualify} defaultValue={lead.roofArea ?? ''} />
              </label>
              <label>Monthly bill (INR)
                <input name="monthlyBill" type="number" min="0" max="9999999999.99" step=".01"
                  required={qualify} defaultValue={lead.monthlyBill ?? ''} />
              </label>
              <label>Grid suitable
                <select name="gridSuitable" required={qualify}
                  defaultValue={lead.gridSuitable == null ? '' : lead.gridSuitable ? 'yes' : 'no'}>
                  <option value="">Unknown</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
            </div>
            <label>Notes
              <textarea name="notes" maxLength={2000} rows={2} defaultValue={lead.notes ?? ''} />
            </label>
          </>
        )}
        <Notice>{error}</Notice>
        <div className="flex justify-end">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Saving…' : target ? action : 'Save enquiry'}
          </button>
        </div>
      </form>
    </RecordDialog>
  )
}
