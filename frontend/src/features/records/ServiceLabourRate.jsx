import { useEffect, useState } from 'react'
import { Notice } from '../../components/ui/Notice.jsx'
import { api } from '../../lib/api.js'
import WorkflowAction from './WorkflowAction.jsx'

export function ServiceLabourRate({ token }) {
  const [rate, setRate] = useState(undefined)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    api('/service-labour-rate', { token, signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setRate(data) })
      .catch(failure => { if (!controller.signal.aborted) setError(failure.message) })
    return () => controller.abort()
  }, [token, retry])

  const action = {
    key: 'serviceLabourRate', label: 'Save service charges', method: 'PATCH', path: '/service-labour-rate',
    fields: [{
      name: 'hourlyRate', label: 'Customer labour rate (INR per hour)', type: 'number',
      attributes: { min: 0, max: 999999.99, step: '.01', defaultValue: rate?.hourlyRate ?? '' },
    }, {
      name: 'visitCharge', label: 'Visiting charge (INR per visit)', type: 'number',
      attributes: { min: 0, max: 999999.99, step: '.01', defaultValue: rate?.visitCharge ?? '0' },
    }],
    convert: values => values,
  }
  const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })
  const rateLabel = rate == null ? 'Service charges not configured'
    : `${currency.format(rate.hourlyRate)} per hour · ${currency.format(rate.visitCharge)} per visit`

  return <div className="toolbar mb-2">
    {error ? <>
      <Notice>{error}</Notice>
      <button type="button" className="secondary" onClick={() => {
        setError('')
        setRetry(value => value + 1)
      }}>Retry loading labour rate</button>
    </> : <>
      <button type="button" className="secondary" disabled={rate === undefined} onClick={() => setEditing(true)}>
        Service charges
      </button>
      <span className="text-sm text-gray-600">{rate === undefined ? 'Loading labour rate…' : rateLabel}</span>
    </>}
    {editing && <WorkflowAction action={action} token={token} onClose={() => setEditing(false)}
      onSaved={data => { setRate(data); setEditing(false) }} />}
  </div>
}
