import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Notice } from '../../components/ui/Notice.jsx'
import { api } from '../../lib/api.js'
import { displayReference } from '../../lib/format.js'
import WorkflowAction, { issueInvoiceAction } from './WorkflowAction.jsx'

export function InvoiceDocument({ order, invoice, token, capabilities, showInvoiceLink = true, allowIssue = true }) {
  const [issued, setIssued] = useState(null)
  const [issuing, setIssuing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const saved = invoice ?? order?.invoiceByOrder
  const document = issued && issued.id === saved?.id ? issued : saved
  const canIssue = allowIssue && !order && document?.status === 'DRAFT' && !document.orderId && capabilities.includes('invoices:manage')
  if (!document || !capabilities.includes('invoices:read')) return null

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
      {document.downloadable ? <>
        <button type="button" className="secondary" disabled={busy} onClick={() => openPdf(false)}>Download invoice PDF</button>
        <button type="button" className="secondary" disabled={busy} onClick={() => openPdf(true)}>Print invoice</button>
      </> : (order || document.orderId) && <span className="text-xs text-gray-600">
        PDF available after dispatch and full payment.
      </span>}
      {showInvoiceLink && <Link className="secondary" to={'/invoices/' + encodeURIComponent(document.id)}>View invoice</Link>}
      {canIssue && <button type="button" className="secondary" disabled={busy} onClick={() => setIssuing(true)}>Issue invoice</button>}
      {document?.status === 'DRAFT' && <span className="text-xs text-gray-600">Draft</span>}
      <Notice>{error}</Notice>
      {issuing && canIssue && <WorkflowAction action={issueInvoiceAction(document.id)} token={token}
        onClose={() => setIssuing(false)} onSaved={updated => { setIssued(updated); setIssuing(false) }} />}
    </div>
  )
}
