import { Link } from 'react-router-dom'
import {
  ArrowTrendingUpIcon,
  CubeIcon,
  ClipboardDocumentCheckIcon,
  WalletIcon,
  StarIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  ArrowUpRightIcon,
} from '@heroicons/react/24/outline'
import { Card, InkCard, Panel, ListRow, AccentCard } from './components/ui/Surface.jsx'
import { Badge, Chip } from './components/ui/Badge.jsx'
import { Avatar } from './components/ui/Avatar.jsx'
import { splitCurrency, formatCompactCurrency } from './lib/format.js'

const groups = [
  {
    title: 'Sales in this period',
    icon: ArrowTrendingUpIcon,
    metrics: [
      ['customers', 'New customers', '/customers'],
      ['enquiries', 'Enquiries', '/leads'],
      ['quotations', 'Quotations created', '/quotes'],
      ['acceptedQuotations', 'Quotations accepted', '/quotes'],
      ['orders', 'Orders confirmed', '/orders'],
    ],
  },
  {
    title: 'Current work queues',
    icon: ClipboardDocumentCheckIcon,
    metrics: [
      ['totalCustomers', 'Total customers', '/customers'],
      ['activeProjects', 'Active projects', '/orders'],
      ['pendingSurveys', 'Pending surveys', '/surveys'],
      ['pendingInstallations', 'Pending installations', '/installations'],
      ['openTickets', 'Open service tickets', '/tickets'],
      ['pendingSubsidies', 'Pending subsidies', '/subsidies'],
    ],
  },
]

const count = new Intl.NumberFormat('en-IN')
const date = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Kolkata',
})
const label = (value) =>
  value?.replaceAll('_', ' ').toLowerCase().replace(/^./, (letter) => letter.toUpperCase()) || '—'
const entity = (value) => value?.replace(/([a-z])([A-Z])/g, '$1 $2') || ''

function MetricCard({ title, value, subtitle }) {
  return (
    <article className="min-w-0 rounded-2xl border border-gray-100 bg-white p-3.5 shadow-2xs transition hover:border-gray-200">
      <h3 className="text-[11px] font-semibold text-gray-500">{title}</h3>
      <p className="mt-1.5 break-words text-xl font-bold tracking-tight text-gray-900">{value}</p>
      {subtitle && <p className="mt-1 text-[10px] text-gray-400">{subtitle}</p>}
    </article>
  )
}

function RevenueChart({ series = [], money }) {
  const peak = Math.max(1, ...series.flatMap((day) => [Number(day.revenue), Number(day.expenses)]))

  return (
    <Panel className="flex flex-col justify-between" aria-labelledby="admin-finance-chart">
      <div>
        <div className="flex items-center justify-between">
          <h2 id="admin-finance-chart" className="text-xs font-bold text-gray-900">
            Revenue and expenses
          </h2>
          <div className="flex items-center gap-3 text-[10px] font-medium text-gray-500">
            <span className="flex items-center gap-1">
              <span className="inline-block size-2 rounded-xs bg-black" />
              Contract revenue
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block size-2 rounded-xs bg-[#E62E6B]" />
              Expenses
            </span>
          </div>
        </div>

        {series.length ? (
          <div className="mt-4 overflow-x-auto scrollbar-thin">
            <div
              className="flex h-36 items-end gap-1.5 border-b border-gray-200/70 pb-0.5"
              style={{ minWidth: Math.max(series.length * 16, 280) }}
            >
              {series.map((day) => (
                <div
                  key={day.date}
                  className="group flex min-w-3 flex-1 flex-col items-center justify-end gap-0.5 h-full"
                  title={`${day.date} | revenue ${money(day.revenue)} | expenses ${money(day.expenses)}`}
                >
                  <span className="sr-only">
                    {day.date} revenue {money(day.revenue)}, expenses {money(day.expenses)}
                  </span>
                  <div className="flex items-end gap-0.5 w-full justify-center h-full">
                    <div
                      className="w-1.5 rounded-t-xs bg-black transition-colors group-hover:bg-gray-700"
                      style={{ height: `${(Number(day.revenue) / peak) * 100}%` }}
                    />
                    <div
                      className="w-1.5 rounded-t-xs bg-[#E62E6B] transition-colors group-hover:bg-[#D0255E]"
                      style={{ height: `${(Number(day.expenses) / peak) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex justify-between gap-2 text-[10px] text-gray-400">
              <span>{series[0]?.date}</span>
              <span>{series.at(-1)?.date}</span>
            </div>
          </div>
        ) : (
          <p className="mt-6 text-center text-xs text-gray-400">
            No revenue or expenses recorded in this period.
          </p>
        )}
      </div>
    </Panel>
  )
}

export default function AdminOverview({ data, money }) {
  const total = data.projectStatuses?.reduce((sum, row) => sum + row._count._all, 0) ?? 0
  const splitRev = splitCurrency(data.revenue)

  return (
    <div className="flex flex-col gap-5">
      {/* -------------------------------------------------------------
          Headline Metrics Section matching Inspiration Layout
      ------------------------------------------------------------- */}
      <section aria-labelledby="admin-financial-summary" className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <h2 id="admin-financial-summary" className="sr-only">
          Financial summary
        </h2>

        {/* Big Headline Revenue Panel on the Left (col-span-5) */}
        <Panel className="flex flex-col justify-between p-5 lg:col-span-5">
          <div>
            <div className="mb-1 text-[11px] font-semibold text-gray-500">Contract revenue in period</div>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">
                {splitRev.whole}
                <span className="text-gray-400 font-medium">{splitRev.fraction}</span>
              </span>
              <Badge tone="accent">
                {data.revenue >= (data.expenses ?? 0) ? 'Profitable' : 'Deficit'}
              </Badge>
            </div>
            <p className="mt-2 text-[11px] text-gray-500">
              Expenses include dispatched materials, recorded labour, job costs, and service parts.
            </p>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200/60 pt-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-400">Expenses:</span>
              <span className="font-bold text-gray-800">{money(data.expenses)}</span>
            </div>
            <Link
              to="/orders"
              className="text-[11px] font-semibold text-[#E62E6B] hover:underline"
            >
              View orders →
            </Link>
          </div>
        </Panel>

        {/* 4 Cards Grid on the Right (col-span-7) */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-7">
          <Card className="flex flex-col justify-between p-3.5">
            <div className="text-[11px] font-medium text-gray-500">Recorded expenses</div>
            <div className="my-1.5 text-xl font-extrabold text-gray-900">{money(data.expenses)}</div>
            <span className="text-[10px] text-gray-400">in selected period</span>
          </Card>

          <InkCard className="flex flex-col justify-between p-3.5">
            <div className="flex items-center justify-between text-[11px] text-gray-300">
              <span>Outstanding dues</span>
              <StarIcon className="size-3.5 text-amber-400" />
            </div>
            <div className="my-1.5 text-xl font-extrabold text-white">
              {money(data.outstandingCustomerPayments)}
            </div>
            <Link
              to="/orders"
              className="mt-auto flex items-center justify-between rounded-lg bg-zinc-800/90 p-1 text-[10px] font-medium text-gray-300 transition hover:text-white"
            >
              <span>Collect payments</span>
              <ArrowUpRightIcon className="size-3" />
            </Link>
          </InkCard>

          <Card className="flex flex-col justify-between p-3.5">
            <div className="text-[11px] font-medium text-gray-500">Stock on hand</div>
            <div className="my-1.5 text-xl font-extrabold text-gray-900">
              {count.format(data.inventory.onHand)}
            </div>
            <div className="mt-auto rounded-lg bg-gray-100 px-2 py-0.5 text-center text-[10px] font-semibold text-gray-600">
              {data.inventory.products} active products
            </div>
          </Card>

          <div className="flex flex-col justify-between gap-2">
            <Link
              to="/inventory"
              className="flex items-center justify-between rounded-2xl border border-pink-200 bg-white p-2.5 shadow-2xs transition hover:border-[#E62E6B]"
            >
              <div>
                <div className="text-[10px] font-medium text-gray-500">Low stock</div>
                <div className="flex items-center gap-0.5 text-[10px] font-bold text-[#E62E6B]">
                  <ExclamationTriangleIcon className="size-2.5" /> reorder
                </div>
              </div>
              <div className="rounded-md bg-[#E62E6B] px-2 py-0.5 text-xs font-bold text-white">
                {data.inventory.lowStock}
              </div>
            </Link>

            <Link
              to="/surveys"
              className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white p-2.5 shadow-2xs transition hover:border-gray-300"
            >
              <div>
                <div className="text-[10px] font-medium text-gray-500">Pending surveys</div>
                <div className="flex items-center gap-0.5 text-[10px] font-bold text-gray-600">
                  <ClockIcon className="size-2.5" /> scheduled
                </div>
              </div>
              <div className="rounded-md bg-gray-200 px-2 py-0.5 text-xs font-bold text-gray-700">
                {data.pendingSurveys}
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------
          Breakdown Widgets (Revenue/Expenses Chart + Project Distribution)
      ------------------------------------------------------------- */}
      <section className="grid min-w-0 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <RevenueChart series={data.series} money={money} />
        </div>

        <Panel className="flex flex-col justify-between p-4 lg:col-span-5" aria-labelledby="project-distribution">
          <div>
            <div className="flex items-center justify-between">
              <h2 id="project-distribution" className="text-xs font-bold text-gray-900">
                Project status distribution
              </h2>
              <span className="rounded-full bg-black px-2 py-0.5 text-[10px] font-bold text-white">
                {total} confirmed
              </span>
            </div>
            <p className="mt-1 text-[11px] text-gray-400">
              Current lifecycle stages of orders confirmed in this period.
            </p>

            {total ? (
              <ul className="mt-4 space-y-2.5">
                {data.projectStatuses.map((row) => (
                  <li key={row.status} className="text-xs">
                    <div className="flex justify-between text-[11px] font-medium text-gray-700">
                      <span>{label(row.status)}</span>
                      <strong className="text-gray-900">{count.format(row._count._all)}</strong>
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-gray-200/80 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-black"
                        style={{ width: `${(row._count._all / total) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-6 text-center text-xs text-gray-400">
                No projects were confirmed in this period.
              </p>
            )}
          </div>
        </Panel>
      </section>

      {/* -------------------------------------------------------------
          Sales & Current Work Queues Groups
      ------------------------------------------------------------- */}
      {groups.map(({ title, icon: Icon, metrics }) => (
        <section key={title} className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <Icon className="size-4 text-[#E62E6B]" />
            <h2 className="text-xs font-bold text-gray-900">{title}</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {metrics.map(([key, name, to]) => (
              <MetricCard
                key={key}
                title={name}
                value={count.format(data[key] ?? 0)}
                to={to}
              />
            ))}
            {title === 'Current work queues' && (
              <MetricCard
                title="Tickets resolved in period"
                value={count.format(data.resolvedTickets ?? 0)}
                to="/tickets"
              />
            )}
          </div>
        </section>
      ))}

      {/* -------------------------------------------------------------
          Inventory Summary & Recent Business Activity
      ------------------------------------------------------------- */}
      <section className="grid min-w-0 gap-4 lg:grid-cols-12">
        <Panel className="flex flex-col justify-between p-4 lg:col-span-6" aria-labelledby="admin-stock">
          <div>
            <div className="flex items-center justify-between">
              <h2 id="admin-stock" className="flex items-center gap-2 text-xs font-bold text-gray-900">
                <CubeIcon className="size-4 text-[#E62E6B]" />
                Inventory summary
              </h2>
              <Link
                to="/inventory"
                className="rounded-full border border-gray-200 bg-white/80 px-2.5 py-1 text-[10px] font-semibold text-gray-700 transition hover:bg-white"
              >
                Open inventory
              </Link>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              {[
                ['Active products', data.inventory.products],
                ['On hand', data.inventory.onHand],
                ['Reserved', data.inventory.reserved],
                ['Low-stock', data.inventory.lowStock],
              ].map(([name, value]) => (
                <div key={name} className="rounded-xl border border-gray-100 bg-white/80 p-2.5">
                  <dt className="text-[10px] text-gray-500 font-medium">{name}</dt>
                  <dd className="mt-1 text-base font-bold text-gray-900">{count.format(value)}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-4">
              <span className="text-[11px] font-bold text-gray-700">Reorder thresholds</span>
              {data.lowStockItems?.length ? (
                <div className="mt-2 space-y-1.5">
                  {data.lowStockItems.slice(0, 4).map((row) => (
                    <ListRow key={row.id}>
                      <div className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-gray-900">
                          {row.name}
                        </span>
                        <span className="block text-[10px] text-gray-400">{row.sku}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-bold text-[#E62E6B]">
                          {row.available} avail
                        </span>
                        <Chip tone="muted">min {row.reorderLevel}</Chip>
                      </div>
                    </ListRow>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-gray-400">
                  No active products are at or below their reorder point.
                </p>
              )}
            </div>
          </div>
        </Panel>

        <Panel className="flex flex-col justify-between p-4 lg:col-span-6" aria-labelledby="admin-recent-activity">
          <div>
            <h2 id="admin-recent-activity" className="text-xs font-bold text-gray-900">
              Recent business activity
            </h2>
            <p className="mt-0.5 text-[11px] text-gray-400">
              Audit log stream of operations and status transitions.
            </p>

            {data.activity?.length ? (
              <div className="mt-3 space-y-2">
                {data.activity.slice(0, 5).map((row) => (
                  <ListRow key={row.id}>
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar name={row.actor?.name ?? row.entityType} size="sm" tone="soft" />
                      <div className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-gray-900">
                          {entity(row.entityType)} · {label(row.action)}
                        </span>
                        {row.actor && (
                          <span className="block truncate text-[10px] text-gray-400">
                            {row.actor.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <time
                      className="shrink-0 text-[10px] text-gray-400 font-medium"
                      dateTime={row.createdAt}
                    >
                      {date.format(new Date(row.createdAt))}
                    </time>
                  </ListRow>
                ))}
              </div>
            ) : (
              <p className="mt-6 text-center text-xs text-gray-400">
                No business activity was logged in this period.
              </p>
            )}
          </div>
        </Panel>
      </section>
    </div>
  )
}
