import { Link } from 'react-router-dom'
import { StatusBadge } from '../../components/ui/Badge.jsx'
import { displayReference, formatCurrency, formatDateTime, words } from '../../lib/format.js'

export function Records({ title, entries, empty, children, action }) {
  return (
    <section className="grid gap-4" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        {action}
      </div>
      {entries.length ? entries.map(children) : <p className="rounded-2xl border border-gray-200 bg-white p-6 text-gray-600">{empty}</p>}
    </section>
  )
}

function Card({ reference, status, children }) {
  return (
    <article className="min-w-0 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="break-all text-lg font-semibold">{displayReference(reference)}</h3>
        {status && <StatusBadge status={status} />}
      </header>
      {children}
    </article>
  )
}

function Prices({ lines }) {
  return (
    <ul className="divide-y divide-gray-100 text-sm">
      {lines.map((line, index) => <li key={index} className="flex justify-between gap-3 py-2">
        <span>{line.description} x {line.quantity}</span>
        <span className="shrink-0">{formatCurrency(line.amount ?? line.lineTotal)}</span>
      </li>)}
    </ul>
  )
}

const download = (save, path, title, reference) => <button className="secondary" onClick={() =>
  save(path, displayReference(reference) || title)} type="button">{title}</button>

export function Quotations({ entries, run, save, busy }) {
  return <Records title="My quotations" entries={entries} empty="Your quotation requests will appear here."
    action={<Link className="primary" to="/customer/quotations/new">Request another quote</Link>}>
    {request => <Card key={request.id} reference={request.leadNumber} status={request.status}>
      <p className="text-sm text-gray-600">Requested {formatDateTime(request.createdAt)}</p>
      {request.siteAddress && <p className="text-sm text-gray-600">{request.siteAddress}</p>}
      {request.siteSurveysByLead.map(survey => <p key={survey.id} className="mt-2 text-sm">Survey <StatusBadge status={survey.status} /> {formatDateTime(survey.scheduledAt)}</p>)}
      {request.quotationsByLead.map(quote => <section key={quote.id} className="mt-4 rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="break-all font-semibold">{displayReference(quote.quoteNumber)}</h4>
          <StatusBadge status={quote.status === 'SENT' && quote.validUntil && new Date(quote.validUntil) <= new Date() ? 'EXPIRED' : quote.status} />
        </div>
        <p className="mt-1 text-sm font-medium">{quote.package.name}</p>
        {quote.package.description && <p className="text-sm text-gray-600">{quote.package.description}</p>}
        {quote.validUntil && <p className="text-sm text-gray-600">Valid until {formatDateTime(quote.validUntil)}</p>}
        <Prices lines={quote.pricing.lines} />
        <p className="pt-2 text-sm text-gray-600">Subtotal {formatCurrency(quote.subtotal)} · Tax {formatCurrency(quote.tax)}</p>
        <p className="font-semibold">Total {formatCurrency(quote.total)}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {download(save, '/quotations/' + quote.id + '/pdf', 'Download quotation', quote.quoteNumber)}
          {quote.status === 'SENT' && <>
            {(!quote.validUntil || new Date(quote.validUntil) > new Date()) && <button className="primary" disabled={busy} onClick={() =>
              run('/quotations/' + quote.id + '/decision', { status: 'ACCEPTED' }, 'Quotation accepted and order created.')}>Accept quotation</button>}
            <button className="secondary" disabled={busy} onClick={() =>
              run('/quotations/' + quote.id + '/decision', { status: 'REJECTED' }, 'Quotation declined.')}>Decline quotation</button>
          </>}
        </div>
      </section>)}
    </Card>}
  </Records>
}

export function Orders({ entries, save }) {
  return <Records title="My orders" entries={entries} empty="Confirmed orders will appear here after quotation acceptance.">
    {row => {
      const installation = row.installationByOrder
      const dispatch = row.dispatchesByOrder[0]
      const timeline = [
        ['Order confirmed', row.confirmedAt], ['Dispatched', dispatch?.dispatchedAt],
        ['Delivered', dispatch?.deliveredAt], ['Installation scheduled', installation?.scheduledAt],
        ['Installation started', installation?.startedAt], ['Installation signed off', installation?.signedAt],
      ]
      return <Card key={row.id} reference={row.orderNumber} status={row.status}>
        <p className="font-medium">{row.quotation.package.name}</p>
        <dl className="my-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          {[['Total', row.total], ['Paid', row.paidTotal], ['Outstanding', row.balance]].map(([label, value]) => <div key={label}>
            <dt className="text-gray-600">{label}</dt><dd className="font-semibold">{formatCurrency(value)}</dd>
          </div>)}
        </dl>
        <h4 className="font-semibold">Order progress</h4>
        <ol className="my-3 space-y-3 border-l border-gray-200 pl-4 text-sm">
          {timeline.map(([label, value]) => <li key={label}><span className="font-medium">{label}</span> <span className="text-gray-600">{value ? formatDateTime(value) : row.status === 'CANCELLED' ? 'Not reached' : 'Pending'}</span></li>)}
        </ol>
        {installation?.signedAt && installation.generationReading != null && <p className="text-sm">Recorded generation {installation.generationReading} kW</p>}
        {!!row.paymentsByOrder.length && <details className="mt-4">
          <summary className="cursor-pointer font-semibold">Payments and receipts</summary>
          <ul className="mt-2 grid gap-2">
            {row.paymentsByOrder.map(payment => <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>{formatCurrency(payment.amount)} · {words(payment.method)} · {formatDateTime(payment.receivedAt)}</span>
              {download(save, '/payments/' + payment.id + '/receipt', 'Download receipt', payment.reference)}
            </li>)}
          </ul>
        </details>}
      </Card>
    }}
  </Records>
}

export function Invoices({ entries, save }) {
  return <Records title="My invoices" entries={entries} empty="Issued invoices will appear here.">
    {row => <Card key={row.id} reference={row.invoiceNumber} status={row.status}>
      <p className="text-sm text-gray-600">Issued {formatDateTime(row.issuedAt)}{row.dueAt && ' · Due ' + formatDateTime(row.dueAt)}</p>
      <p className="my-2 font-semibold">{formatCurrency(row.total)}</p>
      <details className="my-3 text-sm">
        <summary className="cursor-pointer font-semibold">Invoice details</summary>
        <Prices lines={row.invoiceLinesByInvoice} />
        <p>Subtotal {formatCurrency(row.subtotal)} · Tax {formatCurrency(row.tax)}</p>
        {row.paidAt && <p>Paid {formatDateTime(row.paidAt)}</p>}
      </details>
      {download(save, '/invoices/' + row.id + '/pdf', 'Download invoice', row.invoiceNumber)}
    </Card>}
  </Records>
}

export function currentWarranty(warranty) {
  if (!warranty || warranty.status === 'PENDING') return null
  if (warranty.status === 'ACTIVE' && new Date(warranty.endAt) <= new Date()) return 'EXPIRED'
  return warranty.status
}

export function Warranties({ entries, save }) {
  return <Records title="My warranties" entries={entries} empty="Equipment and warranties appear after installation sign-off.">
    {row => {
      const warranty = row.warrantyByAsset
      const status = currentWarranty(warranty)
      return <Card key={row.id} reference={row.product.name} status={status}>
        <p className="break-all text-sm text-gray-600">Serial {row.serialNumber}</p>
        {status ? <>
          <p className="my-2 text-sm">{warranty.months} months · {formatDateTime(warranty.startAt)} to {formatDateTime(warranty.endAt)}</p>
          {download(save, '/warranties/' + row.id + '/pdf', 'Download warranty record', row.serialNumber)}
        </> : <p className="mt-2 text-sm text-gray-600">No coverage record for this serial.</p>}
      </Card>
    }}
  </Records>
}

export function ServiceRequests({ entries, assets, busy, run, save, create }) {
  function submit(event) {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    create({ assetId: fields.get('assetId'), description: fields.get('description') }, fields.get('file')).then(saved => {
      if (saved) form.reset()
    })
  }
  return <div className="grid gap-5">
    {assets.length > 0 && <form className="form rounded-2xl border border-gray-200 bg-white p-5" onSubmit={submit}>
      <h2 className="text-xl font-semibold">Raise a service request</h2>
      <label>Equipment<select name="assetId" defaultValue="" required><option value="" disabled>Choose equipment</option>
        {assets.map(asset => <option key={asset.id} value={asset.id}>{asset.product.name} · {asset.serialNumber}</option>)}
      </select></label>
      <label>Describe the issue<textarea name="description" minLength={10} maxLength={2000} required /></label>
      <label>Supporting photo (optional)<input name="file" type="file" accept="image/png,image/jpeg,image/webp" /></label>
      <button className="primary w-fit" disabled={busy}>Submit service request</button>
    </form>}
    <Records title="My service requests" entries={entries} empty="Your service requests will appear here.">
      {row => <Card key={row.id} reference={row.ticketNumber} status={row.status}>
        <p className="whitespace-pre-wrap break-words text-sm">{row.description}</p>
        {row.asset && <p className="mt-2 break-all text-sm text-gray-600">{row.asset.product.name} · {row.asset.serialNumber}</p>}
        <p className="mt-2 text-sm text-gray-600">Updated {formatDateTime(row.updatedAt)}</p>
        {row.resolvedAt && <p className="text-sm text-gray-600">Resolved {formatDateTime(row.resolvedAt)}</p>}
        {row.confirmedAt && <p className="text-sm text-gray-600">Confirmed {formatDateTime(row.confirmedAt)}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {row.photos.map(photo => <button key={photo.id} type="button" className="secondary" onClick={() => save('/photos/' + photo.id, photo.originalName, false)}>Download photo</button>)}
          {row.status === 'RESOLVED_PENDING_CONFIRMATION' && <button className="primary" disabled={busy} onClick={() =>
            run('/tickets/' + row.id + '/confirm', undefined, 'Resolution confirmed.')}>Confirm resolution</button>}
        </div>
        {row.status !== 'CLOSED' && <form className="form mt-3" onSubmit={event => {
          event.preventDefault()
          const form = event.currentTarget
          run('/tickets/' + row.id + '/photo', new FormData(form), 'Photo uploaded.').then(saved => { if (saved) form.reset() })
        }}>
          <label>Add a photo<input name="file" type="file" accept="image/png,image/jpeg,image/webp" required /></label>
          <button className="secondary w-fit" disabled={busy}>Upload photo</button>
        </form>}
      </Card>}
    </Records>
  </div>
}
