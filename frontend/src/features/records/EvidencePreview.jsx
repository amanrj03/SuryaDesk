import { useEffect, useState } from 'react'
import { RecordDialog } from '../../components/ui/RecordDialog.jsx'
import { Notice } from '../../components/ui/Notice.jsx'
import { api } from '../../lib/api.js'

export function EvidencePreview({ id, name, token, onClose }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    let source
    api('/attachments/' + encodeURIComponent(id), { token, download: true, signal: controller.signal })
      .then(file => {
        if (controller.signal.aborted) return
        source = URL.createObjectURL(file)
        setUrl(source)
      })
      .catch(failure => {
        if (!controller.signal.aborted) setError(failure.message)
      })
    return () => {
      controller.abort()
      if (source) URL.revokeObjectURL(source)
    }
  }, [id, token])

  return <RecordDialog title={name} onClose={onClose}>
    <div className="grid gap-4 p-4">
      {url ? <>
        <img className="mx-auto max-h-[65dvh] max-w-full rounded-lg object-contain" src={url} alt={name} />
        <a className="secondary w-fit" href={url} download={name}>Download photo</a>
      </> : error ? <Notice>{error}</Notice> : <p role="status" className="text-sm text-gray-600">Loading photo…</p>}
    </div>
  </RecordDialog>
}
