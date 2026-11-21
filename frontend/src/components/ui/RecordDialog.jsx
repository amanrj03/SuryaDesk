import { useId, useLayoutEffect, useRef } from 'react'

export function RecordDialog({ title, busy, onClose, children }) {
  const dialog = useRef(null)
  const titleId = useId()

  useLayoutEffect(() => {
    const element = dialog.current
    element.showModal()
    return () => element.close()
  }, [])

  function cancel(event) {
    event.preventDefault()
    if (!busy) onClose()
  }

  return (
    <dialog ref={dialog} className="record-dialog" aria-labelledby={titleId} onCancel={cancel}>
      <header className="record-dialog-header">
        <h2 id={titleId} className="min-w-0 break-words text-base font-semibold text-gray-900">{title}</h2>
        <button type="button" className="secondary shrink-0" disabled={busy} onClick={onClose}>
          Close
        </button>
      </header>
      {children}
    </dialog>
  )
}
