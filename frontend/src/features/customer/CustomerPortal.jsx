import { useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { ChartBarIcon, ClipboardDocumentListIcon, DocumentTextIcon, MapPinIcon, ShieldCheckIcon, ShoppingBagIcon, UserCircleIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline'
import { Brand } from '../../components/ui/Brand.jsx'
import { BackToHome } from '../../components/ui/BackToHome.jsx'
import { Notice } from '../../components/ui/Notice.jsx'
import { displayReference, formatCurrency, formatDateTime, words } from '../../lib/format.js'
import Enquiry from '../enquiries/EnquiryPage.jsx'
import { NewPasswordFields } from './CustomerAuthFields.jsx'
import { customerApi, downloadCustomerFile } from './customerApi.js'
import { currentWarranty, Invoices, Orders, Quotations, ServiceRequests, Warranties } from './CustomerRecords.jsx'
import { CustomerTracking } from './CustomerTracking.jsx'
import { openRazorpay } from './razorpay.js'

const sections = [
  ['', 'Overview', ChartBarIcon], ['quotations', 'Quotations', ClipboardDocumentListIcon], ['orders', 'Orders', ShoppingBagIcon],
  ['tracking', 'Tracking', MapPinIcon],
  ['invoices', 'Invoices', DocumentTextIcon], ['warranties', 'Warranties', ShieldCheckIcon],
  ['service', 'Service requests', WrenchScrewdriverIcon], ['profile', 'Profile', UserCircleIcon],
]

function Overview({ profile, data }) {
  const activeInstallations = data.orders.filter(row => ['SCHEDULED', 'IN_PROGRESS', 'PENDING_SIGNOFF'].includes(row.installationByOrder?.status))
  const appointments = [
    ...data.requests.flatMap(row => row.siteSurveysByLead.filter(survey => survey.status === 'SCHEDULED')
      .map(survey => ['Site survey', row.leadNumber, survey.scheduledAt])),
    ...activeInstallations.filter(row => row.installationByOrder.status === 'SCHEDULED')
      .map(row => ['Installation', row.orderNumber, row.installationByOrder.scheduledAt]),
  ].filter(([, , time]) => time && new Date(time) >= new Date()).sort((a, b) => new Date(a[2]) - new Date(b[2]))
  const updates = [
    ...data.requests.map(row => ['Enquiry', row.leadNumber, row.updatedAt, row.status, 'quotations']),
    ...data.orders.map(row => ['Order', row.orderNumber, row.updatedAt, row.status, 'orders']),
    ...data.tickets.map(row => ['Service request', row.ticketNumber, row.updatedAt, row.status, 'service']),
  ].sort((a, b) => new Date(b[2]) - new Date(a[2])).slice(0, 6)
  const payable = data.orders.filter(order => order.status !== 'CANCELLED')
  const sumMoney = (field) => formatCurrency(payable.reduce((sum, row) => sum + Math.round(Number(row[field]) * 100), 0) / 100)
  const metrics = [
    ['Quotation requests', data.requests.length, 'quotations'], ['Orders', payable.length, 'orders'],
    ['Active installations', activeInstallations.length, 'orders'],
    ['Paid', sumMoney('paidTotal'), 'orders'], ['Outstanding', sumMoney('balance'), 'orders'],
    ['Active warranties', data.assets.filter(asset => currentWarranty(asset.warrantyByAsset) === 'ACTIVE').length, 'warranties'],
    ['Open service requests', data.tickets.filter(ticket => ticket.status !== 'CLOSED').length, 'service'],
  ]
  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-3xl font-bold tracking-tight">Welcome, {profile.name.split(' ')[0]}</h1><p className="mt-1 text-gray-600">Your solar projects and support</p></div>
        <div className="flex flex-wrap gap-2">
          <Link className="secondary" to="/customer/tracking">Track project</Link>
          <Link className="primary" to="/customer/quotations/new">Request a quote</Link>
        </div>
      </header>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {metrics.map(([label, value, path]) => <Link key={label} className="rounded-2xl border border-gray-200 bg-white p-4 hover:border-emerald-500" to={'/customer/' + path}>
          <span className="block text-sm text-gray-600">{label}</span><strong className="mt-1 block text-lg sm:text-2xl">{value}</strong>
        </Link>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-bold">Upcoming appointments</h2>
          {appointments.length === 0 && <p className="mt-2 text-sm text-gray-600">You have no upcoming appointments.</p>}
          <ul className="divide-y divide-gray-100">
            {appointments.map(([label, reference, at], index) => <li key={index} className="py-3 text-sm">
              <p className="font-medium">{label} · {formatDateTime(at)}</p><p className="break-all text-gray-600">{displayReference(reference)}</p>
            </li>)}
          </ul>
        </section>
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-bold">Recent updates</h2>
          {updates.length === 0 && <p className="mt-2 text-sm text-gray-600">Updates appear as your requests progress.</p>}
          <ul className="divide-y divide-gray-100">
            {updates.map(([label, reference, at, status, path]) => <li key={reference} className="py-3 text-sm">
              <Link className="font-medium" to={'/customer/' + path}>{label} · {words(status)}</Link>
              <p className="break-all text-gray-600">{displayReference(reference)} · {formatDateTime(at)}</p>
            </li>)}
          </ul>
        </section>
      </div>
    </div>
  )
}

function Profile({ profile, busy, run }) {
  function submit(event, path, method, message) {
    event.preventDefault()
    const form = event.currentTarget
    run(path, Object.fromEntries(new FormData(form)), message, method).then(saved => {
      if (saved && method === 'POST') form.reset()
    })
  }
  return (
    <section className="grid gap-4">
      <h1 className="text-2xl font-bold">My profile</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <form className="form rounded-2xl border border-gray-200 bg-white p-5" onSubmit={event => submit(event, '/profile', 'PATCH', 'Profile saved.')}>
          <h2 className="text-lg font-semibold">Account information</h2>
          <p className="break-all text-sm text-gray-600">Verified email · {profile.email}</p>
          <p className="text-sm text-gray-600">Phone · {profile.phone}</p>
          <label>Full name<input name="name" defaultValue={profile.name} maxLength={120} required /></label>
          <label>Address<textarea name="address" defaultValue={profile.address} maxLength={500} required /></label>
          <button className="primary w-fit" disabled={busy}>Save profile</button>
        </form>
        <form className="form rounded-2xl border border-gray-200 bg-white p-5" onSubmit={event => submit(event, '/password/change', 'POST', 'Password changed. Other sessions have been signed out.')}>
          <h2 className="text-lg font-semibold">Change password</h2>
          <label>Current password<input name="currentPassword" type="password" autoComplete="current-password" required /></label>
          <NewPasswordFields />
          <button className="primary w-fit" disabled={busy}>Change password</button>
        </form>
      </div>
    </section>
  )
}

export default function CustomerPortal() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const options = { signal: controller.signal }
    Promise.all([customerApi('/profile', options), customerApi('/records', options)]).then(([account, records]) => {
      if (controller.signal.aborted) return
      setProfile(account.data)
      setData(records.data)
    }).catch(failure => {
      if (controller.signal.aborted) return
      if (failure.status === 401) navigate('/customer/login', { replace: true })
      else setError(failure.message)
    })
    return () => controller.abort()
  }, [navigate, retry])

  async function perform(action, success) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await action()
      if (success) setMessage(success)
      return true
    } catch (failure) {
      setError(failure.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  function run(path, body, success, method = 'POST') {
    return perform(async () => {
      await customerApi(path, { method, body })
      setRetry(value => value + 1)
    }, success)
  }

  function createTicket(body, file) {
    return perform(async () => {
      const result = await customerApi('/tickets', { method: 'POST', body })
      setRetry(value => value + 1)
      if (file?.size) {
        const photo = new FormData()
        photo.set('file', file)
        try {
          await customerApi('/tickets/' + result.data.id + '/photo', { method: 'POST', body: photo })
        } catch (failure) {
          setError('Request created. Upload the photo from the request card. ' + failure.message)
        }
        setRetry(value => value + 1)
      }
    }, 'Service request submitted.')
  }

  function pay(kind, id) {
    return perform(async () => {
      const path = '/checkout/' + kind + '/' + encodeURIComponent(id)
      const { data: checkout } = await customerApi(path, { method: 'POST' })
      if (!checkout.paid) {
        const proof = await openRazorpay(checkout)
        if (!proof) return
        await customerApi(path + '/verify', { method: 'POST', body: proof })
      }
      setMessage('Test payment verified.')
      setRetry(value => value + 1)
    })
  }

  const payOnline = data?.razorpayEnabled ? pay : undefined
  const save = (path, title, pdf = true) => perform(() => downloadCustomerFile(path, title + (pdf ? '.pdf' : '')))
  const logout = () => perform(async () => {
    await customerApi('/logout', { method: 'POST' })
    navigate('/customer/login', { replace: true })
  })

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <Link to="/" aria-label="SuryaDesk home"><Brand /></Link>
          <div className="flex flex-wrap justify-end gap-2">
            <BackToHome />
            {profile && <button type="button" className="secondary shrink-0" disabled={busy} onClick={logout}>Sign out</button>}
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
        {profile && <nav aria-label="Customer portal" className="flex gap-2 overflow-x-auto lg:flex-col">
          {sections.map(([path, label, Icon]) => <NavLink key={label} end={!path} to={'/customer' + (path ? '/' + path : '')}
            className={({ isActive }) => 'flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium ' +
              (isActive ? 'bg-emerald-100 text-emerald-900' : 'text-gray-700 hover:bg-white')}>
            <Icon className="size-5" aria-hidden="true" /> {label}
          </NavLink>)}
        </nav>}
        <main className="min-w-0">
          <Notice>{error}</Notice>
          {message && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{message}</p>}
          {!profile || !data ? <div className="rounded-2xl bg-white p-5">
            {error ? <button type="button" className="secondary" onClick={() => { setError(''); setRetry(value => value + 1) }}>Try again</button>
              : <p role="status">Loading customer portal...</p>}
          </div> : <Routes>
            <Route index element={<Overview profile={profile} data={data} />} />
            <Route path="quotations" element={<Quotations entries={data.requests} run={run} save={save} busy={busy}
              refresh={() => setRetry(value => value + 1)} />} />
            <Route path="quotations/new" element={<Enquiry profile={profile} onSubmitted={() => setRetry(value => value + 1)} />} />
            <Route path="orders" element={<Orders entries={data.orders} save={save} pay={payOnline} busy={busy} />} />
            <Route path="tracking" element={<CustomerTracking projects={data.projects ?? []}
              refresh={() => { setError(''); setRetry(value => value + 1) }} />} />
            <Route path="invoices" element={<Invoices entries={data.invoices} save={save} pay={payOnline} busy={busy} />} />
            <Route path="warranties" element={<Warranties entries={data.assets} save={save} />} />
            <Route path="service" element={<ServiceRequests entries={data.tickets} assets={data.assets.filter(row => row.status === 'INSTALLED')}
              run={run} create={createTicket} save={save} pay={payOnline} busy={busy} />} />
            <Route path="profile" element={<Profile profile={profile} run={run} busy={busy} />} />
            <Route path="*" element={<Navigate to="/customer" replace />} />
          </Routes>}
        </main>
      </div>
    </div>
  )
}
