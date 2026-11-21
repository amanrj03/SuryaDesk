import { useEffect, useMemo, useState } from 'react'
import { api } from './api.js'

const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value))
const metrics = [
  ['revenue', 'Contract revenue', money], ['cashCollected', 'Cash collected', money],
  ['invoicesIssued', 'Invoices issued', money], ['purchases', 'Stock purchases', money],
  ['openInstallations', 'Open installations', String], ['openTickets', 'Open tickets', String],
  ['lowStock', 'Low-stock products', String], ['orderCount', 'Confirmed orders', String],
]

function query(period) {
  if (period !== 'sixMonths') return 'period=' + period
  const to = new Date()
  const from = new Date(to.getTime() - 180 * 86400_000)
  return String(new URLSearchParams({ period: 'custom', from: from.toISOString(), to: to.toISOString() }))
}

export default function Dashboard({ session }) {
  const [period, setPeriod] = useState('month')
  const [exportError, setExportError] = useState('')
  const [retry, setRetry] = useState(0)
  const [state, setState] = useState({ loading: true })
  const financial = session.user.capabilities.includes('reports:financial')
  const description = useMemo(() => query(period), [period])

  useEffect(() => {
    const controller = new AbortController()
    const options = { token: session.accessToken, signal: controller.signal }
    Promise.all([
      api('/reports/overview?' + description, options),
      financial && api('/reports/profitability?limit=20&' + description, options),
    ]).then(([overview, profitability]) => setState({ data: overview.data, rows: profitability?.data }))
      .catch(error => { if (!controller.signal.aborted) setState({ error: error.message }) })
    return () => controller.abort()
  }, [description, financial, retry, session.accessToken])

  const data = state.data
  const chart = data?.series.slice(-20) ?? []
  const maximum = Math.max(1, ...chart.map(point => Number(point.cash)))

  async function exportReport() {
    setExportError('')
    const type = financial ? 'profitability' : 'operations'
    try {
      const file = await api('/reports/export?type=' + type + '&' + description, {
        token: session.accessToken, download: true,
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

  return <>
    <header className="page-header"><div><h1>Operations overview</h1><p>SunPower Solutions</p></div>
      <label className="grid gap-1 text-sm font-semibold">Reporting period
        <select value={period} onChange={event => { setState({ loading: true }); setPeriod(event.target.value) }}>
          <option value="today">Today</option><option value="week">This week</option>
          <option value="month">This month</option><option value="sixMonths">Last 180 days</option>
        </select>
      </label>
    </header>
    {session.user.capabilities.includes('reports:export') && <div className="px-5 pt-4 sm:px-8">
      <button className="secondary" onClick={exportReport}>Download CSV</button>
      {exportError && <p className="notice mt-2" role="alert">{exportError}</p>}
    </div>}
    {state.loading && <p role="status" className="feedback">Loading operational totals…</p>}
    {state.error && <div className="feedback"><p className="notice" role="alert">{state.error}</p>
      <button className="secondary" onClick={() => { setState({ loading: true }); setRetry(value => value + 1) }}>Try again</button></div>}
    {data && <>
      <section className="dashboard-metrics" aria-label="Key totals">
        {metrics.map(([key, label, format]) => <article key={key}><h2>{label}</h2><p>{format(data[key])}</p></article>)}
      </section>
      <section className="records p-5" aria-labelledby="cash-chart">
        <h2 id="cash-chart">Daily cash collections</h2>
        {chart.length ? <div className="cash-chart">
          {chart.map(point => <div key={point.date} title={point.date + ' · ' + money(point.cash)}>
            <span className="sr-only">{point.date} {money(point.cash)}</span>
            <div className="cash-bar" style={{ height: (Number(point.cash) / maximum * 100) + '%' }} />
          </div>)}
        </div> : <p className="mt-3 text-slate-600">No payments in this period.</p>}
      </section>
      {financial && <section className="records" aria-labelledby="margin-heading">
        <h2 id="margin-heading" className="p-4">Recent job profitability</h2>
        {state.rows?.length ? <div className="overflow-x-auto"><table>
          <thead><tr>{['Customer', 'Revenue', 'Materials', 'Labour', 'Margin', 'Cost status'].map(label => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>{state.rows.map(row => <tr key={row.id}>
            <td>{row.customerName}</td><td>{money(row.revenue)}</td><td>{money(row.materialCost)}</td>
            <td>{money(row.laborCost)}</td><td>{money(row.margin)}</td><td>{row.costComplete ? 'Complete' : 'Costs pending'}</td>
          </tr>)}</tbody>
        </table></div> : <p className="feedback">No orders in this period.</p>}
      </section>}
    </>}
  </>
}
