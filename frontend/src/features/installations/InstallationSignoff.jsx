import { useRef, useState } from 'react'
import { api } from '../../lib/api.js'

const checks = [
  ['mounting', 'Mounting and panels secured'], ['electrical', 'Electrical connections checked'],
  ['earthing', 'Earthing and protection verified'], ['generation', 'Generation test completed'],
]

function Signature({ canvas, onChange }) {
  const drawing = useRef(false)
  function point(event) {
    const rect = canvas.current.getBoundingClientRect()
    return [(event.clientX - rect.left) * canvas.current.width / rect.width,
      (event.clientY - rect.top) * canvas.current.height / rect.height]
  }
  function start(event) {
    event.preventDefault()
    const element = canvas.current
    element.setPointerCapture(event.pointerId)
    const context = element.getContext('2d')
    context.strokeStyle = '#142b43'
    context.lineWidth = 3
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.beginPath()
    context.moveTo(...point(event))
    drawing.current = true
  }
  function move(event) {
    if (!drawing.current) return
    const context = canvas.current.getContext('2d')
    context.lineTo(...point(event))
    context.stroke()
    onChange(true)
  }
  return <div className="grid gap-2">
    <p id="sign-label" className="text-sm font-semibold">Customer signature</p>
    <canvas ref={canvas} width={720} height={240} aria-labelledby="sign-label" className="signature"
      onPointerDown={start} onPointerMove={move} onPointerUp={() => { drawing.current = false }}
      onPointerCancel={() => { drawing.current = false }} />
    <button className="secondary w-fit" type="button" onClick={() => {
      canvas.current.getContext('2d').clearRect(0, 0, canvas.current.width, canvas.current.height)
      onChange(false)
    }}>Clear signature</button>
  </div>
}

function localInput(value) {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export default function InstallationSignoff({ job, token, onClose, onSaved }) {
  const canvas = useRef(null)
  const [signed, setSigned] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function upload(file, filename) {
    const body = new FormData()
    body.set('ownerType', 'INSTALLATION')
    body.set('ownerId', job.id)
    body.set('file', file, filename)
    return (await api('/attachments', { method: 'POST', token, body })).data
  }

  async function save(event) {
    event.preventDefault()
    if (!signed) { setError('Capture the customer signature.'); return }
    const values = new FormData(event.currentTarget)
    const startedAt = new Date(values.get('startedAt'))
    const finishedAt = new Date(values.get('finishedAt'))
    if (finishedAt <= startedAt || finishedAt > new Date()) {
      setError('Finish must follow start and cannot be in the future.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await api('/installations/' + job.id, {
        method: 'PATCH', token,
        body: { startedAt: startedAt.toISOString(), generationReading: Number(values.get('generationReading')) },
      })
      const photo = values.get('photo')
      await upload(photo, photo.name)
      const signature = await new Promise(resolve => canvas.current.toBlob(resolve, 'image/png'))
      if (!signature) throw new Error('Signature could not be saved.')
      const proof = await upload(signature, 'customer-signature.png')
      await api('/installations/' + job.id + '/complete', {
        method: 'POST', token,
        body: {
          finishedAt: finishedAt.toISOString(), capacityKw: Number(values.get('capacityKw')),
          checklist: Object.fromEntries(checks.map(([key]) => [key, values.has(key)])),
          generationTestPassed: true, signatureAttachmentId: proof.id,
          customerSignerName: values.get('customerSignerName'),
        },
      })
      onSaved()
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return <section className="lead-editor">
    <div className="toolbar items-center"><h2>{job.order.customer.name}</h2>
      <button className="secondary ml-auto" disabled={busy} onClick={onClose}>Close</button>
    </div>
    <form className="form p-4" onSubmit={save}>
      <div className="form-grid">
        <label>Started at<input type="datetime-local" name="startedAt" required defaultValue={localInput(job.startedAt)} /></label>
        <label>Finished at<input type="datetime-local" name="finishedAt" required defaultValue={localInput(job.finishedAt)} /></label>
        <label>Installed capacity (kW)<input type="number" name="capacityKw" min="0.01" step="0.01" defaultValue={job.capacityKw || ''} required /></label>
        <label>Generation reading (kW)<input type="number" name="generationReading" min="0" step="0.01" defaultValue={job.generationReading ?? ''} required /></label>
      </div>
      <fieldset className="grid gap-2"><legend className="mb-2 text-sm font-semibold">Installation checklist</legend>
        {checks.map(([name, label]) => <label className="check" key={name}>
          <input type="checkbox" name={name} defaultChecked={job.checklist?.[name]} required />{label}
        </label>)}
      </fieldset>
      <label>Roof photo<input type="file" name="photo" accept=".png,.jpg,.jpeg,.webp" required /></label>
      <label>Customer name<input name="customerSignerName" maxLength={120} required defaultValue={job.order.customer.name} /></label>
      <Signature canvas={canvas} onChange={setSigned} />
      {error && <p className="notice" role="alert">{error}</p>}
      <button disabled={busy} className="primary w-fit">{busy ? 'Saving evidence…' : 'Complete installation'}</button>
    </form>
  </section>
}
