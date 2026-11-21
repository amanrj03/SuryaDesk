import { useEffect, useState } from 'react'
import { api } from './api.js'

const input = (name, label, type = 'text', attributes = {}) => ({ name, label, type, attributes })
const choice = (name, label, options) => ({ name, label, type: 'select', options })
const time = (name, label) => input(name, label, 'datetime-local')
const number = (name, label, attributes = {}) => input(name, label, 'number', { step: '.01', ...attributes })
const toDate = text => text && new Date(text).toISOString()


function productFields(product = {}) {
  return [
    input('sku', 'SKU', 'text', { defaultValue: product.sku }),
    input('name', 'Product name', 'text', { defaultValue: product.name }),
    { ...choice('category', 'Category', ['PANEL', 'INVERTER', 'BATTERY', 'CONTROLLER', 'STAND', 'WIRING', 'SWITCH', 'SAFETY', 'OTHER']),
      attributes: { defaultValue: product.category } },
    input('unit', 'Unit of measure', 'text', { defaultValue: product.unit ?? 'unit' }),
    number('cost', 'Unit cost (INR)', { min: 0, defaultValue: product.cost }),
    number('salePrice', 'Sale price (INR)', { min: 0, defaultValue: product.salePrice }),
    number('warrantyMonths', 'Warranty (months)', { min: 0, max: 600, step: 1, defaultValue: product.warrantyMonths ?? 0 }),
    number('reorderLevel', 'Reorder threshold', { min: 0, max: 1000000, step: 1, defaultValue: product.reorderLevel ?? 0 }),
    input('serialized', 'Track individual serials', 'checkbox', { defaultChecked: product.serialized, disabled: Boolean(product.id) }),
    input('isActive', 'Active product', 'checkbox', { defaultChecked: product.isActive ?? true }),
  ]
}

function productData({ warrantyMonths, reorderLevel, ...values }) {
  return { ...values, warrantyMonths: Number(warrantyMonths), reorderLevel: Number(reorderLevel) }
}

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
    if (can('reports:financial')) actions.push(post('jobCost', 'Record job cost', '/orders/' + id + '/costs', [
      choice('category', 'Cost category', ['TRANSPORT', 'LABOR', 'MATERIAL', 'OTHER']),
      input('description', 'Cost description', 'textarea', { maxLength: 500 }),
      number('amount', 'Amount (INR)', { min: '.01' }),
      input('incurredAt', 'Incurred at', 'datetime-local', { optional: true }),
    ], ({ incurredAt, ...values }) => ({ ...values, incurredAt: toDate(incurredAt) })))
    if (can('invoices:manage')) actions.push(post('invoice', 'Draft invoice', '/invoices', [], () => ({ orderId: id, customerId: row.customerId })))
    if (can('subsidies:manage')) actions.push(post('subsidy', 'Start subsidy application', '/subsidies', [], () => ({ orderId: id })))
    return actions
  }
  if (section === 'purchases' && can('inventory:write')) {
    const url = '/purchases/' + id
    if (row.status === 'DRAFT') return [post('orderPurchase', 'Mark ordered', url + '/order')]
    if (['ORDERED', 'PARTIALLY_RECEIVED'].includes(row.status)) {
      return row.lines.filter(line => line.received < line.quantity).map(line => {
        const remaining = line.quantity - line.received
        return post('receive-' + line.id, 'Receive ' + line.product.name, url + '/receive', [
          number('quantity', 'Quantity received', { min: 1, max: remaining, step: 1, defaultValue: remaining }),
          ...(line.product.serialized ? [input('serialNumbers', 'Serials (one per line)', 'textarea')] : []),
        ], values => ({ productId: line.productId, quantity: Number(values.quantity),
          serialNumbers: values.serialNumbers?.split(/\r?\n/).map(value => value.trim()).filter(Boolean) ?? [] }))
      })
    }
  }
  if (section === 'products' && can('catalog:manage')) {
    return [patch('editProduct', 'Edit product', '/products/' + id, productFields(row), values => {
      const { serialized, ...data } = productData(values)
      return data
    })]
  }
  if (section === 'inventory' && can('inventory:write')) {
    const actions = [post('receipt', 'Receive stock', '/inventory/receipts', [
      number('quantity', 'Quantity received', { min: 1, max: 10000, step: 1 }),
      number('unitCost', 'Unit cost (INR)', { min: 0, defaultValue: row.cost }),
      input('reference', 'Purchase reference', 'text', { optional: true }),
      ...(row.serialized ? [input('serialNumbers', 'Serials (one per line)', 'textarea')] : []),
    ], values => ({
      ...values, productId: id, quantity: Number(values.quantity),
      serialNumbers: values.serialNumbers?.split(/\r?\n/).map(value => value.trim()).filter(Boolean) ?? [],
    }))]
    if (!row.serialized) actions.push(post('adjust', 'Adjust stock', '/inventory/adjustments', [
      number('delta', 'Stock change (negative to subtract)', { min: -10000, max: 10000, step: 1 }),
      input('reason', 'Reason', 'textarea', { maxLength: 500 }),
    ], values => ({ productId: id, delta: Number(values.delta), reason: values.reason })))
    return actions
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
        input(item.productId, item.name + ' × ' + item.quantity + ' · serials if tracked', 'textarea', { optional: true })
      ), values => ({ items: requirements.map(({ productId, quantity }) => ({
        productId, quantity, serialNumbers: values[productId]?.split(/\r?\n/).map(value => value.trim()).filter(Boolean) ?? [],
      })) }))]
    }
    if (row.status === 'ALLOCATED' && can('dispatch:complete')) return [post('dispatch', 'Record dispatch', url + '/dispatch')]
    if (row.status === 'DISPATCHED' && can('dispatch:deliver')) return [post('deliver', 'Confirm delivery', url + '/deliver', [
      input('recipientName', 'Recipient name', 'text', { defaultValue: row.order.customer.name, maxLength: 120 }),
    ])]
  }
  if (section === 'customers' && can('tickets:create')) {
    return [post('customerTicket', 'Open service ticket', '/tickets', [
      input('description', 'Describe the issue', 'textarea', { maxLength: 2000 }),
      choice('priority', 'Priority', ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    ], values => ({ ...values, customerId: id }))]
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
        ...(row.asset && !row.ticketPartsByTicket.some(part => part.replacementAssetId) ? [
          post('replacement', 'Replace serialized equipment', url + '/replace', [
            input('serialNumber', 'Replacement serial'), number('chargePerUnit', 'Customer charge (INR)', { min: 0, defaultValue: 0 }),
          ]),
        ] : []),
        ...(can('inventory:read') ? [post('addPart', 'Record repair part', url + '/parts', [
          { ...choice('productId', 'Repair part', []), source: '/inventory?limit=100',
            filter: item => !item.serialized && item.available > 0 },
          number('quantity', 'Quantity', { min: 1, step: 1 }),
          number('chargePerUnit', 'Customer charge per unit (INR)', { min: 0, defaultValue: 0 }),
        ], values => ({ ...values, quantity: Number(values.quantity) }))] : []),
        post('resolve', 'Resolve ticket', url + '/resolve', [
          input('resolutionNotes', 'Repair details', 'textarea', { maxLength: 2000 }),
        ], values => ({ ...values, coverageDecision: row.coverageDecision === 'COVERED' ? 'COVERED' : 'NOT_COVERED' })),
      ]
    }
  }
  if (section === 'subsidies' && can('subsidies:manage')) {
    const statuses = {
      NOT_STARTED: ['DOCUMENTS_PENDING'], DOCUMENTS_PENDING: ['SUBMITTED'],
      SUBMITTED: ['APPROVED', 'REJECTED'], REJECTED: ['DOCUMENTS_PENDING'], APPROVED: ['PAID'], PAID: [],
    }
    return [patch('subsidyUpdate', 'Update application', '/subsidies/' + id, [
      choice('status', 'Application status', [...new Set([row.status, ...statuses[row.status]])]),
      input('reference', 'Application reference', 'text', { optional: true, defaultValue: row.reference ?? '' }),
      time('submittedAt', 'Submitted at'), time('decisionAt', 'Decision date'),
      input('identity', 'Identity document', 'checkbox', { defaultChecked: row.documentChecklist?.identity }),
      input('utilityBill', 'Utility bill', 'checkbox', { defaultChecked: row.documentChecklist?.utilityBill }),
      input('installationCertificate', 'Installation certificate', 'checkbox', { defaultChecked: row.documentChecklist?.installationCertificate }),
      input('bankDetails', 'Bank details', 'checkbox', { defaultChecked: row.documentChecklist?.bankDetails }),
      input('notes', 'Notes', 'textarea', { optional: true, defaultValue: row.notes ?? '' }),
    ], ({ status, reference, submittedAt, decisionAt, identity, utilityBill, installationCertificate, bankDetails, notes }) => ({
      status, reference, submittedAt: toDate(submittedAt), decisionAt: toDate(decisionAt), notes,
      documentChecklist: { identity, utilityBill, installationCertificate, bankDetails },
    }))]
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


export function collectionActions(section, capabilities) {
  const can = capability => capabilities.includes(capability)
  const post = (key, label, path, fields, convert = values => values) => [{ key, label, path, fields, convert, method: 'POST' }]
  if (section === 'leads' && can('leads:write')) return post('manualLead', 'Add enquiry', '/leads', [
    input('name', 'Customer name'), input('phone', 'Phone', 'tel'), input('address', 'Installation address', 'textarea'),
    choice('source', 'Enquiry source', ['PHONE', 'WHATSAPP', 'WEB', 'OTHER']),
    input('email', 'Email', 'email', { optional: true }),
    number('desiredKw', 'Desired system capacity (kW)', { min: 1, max: 5, optional: true }),
    number('monthlyBill', 'Monthly bill (INR)', { min: 0, optional: true }),
    input('subsidyInterest', 'Interested in subsidies', 'checkbox'),
    input('notes', 'Notes', 'textarea', { optional: true }),
  ], ({ desiredKw, ...values }) => ({ ...values, ...(desiredKw && { desiredKw: Number(desiredKw) }) }))
  if (section === 'products' && can('catalog:manage')) return post('newProduct', 'Add product', '/products', productFields(), productData)
  if (section === 'suppliers' && can('inventory:write')) return post('supplier', 'Add supplier', '/suppliers', [
    input('code', 'Supplier code'), input('name', 'Supplier name'),
    input('email', 'Email', 'email', { optional: true }), input('phone', 'Phone', 'tel', { optional: true }),
    input('address', 'Address', 'textarea', { optional: true }),
  ])
  if (section === 'purchases' && can('inventory:write')) return post('purchase', 'Draft purchase order', '/purchases', [
    { ...choice('supplierId', 'Supplier', []), source: '/suppliers?limit=100', filter: supplier => supplier.isActive },
    { ...choice('productId', 'Product', []), source: '/inventory?limit=100' },
    number('quantity', 'Quantity', { min: 1, max: 10000, step: 1 }),
    number('unitCost', 'Agreed unit cost (INR)', { min: 0 }),
    input('expectedAt', 'Expected delivery', 'datetime-local', { optional: true }),
  ], ({ supplierId, productId, quantity, unitCost, expectedAt }) => ({
    supplierId, expectedAt: toDate(expectedAt), lines: [{ productId, quantity: Number(quantity), unitCost }],
  }))
  if (section === 'users' && can('users:manage')) return post('user', 'Add staff account', '/users', [
    input('name', 'Name'), input('email', 'Work email', 'email'), input('password', 'Temporary password', 'password', { minLength: 12 }),
    choice('role', 'Role', ['ADMIN', 'DIRECTOR', 'SALES', 'SURVEYOR', 'WAREHOUSE', 'TECHNICIAN', 'SUPPORT', 'FINANCE']),
  ])
  return []
}

function Field({ field, options }) {
  const { name, type, label, attributes = {}, multiple } = field
  const { optional, ...props } = attributes
  const common = { name, required: !optional && (!['validUntil', 'dueAt', 'submittedAt', 'decisionAt'].includes(name)), ...props }
  if (type === 'checkbox') return <label className="check"><input type="checkbox" name={name} {...props} />{label}</label>
  if (type === 'textarea') return <label>{label}<textarea {...common} /></label>
  if (type === 'select') return <label>{label}<select {...common} multiple={multiple} defaultValue={multiple ? [] : attributes.defaultValue ?? ''}>
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
      Promise.all(fields.map(async field => {
        const { data } = await api(field.source, { token, signal: controller.signal })
        return [field.name, field.filter ? data.filter(field.filter) : data]
      }))
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
