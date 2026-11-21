import { useEffect, useState } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import {
  ArrowLeftStartOnRectangleIcon, BoltIcon, ClipboardDocumentCheckIcon,
  CubeIcon, DocumentTextIcon, InboxStackIcon, ShoppingBagIcon, CreditCardIcon,
  TruckIcon, ShieldCheckIcon, Squares2X2Icon,
} from '@heroicons/react/24/outline'
import { api } from './api.js'

const date = value => value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(value)) : '—'
const currency = value => value == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value))
const words = value => value?.toLowerCase().replaceAll('_', ' ').replace(/^./, first => first.toUpperCase())
const sections = [
  { path: 'leads', title: 'Enquiries', capability: 'leads:read', icon: InboxStackIcon, search: true,
    columns: [['Reference', row => row.leadNumber], ['Customer', row => row.customer.name], ['Phone', row => row.customer.phone], ['Source', row => words(row.source)], ['Status', row => <Status value={row.status} />], ['Received', row => date(row.createdAt)]] },
  { path: 'surveys', title: 'Surveys', capability: 'surveys:read', icon: ClipboardDocumentCheckIcon,
    columns: [['Customer', row => row.lead.customer.name], ['Scheduled', row => date(row.scheduledAt)], ['Status', row => <Status value={row.status} />]] },
  { path: 'packages', title: 'Packages', capability: 'catalog:read', icon: CubeIcon, search: true,
    columns: [['Code', row => row.code], ['Package', row => row.name], ['System', row => words(row.type)], ['Capacity', row => row.capacityKw ? row.capacityKw + ' kW' : '—'], ['Price', row => currency(row.basePrice)]] },
  { path: 'quotes', title: 'Quotations', capability: 'quotes:read', icon: DocumentTextIcon, search: true,
    columns: [['Reference', row => row.quoteNumber], ['Customer', row => row.lead.customer.name], ['Total', row => currency(row.total)], ['Status', row => <Status value={row.status} />], ['Created', row => date(row.createdAt)]] },
  { path: 'orders', title: 'Orders', capability: 'orders:read', icon: ShoppingBagIcon, search: true,
    columns: [['Reference', row => row.orderNumber], ['Customer', row => row.customer.name], ['Total', row => currency(row.total)], ['Status', row => <Status value={row.status} />], ['Confirmed', row => date(row.confirmedAt)]] },
  { path: 'inventory', title: 'Inventory', capability: 'inventory:read', icon: Squares2X2Icon, search: true,
    columns: [['SKU', row => row.sku], ['Product', row => row.name], ['In stock', row => row.onHand], ['Reserved', row => row.reserved], ['Available', row => row.available], ['Reorder', row => row.lowStock ? 'Required' : '?']] },
  { path: 'dispatches', title: 'Dispatch', capability: 'dispatch:prepare', icon: TruckIcon,
    columns: [['Reference', row => row.dispatchNumber], ['Customer', row => row.order.customer.name], ['Status', row => <Status value={row.status} />], ['Delivered', row => date(row.deliveredAt)]] },
  { path: 'warranties', title: 'Warranties', capability: 'warranties:read', icon: ShieldCheckIcon, search: true,
    columns: [['Serial', row => row.asset.serialNumber], ['Product', row => row.asset.product.name], ['Customer', row => row.customer.name], ['Status', row => <Status value={row.status} />], ['Expires', row => date(row.endAt)]] },
  { path: 'payments', title: 'Payments', capability: 'payments:read', icon: CreditCardIcon,
    columns: [['Reference', row => row.reference || '—'], ['Amount', row => currency(row.amount)], ['Method', row => words(row.method)], ['Received', row => date(row.receivedAt)]] },
]

function Status({ value }) {
  return <span className="status">{words(value)}</span>
}

function Brand() {
  return <div className="brand"><span><BoltIcon /></span>SuryaDesk</div>
}

function Notice({ children }) {
  return children && <p className="notice" role="alert">{children}</p>
}

function Login({ onLogin }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  async function submit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const body = Object.fromEntries(new FormData(event.currentTarget))
      const { data } = await api('/auth/login', { method: 'POST', body })
      onLogin(data)
      navigate('/', { replace: true })
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }
  return <main className="public-screen">
    <section className="public-panel">
      <Brand />
      <h1>Staff sign in</h1>
      <form className="form" onSubmit={submit}>
        <label>Work email<input name="email" type="email" autoComplete="username" required /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        <Notice>{error}</Notice>
        <button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <Link to="/enquiry">Request a solar quote</Link>
    </section>
  </main>
}

function Enquiry() {
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const form = new FormData(event.currentTarget)
    const body = Object.fromEntries([...form].filter(([, value]) => value !== ''))
    if (body.desiredKw) body.desiredKw = Number(body.desiredKw)
    body.subsidyInterest = form.has('subsidyInterest')
    try {
      setResult((await api('/public/enquiries', { method: 'POST', body })).data)
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }
  return <main className="public-screen">
    <section className="public-panel enquiry">
      <Brand />
      <h1>Request a solar quote</h1>
      {result ? <div className="success" role="status">
        <h2>Enquiry received</h2><p>Keep this reference for your follow-up.</p><strong>{result.leadNumber}</strong>
      </div> : <form className="form" onSubmit={submit}>
        <div className="form-grid">
          <label>Full name<input name="name" autoComplete="name" required maxLength={120} /></label>
          <label>Phone<input name="phone" type="tel" autoComplete="tel" required maxLength={20} /></label>
          <label>Email<input name="email" type="email" autoComplete="email" /></label>
          <label>System size (kW)<input name="desiredKw" type="number" min="1" max="5" step="0.1" /></label>
          <label>System type<select name="systemType"><option value="">Help me decide</option><option value="ON_GRID">On-grid</option><option value="OFF_GRID">Off-grid</option><option value="PANEL_SET">Panel set</option></select></label>
          <label>Monthly bill (INR)<input name="monthlyBill" type="number" min="0" step="0.01" /></label>
        </div>
        <label>Installation address<textarea name="address" autoComplete="street-address" required maxLength={500} /></label>
        <label>Anything else<textarea name="notes" maxLength={2000} /></label>
        <label className="check"><input name="subsidyInterest" type="checkbox" /> I’m interested in subsidy options</label>
        <Notice>{error}</Notice>
        <button className="primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit enquiry'}</button>
      </form>}
      <Link to="/login">Staff sign in</Link>
    </section>
  </main>
}

function LeadEditor({ lead, token, onClose, onSaved }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const next = { NEW: ['CONTACTED', 'LOST'], CONTACTED: ['QUALIFIED', 'LOST'], QUALIFIED: ['LOST'] }
  const allowed = next[lead.status] ?? []

  async function save(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const body = {}
    for (const field of ['status', 'monthlyBill', 'notes']) {
      const value = form.get(field).trim()
      if (value) body[field] = value
    }
    if (form.get('roofArea')) body.roofArea = Number(form.get('roofArea'))
    if (form.get('gridSuitable')) body.gridSuitable = form.get('gridSuitable') === 'yes'
    if (!Object.keys(body).length) {
      setError('Enter an update before saving.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await api('/leads/' + lead.id, { method: 'PATCH', token, body })
      onSaved()
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return <section className="lead-editor" aria-labelledby="lead-editor-title">
    <div className="toolbar"><h2 id="lead-editor-title">{lead.customer.name}</h2><button className="secondary ml-auto" disabled={busy} onClick={onClose}>Close</button></div>
    <form className="form p-4" onSubmit={save}>
      <div className="form-grid">
        <label>Status<select name="status"><option value="">{words(lead.status)}</option>
          {allowed.map(status => <option key={status} value={status}>{words(status)}</option>)}</select></label>
        <label>Shadow-free roof area (m?)<input name="roofArea" type="number" min="0.01" step="0.01" defaultValue={lead.roofArea ?? ''} /></label>
        <label>Monthly bill (INR)<input name="monthlyBill" type="number" min="0" step="0.01" defaultValue={lead.monthlyBill ?? ''} /></label>
        <label>Grid suitable<select name="gridSuitable" defaultValue={lead.gridSuitable == null ? '' : lead.gridSuitable ? 'yes' : 'no'}>
          <option value="">Unknown</option><option value="yes">Yes</option><option value="no">No</option></select></label>
      </div>
      <label>Notes<textarea name="notes" maxLength={2000} defaultValue={lead.notes ?? ''} /></label>
      <Notice>{error}</Notice>
      <button className="primary w-fit" disabled={busy}>{busy ? 'Saving?' : 'Save enquiry'}</button>
    </form>
  </section>
}

function Records({ section, token, capabilities }) {
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [retry, setRetry] = useState(0)
  const [state, setState] = useState({ busy: true })
  const [selected, setSelected] = useState(null)
  const canEdit = section.path === 'leads' && capabilities.includes('leads:write')
  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ page: String(page), limit: '20' })
    if (search) params.set('q', search)
    api('/' + section.path + '?' + params, { token, signal: controller.signal })
      .then(result => setState({ result }))
      .catch(error => { if (!controller.signal.aborted) setState({ error: error.message }) })
    return () => controller.abort()
  }, [section.path, token, page, search, retry])

  function go(nextPage) {
    setState({ busy: true })
    setPage(nextPage)
  }

  return <>
    <header className="page-header"><h1>{section.title}</h1>
      {state.result && <p>{state.result.meta.total} {state.result.meta.total === 1 ? 'record' : 'records'}</p>}
    </header>
    <div className="records">
      {selected && <LeadEditor key={selected.id} lead={selected} token={token} onClose={() => setSelected(null)} onSaved={() => {
        setSelected(null)
        setState({ busy: true })
        setRetry(value => value + 1)
      }} />}
      {section.search && <form className="toolbar" onSubmit={event => {
        event.preventDefault()
        setState({ busy: true })
        setSearch(query.trim())
        setPage(1)
        setRetry(value => value + 1)
      }}>
        <input aria-label={'Search ' + section.title.toLowerCase()} placeholder="Search records" maxLength={120} value={query} onChange={event => setQuery(event.target.value)} />
        <button className="secondary">Search</button>
      </form>}
      {state.busy && <p className="feedback" role="status">Loading {section.title.toLowerCase()}…</p>}
      {state.error && <div className="feedback"><Notice>{state.error}</Notice><button className="secondary" onClick={() => {
        setState({ busy: true }); setRetry(value => value + 1)
      }}>Try again</button></div>}
      {state.result && (!state.result.data.length
        ? <p className="feedback">No {section.title.toLowerCase()} found.</p>
        : <><div className="overflow-x-auto"><table><thead><tr>{section.columns.map(([label]) => <th key={label}>{label}</th>)}{canEdit && <th scope="col">Action</th>}</tr></thead>
          <tbody>{state.result.data.map(row => <tr key={row.id}>{section.columns.map(([label, value]) => <td key={label}>{value(row)}</td>)}{canEdit && <td><button className="secondary" onClick={() => setSelected(row)}>Edit</button></td>}</tr>)}</tbody>
        </table></div>
        <div className="pager"><button className="secondary" disabled={page <= 1} onClick={() => go(page - 1)}>Previous</button>
          <span>Page {page} of {state.result.meta.totalPages}</span>
          <button className="secondary" disabled={page >= state.result.meta.totalPages} onClick={() => go(page + 1)}>Next</button>
        </div></>)}
    </div>
  </>
}

function Workspace({ session, onLogout }) {
  const allowed = sections.filter(section => session.user.capabilities.includes(section.capability))
  const [error, setError] = useState('')
  async function logout() {
    try {
      await api('/auth/logout', { token: session.accessToken, method: 'POST' })
      onLogout()
    } catch (failure) {
      setError(failure.message)
    }
  }
  return <div className="workspace">
    <aside className="sidebar"><Brand />
      <nav aria-label="Workspace">{allowed.map(({ path, title, icon: Icon }) =>
        <NavLink key={path} to={'/' + path}><Icon />{title}</NavLink>)}</nav>
      <div className="account"><div><strong>{session.user.name}</strong><span>{words(session.user.role)}</span></div>
        <button aria-label="Sign out" title="Sign out" onClick={logout}><ArrowLeftStartOnRectangleIcon /></button>
      </div>
    </aside>
    <main className="workspace-body">
      <Notice>{error}</Notice>
      <Routes>
        {allowed.map(section => <Route key={section.path} path={section.path}
          element={<Records key={section.path} section={section} token={session.accessToken} capabilities={session.user.capabilities} />} />)}
        <Route path="*" element={allowed.length ? <Navigate to={'/' + allowed[0].path} replace /> : <header className="page-header"><h1>Workspace</h1><p>No pages are assigned to your role yet.</p></header>} />
      </Routes>
    </main>
  </div>
}

export default function App() {
  const [session, setSession] = useState(null)
  return <Routes>
    <Route path="/enquiry" element={<Enquiry />} />
    <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login onLogin={setSession} />} />
    <Route path="*" element={session ? <Workspace session={session} onLogout={() => setSession(null)} /> : <Navigate to="/login" replace />} />
  </Routes>
}
