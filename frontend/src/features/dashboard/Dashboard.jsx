import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDownIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'
import { api } from '../../lib/api.js'
import AdminOverview from './AdminOverview.jsx'
import { PageHeader, Toolbar } from '../../components/ui/PageHeader.jsx'
import { Card, Panel } from '../../components/ui/Surface.jsx'
import { Avatar } from '../../components/ui/Avatar.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { TableSkeleton, ErrorState } from '../../components/ui/States.jsx'
import { BarChart } from '../../components/charts/BarChart.jsx'
import { formatNumber } from '../../lib/format.js'
import { CustomerNameLink } from '../../components/ui/CustomerNameLink.jsx'

const money = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value))

const metrics = [
  ['revenue', 'Contract revenue', money],
  ['cashCollected', 'Cash collected', money],
  ['invoicesIssued', 'Invoices issued', money],
  ['purchases', 'Stock purchases', money],
  ['openInstallations', 'Open installations', String],
  ['openTickets', 'Open tickets', String],
  ['lowStock', 'Low-stock products', String],
  ['orderCount', 'Confirmed orders', String],
]

function query(period) {
  if (!['sixMonths', 'year'].includes(period)) return 'period=' + period
  const to = new Date()
  const from = new Date(to.getTime() - (period === 'year' ? 365 : 180) * 86400_000)
  return String(new URLSearchParams({ period: 'custom', from: from.toISOString(), to: to.toISOString() }))
}

export default function Dashboard({ session }) {
  const [period, setPeriod] = useState('month')
  const [exportError, setExportError] = useState('')
  const [page, setPage] = useState(1)
  const [retry, setRetry] = useState(0)
  const [state, setState] = useState({ loading: true })
  const admin = session.user.capabilities.includes('reports:admin_overview')
  const financial = session.user.capabilities.includes('reports:financial')
  const description = useMemo(() => query(period), [period])

  useEffect(() => {
    const controller = new AbortController()
    const options = { token: session.accessToken, signal: controller.signal }
    Promise.all([
      api('/reports/overview?' + description, options),
      financial && api('/reports/profitability?limit=20&page=' + page + '&' + description, options),
      admin && api('/reports/admin-overview?' + description, options),
    ])
      .then(([overview, profitability, administration]) =>
        setState({
          data: overview.data,
          rows: profitability?.data,
          meta: profitability?.meta,
          administration: administration?.data,
        }),
      )
      .catch((error) => {
        if (!controller.signal.aborted) setState({ error: error.message })
      })
    return () => controller.abort()
  }, [admin, description, financial, page, retry, session.accessToken])

  const data = state.data
  const chart = data?.series?.slice(-20) ?? []
  const maximum = Math.max(1, ...chart.map((point) => Number(point.cash)))

  async function exportReport() {
    setExportError('')
    const type = financial ? 'profitability' : 'operations'
    try {
      const file = await api('/reports/export?type=' + type + '&' + description, {
        token: session.accessToken,
        download: true,
      })
      const objectUrl = URL.createObjectURL(file)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = type + '.csv'
      link.click()
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch (error) {
      setExportError(error.message)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* -------------------------------------------------------------
          Action Bar: Roles & Timeframe selector matching inspiration
      ------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Toolbar className="gap-1.5 px-3 py-1">
          <span className="flex size-6 items-center justify-center rounded-full bg-black text-[10px] font-bold text-white">
            {session.user.name?.[0] ?? 'S'}
          </span>
          {['SALES', 'SURVEYOR', 'WAREHOUSE', 'TECHNICIAN'].map((role) => (
            <span
              key={role}
              className="flex items-center gap-1.5 rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-medium text-gray-700"
            >
              <Avatar name={role} size="xs" tone="soft" />
              <span className="hidden sm:inline">{role.toLowerCase()}</span>
            </span>
          ))}
        </Toolbar>

        <div className="flex items-center gap-2">
          {session.user.capabilities.includes('reports:export') && (
            <Button
              variant="outline"
              size="xs"
              onClick={exportReport}
              icon={<ArrowDownTrayIcon className="size-3.5" />}
            >
              Download CSV
            </Button>
          )}

          <div className="relative">
            <label htmlFor="period-select" className="sr-only">
              Reporting period
            </label>
            <select
              id="period-select"
              value={period}
              onChange={(event) => {
                setState({ loading: true })
                setPage(1)
                setPeriod(event.target.value)
              }}
              aria-label="Reporting period"
              className="appearance-none rounded-full border border-gray-200 bg-white py-1.5 pl-3 pr-8 text-xs font-semibold text-gray-800 shadow-2xs transition hover:bg-gray-50 focus:outline-hidden focus:ring-2 focus:ring-black/10"
            >
              <option value="today">Today</option>
              <option value="week">This week</option>
              <option value="month">This month</option>
              <option value="sixMonths">Last 180 days</option>
              <option value="year">Last 365 days</option>
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" />
          </div>

          <button
            type="button"
            onClick={() => {
              setState({ loading: true })
              setRetry((v) => v + 1)
            }}
            title="Refresh totals"
            aria-label="Refresh totals"
            className="flex size-7 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-2xs transition hover:bg-gray-50 hover:text-black"
          >
            <ArrowPathIcon className="size-3.5" />
          </button>
        </div>
      </div>

      {exportError && <p className="notice" role="alert">{exportError}</p>}

      <PageHeader
        title="Operations overview"
        subtitle="Real-time operational metrics and financial progress across SuryaDesk."
      />

      {state.loading && <TableSkeleton rows={6} columns={4} />}

      {state.error && (
        <ErrorState
          message={state.error}
          onRetry={() => {
            setState({ loading: true })
            setRetry((v) => v + 1)
          }}
        />
      )}

      {data && (
        <>
          {/* Admin centralized overview */}
          {state.administration && <AdminOverview data={state.administration} money={money} />}

          {/* Key Totals Cards */}
          <section className="dashboard-metrics" aria-label="Key totals">
            {metrics
              .filter(([key]) => !admin || ['cashCollected', 'invoicesIssued', 'purchases'].includes(key))
              .map(([key, label, format]) => (
                <article
                  key={key}
                  className="rounded-2xl border border-gray-100 bg-white p-4 shadow-2xs"
                >
                  <h2 className="text-[11px] font-semibold text-gray-500">{label}</h2>
                  <p className="mt-1.5 text-xl font-bold tracking-tight text-gray-900">
                    {format(data[key])}
                  </p>
                </article>
              ))}
          </section>

          {/* Daily Cash Collections */}
          <section className="records p-5" aria-labelledby="cash-chart">
            <Panel className="p-5">
              <div className="flex items-center justify-between">
                <h2 id="cash-chart" className="text-xs font-bold text-gray-900">
                  Daily cash collections
                </h2>
                <span className="text-[10px] font-medium text-gray-400">Past 20 active days</span>
              </div>

              {chart.length ? (
                <div className="mt-4">
                  <div className="cash-chart">
                    {chart.map((point) => (
                      <div
                        key={point.date}
                        className="group relative flex h-full min-w-0 flex-1 items-end"
                        title={point.date + ' · ' + money(point.cash)}
                      >
                        <span className="sr-only">
                          {point.date} {money(point.cash)}
                        </span>
                        <div
                          className="cash-bar transition-all group-hover:bg-[#E62E6B]"
                          style={{
                            height: `${(Number(point.cash) / maximum) * 100}%`,
                            backgroundColor: '#000000',
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex justify-between text-[10px] text-gray-400">
                    <span>{chart[0]?.date}</span>
                    <span>{chart.at(-1)?.date}</span>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-xs text-gray-400">No payments in this period.</p>
              )}
            </Panel>
          </section>

          {/* Job Profitability Section (Financial access) */}
          {financial && (
            <section className="records" aria-labelledby="margin-heading">
              <div className="rounded-2xl border border-gray-100 bg-white shadow-2xs overflow-hidden">
                <div className="flex items-center justify-between border-b border-gray-100 p-4">
                  <h2 id="margin-heading" className="text-xs font-bold text-gray-900">
                    Recent job profitability
                  </h2>
                  <span className="text-[10px] font-medium text-gray-400">
                    Recorded costs · Margin shown when costs are complete
                  </span>
                </div>

                {state.rows?.length ? (
                  <>
                    <div className="overflow-x-auto scrollbar-thin">
                      <table>
                        <thead>
                          <tr>
                            {[
                              'Customer',
                              'Revenue',
                              'Materials',
                              'Labour',
                              'Other costs',
                              'Margin',
                              'Cost status',
                            ].map((hdr) => (
                              <th key={hdr}>{hdr}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {state.rows.map((row) => (
                            <tr key={row.id}>
                              <td className="font-semibold text-gray-900"><CustomerNameLink
                                customer={{ id: row.customerId, name: row.customerName }} capabilities={session.user.capabilities} /></td>
                              <td>{money(row.revenue)}</td>
                              <td>{money(row.materialCost)}</td>
                              <td>
                                {money(row.laborCost)}
                                {row.laborMinutes != null && <span className="block text-xs text-gray-600">
                                  {formatNumber(row.laborMinutes)} min logged
                                </span>}
                              </td>
                              <td>{money(row.otherCost)}</td>
                              <td className={row.margin == null ? 'text-gray-600' : 'font-semibold'}>
                                {row.margin == null ? 'Pending' : money(row.margin)}
                              </td>
                              <td>
                                <span
                                  className={
                                    row.costComplete
                                      ? 'inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800'
                                      : 'inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800'
                                  }
                                >
                                  {row.costComplete ? 'Complete' : 'Costs pending'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {state.meta?.totalPages > 1 && (
                      <div className="pager">
                        <button
                          type="button"
                          className="secondary"
                          disabled={page <= 1}
                          onClick={() => {
                            setState({ loading: true })
                            setPage(page - 1)
                          }}
                        >
                          Previous jobs
                        </button>
                        <span>
                          Page {page} of {state.meta.totalPages}
                        </span>
                        <button
                          type="button"
                          className="secondary"
                          disabled={page >= state.meta.totalPages}
                          onClick={() => {
                            setState({ loading: true })
                            setPage(page + 1)
                          }}
                        >
                          Next jobs
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="feedback">No orders in this period.</p>
                )}
              </div>
            </section>
          )}

          {/* Technician hours and labour cost */}
          {financial && (
            <section
              className="records"
              aria-labelledby="technician-hours"
              role="region"
              aria-label="Technician hours and labour cost"
            >
              <div className="rounded-2xl border border-gray-100 bg-white shadow-2xs overflow-hidden">
                <div className="border-b border-gray-100 p-4">
                  <h2 id="technician-hours" className="text-xs font-bold text-gray-900">
                    Technician hours and labour cost
                  </h2>
                </div>

                {data.staffHours?.length ? (
                  <div className="overflow-x-auto scrollbar-thin">
                    <table>
                      <thead>
                        <tr>
                          <th>Technician</th>
                          <th>Hours</th>
                          <th>Labour cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.staffHours.map((worker) => (
                          <tr key={worker.id}>
                            <td className="font-semibold text-gray-900">{worker.name}</td>
                            <td>{worker.hours}</td>
                            <td className="font-bold">{money(worker.cost)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="feedback">No technician hours in this period.</p>
                )}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
