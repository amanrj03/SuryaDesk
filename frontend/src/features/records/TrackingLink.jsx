import { useState } from 'react'
import { RecordDialog } from '../../components/ui/RecordDialog.jsx'
import { Notice } from '../../components/ui/Notice.jsx'
import { api } from '../../lib/api.js'

export function TrackingLink({ id, token }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  async function issue() {
    setOpen(true)
    setBusy(true)
    setLink('')
    setCopied(false)
    setError('')
    try {
      const { data } = await api('/orders/' + encodeURIComponent(id) + '/tracking-link', { token, method: 'POST' })
      setLink(window.location.origin + '/track#' + new URLSearchParams({ token: data.token }))
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  async function copy(event) {
    const input = event.currentTarget.form.elements.trackingLink
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      input.focus()
      input.select()
    }
  }

  return (
    <>
      <button type="button" className="secondary justify-self-start" onClick={issue}>Share tracking link</button>
      {open && (
        <RecordDialog title="Share tracking link" busy={busy} onClose={() => setOpen(false)}>
          <form className="form p-4" onSubmit={event => event.preventDefault()}>
            {busy && <p role="status">Creating tracking link…</p>}
            <Notice>{error}</Notice>
            {error && <button type="button" className="secondary w-fit" onClick={issue}>Try again</button>}
            {link && (
              <>
                <p className="text-sm text-gray-600">Share this private link with the customer. It works for 30 days and anyone with it can see this order’s status and warranties.</p>
                <label>Tracking link<input name="trackingLink" value={link} readOnly /></label>
                <button type="button" className="primary w-fit" onClick={copy}>Copy link</button>
                {copied && <p role="status" className="text-sm text-emerald-700">Link copied.</p>}
              </>
            )}
          </form>
        </RecordDialog>
      )}
    </>
  )
}
