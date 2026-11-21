import { useId, useRef } from 'react'

export function Signature({ canvas, onChange, disabled = false }) {
  const labelId = useId()
  const drawing = useRef(false)
  function point(event) {
    const rect = canvas.current.getBoundingClientRect()
    return [(event.clientX - rect.left) * canvas.current.width / rect.width,
      (event.clientY - rect.top) * canvas.current.height / rect.height]
  }
  function start(event) {
    if (disabled) return
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
    if (disabled || !drawing.current) return
    const context = canvas.current.getContext('2d')
    context.lineTo(...point(event))
    context.stroke()
    onChange(true)
  }
  return <div className="grid gap-2">
    <p id={labelId} className="text-sm font-semibold">Customer signature</p>
    <canvas ref={canvas} width={720} height={240} aria-labelledby={labelId} className="signature"
      onPointerDown={start} onPointerMove={move} onPointerUp={() => { drawing.current = false }}
      onPointerCancel={() => { drawing.current = false }} />
    <button className="secondary w-fit" type="button" disabled={disabled} onClick={() => {
      canvas.current.getContext('2d').clearRect(0, 0, canvas.current.width, canvas.current.height)
      onChange(false)
    }}>Clear signature</button>
  </div>
}
