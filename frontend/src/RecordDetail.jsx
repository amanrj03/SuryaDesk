import { useEffect, useState } from 'react'
import { api } from './api.js'

const localDate = value => value ? new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata',
}).format(new Date(value)) : ''
const money = value => value == null ? '' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value))
const state = value => value?.toLowerCase().replaceAll('_', ' ')
const activity = items => (items ?? []).map(item => [localDate(item.createdAt), item.notes ?? state(item.action)])
const lines = rows => rows?.map(row => [row.descriptionSnapshot ?? row.description, row.quantity, money(row.lineTotal)])
const assignment = rows => rows.map(row => [row.technician.name, localDate(row.assignedAt)])
const definition = {
  assets: row => ({
    title: row.asset.serialNumber, fields: [
      ['Product', row.asset.product.name], ['Status', state(row.asset.status)], ['Customer', row.asset.customer?.name],
      ['Order', row.asset.order?.orderNumber], ['Warranty active', row.coveredAsOf ? 'Yes' : 'No'],
      ['Warranty starts', localDate(row.warranty?.startAt)], ['Warranty ends', localDate(row.warranty?.endAt)],
    ],
  }),
  leads: row => ({
    title: row.customer.name,
    fields: [['Reference', row.leadNumber], ['Status', state(row.status)], ['Phone', row.customer.phone],
      ['Address', row.customer.address], ['Roof area', row.roofArea && row.roofArea + ' m²'], ['Monthly bill', money(row.monthlyBill)], ['Notes', row.notes]],
    groups: [['Activity', ['At', 'Notes'], activity(row.leadActivitiesByLead)]],
  }),
  customers: row => ({
    title: row.name, fields: [['Phone', row.phone], ['Email', row.email], ['Address', row.address]],
    groups: [
      ['Enquiries', ['Reference', 'Status', 'Received'], row.leadsByCustomer?.map(event => [event.leadNumber, state(event.status), localDate(event.createdAt)])],
      ['Orders', ['Reference', 'Status', 'Confirmed'], row.ordersByCustomer?.map(event => [event.orderNumber, state(event.status), localDate(event.confirmedAt)])],
      ['Tickets', ['Reference', 'Status', 'Reported'], row.serviceTicketsByCustomer?.map(event => [event.ticketNumber, state(event.status), localDate(event.incidentAt)])],
    ],
  }),
  surveys: row => ({
    title: 'Survey for ' + row.lead.customer.name,
    fields: [['Status', state(row.status)], ['Appointment', localDate(row.scheduledAt)], ['Visited', localDate(row.visitedAt)],
      ['Roof direction', row.roofDirection], ['Tilt (degrees)', row.tiltDegrees], ['Cable run (m)', row.cableDistanceMeters],
      ['Shadow-free area (m²)', row.shadowFreeArea], ['Findings', row.findings], ['Review note', row.rejectionReason]], attachments: row.attachments,
  }),
  packages: row => ({
    title: row.name, fields: [['Code', row.code], ['Capacity', row.capacityKw && row.capacityKw + ' kW'],
      ['Base price', money(row.basePrice)], ['Description', row.description]],
    groups: [['Bill of materials', ['Product', 'SKU', 'Quantity'],
      row.packageComponentsByPackage.map(item => [item.product.name, item.product.sku, item.quantity])]],
  }),
  quotes: row => ({
    title: 'Quotation for ' + row.lead.customer.name,
    fields: [['Reference', row.quoteNumber], ['Status', state(row.status)], ['Subtotal', money(row.subtotal)],
      ['Tax', money(row.tax)], ['Total', money(row.total)], ['Valid until', localDate(row.validUntil)]],
    groups: [['Quotation lines', ['Description', 'Quantity', 'Total'], lines(row.quotationLinesByQuotation)],
      ['History', ['At', 'Action'], activity(row.timeline)]],
  }),
  orders: row => ({
    title: 'Order for ' + row.customer.name,
    fields: [['Reference', row.orderNumber], ['Status', state(row.status)], ['Total', money(row.total)],
      ['Confirmed', localDate(row.confirmedAt)], ['Installation', state(row.installationByOrder?.status)]],
    groups: [['Order lines', ['Description', 'Quantity', 'Total'], lines(row.orderLinesByOrder)],
      ['Dispatches', ['Reference', 'Status', 'Delivered'], row.dispatchesByOrder.map(item =>
        [item.dispatchNumber, state(item.status), localDate(item.deliveredAt)])]],
  }),
  dispatches: row => ({
    title: 'Dispatch for ' + row.order.customer.name,
    fields: [['Reference', row.dispatchNumber], ['Status', state(row.status)], ['Recipient', row.recipientName],
      ['Dispatched', localDate(row.dispatchedAt)], ['Delivered', localDate(row.deliveredAt)]],
    groups: [['Required materials', ['Description', 'Quantity', 'Total'], lines(row.order.orderLinesByOrder.filter(item => item.lineKind === 'MATERIAL'))],
      ['Allocated materials', ['Product', 'Quantity', 'Serial'], row.dispatchItemsByDispatch.map(item => [
        item.product.name, item.quantity, item.asset?.serialNumber,
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
    fields: [['Reference', row.ticketNumber], ['Status', state(row.status)], ['Serial', row.asset?.serialNumber],
      ['Coverage', state(row.coverageDecision)], ['Assigned to', row.assignedTo?.name], ['Reported', localDate(row.incidentAt)],
      ['Description', row.description], ['Labour charge', money(row.laborCharge)], ['Invoice', row.invoiceByTicket?.invoiceNumber],
      ['Confirmation', row.customerConfirmationName]],
    groups: [['Parts', ['Product', 'Quantity', 'Unit charge'], row.ticketPartsByTicket.map(part => [part.product.name, part.quantity, money(part.chargeSnapshot)])],
      ['History', ['At', 'Action'], activity(row.timeline)]], attachments: row.attachments,
  }),
  subsidies: row => ({
    title: 'Subsidy for ' + row.order.customer.name,
    fields: [['Order', row.order.orderNumber], ['Reference', row.reference], ['Status', state(row.status)],
      ['Submitted', localDate(row.submittedAt)], ['Decision', localDate(row.decisionAt)], ['Notes', row.notes]],
    attachments: row.attachments,
  }),
  invoices: row => ({
    title: 'Invoice for ' + row.customer.name,
    fields: [['Reference', row.invoiceNumber], ['Status', state(row.status)], ['Subtotal', money(row.subtotal)], ['Tax', money(row.tax)],
      ['Total', money(row.total)], ['Due', localDate(row.dueAt)]],
    groups: [['Invoice lines', ['Description', 'Quantity', 'Total'], lines(row.invoiceLinesByInvoice)]],
  }),
}

export const hasDetail = section => Object.hasOwn(definition, section)

export default function RecordDetail({ section, id, token, onClose }) {
  const [state, setState] = useState({})
  const [mediaError, setMediaError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    const path = section === 'assets' ? '/assets/' + encodeURIComponent(id) + '/warranty' : '/' + section + '/' + id
    api(path, { token, signal: controller.signal })
      .then(({ data }) => setState({ data: definition[section](data) }))
      .catch(error => { if (!controller.signal.aborted) setState({ error: error.message }) })
    return () => controller.abort()
  }, [section, id, token])

  async function download(item) {
    setMediaError('')
    try {
      const file = await api('/attachments/' + item.id, { token, download: true })
      const url = URL.createObjectURL(file)
      const link = document.createElement('a')
      link.href = url
      link.download = item.originalName
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      setMediaError(error.message)
    }
  }

  const data = state.data
  return <section className="lead-editor">
    <div className="toolbar items-center"><h2>{data?.title ?? 'Record details'}</h2>
      <button className="secondary ml-auto" onClick={onClose}>Close</button></div>
    {state.error && <p className="notice m-4" role="alert">{state.error}</p>}
    {!data && !state.error && <p className="feedback" role="status">Loading details…</p>}
    {data && <div className="grid gap-5 p-4">
      <dl className="form-grid">{data.fields.filter(([, value]) => value != null && value !== '').map(([label, value]) =>
        <div key={label} className="min-w-0"><dt className="text-sm font-semibold text-slate-600">{label}</dt><dd className="break-words">{value}</dd></div>)}</dl>
      {data.groups?.filter(([, , rows]) => rows?.length).map(([label, columns, rows]) => <section key={label} className="overflow-x-auto">
        <h3 className="mb-2 font-semibold">{label}</h3>
        <table><thead><tr>{columns.map(column => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
        </table>
      </section>)}
      {data.attachments?.length > 0 && <div><h3 className="mb-2 font-semibold">Evidence</h3>
        {data.attachments.map(item => <button className="secondary mb-1 mr-1" key={item.id} onClick={() => download(item)}>{item.originalName}</button>)}</div>}
      {mediaError && <p className="notice" role="alert">{mediaError}</p>}
    </div>}
  </section>
}
