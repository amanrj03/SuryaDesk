import { Link } from 'react-router-dom'
import { ArrowTrendingUpIcon, CubeIcon, ClipboardDocumentCheckIcon, WalletIcon } from '@heroicons/react/24/outline'

const groups = [
  { title: 'Sales in this period', icon: ArrowTrendingUpIcon, metrics: [
    ['customers', 'New customers', '/customers'], ['enquiries', 'Enquiries', '/leads'],
    ['quotations', 'Quotations created', '/quotes'], ['acceptedQuotations', 'Quotations accepted', '/quotes'],
    ['orders', 'Orders confirmed', '/orders'],
  ] },
  { title: 'Current work queues', icon: ClipboardDocumentCheckIcon, metrics: [
    ['totalCustomers', 'Total customers', '/customers'], ['activeProjects', 'Active projects', '/orders'], ['pendingSurveys', 'Pending surveys', '/surveys'],
    ['pendingInstallations', 'Pending installations', '/installations'], ['openTickets', 'Open service tickets', '/tickets'],
    ['pendingSubsidies', 'Pending subsidies', '/subsidies'],
  ] },
]

const count = new Intl.NumberFormat('en-IN')
const date = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })
const label = value => value.replaceAll('_', ' ').toLowerCase().replace(/^./, letter => letter.toUpperCase())
const entity = value => value.replace(/([a-z])([A-Z])/g, '$1 $2')

function Card({ title, value, to }) {
  return <article className="min-w-0 rounded-2xl border border-sky-100 bg-white p-4 shadow-sm">
    <h3 className="text-sm font-semibold text-slate-600">{to ? <Link className="hover:text-blue-700 hover:underline" to={to}>{title}</Link> : title}</h3>
    <p className="mt-2 break-words text-xl font-bold tracking-tight text-slate-900">{value}</p>
  </article>
}

function RevenueChart({ series, money }) {
  const peak = Math.max(1, ...series.flatMap(day => [Number(day.revenue), Number(day.expenses)]))
  return <section className="min-w-0 rounded-2xl border border-sky-100 bg-white p-5 shadow-sm" aria-labelledby="admin-finance-chart">
    <h2 id="admin-finance-chart">Revenue and expenses</h2>
    <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-700">
      <span><span className="mr-1 inline-block size-2.5 rounded-sm bg-blue-700" />Contract revenue</span>
      <span><span className="mr-1 inline-block size-2.5 rounded-sm bg-amber-500" />Recorded expenses</span>
    </div>
    {series.length ? <div className="mt-5 overflow-x-auto">
      <div className="flex h-44 gap-2 border-b border-slate-200" style={{ minWidth: series.length * 14 }}>
        {series.map(day => <div key={day.date} className="flex min-w-2 flex-1 items-end gap-px"
          title={day.date + ' | revenue ' + money(day.revenue) + ' | expenses ' + money(day.expenses)}>
          <span className="sr-only">{day.date} revenue {money(day.revenue)}, expenses {money(day.expenses)}</span>
          <div className="w-1/2 rounded-t bg-blue-700" style={{ height: Number(day.revenue) / peak * 100 + '%' }} />
          <div className="w-1/2 rounded-t bg-amber-500" style={{ height: Number(day.expenses) / peak * 100 + '%' }} />
        </div>)}
      </div>
      <div className="mt-2 flex justify-between gap-2 text-xs text-slate-600">
        <span>{series[0].date}</span><span>{series.at(-1).date}</span>
      </div>
    </div> : <p className="mt-4 text-sm text-slate-600">No revenue or expenses recorded in this period.</p>}
  </section>
}

export default function AdminOverview({ data, money }) {
  const total = data.projectStatuses.reduce((sum, row) => sum + row._count._all, 0)
  return <div className="grid gap-5 p-4 sm:p-7">
    <section aria-labelledby="admin-financial-summary">
      <h2 id="admin-financial-summary" className="mb-3 flex items-center gap-2"><WalletIcon className="size-5 text-blue-700" />Financial summary</h2>
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-3">
        <Card title="Contract revenue in period" value={money(data.revenue)} />
        <Card title="Recorded expenses in period" value={money(data.expenses)} />
        <Card title="Outstanding customer payments" value={money(data.outstandingCustomerPayments)} to="/orders" />
      </div>
      <p className="mt-2 text-sm text-slate-600">Expenses include dispatched materials, recorded labour, job costs, and service parts. Inventory purchases are shown separately below. Outstanding payments include unpaid order balances and issued service invoices.</p>
    </section>
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
      <RevenueChart series={data.series} money={money} />
      <section className="min-w-0 rounded-2xl border border-sky-100 bg-white p-5 shadow-sm" aria-labelledby="project-distribution">
        <h2 id="project-distribution">Project status distribution</h2>
        <p className="mt-1 text-sm text-slate-600">Current statuses of orders confirmed in this period.</p>
        {total ? <ul className="mt-4 grid gap-3">
          {data.projectStatuses.map(row => <li key={row.status}>
            <div className="flex justify-between gap-2 text-sm"><span>{label(row.status)}</span><strong>{count.format(row._count._all)}</strong></div>
            <div className="mt-1 h-2 rounded-full bg-sky-100">
              <div className="h-full rounded-full bg-blue-600" style={{ width: row._count._all / total * 100 + '%' }} />
            </div>
          </li>)}
        </ul> : <p className="mt-4 text-sm text-slate-600">No projects were confirmed in this period.</p>}
      </section>
    </div>
    {groups.map(({ title, icon: Icon, metrics }) => <section key={title}>
      <h2 className="mb-3 flex items-center gap-2"><Icon className="size-5 text-blue-700" />{title}</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-5">
        {metrics.map(([key, name, to]) => <Card key={key} title={name} value={count.format(data[key])} to={to} />)}
        {title === 'Current work queues' && <Card title="Tickets resolved in period" value={count.format(data.resolvedTickets)} to="/tickets" />}
      </div>
    </section>)}
    <div className="grid min-w-0 gap-4 xl:grid-cols-2">
      <section className="min-w-0 rounded-2xl border border-sky-100 bg-white p-5 shadow-sm" aria-labelledby="admin-stock">
        <h2 id="admin-stock" className="flex items-center gap-2"><CubeIcon className="size-5 text-blue-700" />Inventory summary</h2>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          {[
            ['Active products', data.inventory.products], ['On hand', data.inventory.onHand],
            ['Reserved', data.inventory.reserved], ['Low-stock products', data.inventory.lowStock],
          ].map(([name, value]) => <div className="rounded-xl bg-sky-50 p-3" key={name}>
            <dt className="text-slate-600">{name}</dt><dd className="mt-1 font-bold">{count.format(value)}</dd>
          </div>)}
        </dl>
        {data.lowStockItems.length ? <ul className="mt-4 divide-y divide-slate-100">
          {data.lowStockItems.map(row => <li key={row.id} className="flex justify-between gap-3 py-2 text-sm">
            <span>{row.name}<span className="block text-xs text-slate-600">{row.sku}</span></span>
            <span className="shrink-0 font-semibold text-amber-800">{row.available} of {row.reorderLevel}</span>
          </li>)}
        </ul> : <p className="mt-4 text-sm text-slate-600">No active products are at or below their reorder point.</p>}
        <Link className="mt-3 inline-block text-sm font-semibold text-blue-700 hover:underline" to="/inventory">Open inventory</Link>
      </section>
      <section className="min-w-0 rounded-2xl border border-sky-100 bg-white p-5 shadow-sm" aria-labelledby="admin-recent-activity">
        <h2 id="admin-recent-activity">Recent business activity</h2>
        {data.activity.length ? <ul className="mt-3 divide-y divide-slate-100">
          {data.activity.map(row => <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2 text-sm">
            <span><strong>{entity(row.entityType)}</strong> · {label(row.action)}
              {row.actor && <span className="block text-xs text-slate-600">{row.actor.name}</span>}</span>
            <time className="text-xs text-slate-600" dateTime={row.createdAt}>{date.format(new Date(row.createdAt))}</time>
          </li>)}
        </ul> : <p className="mt-4 text-sm text-slate-600">No business activity was logged in this period.</p>}
      </section>
    </div>
  </div>
}
