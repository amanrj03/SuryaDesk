import { useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api.js'
import { displayReference, displaySupplierName, localDateTimeInput } from '../../lib/format.js'
import { useNavigate } from 'react-router-dom'
import { RecordDialog } from '../../components/ui/RecordDialog.jsx'
import { Signature } from '../../components/ui/Signature.jsx'

const input = (name, label, type = 'text', attributes = {}) => ({ name, label, type, attributes })
const choice = (name, label, options) => ({ name, label, type: 'select', options })
const time = (name, label) => input(name, label, 'datetime-local')
const number = (name, label, attributes = {}) => input(name, label, 'number', { step: '.01', ...attributes })
const toDate = text => text && new Date(text).toISOString()
const staffRoles = ['ADMIN', 'DIRECTOR', 'SALES', 'SURVEYOR', 'WAREHOUSE', 'TECHNICIAN', 'SUPPORT', 'FINANCE']

export function issueInvoiceAction(id) {
  return {
    key: 'issueInvoice', label: 'Issue invoice', method: 'POST',
    path: '/invoices/' + encodeURIComponent(id) + '/issue',
    fields: [time('dueAt', 'Due date')],
    convert: values => ({ dueAt: toDate(values.dueAt) }),
  }
}

function productFields(product = {}) {
  return [
    input('name', 'Product name', 'text', { defaultValue: product.name }),
    { ...choice('category', 'Category', ['PANEL', 'INVERTER', 'BATTERY', 'CONTROLLER', 'STAND', 'WIRING', 'SWITCH', 'SAFETY', 'OTHER']),
      attributes: { defaultValue: product.category } },
    input('unit', 'Unit of measure', 'text', { defaultValue: product.unit ?? 'unit' }),
    number('cost', 'Unit cost (INR)', { min: 0, defaultValue: product.cost }),
    number('salePrice', 'Sale price (INR)', { min: 0, defaultValue: product.salePrice }),
    number('taxRate', 'Product tax rate (%)', { min: 0, max: 100, optional: true, defaultValue: product.taxRate ?? '' }),
    number('warrantyMonths', 'Warranty (months)', { min: 0, max: 600, step: 1, defaultValue: product.warrantyMonths ?? 0 }),
    number('reorderLevel', 'Reorder threshold', { min: 0, max: 1000000, step: 1, defaultValue: product.reorderLevel ?? 0 }),
    input('serialized', 'Track individual serials', 'checkbox', { defaultChecked: product.serialized, disabled: Boolean(product.id) }),
    input('isActive', 'Active product', 'checkbox', { defaultChecked: product.isActive ?? true }),
  ]
}

function productData({ warrantyMonths, reorderLevel, taxRate, ...values }) {
  return { ...values, taxRate: taxRate ?? null, warrantyMonths: Number(warrantyMonths), reorderLevel: Number(reorderLevel) }
}

function baseRecordActions(section, row, capabilities, detail) {
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
      return [{ ...patch('record', 'Submit for review', url, [
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
      })), approveOnSubmit: can('surveys:approve') }]
    }
    if (detail && row.status === 'SUBMITTED' && can('surveys:approve')) {
      return [post('approve', 'Approve survey', url + '/approve', [], () => ({ approved: true })),
        post('rejectSurvey', 'Reject survey', url + '/approve', [input('rejectionReason', 'Reason', 'textarea')], values => ({ ...values, approved: false }))]
    }
    if (row.status === 'APPROVED' && ['SURVEY_APPROVED', 'QUOTED'].includes(row.lead.status) && can('quotes:create')) {
      return [{ ...post('quote', 'Create quotation', '/quotes', [
        { ...choice('packageId', 'Solar package', []), source: '/packages?limit=100' },
        input('includeInstallation', 'Include installation', 'checkbox'), time('validUntil', 'Valid until'),
      ], ({ validUntil, ...values }) => ({ ...values, validUntil: toDate(validUntil),
        leadId: row.lead.id, surveyId: id })), successPath: quote => '/quotes/' + encodeURIComponent(quote.id) }]
    }
  }
  if (section === 'quotes') {
    const url = '/quotes/' + id
    const withinValidity = !row.validUntil || new Date(row.validUntil).getTime() > Date.now()
    const accept = issuedAndAccepted => ({
      ...post('accept', issuedAndAccepted ? 'Issue, accept and create order' : 'Record acceptance and create order',
        url + '/accept', [
          input('confirmed', issuedAndAccepted ? 'I shared this quotation and the customer accepted it.'
            : 'The customer accepted this quotation.', 'checkbox', { required: true }),
        ], () => ({ issuedAndAccepted })),
      successPath: quote => '/orders/' + encodeURIComponent(quote.orderByQuotation.id),
    })
    if (row.status === 'DRAFT' && can('quotes:send')) return [
      post('send', 'Issue quotation', url + '/send', [time('validUntil', 'Valid until')],
        ({ validUntil }) => ({ validUntil: toDate(validUntil) })),
      ...(withinValidity && can('quotes:accept') ? [accept(true)] : []),
    ]
    if (row.status === 'SENT' && can('quotes:accept')) {
      return [...(withinValidity ? [accept(false)] : []), post('rejectQuote', 'Record rejection', url + '/reject',
        [input('reason', 'Reason', 'textarea', { optional: true })])]
    }
    if (row.status === 'ACCEPTED' && !row.orderByQuotation && can('orders:create')) {
      return [{
        ...post('order', 'Create order', url + '/convert-to-order'),
        successPath: order => '/orders/' + encodeURIComponent(order.id),
      }]
    }
  }
  if (section === 'orders' && row.status !== 'CANCELLED') {
    const actions = []
    if (Number(row.balance) > 0 && can('payments:record')) actions.push(post('payment', 'Record payment', '/orders/' + id + '/payments', [
      number('amount', 'Amount (INR)', { min: '.01', max: row.balance }),
      choice('method', 'Payment method', ['CASH', 'BANK_TRANSFER', 'UPI', 'CARD', 'OTHER']),
    ]))
    if (!detail) return actions
    if (can('reports:financial')) actions.push(post('jobCost', 'Record job cost', '/orders/' + id + '/costs', [
      choice('category', 'Cost category', ['TRANSPORT', 'LABOR', 'MATERIAL', 'OTHER']),
      input('description', 'Cost description', 'textarea', { maxLength: 500 }),
      number('amount', 'Amount (INR)', { min: '.01' }),
      input('incurredAt', 'Incurred at', 'datetime-local', { optional: true }),
    ], ({ incurredAt, ...values }) => ({ ...values, incurredAt: toDate(incurredAt) })))
    if (!row.subsidyApplicationByOrder && can('subsidies:manage')) {
      actions.push(post('subsidy', 'Start subsidy application', '/subsidies', [], () => ({ orderId: id })))
    }
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
          ...(line.product.serialized ? [input('serialNumbers', 'Equipment serials (one per line)', 'textarea')] : []),
        ], values => ({ productId: line.productId, quantity: Number(values.quantity),
          serialNumbers: values.serialNumbers?.split(/\r?\n/).map(value => value.trim()).filter(Boolean) ?? [] }))
      })
    }
  }
  if (section === 'users' && can('users:manage')) {
    return [patch('editStaff', 'Edit staff account', '/users/' + id, [
      input('name', 'Name', 'text', { defaultValue: row.name }),
      { ...choice('role', 'Role', staffRoles), attributes: { defaultValue: row.role } },
      input('isActive', 'Active account', 'checkbox', { defaultChecked: row.isActive }),
      number('hourlyCost', 'Hourly cost (INR)', { min: 0, defaultValue: row.hourlyCost, optional: true }),
    ], values => values)]
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
      input('reference', 'Supplier invoice or delivery note reference (optional)', 'text', { optional: true, maxLength: 120 }),
      ...(row.serialized ? [input('serialNumbers', 'Equipment serials (one per line)', 'textarea')] : []),
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
      return [{ key: 'allocate', label: 'Allocate stock', dispatchId: id }]
    }
    const canDeliver = row.status === 'DISPATCHED' || (row.status === 'ALLOCATED' && can('dispatch:complete'))
    if (canDeliver && can('dispatch:deliver')) return [{
      ...post('deliver', 'Confirm delivery', url + '/deliver', [
        input('recipientName', 'Recipient name', 'text', { defaultValue: row.order.customer.name, maxLength: 120 }),
      ]),
      description: 'Confirm only after the recipient has received the materials.',
    }]
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
    const actions = []
    const canResolve = can('tickets:resolve')
    if (canResolve && (
      ['OPEN', 'TRIAGED'].includes(row.status)
      || (detail && ['ASSIGNED', 'IN_PROGRESS'].includes(row.status) && !row.repairReportedAt)
    )) {
      const assigning = ['OPEN', 'TRIAGED'].includes(row.status)
      actions.push(patch(assigning ? 'ticketAssignment' : 'ticketReassignment',
        assigning ? 'Assign technician' : 'Reassign technician', url, [
          { ...choice('assignedToId', 'Technician', []), source: '/users/options?kind=technician' },
        ], values => values))
    }
    if (row.status === 'ASSIGNED' && can('tickets:manage')) {
      actions.push(patch('startTicket', 'Mark in progress', url, [], () => ({ status: 'IN_PROGRESS' })))
    }
    if (row.status !== 'IN_PROGRESS') return actions
    if (!row.repairReportedAt && row.canReportRepair) {
      if (row.repairStartedAt) {
        actions.push({
          ...post('reportRepair', 'Report work done', url + '/report-repair', [
            input('repairNotes', 'Work completed', 'textarea', { maxLength: 2000 }),
            input('customerSignerName', 'Customer signer name', 'text', { maxLength: 120, defaultValue: row.customer.name }),
          ]),
          signServiceVisit: { ownerType: 'TICKET', ownerId: id },
        })
      } else {
        actions.push(patch('startTicket', 'Start visit timer', url, [], () => ({ status: 'IN_PROGRESS' })))
      }
    }
    if (row.repairReportedAt && canResolve) {
      actions.push(post('resolve', 'Resolve ticket', url + '/resolve', [
        input('resolutionNotes', 'Repair details', 'textarea', { maxLength: 2000, defaultValue: row.repairNotes ?? '' }),
      ], values => ({ ...values, coverageDecision: row.coverageDecision === 'COVERED' ? 'COVERED' : 'NOT_COVERED' })))
    }
    const recordingRepair = row.canReportRepair && !row.repairReportedAt
    if (detail && (canResolve || recordingRepair)) {
      const canSetCharges = canResolve && row.coverageDecision !== 'COVERED'
      const chargeField = label => canSetCharges
        ? [number('chargePerUnit', label, { min: 0, defaultValue: 0 })] : []
      if (row.orderId && ['DELIVERED', 'INSTALLED', 'UNDER_REPAIR'].includes(row.asset?.status) &&
        !row.ticketPartsByTicket.some(part => part.replacementAssetId)) {
        actions.push(post('replacement', 'Replace serialized equipment', url + '/replace', [
          input('serialNumber', 'Replacement serial'), ...chargeField('Customer charge (INR)'),
        ]))
      }
      actions.push(post('addPart', 'Record repair part', url + '/parts', [
        { ...choice('productId', 'Repair part', []), source: url + '/part-options',
          emptyLabel: 'No repair parts in stock',
          optionLabel: item => `${item.name} · ${item.sku} · ${item.available} available` },
        number('quantity', 'Quantity used', { min: 1, max: 10000, step: 1 }),
        ...chargeField('Customer charge per unit (INR)'),
      ], values => ({ ...values, quantity: Number(values.quantity) })))
    }
    return actions
  }
  if (section === 'subsidies' && row.status !== 'PAID' && can('subsidies:manage')) {
    const statuses = {
      NOT_STARTED: ['DOCUMENTS_PENDING'], DOCUMENTS_PENDING: ['SUBMITTED'],
      SUBMITTED: ['APPROVED', 'REJECTED'], REJECTED: ['DOCUMENTS_PENDING'], APPROVED: ['PAID'],
    }
    return [patch('subsidyUpdate', 'Update application', '/subsidies/' + id, [
      choice('status', 'Application status', [...new Set([row.status, ...statuses[row.status]])]),
      input('reference', 'Government application reference', 'text', { optional: true, defaultValue: displayReference(row.reference) ?? '' }),
      time('submittedAt', 'Submitted at'), time('decisionAt', 'Decision date'),
      input('identity', 'Identity document', 'checkbox', { defaultChecked: row.documentChecklist?.identity }),
      input('utilityBill', 'Utility bill', 'checkbox', { defaultChecked: row.documentChecklist?.utilityBill }),
      input('installationCertificate', 'Installation certificate', 'checkbox', { defaultChecked: row.documentChecklist?.installationCertificate }),
      input('bankDetails', 'Bank details', 'checkbox', { defaultChecked: row.documentChecklist?.bankDetails }),
      input('notes', 'Notes', 'textarea', { optional: true, defaultValue: row.notes ?? '' }),
    ], ({ status, reference, submittedAt, decisionAt, identity, utilityBill, installationCertificate, bankDetails, notes }) => ({
      status, reference: reference && reference === displayReference(row.reference) ? row.reference : reference,
      submittedAt: toDate(submittedAt), decisionAt: toDate(decisionAt), notes,
      documentChecklist: { identity, utilityBill, installationCertificate, bankDetails },
    }))]
  }
  if (section === 'installations' && row.status !== 'COMPLETED' && can('installations:manage') && !row.startedAt) {
    const appointment = localDateTimeInput(row.scheduledAt)
    return [patch('scheduleJob', row.status === 'SCHEDULED' ? 'Change crew' : 'Schedule crew', '/installations/' + id, [
      { ...choice('technicianIds', 'Technicians', []), source: '/users/options?kind=technician', multiple: true,
        attributes: { defaultValue: row.installationAssignmentsByInstallation?.map(member => member.technicianId) ?? [] } },
      input('scheduledAt', 'Installation appointment', 'datetime-local', { defaultValue: appointment }),
    ], ({ scheduledAt, technicianIds }) => ({
      technicianIds,
      ...(scheduledAt !== appointment && { scheduledAt: toDate(scheduledAt) }),
    }))]
  }
  return []
}



export function recordActions(section, row, capabilities, { detail = false } = {}) {
  const actions = baseRecordActions(section, row, capabilities, detail)
  if (!capabilities.includes('attachments:upload')) return actions
  const evidenceActions = {
    surveys: { type: 'SURVEY', keys: ['record'] },
    tickets: { type: 'TICKET', keys: ['reportRepair', 'closeTicket'] },
  }
  const evidence = evidenceActions[section]
  if (evidence) return actions.map(action => evidence.keys.includes(action.key)
    ? { ...action, evidence: { ownerType: evidence.type, ownerId: row.id } } : action)
  if (section !== 'subsidies' || !capabilities.includes('subsidies:manage')) return actions
  return [...actions, {
    key: 'attach', label: 'Upload evidence', method: 'POST', path: '/attachments',
    fields: [input('file', 'Evidence file', 'file', { accept: '.pdf,.png,.jpg,.jpeg,.webp' })],
    convert: ({ file }) => evidenceBody({ ownerType: 'SUBSIDY', ownerId: row.id }, file),
  }]
}

function evidenceBody({ ownerType, ownerId }, file) {
  const body = new FormData()
  body.set('ownerType', ownerType)
  body.set('ownerId', ownerId)
  body.set('file', file)
  return body
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
    input('name', 'Supplier name'),
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
    choice('role', 'Role', staffRoles),
  ])
  return []
}

function Field({ field, options }) {
  const { name, type, label, attributes = {}, multiple } = field
  const { optional, ...props } = attributes
  const common = { name, required: !optional && (!['validUntil', 'dueAt', 'submittedAt', 'decisionAt'].includes(name)), ...props }
  if (type === 'checkbox') return <label className="check"><input type="checkbox" name={name} {...props} />{label}</label>
  if (type === 'textarea') return <label>{label}<textarea {...common} /></label>
  if (type === 'select') return <label>{label}<select {...common} multiple={multiple} defaultValue={attributes.defaultValue ?? (multiple ? [] : '')}>
    {!multiple && <option value="">{!options.length && field.emptyLabel ? field.emptyLabel : `Choose ${label.toLowerCase()}`}</option>}
    {options.map(option => typeof option === 'string'
      ? <option key={option} value={option}>{option.replaceAll('_', ' ')}</option>
      : <option key={option.id} value={option.id}>
        {field.optionLabel?.(option) ?? (name === 'supplierId' ? displaySupplierName(option) : option.name)}
      </option>)}
  </select></label>
  return <label>{label}<input type={type} {...common} /></label>
}

export function quotationAfterApproval(action, survey, capabilities) {
  if (!['record', 'approve'].includes(action.key) || survey?.status !== 'APPROVED') return null
  return recordActions('surveys', survey, capabilities).find(candidate => candidate.key === 'quote') ?? null
}

export default function WorkflowAction({ action, token, onClose, onSaved }) {
  const navigate = useNavigate()
  const canvas = useRef(null)
  const signature = useRef(null)
  const [signed, setSigned] = useState(false)
  const [paymentRequestId] = useState(() => action.key === 'payment' ? crypto.randomUUID() : undefined)
  const [choices, setChoices] = useState({})
  const [loading, setLoading] = useState(action.fields.some(field => field.source))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [uploaded, setUploaded] = useState('')
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
    if (action.signServiceVisit && !signed) {
      setError('Capture the customer signature to finish this visit.')
      return
    }
    const fileInput = event.currentTarget.elements.namedItem('evidenceFile')
    const evidenceFile = fileInput?.files?.[0]
    const approve = event.nativeEvent.submitter?.value === 'approve'
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
      const body = action.convert(values)
      if (paymentRequestId) body.requestId = paymentRequestId
      if (action.approveOnSubmit && approve) body.approveOnSubmit = true
      if (action.evidence && evidenceFile) {
        await api('/attachments', { token, method: 'POST', body: evidenceBody(action.evidence, evidenceFile) })
        setUploaded(evidenceFile.name)
        fileInput.value = ''
      }
      if (action.signServiceVisit) {
        if (!signature.current) {
          const png = await new Promise(resolve => canvas.current.toBlob(resolve, 'image/png'))
          if (!png) throw new Error('The customer signature could not be saved.')
          const proof = new File([png], 'service-customer-signature.png', { type: 'image/png' })
          const { data } = await api('/attachments', { token, method: 'POST',
            body: evidenceBody(action.signServiceVisit, proof) })
          signature.current = data.id
        }
        body.signatureAttachmentId = signature.current
      }
      const result = await api(action.path, { token, method: action.method, body })
      if (action.successPath) navigate(action.successPath(result.data))
      else onSaved(result.data)
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return <RecordDialog title={action.label} busy={busy} onClose={onClose}>
    <form className="form p-4" onSubmit={submit}>
      {action.description && <p className="text-sm text-gray-600">{action.description}</p>}
      {loading && <p role="status">Loading available options…</p>}
      {!loading && !!action.fields.length && <div className="form-grid">
        {action.fields.map(field => <Field key={field.name} field={field} options={choices[field.name] ?? field.options ?? []} />)}
      </div>}
      {action.evidence && <label>Evidence photo (optional)
        <input name="evidenceFile" type="file" accept=".png,.jpg,.jpeg,.webp" disabled={busy} />
      </label>}
      {uploaded && <p role="status" className="text-sm text-gray-600">Evidence uploaded: {uploaded}</p>}
      {action.signServiceVisit && <fieldset disabled={busy}>
        <legend className="mb-2 text-sm text-gray-600">Ask the customer to sign. Submitting the signed report ends the visit and closes the ticket.</legend>
        <Signature canvas={canvas} disabled={busy} onChange={value => { signature.current = null; setSigned(value) }} />
      </fieldset>}
      {error && <p className="notice" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={action.approveOnSubmit ? 'secondary' : 'primary'} disabled={busy || loading}>
          {busy ? 'Saving…' : action.label}
        </button>
        {action.approveOnSubmit && (
          <button type="submit" value="approve" className="primary" disabled={busy || loading}>Submit and approve</button>
        )}
      </div>
    </form>
  </RecordDialog>
}
