import { useEffect, useState } from 'react'
import { api } from './api.js'

const input = (name, label, type = 'text', attributes = {}) => ({ name, label, type, attributes })
const choice = (name, label, options) => ({ name, label, type: 'select', options })
const time = (name, label) => input(name, label, 'datetime-local')
const number = (name, label, attributes = {}) => input(name, label, 'number', { step: '.01', ...attributes })
const toDate = text => text && new Date(text).toISOString()

export function recordActions(section, row, capabilities) {
  const can = capability => capabilities.includes(capability)
  const id = row.id
  const post = (key, label, path, fields = [], convert = values => values) => ({ key, label, path, method: 'POST', fields, convert })
  const patch = (key, label, path, fields, convert) => ({ key, label, path, method: 'PATCH', fields, convert })
  if (section === 'leads' && row.status === 'QUALIFIED' && can('surveys:schedule')) {
    return [post('schedule', 'Schedule survey', '/leads/' + id + '/surveys', [
      { ...choice('surveyorId', 'Surveyor', []), source: '/users/options?kind=surveyor' }, time('scheduledAt', 'Survey appointment'),
    ], ({ scheduledAt, ...values }) => ({ ...values, scheduledAt: toDate(scheduledAt) }))]
  }
  if (section === 'surveys') {
    const url = '/surveys/' + id
    if (['SCHEDULED', 'IN_PROGRESS'].includes(row.status) && can('surveys:record')) {
      return [patch('record', 'Submit survey', url, [
        time('visitedAt', 'Visit time'), choice('roofDirection', 'Roof direction', ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']),
        number('tiltDegrees', 'Roof tilt (degrees)', { min: 0, max: 90 }),
        number('cableDistanceMeters', 'Cable distance (m)', { min: 0 }),
        number('shadowFreeArea', 'Shadow-free area (m²)', { min: '.01' }),
        choice('gridSuitable', 'Grid suitable', [{ id: 'yes', name: 'Yes' }, { id: 'no', name: 'No' }]),
        input('findings', 'Survey findings', 'textarea', { maxLength: 2000 }),
      ], values => ({
        ...values, visitedAt: toDate(values.visitedAt), tiltDegrees: Number(values.tiltDegrees),
        cableDistanceMeters: Number(values.cableDistanceMeters), shadowFreeArea: Number(values.shadowFreeArea),
        gridSuitable: values.gridSuitable === 'yes', status: 'SUBMITTED',
      }))]
    }
    if (row.status === 'SUBMITTED' && can('surveys:approve')) {
      return [post('approve', 'Approve survey', url + '/approve', [], () => ({ approved: true })),
        post('rejectSurvey', 'Reject survey', url + '/approve', [input('rejectionReason', 'Reason', 'textarea')], values => ({ ...values, approved: false }))]
    }
    if (row.status === 'APPROVED' && ['SURVEY_APPROVED', 'QUOTED'].includes(row.lead.status) && can('quotes:create')) {
      return [post('quote', 'Create quotation', '/quotes', [
        { ...choice('packageId', 'Solar package', []), source: '/packages?limit=100' },
        number('taxRate', 'Tax rate (%)', { min: 0, max: 100, defaultValue: 0 }),
        input('includeInstallation', 'Include installation', 'checkbox'), time('validUntil', 'Valid until'),
      ], ({ validUntil, ...values }) => ({ ...values, validUntil: toDate(validUntil), taxRate: Number(values.taxRate),
        leadId: row.lead.id, surveyId: id }))]
    }
  }
  if (section === 'quotes') {
    const url = '/quotes/' + id
    if (row.status === 'DRAFT' && can('quotes:send')) return [post('send', 'Issue quotation', url + '/send', [time('validUntil', 'Valid until')],
      ({ validUntil }) => ({ validUntil: toDate(validUntil) }))]
    if (row.status === 'SENT' && can('quotes:accept')) {
      return [post('accept', 'Record acceptance', url + '/accept'), post('rejectQuote', 'Record rejection', url + '/reject',
        [input('reason', 'Reason', 'textarea', { optional: true })])]
    }
    if (row.status === 'ACCEPTED' && can('orders:create')) return [post('order', 'Create order', url + '/convert-to-order')]
  }
  if (section === 'orders' && row.status !== 'CANCELLED') {
    const actions = []
    if (can('payments:record')) actions.push(post('payment', 'Record payment', '/orders/' + id + '/payments', [
      number('amount', 'Amount (INR)', { min: '.01' }),
      choice('method', 'Payment method', ['CASH', 'BANK_TRANSFER', 'UPI', 'CARD', 'OTHER']),
      input('reference', 'Payment reference', 'text', { optional: true, maxLength: 120 }),
    ]))
    if (can('invoices:manage')) actions.push(post('invoice', 'Draft invoice', '/invoices', [], () => ({ orderId: id, customerId: row.customerId })))
    if (can('subsidies:manage')) actions.push(post('subsidy', 'Start subsidy application', '/subsidies', [], () => ({ orderId: id })))
    return actions
  }
  if (section === 'inventory' && can('inventory:write')) {
    return [post('receipt', 'Receive stock', '/inventory/receipts', [
      number('quantity', 'Quantity received', { min: 1, max: 10000, step: 1 }),
      number('unitCost', 'Unit cost (INR)', { min: 0, defaultValue: row.cost }),
      input('reference', 'Purchase reference', 'text', { optional: true }),
      ...(row.serialized ? [input('serialNumbers', 'Serials (one per line)', 'textarea')] : []),
    ], values => ({
      ...values, productId: id, quantity: Number(values.quantity),
      serialNumbers: values.serialNumbers?.split(/\r?\n/).map(value => value.trim()).filter(Boolean) ?? [],
    }))]
  }
  if (section === 'dispatches') {
    const url = '/dispatches/' + id
    if (row.status === 'DRAFT' && can('dispatch:allocate')) {
      const items = new Map()
      for (const line of row.order.orderLinesByOrder) {
        if (line.lineKind !== 'MATERIAL' || !line.productId) continue
        const previous = items.get(line.productId)
        items.set(line.productId, { productId: line.productId, name: line.descriptionSnapshot,
          quantity: line.quantity + (previous?.quantity ?? 0) })
      }
      const requirements = [...items.values()]
      return [post('allocate', 'Allocate stock', url + '/allocate', requirements.map(item =>
        input(item.productId, item.name + ' ? ' + item.quantity + ' ? serials if tracked', 'textarea', { optional: true })
      ), values => ({ items: requirements.map(({ productId, quantity }) => ({
        productId, quantity, serialNumbers: values[productId]?.split(/\r?\n/).map(value => value.trim()).filter(Boolean) ?? [],
      })) }))]
    }
    if (row.status === 'ALLOCATED' && can('dispatch:complete')) return [post('dispatch', 'Record dispatch', url + '/dispatch')]
    if (row.status === 'DISPATCHED' && can('dispatch:deliver')) return [post('deliver', 'Confirm delivery', url + '/deliver', [
      input('recipientName', 'Recipient name', 'text', { defaultValue: row.order.customer.name, maxLength: 120 }),
    ])]
  }
  if (section === 'warranties' && can('tickets:create')) {
    return [post('ticket', 'Open service ticket', '/tickets', [
      input('faultCode', 'Fault code', 'text', { optional: true, maxLength: 80 }),
      input('description', 'Describe the fault', 'textarea', { maxLength: 2000 }),
      choice('priority', 'Priority', ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    ], values => ({ ...values, customerId: row.customerId, assetId: row.assetId, orderId: row.orderId }))]
  }
  if (section === 'tickets') {
    const url = '/tickets/' + id
    if (row.status === 'RESOLVED_PENDING_CONFIRMATION' && can('tickets:confirm')) {
      return [post('closeTicket', 'Confirm repair', url + '/confirm', [
        input('customerConfirmationName', 'Customer confirmation name', 'text', { defaultValue: row.customer.name }),
      ])]
    }
    if (!['RESOLVED_PENDING_CONFIRMATION', 'CLOSED'].includes(row.status) && can('tickets:resolve')) {
      return [
        patch('ticketAssignment', 'Assign technician', url, [
          { ...choice('assignedToId', 'Technician', []), source: '/users/options?kind=technician' },
        ], values => values),
        patch('laborCharge', 'Set labour charge', url, [
          number('laborCharge', 'Labour charge (INR)', { min: 0, defaultValue: row.laborCharge }),
        ], values => values),
        post('resolve', 'Resolve ticket', url + '/resolve', [
          input('resolutionNotes', 'Repair details', 'textarea', { maxLength: 2000 }),
        ], values => ({ ...values, coverageDecision: row.coverageDecision === 'COVERED' ? 'COVERED' : 'NOT_COVERED' })),
      ]
    }
  }
  if (section === 'invoices' && row.status === 'DRAFT' && can('invoices:manage')) {
    return [post('issueInvoice', 'Issue invoice', '/invoices/' + id + '/issue', [time('dueAt', 'Due date')], values => ({ dueAt: toDate(values.dueAt) }))]
  }
  if (section === 'installations' && row.status !== 'COMPLETED' && can('installations:manage') && !row.startedAt) {
    return [patch('scheduleJob', 'Schedule crew', '/installations/' + id, [
      { ...choice('technicianIds', 'Technicians', []), source: '/users/options?kind=technician', multiple: true },
      time('scheduledAt', 'Installation appointment'),
    ], values => ({ ...values, scheduledAt: toDate(values.scheduledAt) }))]
  }
  return []
}

function Field({ field, options }) {
  const { name, type, label, attributes = {}, multiple } = field
  const { optional, ...props } = attributes
  const common = { name, required: !optional && (!['validUntil', 'dueAt'].includes(name)), ...props }
  if (type === 'checkbox') return <label className="check"><input type="checkbox" name={name} />{label}</label>
  if (type === 'textarea') return <label>{label}<textarea {...common} /></label>
  if (type === 'select') return <label>{label}<select {...common} multiple={multiple} defaultValue={multiple ? [] : ''}>
    {!multiple && <option value="">Choose {label.toLowerCase()}</option>}
    {options.map(option => typeof option === 'string'
      ? <option key={option} value={option}>{option.replaceAll('_', ' ')}</option>
      : <option key={option.id} value={option.id}>{option.name}</option>)}
  </select></label>
  return <label>{label}<input type={type} {...common} /></label>
}

export default function WorkflowAction({ action, token, onClose, onSaved }) {
  const [choices, setChoices] = useState({})
  const [loading, setLoading] = useState(action.fields.some(field => field.source))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    const fields = action.fields.filter(field => field.source)
    if (fields.length) {
      Promise.all(fields.map(async field => [field.name, (await api(field.source, { token, signal: controller.signal })).data]))
        .then(entries => { setChoices(Object.fromEntries(entries)); setLoading(false) })
        .catch(failure => { if (!controller.signal.aborted) { setError(failure.message); setLoading(false) } })
    }
    return () => controller.abort()
  }, [action, token])

  async function submit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const values = Object.fromEntries(action.fields.flatMap(field => {
      if (field.type === 'checkbox') return [[field.name, form.has(field.name)]]
      if (field.multiple) return [[field.name, form.getAll(field.name)]]
      const value = form.get(field.name)
      return value ? [[field.name, value]] : []
    }))
    setBusy(true)
    setError('')
    try {
      await api(action.path, { token, method: action.method, body: action.convert(values) })
      onSaved()
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return <section className="lead-editor">
    <div className="toolbar items-center"><h2>{action.label}</h2>
      <button className="secondary ml-auto" disabled={busy} onClick={onClose}>Close</button>
    </div>
    <form className="form p-4" onSubmit={submit}>
      {loading && <p role="status">Loading available options…</p>}
      {!loading && !!action.fields.length && <div className="form-grid">
        {action.fields.map(field => <Field key={field.name} field={field} options={choices[field.name] ?? field.options ?? []} />)}
      </div>}
      {error && <p className="notice" role="alert">{error}</p>}
      <button className="primary w-fit" disabled={busy || loading}>{busy ? 'Saving…' : action.label}</button>
    </form>
  </section>
}
