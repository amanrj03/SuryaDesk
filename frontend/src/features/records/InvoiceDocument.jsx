import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Notice } from '../../components/ui/Notice.jsx'
import { api } from '../../lib/api.js'
import { displayReference } from '../../lib/format.js'

const allocated = ['READY_TO_DISPATCH', 'DISPATCHED', 'DELIVERED', 'INSTALLATION_IN_PROGRESS', 'COMPLETED']

export function InvoiceDocument({ order, invoice, token, capabilities, showInvoiceLink = true }) {
  const [prepared, setPrepared] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const document = invoice ?? order?.invoiceByOrder ?? prepared
  const canPrepare = order && allocated.includes(order.status) && capabilities.includes('invoices:manage')
  if (!capabilities.includes('invoices:read') || (!document && !canPrepare)) return null

  async function prepare() {
    setBusy(true)
    setError('')
    try {
      const { data } = await api('/invoices/for-order/' + encodeURIComponent(order.id), { token, method: 'POST' })
      setPrepared(data)
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  async function openPdf(print) {
    const preview = print ? window.open('', '_blank') : null
    if (print && !preview) {
      setError('The PDF preview was blocked. Allow pop-ups or download the PDF to print it.')
      return
    }
    if (preview) preview.opener = null
    setBusy(true)
    setError('')
    try {
      const file = await api('/invoices/' + encodeURIComponent(document.id) + '/pdf', { token, download: true })
      const url = URL.createObjectURL(file)
      if (preview) preview.location.replace(url)
      else {
        const link = window.document.createElement('a')
        link.href = url
        link.download = displayReference(document.invoiceNumber) + '.pdf'
        link.click()
      }
      setTimeout(() => URL.revokeObjectURL(url), 300_000)
    } catch (failure) {
      preview?.close()
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-invoice-actions className="flex flex-wrap items-center gap-2">
      {document ? (
        <>
          <button type="button" className="secondary" disabled={busy} onClick={() => openPdf(false)}>Download invoice PDF</button>
          <button type="button" className="secondary" disabled={busy} onClick={() => openPdf(true)}>Print invoice</button>
          {showInvoiceLink && <Link className="secondary" to={'/invoices/' + encodeURIComponent(document.id)}>View invoice</Link>}
        </>
      ) : (
        <button type="button" className="secondary" disabled={busy} onClick={prepare}>
          {busy ? 'Preparing…' : 'Prepare invoice PDF'}
        </button>
      )}
      {document?.status === 'DRAFT' && <span className="text-xs text-gray-600">Draft</span>}
      <Notice>{error}</Notice>
    </div>
  )
}
