import { useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api.js'
import { ErrorState } from '../../components/ui/States.jsx'
import { displayContactEmail, displayPackageDescription, displayReference } from '../../lib/format.js'
import { Link } from 'react-router-dom'
import WorkflowAction, { recordActions } from './WorkflowAction.jsx'
import { TrackingLink } from './TrackingLink.jsx'

const localDate = value => value ? new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata',
}).format(new Date(value)) : ''
const money = value => value == null ? '' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value))
const state = value => value?.toLowerCase().replaceAll('_', ' ')
const activity = items => (items ?? []).map(item => [localDate(item.createdAt), item.notes ?? state(item.action)])
const lines = rows => rows?.map(row => [
  row.descriptionSnapshot ?? row.description,
  row.quantity,
  row.lineKind === 'MATERIAL' && row.lineTotal != null && Number(row.lineTotal) === 0
    ? 'Included in package'
    : money(row.lineTotal),
])
const assignment = rows => rows.map(row => [row.technician.name, localDate(row.assignedAt)])
const evidenceName = item => item.id.startsWith('DEMO-')
  ? item.originalName.replace(/-demo(?=\.png$)/, '')
  : item.originalName
const definition = {
  assets: row => ({
    title: row.asset.serialNumber, fields: [
      ['Product', row.asset.product.name], ['Status', state(row.asset.status)], ['Customer', row.asset.customer?.name],
      ['Order', displayReference(row.asset.order?.orderNumber)], ['Warranty active', row.coveredAsOf ? 'Yes' : 'No'],
      ['Warranty starts', localDate(row.warranty?.startAt)], ['Warranty ends', localDate(row.warranty?.endAt)],
    ],
  }),
  leads: row => ({
    title: row.customer.name,
    fields: [['Reference', displayReference(row.leadNumber)], ['Status', state(row.status)], ['Phone', row.customer.phone],
      ['Address', row.customer.address], ['Roof area', row.roofArea && row.roofArea + ' m²'], ['Monthly bill', money(row.monthlyBill)], ['Notes', row.notes]],
    groups: [['Activity', ['At', 'Notes'], activity(row.leadActivitiesByLead)]],
  }),
  customers: row => ({
    title: row.name, fields: [['Phone', row.phone], ['Email', displayContactEmail(row.email)], ['Address', row.address]],
    groups: [
      ['Enquiries', ['Reference', 'Status', 'Received'], row.leadsByCustomer?.map(event => [displayReference(event.leadNumber), state(event.status), localDate(event.createdAt)])],
      ['Orders', ['Reference', 'Status', 'Confirmed'], row.ordersByCustomer?.map(event => [displayReference(event.orderNumber), state(event.status), localDate(event.confirmedAt)])],
      ['Tickets', ['Reference', 'Status', 'Reported'], row.serviceTicketsByCustomer?.map(event => [displayReference(event.ticketNumber), state(event.status), localDate(event.incidentAt)])],
    ],
  }),
  surveys: row => ({
    title: 'Survey for ' + row.lead.customer.name,
    fields: [['Status', state(row.status)], ['Appointment', localDate(row.scheduledAt)], ['Visited', localDate(row.visitedAt)],
      ['Roof direction', row.roofDirection], ['Tilt (degrees)', row.tiltDegrees], ['Cable run (m)', row.cableDistanceMeters],
      ['Shadow-free area (m²)', row.shadowFreeArea], ['Findings', row.findings], ['Review note', row.rejectionReason]], attachments: row.attachments,
  }),
  packages: row => ({
    title: row.name, fields: [['Code', displayReference(row.code)], ['Capacity', row.capacityKw && row.capacityKw + ' kW'],
      ['Base price', money(row.basePrice)], ['Description', displayPackageDescription(row.description)]],
    groups: [['Bill of materials', ['Product', 'SKU', 'Quantity'],
      row.packageComponentsByPackage.map(item => [item.product.name, displayReference(item.product.sku), item.quantity])]],
  }),
  quotes: row => ({
    title: 'Quotation for ' + row.lead.customer.name,
    fields: [['Reference', displayReference(row.quoteNumber)], ['Status', state(row.status)], ['Valid until', localDate(row.validUntil)]],
    groups: [['Quotation lines', ['Description', 'Quantity', 'Amount'],
      row.pricing?.lines.map(line => [line.description, line.quantity, money(line.amount)]) ?? lines(row.quotationLinesByQuotation),
      {
        description: row.pricing?.packageName && `Product amounts are shares of the ${row.pricing.packageName} package price.`,
        totals: [['Subtotal', money(row.subtotal)], ['Tax', money(row.tax)], ['Grand total', money(row.total)]],
      }],
      ['History', ['At', 'Action'], activity(row.timeline)]],
  }),
  orders: row => ({
    title: 'Order for ' + row.customer.name,
    fields: [['Reference', displayReference(row.orderNumber)], ['Quotation', displayReference(row.quotation?.quoteNumber)], ['Status', state(row.status)], ['Total', money(row.total)],
      ['Paid', money(row.paidTotal)], ['Remaining', row.status === 'CANCELLED' ? '—' : money(row.balance)],
      ['Confirmed', localDate(row.confirmedAt)], ['Installation', state(row.installationByOrder?.status)]],
    groups: [['Order lines', ['Description', 'Quantity', 'Total'], lines(row.orderLinesByOrder)],
      ['Dispatches', ['Reference', 'Status', 'Delivered'], row.dispatchesByOrder.map(item =>
        [displayReference(item.dispatchNumber), state(item.status), localDate(item.deliveredAt)])]],
  }),
  dispatches: row => ({
    title: 'Dispatch for ' + row.order.customer.name,
    fields: [['Reference', displayReference(row.dispatchNumber)], ['Order', displayReference(row.order.orderNumber)], ['Status', state(row.status)], ['Recipient', row.recipientName],
      ['Dispatched', localDate(row.dispatchedAt)], ['Delivered', localDate(row.deliveredAt)]],
    groups: [['Required materials', ['Description', 'Quantity'], row.order.orderLinesByOrder
      .filter(item => item.lineKind === 'MATERIAL' && item.productId)
      .map(item => [item.descriptionSnapshot, item.quantity])],
      ['Allocated materials', ['Product', 'Quantity', 'Serial number'], row.dispatchItemsByDispatch.map(item => [
        item.product.name, item.quantity, item.asset?.serialNumber ?? (item.product.serialized ? 'Missing serial' : 'Not serialized'),
      ])]],
  }),
  installations: row => ({
    title: 'Installation for ' + row.order.customer.name,
    fields: [['Status', state(row.status)], ['Scheduled', localDate(row.scheduledAt)], ['Started', localDate(row.startedAt)],
      ['Finished', localDate(row.finishedAt)], ['Signed by', row.customerSignerName], ['Signed at', localDate(row.signedAt)]],
    groups: [['Crew', ['Technician', 'Assigned'], assignment(row.installationAssignmentsByInstallation)]], attachments: row.attachments,
  }),
  tickets: row => ({
    title: 'Ticket for ' + row.customer.name,
    fields: [['Reference', displayReference(row.ticketNumber)], ['Status', state(row.status)], ['Serial', row.asset?.serialNumber],
      ['Coverage', state(row.coverageDecision)], ['Assigned to', row.assignedTo?.name], ['Reported', localDate(row.incidentAt)],
      ['Description', row.description], ['Labour charge', money(row.laborCharge)], ['Invoice', displayReference(row.invoiceByTicket?.invoiceNumber)],
      ['Confirmation', row.customerConfirmationName]],
    groups: [['Parts', ['Product', 'Quantity', 'Unit charge'], row.ticketPartsByTicket.map(part => [part.product.name, part.quantity, money(part.chargeSnapshot)])],
      ['History', ['At', 'Action'], activity(row.timeline)]], attachments: row.attachments,
  }),
  subsidies: row => ({
    title: 'Subsidy for ' + row.order.customer.name,
    fields: [['Order', displayReference(row.order.orderNumber)], ['Reference', displayReference(row.reference)], ['Status', state(row.status)],
      ['Submitted', localDate(row.submittedAt)], ['Decision', localDate(row.decisionAt)], ['Notes', row.notes]],
    attachments: row.attachments,
  }),
  invoices: row => ({
    title: 'Invoice for ' + row.customer.name,
    fields: [['Reference', displayReference(row.invoiceNumber)], ['Status', state(row.status)], ['Subtotal', money(row.subtotal)], ['Tax', money(row.tax)],
      ['Total', money(row.total)], ['Due', localDate(row.dueAt)]],
    groups: [['Invoice lines', ['Description', 'Quantity', 'Total'], lines(row.invoiceLinesByInvoice)]],
  }),
}

export const hasDetail = section => Object.hasOwn(definition, section)

export default function RecordDetail({ section, id, token, capabilities, backLabel, onBack }) {
  const [state, setState] = useState({})
  const [retry, setRetry] = useState(0)
  const [mediaError, setMediaError] = useState('')
  const [creatingOrder, setCreatingOrder] = useState(false)
  const backButton = useRef(null)

  useEffect(() => {
    backButton.current.focus({ preventScroll: true })
    backButton.current.scrollIntoView({ block: 'nearest' })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const path = '/' + section + '/' + encodeURIComponent(id) + (section === 'assets' ? '/warranty' : '')
    api(path, { token, signal: controller.signal })
      .then(({ data }) => {
        if (!controller.signal.aborted) {
          setState({ data: definition[section](data), quote: section === 'quotes' ? data : undefined })
        }
      })
      .catch(error => { if (!controller.signal.aborted) setState({ error: error.message }) })
    return () => controller.abort()
  }, [section, id, token, retry])

  function retryDetails() {
    setState({})
    setRetry(value => value + 1)
  }

  async function download(item) {
    setMediaError('')
    try {
      const file = await api('/attachments/' + item.id, { token, download: true })
      const url = URL.createObjectURL(file)
      const link = document.createElement('a')
      link.href = url
      link.download = evidenceName(item)
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      setMediaError(error.message)
    }
  }

  const data = state.data
  const order = state.quote?.orderByQuotation
  const createOrder = state.quote && recordActions('quotes', state.quote, capabilities)
    .find(action => action.key === 'order')
  return <section aria-labelledby="record-detail-heading" className="min-w-0 rounded-2xl border border-gray-100 bg-white shadow-2xs">
    <header className="grid gap-3 border-b border-gray-100 p-4 sm:p-5">
      <button type="button" ref={backButton} className="secondary justify-self-start" onClick={onBack}>
        <span aria-hidden="true" className="mr-1.5">←</span>{backLabel}
      </button>
      <h1 id="record-detail-heading" className="break-words text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">
        {data?.title ?? 'Record details'}
      </h1>
      {order && capabilities.includes('orders:read') && (
        <Link className="secondary justify-self-start" to={'/orders/' + encodeURIComponent(order.id)}>
          View order {displayReference(order.orderNumber)}
        </Link>
      )}
      {createOrder && (
        <button type="button" className="primary justify-self-start" onClick={() => setCreatingOrder(true)}>
          Create order
        </button>
      )}
      {data && section === 'orders' && capabilities.includes('orders:share_tracking') && (
        <TrackingLink id={id} token={token} />
      )}
    </header>
    {state.error && <ErrorState message={state.error} onRetry={retryDetails} className="m-4" />}
    {!data && !state.error && <p className="feedback" role="status">Loading details…</p>}
    {data && <div className="grid gap-5 p-4">
      <dl className="form-grid">{data.fields.filter(([, value]) => value != null && value !== '').map(([label, value]) =>
        <div key={label} className="min-w-0"><dt className="text-sm font-semibold text-slate-600">{label}</dt><dd className="break-words">{value}</dd></div>)}</dl>
      {data.groups?.filter(([, , rows, summary]) => rows?.length || summary?.totals).map(([label, columns, rows, summary]) => <section key={label} className="overflow-x-auto">
        <h2 className="mb-2 font-semibold">{label}</h2>
        {summary?.description && <p className="mb-3 text-sm text-gray-600">{summary.description}</p>}
        <table aria-label={label}><thead><tr>{columns.map(column => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>{rows?.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
          {summary?.totals && <tfoot className="border-t border-gray-200 bg-gray-50">
            {summary.totals.map(([name, amount]) => (
              <tr key={name}>
                <th scope="row" colSpan={columns.length - 1} className="text-right">{name}</th>
                <td className="font-semibold">{amount}</td>
              </tr>
            ))}
          </tfoot>}
        </table>
      </section>)}
      {data.attachments?.length > 0 && <div><h2 className="mb-2 font-semibold">Evidence</h2>
        {data.attachments.map(item => <button className="secondary mb-1 mr-1" key={item.id} onClick={() => download(item)}>{evidenceName(item)}</button>)}</div>}
      {mediaError && <p className="notice" role="alert">{mediaError}</p>}
    </div>}
    {createOrder && creatingOrder && (
      <WorkflowAction action={createOrder} token={token} onClose={() => setCreatingOrder(false)} />
    )}
  </section>
}
