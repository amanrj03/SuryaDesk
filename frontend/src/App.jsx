import { useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  BoltIcon,
  ClipboardDocumentCheckIcon,
  CubeIcon,
  DocumentTextIcon,
  InboxStackIcon,
  ShoppingBagIcon,
  CreditCardIcon,
  EnvelopeIcon,
  LockClosedIcon,
  EyeIcon,
  EyeSlashIcon,
  TruckIcon,
  ShieldCheckIcon,
  Squares2X2Icon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline'
import { api } from './api.js'
import Dashboard from './Dashboard.jsx'
import InstallationSignoff from './InstallationSignoff.jsx'
import RecordDetail, { hasDetail } from './RecordDetail.jsx'
import PackageEditor from './PackageEditor.jsx'
import WorkflowAction, { collectionActions, recordActions } from './WorkflowAction.jsx'
import { AppShell } from './components/layout/AppShell.jsx'
import { PageHeader } from './components/ui/PageHeader.jsx'
import { StatusBadge } from './components/ui/Badge.jsx'
import { TableSkeleton } from './components/ui/States.jsx'
import { words } from './lib/format.js'

const date = (value) =>
  value
    ? new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeZone: 'Asia/Kolkata',
    }).format(new Date(value))
    : '—'

const currency = (value) =>
  value == null
    ? '—'
    : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value))

export const sections = [
  {
    path: 'leads',
    title: 'Enquiries',
    capability: 'leads:read',
    icon: InboxStackIcon,
    search: true,
    columns: [
      ['Reference', (row) => row.leadNumber],
      ['Customer', (row) => row.customer.name],
      ['Phone', (row) => row.customer.phone],
      ['Source', (row) => words(row.source)],
      ['Status', (row) => <StatusBadge status={row.status} />],
      ['Received', (row) => date(row.createdAt)],
    ],
  },
  {
    path: 'customers',
    title: 'Customers',
    capabilities: ['leads:write', 'tickets:create', 'reports:view', 'orders:create'],
    icon: InboxStackIcon,
    search: true,
    columns: [
      ['Customer', (row) => row.name],
      ['Phone', (row) => row.phone],
      ['Email', (row) => row.email],
      ['Address', (row) => row.address],
    ],
  },
  {
    path: 'surveys',
    title: 'Surveys',
    capability: 'surveys:read',
    icon: ClipboardDocumentCheckIcon,
    columns: [
      ['Customer', (row) => row.lead.customer.name],
      ['Scheduled', (row) => date(row.scheduledAt)],
      ['Status', (row) => <StatusBadge status={row.status} />],
    ],
  },
  {
    path: 'packages',
    title: 'Packages',
    capability: 'catalog:read',
    icon: CubeIcon,
    search: true,
    columns: [
      ['Code', (row) => row.code],
      ['Package', (row) => row.name],
      ['System', (row) => words(row.type)],
      ['Capacity', (row) => (row.capacityKw ? row.capacityKw + ' kW' : '—')],
      ['Price', (row) => currency(row.basePrice)],
    ],
  },
  {
    path: 'products',
    title: 'Products',
    capability: 'catalog:read',
    icon: CubeIcon,
    search: true,
    columns: [
      ['SKU', (row) => row.sku],
      ['Product', (row) => row.name],
      ['Category', (row) => words(row.category)],
      ['Sale price', (row) => currency(row.salePrice)],
      ['Status', (row) => (row.isActive ? 'Active' : 'Inactive')],
    ],
  },
  {
    path: 'quotes',
    title: 'Quotations',
    capability: 'quotes:read',
    icon: DocumentTextIcon,
    search: true,
    columns: [
      ['Reference', (row) => row.quoteNumber],
      ['Customer', (row) => row.lead.customer.name],
      ['Total', (row) => currency(row.total)],
      ['Status', (row) => <StatusBadge status={row.status} />],
      ['Created', (row) => date(row.createdAt)],
    ],
  },
  {
    path: 'orders',
    title: 'Orders',
    capability: 'orders:read',
    icon: ShoppingBagIcon,
    search: true,
    columns: [
      ['Reference', (row) => row.orderNumber],
      ['Customer', (row) => row.customer.name],
      ['Total', (row) => currency(row.total)],
      ['Status', (row) => <StatusBadge status={row.status} />],
      ['Confirmed', (row) => date(row.confirmedAt)],
    ],
  },
  {
    path: 'inventory',
    title: 'Inventory',
    capability: 'inventory:read',
    icon: Squares2X2Icon,
    search: true,
    columns: [
      ['SKU', (row) => row.sku],
      ['Product', (row) => row.name],
      ['In stock', (row) => row.onHand],
      ['Reserved', (row) => row.reserved],
      ['Available', (row) => row.available],
      ['Reorder', (row) => (row.lowStock ? 'Required' : '—')],
    ],
  },
  {
    path: 'assets',
    title: 'Equipment serials',
    capability: 'inventory:read',
    icon: CubeIcon,
    search: true,
    columns: [
      ['Serial', (row) => row.serialNumber],
      ['Product', (row) => row.product.name],
      ['Status', (row) => <StatusBadge status={row.status} />],
      ['Order', (row) => row.order?.orderNumber],
      ['Customer', (row) => row.customer?.name],
    ],
  },
  {
    path: 'dispatches',
    title: 'Dispatch',
    capability: 'dispatch:prepare',
    icon: TruckIcon,
    columns: [
      ['Reference', (row) => row.dispatchNumber],
      ['Customer', (row) => row.order.customer.name],
      ['Status', (row) => <StatusBadge status={row.status} />],
      ['Delivered', (row) => date(row.deliveredAt)],
    ],
  },
  {
    path: 'warranties',
    title: 'Warranties',
    capability: 'warranties:read',
    icon: ShieldCheckIcon,
    search: true,
    columns: [
      ['Serial', (row) => row.asset.serialNumber],
      ['Product', (row) => row.asset.product.name],
      ['Customer', (row) => row.customer.name],
      ['Status', (row) => <StatusBadge status={row.status} />],
      ['Expires', (row) => date(row.endAt)],
    ],
  },
  {
    path: 'installations',
    title: 'Installations',
    capability: 'installations:read',
    icon: WrenchScrewdriverIcon,
    columns: [
      ['Customer', (row) => row.order.customer.name],
      ['Capacity', (row) => row.capacityKw + ' kW'],
      ['Scheduled', (row) => date(row.scheduledAt)],
      ['Status', (row) => <StatusBadge status={row.status} />],
    ],
  },
  {
    path: 'tickets',
    title: 'Service tickets',
    capability: 'tickets:read',
    icon: ClipboardDocumentCheckIcon,
    search: true,
    columns: [
      ['Reference', (row) => row.ticketNumber],
      ['Customer', (row) => row.customer.name],
      ['Fault', (row) => row.faultCode || '—'],
      ['Priority', (row) => words(row.priority)],
      ['Status', (row) => <StatusBadge status={row.status} />],
    ],
  },
  {
    path: 'invoices',
    title: 'Invoices',
    capability: 'invoices:read',
    icon: DocumentTextIcon,
    search: true,
    columns: [
      ['Reference', (row) => row.invoiceNumber],
      ['Customer', (row) => row.customer.name],
      ['Total', (row) => currency(row.total)],
      ['Status', (row) => <StatusBadge status={row.status} />],
      ['Issued', (row) => date(row.issuedAt)],
    ],
  },
  {
    path: 'subsidies',
    title: 'Subsidies',
    capability: 'subsidies:read',
    icon: ClipboardDocumentCheckIcon,
    columns: [
      ['Order', (row) => row.order.orderNumber],
      ['Customer', (row) => row.order.customer.name],
      ['Reference', (row) => row.reference || '—'],
      ['Status', (row) => <StatusBadge status={row.status} />],
    ],
  },
  {
    path: 'suppliers',
    title: 'Suppliers',
    capability: 'inventory:read',
    icon: CubeIcon,
    search: true,
    columns: [
      ['Code', (row) => row.code],
      ['Supplier', (row) => row.name],
      ['Email', (row) => row.email],
      ['Phone', (row) => row.phone],
    ],
  },
  {
    path: 'purchases',
    title: 'Purchase orders',
    capability: 'inventory:read',
    icon: TruckIcon,
    search: true,
    columns: [
      ['Reference', (row) => row.purchaseNumber],
      ['Supplier', (row) => row.supplier.name],
      ['Expected', (row) => date(row.expectedAt)],
      ['Status', (row) => <StatusBadge status={row.status} />],
    ],
  },
  {
    path: 'users',
    title: 'Staff',
    capability: 'users:manage',
    icon: ClipboardDocumentCheckIcon,
    search: true,
    columns: [
      ['Name', (row) => row.name],
      ['Email', (row) => row.email],
      ['Role', (row) => words(row.role)],
      ['Account', (row) => (row.isActive ? 'Active' : 'Inactive')],
    ],
  },
  {
    path: 'payments',
    title: 'Payments',
    capability: 'payments:read',
    icon: CreditCardIcon,
    columns: [
      ['Reference', (row) => row.reference || '—'],
      ['Amount', (row) => currency(row.amount)],
      ['Method', (row) => words(row.method)],
      ['Received', (row) => date(row.receivedAt)],
    ],
  },
]

function Brand({ full = true, className = '' }) {
  return full ? (
    <div className={`brand flex items-center ${className}`}>
      <img
        src="/fulllogo.png"
        alt="SuryaDesk"
        width="866"
        height="288"
        className="h-9 w-auto max-w-[190px] object-contain sm:h-10"
      />
    </div>
  ) : (
    <div className={`brand flex items-center ${className}`}>
      <img
        src="/logo.png"
        alt="SuryaDesk"
        width="222"
        height="195"
        className="h-8 w-auto object-contain sm:h-9"
      />
    </div>
  )
}

function Notice({ children }) {
  return children && <p className="notice" role="alert">{children}</p>
}

function Login({ onLogin }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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

  return (
    <main className="login-screen w-full min-h-screen lg:h-screen lg:max-h-screen grid grid-cols-1 lg:grid-cols-2 bg-[#FAF9F6] text-[#2D2D2E] antialiased box-border overflow-hidden lg:overflow-hidden">
      {/* Left side: big image from public folder covering half window */}
      <section
        className="login-visual relative hidden h-full w-full min-h-0 overflow-hidden bg-neutral-900 lg:block"
        aria-label="Solar Operations Showcase"
      >
        <img
          src="/LOGIN_PAGE_IMAGE.png"
          alt="SuryaDesk Solar Operations"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
        <div className="absolute top-6 left-6 z-10 xl:top-8 xl:left-8">
          <div className="flex items-center gap-2 rounded-full bg-white/20 px-3.5 py-1.5 backdrop-blur-md border border-white/30 text-white shadow-sm">
            <span className="flex size-5 items-center justify-center rounded-full bg-amber-400 text-black">
              <BoltIcon className="size-3" />
            </span>
            <span className="text-xs font-semibold tracking-wide">SuryaDesk Operations</span>
          </div>
        </div>
        <div className="absolute bottom-8 left-8 right-8 z-10 text-white xl:bottom-10 xl:left-10 xl:right-10">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/20 px-3 py-1 text-xs font-semibold text-amber-300 backdrop-blur-md border border-amber-300/30">
            End-to-End Rooftop Solar
          </span>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-white drop-shadow-sm xl:text-3xl leading-snug">
            Streamlining solar installation and maintenance operations
          </h2>
          <p className="mt-2 text-xs text-white/80 max-w-lg leading-relaxed">
            Follow every project from initial lead qualification and site survey through system dispatch, installation sign-off, and lifetime warranty service.
          </p>
        </div>
      </section>

      {/* Right side: login form */}
      <section
        className="login-entry flex min-h-screen lg:min-h-0 h-full w-full flex-col justify-center items-center p-4 sm:p-6 lg:p-8 xl:p-12 bg-[#FAF9F6] box-border lg:overflow-y-auto"
        aria-labelledby="login-title"
      >
        <div className="login-content w-full max-w-sm sm:max-w-md my-auto">
          <div className="mb-5 flex items-center justify-between">
            <Brand />
            <Link
              to="/enquiry"
              className="text-xs font-semibold text-[#E62E6B] transition hover:underline"
            >
              Public quote →
            </Link>
          </div>

          <h1 id="login-title" className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            Staff sign in
          </h1>
          <p className="mt-1 text-xs text-gray-500 sm:text-sm">
            Welcome back to SuryaDesk. Sign in with your work email to access your workspace.
          </p>

          <form className="form login-form mt-5 grid gap-3.5" onSubmit={submit}>
            <div className="login-field grid gap-1">
              <label htmlFor="login-email" className="text-xs font-semibold text-gray-700">
                Work email
              </label>
              <div className="login-input relative flex items-center">
                <EnvelopeIcon className="pointer-events-none absolute left-3.5 size-4 text-gray-400" aria-hidden="true" />
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  placeholder="Enter your work email"
                  required
                  className="w-full rounded-xl border border-gray-200 bg-white py-2 sm:py-2.5 pl-10 pr-3 text-xs text-gray-900 placeholder-gray-400 shadow-2xs focus:border-gray-400 focus:outline-hidden focus:ring-2 focus:ring-black/10 sm:text-sm"
                />
              </div>
            </div>

            <div className="login-field grid gap-1">
              <label htmlFor="login-password" className="text-xs font-semibold text-gray-700">
                Password
              </label>
              <div className="login-input login-password relative flex items-center">
                <LockClosedIcon className="pointer-events-none absolute left-3.5 size-4 text-gray-400" aria-hidden="true" />
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  required
                  className="w-full rounded-xl border border-gray-200 bg-white py-2 sm:py-2.5 pl-10 pr-10 text-xs text-gray-900 placeholder-gray-400 shadow-2xs focus:border-gray-400 focus:outline-hidden focus:ring-2 focus:ring-black/10 sm:text-sm"
                />
                <button
                  type="button"
                  className="login-reveal absolute right-2.5 p-1 text-gray-400 hover:text-gray-700"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  <span className="sr-only">{showPassword ? 'Hide password' : 'Show password'}</span>
                  {showPassword ? (
                    <EyeSlashIcon className="size-4" aria-hidden="true" />
                  ) : (
                    <EyeIcon className="size-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <Notice>{error}</Notice>

            <button
              type="submit"
              className="primary login-submit w-full rounded-full py-2.5 text-xs font-semibold shadow-xs sm:text-sm cursor-pointer"
              disabled={busy}
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="mt-6 border-t border-gray-200/80 pt-4 text-center">
            <p className="text-xs text-gray-500">
              Looking for a rooftop solar quote for your home or business?{' '}
              <Link
                className="login-enquiry font-semibold text-[#E62E6B] transition hover:underline"
                to="/enquiry"
              >
                Request a solar quote
              </Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  )
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

  return (
    <main className="public-screen flex min-h-screen items-center justify-center bg-[#FAF9F6] p-3 text-[#2D2D2E] antialiased sm:p-6">
      <div className="w-full max-w-2xl rounded-[22px] border border-gray-200/80 bg-white p-6 shadow-xl sm:p-8">
        <Brand />
        <h1 className="mt-6 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          Request a solar quote
        </h1>
          <p className="mt-1 text-xs text-gray-500">
            Tell us about your rooftop and power requirements. Our engineers will prepare an exact proposal.
          </p>

          {result ? (
            <div className="mt-6 space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 text-emerald-950" role="status">
              <h2 className="text-base font-bold">Enquiry received</h2>
              <p className="text-xs">Keep this reference number for your follow-up with our sales team.</p>
              <strong className="block text-xl tracking-wider text-emerald-900">{result.leadNumber}</strong>
            </div>
          ) : (
            <form className="form mt-6 grid gap-4" onSubmit={submit}>
              <div className="form-grid grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-semibold text-gray-700">
                  Full name
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    maxLength={120}
                    placeholder="E.g. Ramesh Patel"
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-black/10 focus:outline-hidden"
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-gray-700">
                  Phone
                  <input
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    required
                    maxLength={20}
                    placeholder="+91 98765 43210"
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-black/10 focus:outline-hidden"
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-gray-700">
                  Email
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="name@example.com"
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-black/10 focus:outline-hidden"
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-gray-700">
                  System size (kW)
                  <input
                    name="desiredKw"
                    type="number"
                    min="1"
                    max="5"
                    step="0.1"
                    placeholder="3.0"
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-black/10 focus:outline-hidden"
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-gray-700">
                  System type
                  <select
                    name="systemType"
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-black/10 focus:outline-hidden"
                  >
                    <option value="">Help me decide</option>
                    <option value="ON_GRID">On-grid</option>
                    <option value="OFF_GRID">Off-grid</option>
                    <option value="PANEL_SET">Panel set</option>
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-semibold text-gray-700">
                  Monthly bill (INR)
                  <input
                    name="monthlyBill"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="3500"
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-black/10 focus:outline-hidden"
                  />
                </label>
              </div>

              <label className="grid gap-1 text-xs font-semibold text-gray-700">
                Installation address
                <textarea
                  name="address"
                  autoComplete="street-address"
                  required
                  maxLength={500}
                  rows={2}
                  placeholder="Plot number, building name, locality, city and pin code"
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-black/10 focus:outline-hidden resize-y"
                />
              </label>

              <label className="grid gap-1 text-xs font-semibold text-gray-700">
                Anything else
                <textarea
                  name="notes"
                  maxLength={2000}
                  rows={2}
                  placeholder="Rooftop type, shading concerns, preferred appointment times…"
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-black/10 focus:outline-hidden resize-y"
                />
              </label>

              <label className="check flex items-center gap-2 text-xs font-medium text-gray-700">
                <input
                  name="subsidyInterest"
                  type="checkbox"
                  className="size-4 rounded-xs accent-black"
                />
                I’m interested in government solar subsidy options
              </label>

              <Notice>{error}</Notice>

              <button
                type="submit"
                className="primary w-full sm:w-auto py-2.5 px-6 rounded-full text-xs font-semibold shadow-xs"
                disabled={busy}
              >
                {busy ? 'Submitting…' : 'Submit enquiry'}
              </button>
            </form>
          )}

          <div className="mt-6 border-t border-gray-200/60 pt-4 text-center">
            <Link to="/login" className="text-xs font-semibold text-gray-600 transition hover:text-black">
              ← Return to staff sign in
            </Link>
          </div>
        </div>
    </main>
  )
}

function LeadEditor({ lead, token, onClose, onSaved }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const next = {
    NEW: ['CONTACTED', 'LOST'],
    CONTACTED: ['QUALIFIED', 'LOST'],
    QUALIFIED: ['LOST'],
  }
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

  return (
    <section className="lead-editor p-4 mb-4" aria-labelledby="lead-editor-title">
      <div className="toolbar flex items-center justify-between border-b border-gray-100 pb-3">
        <h2 id="lead-editor-title" className="text-xs font-bold text-gray-900">
          Edit Enquiry · {lead.customer.name}
        </h2>
        <button
          type="button"
          className="secondary ml-auto"
          disabled={busy}
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <form className="form mt-3 grid gap-3" onSubmit={save}>
        <div className="form-grid grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-gray-700">
            Status
            <select
              name="status"
              className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs focus:outline-hidden focus:ring-2 focus:ring-black/10"
            >
              <option value="">{words(lead.status)}</option>
              {allowed.map((status) => (
                <option key={status} value={status}>
                  {words(status)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-gray-700">
            Shadow-free roof area (m²)
            <input
              name="roofArea"
              type="number"
              min="0.01"
              step="0.01"
              defaultValue={lead.roofArea ?? ''}
              className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs focus:outline-hidden focus:ring-2 focus:ring-black/10"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-gray-700">
            Monthly bill (INR)
            <input
              name="monthlyBill"
              type="number"
              min="0"
              step="0.01"
              defaultValue={lead.monthlyBill ?? ''}
              className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs focus:outline-hidden focus:ring-2 focus:ring-black/10"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-gray-700">
            Grid suitable
            <select
              name="gridSuitable"
              defaultValue={lead.gridSuitable == null ? '' : lead.gridSuitable ? 'yes' : 'no'}
              className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs focus:outline-hidden focus:ring-2 focus:ring-black/10"
            >
              <option value="">Unknown</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
        </div>
        <label className="grid gap-1 text-xs font-semibold text-gray-700">
          Notes
          <textarea
            name="notes"
            maxLength={2000}
            rows={2}
            defaultValue={lead.notes ?? ''}
            className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs focus:outline-hidden focus:ring-2 focus:ring-black/10 resize-y"
          />
        </label>
        <Notice>{error}</Notice>
        <div className="flex justify-end pt-1">
          <button
            type="submit"
            className="primary py-2 px-5 text-xs font-semibold"
            disabled={busy}
          >
            {busy ? 'Saving…' : 'Save enquiry'}
          </button>
        </div>
      </form>
    </section>
  )
}

const statuses = {
  leads: 'NEW CONTACTED QUALIFIED SURVEY_SCHEDULED SURVEY_PENDING_APPROVAL SURVEY_APPROVED QUOTED WON LOST',
  surveys: 'SCHEDULED IN_PROGRESS SUBMITTED APPROVED REJECTED',
  quotes: 'DRAFT SENT ACCEPTED REJECTED EXPIRED',
  orders: 'CONFIRMED AWAITING_STOCK READY_TO_DISPATCH DISPATCHED DELIVERED INSTALLATION_IN_PROGRESS COMPLETED CANCELLED',
  assets: 'IN_STOCK RESERVED DISPATCHED DELIVERED INSTALLED UNDER_REPAIR REPLACED',
  dispatches: 'DRAFT ALLOCATED DISPATCHED DELIVERED CANCELLED',
  warranties: 'ACTIVE EXPIRED VOID REPLACED',
  installations: 'UNSCHEDULED SCHEDULED IN_PROGRESS PENDING_SIGNOFF COMPLETED',
  tickets: 'OPEN TRIAGED ASSIGNED IN_PROGRESS RESOLVED_PENDING_CONFIRMATION CLOSED',
  invoices: 'DRAFT ISSUED PARTIALLY_PAID PAID VOID',
  subsidies: 'NOT_STARTED DOCUMENTS_PENDING SUBMITTED APPROVED REJECTED PAID',
  purchases: 'DRAFT ORDERED PARTIALLY_RECEIVED RECEIVED CANCELLED',
}

function Records({ section, token, capabilities }) {
  const [page, setPage] = useState(1)
  const [searchParams, setSearchParams] = useSearchParams()
  const search = section.search ? (searchParams.get('q') ?? '').slice(0, 120) : ''
  const [query, setQuery] = useState(search)
  const [status, setStatus] = useState('')
  const choices = statuses[section.path]?.split(' ')
  const [retry, setRetry] = useState(0)
  const [state, setState] = useState({ busy: true })
  const [selected, setSelected] = useState(null)
  const canEditLead = section.path === 'leads' && capabilities.includes('leads:write')
  const canSign =
    section.path === 'installations' && capabilities.includes('installations:complete_assigned')
  const [action, setAction] = useState(null)
  const [detail, setDetail] = useState(null)
  const [packageEdit, setPackageEdit] = useState(null)
  const managePackages = section.path === 'packages' && capabilities.includes('catalog:manage')
  const hasActions =
    hasDetail(section.path) ||
    canEditLead ||
    canSign ||
    managePackages ||
    state.result?.data.some((row) => recordActions(section.path, row, capabilities).length)
  const Editor = canEditLead ? LeadEditor : InstallationSignoff

  useEffect(() => {
    setQuery(search)
    setPage(1)
    setState({ busy: true })
  }, [search])

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ page: String(page), limit: '20' })
    if (search) params.set('q', search)
    if (status) params.set('status', status)
    api('/' + section.path + '?' + params, { token, signal: controller.signal })
      .then((result) => setState({ result }))
      .catch((error) => {
        if (!controller.signal.aborted) setState({ error: error.message })
      })
    return () => controller.abort()
  }, [section.path, token, page, search, status, retry])

  function refresh() {
    setSelected(null)
    setAction(null)
    setDetail(null)
    setPackageEdit(null)
    setState({ busy: true })
    setRetry((value) => value + 1)
  }

  function go(nextPage) {
    setState({ busy: true })
    setPage(nextPage)
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={section.title}
        subtitle={
          state.result
            ? `${state.result.meta.total} ${state.result.meta.total === 1 ? 'record' : 'records'}`
            : undefined
        }
      />

      <div className="records">
        {managePackages && (
          <div className="toolbar mb-2">
            <button
              type="button"
              className="primary"
              onClick={() => {
                setDetail(null)
                setPackageEdit({})
              }}
            >
              Add package
            </button>
          </div>
        )}

        {packageEdit && (
          <PackageEditor
            key={packageEdit.id ?? 'new'}
            id={packageEdit.id}
            token={token}
            onSaved={refresh}
            onClose={() => setPackageEdit(null)}
          />
        )}

        {collectionActions(section.path, capabilities).map((candidate) => (
          <div className="toolbar mb-2" key={candidate.key}>
            <button
              type="button"
              className="primary"
              onClick={() => {
                setDetail(null)
                setSelected(null)
                setAction(candidate)
              }}
            >
              {candidate.label}
            </button>
          </div>
        ))}

        {detail && (
          <RecordDetail
            key={detail}
            id={detail}
            section={section.path}
            token={token}
            onClose={() => setDetail(null)}
          />
        )}

        {selected && (
          <Editor
            key={selected.id}
            lead={selected}
            job={selected}
            token={token}
            onClose={() => setSelected(null)}
            onSaved={refresh}
          />
        )}

        {action && (
          <WorkflowAction
            key={action.path + action.key}
            action={action}
            token={token}
            onSaved={refresh}
            onClose={() => setAction(null)}
          />
        )}

        {/* Filter and Search Bar styled as Toolbar */}
        {(section.search || choices) && (
          <form
            className="toolbar mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-gray-100 bg-white/80 p-2 shadow-2xs backdrop-blur-xs"
            onSubmit={(event) => {
              event.preventDefault()
              setState({ busy: true })
              setSearchParams((current) => {
                const next = new URLSearchParams(current)
                const term = query.trim()
                if (term) next.set('q', term)
                else next.delete('q')
                return next
              })
              setPage(1)
              setRetry((value) => value + 1)
            }}
          >
            {section.search && (
              <input
                aria-label={'Search ' + section.title.toLowerCase()}
                placeholder="Search records…"
                maxLength={120}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full max-w-xs rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-xs text-gray-800 placeholder-gray-400 focus:outline-hidden focus:ring-2 focus:ring-black/10"
              />
            )}
            {choices && (
              <select
                aria-label="Filter by status"
                className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-black/10"
                value={status}
                onChange={(event) => {
                  setPage(1)
                  setState({ busy: true })
                  setStatus(event.target.value)
                }}
              >
                <option value="">All statuses</option>
                {choices.map((value) => (
                  <option key={value} value={value}>
                    {words(value)}
                  </option>
                ))}
              </select>
            )}
            {section.search && (
              <button type="submit" className="secondary">
                Search
              </button>
            )}
          </form>
        )}

        {state.busy && <TableSkeleton rows={6} columns={section.columns.length + (hasActions ? 1 : 0)} />}

        {state.error && (
          <div className="feedback">
            <Notice>{state.error}</Notice>
            <button
              type="button"
              className="secondary mt-2"
              onClick={() => {
                setState({ busy: true })
                setRetry((value) => value + 1)
              }}
            >
              Try again
            </button>
          </div>
        )}

        {state.result &&
          (!state.result.data.length ? (
            <p className="feedback">No {section.title.toLowerCase()} found.</p>
          ) : (
            <div className="rounded-2xl border border-gray-100 bg-white shadow-2xs overflow-hidden">
              <div className="overflow-x-auto scrollbar-thin">
                <table>
                  <thead>
                    <tr>
                      {section.columns.map(([label]) => (
                        <th key={label}>{label}</th>
                      ))}
                      {hasActions && <th scope="col">Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {state.result.data.map((row) => (
                      <tr key={row.id}>
                        {section.columns.map(([label, value]) => (
                          <td key={label}>{value(row)}</td>
                        ))}
                        {hasActions && (
                          <td>
                            {hasDetail(section.path) && (
                              <button
                                type="button"
                                className="secondary mb-1 mr-1"
                                onClick={() => {
                                  setPackageEdit(null)
                                  setAction(null)
                                  setSelected(null)
                                  setDetail(section.path === 'assets' ? row.serialNumber : row.id)
                                }}
                              >
                                View
                              </button>
                            )}
                            {managePackages && (
                              <button
                                type="button"
                                className="secondary mb-1 mr-1"
                                onClick={() => {
                                  setDetail(null)
                                  setPackageEdit({ id: row.id })
                                }}
                              >
                                Edit package
                              </button>
                            )}
                            {(canEditLead ||
                              (canSign &&
                                row.status !== 'COMPLETED' &&
                                ['DELIVERED', 'INSTALLATION_IN_PROGRESS'].includes(row.order?.status) &&
                                row.installationAssignmentsByInstallation?.length > 0)) && (
                                <button
                                  type="button"
                                  className="secondary mb-1"
                                  onClick={() => {
                                    setDetail(null)
                                    setAction(null)
                                    setSelected(row)
                                  }}
                                >
                                  {canEditLead ? 'Edit' : 'Sign off'}
                                </button>
                              )}
                            {recordActions(section.path, row, capabilities).map((candidate) => (
                              <button
                                type="button"
                                className="secondary mb-1 ml-1"
                                key={candidate.key}
                                onClick={() => {
                                  setSelected(null)
                                  setAction(candidate)
                                }}
                              >
                                {candidate.label}
                              </button>
                            ))}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pager">
                <button
                  type="button"
                  className="secondary"
                  disabled={page <= 1}
                  onClick={() => go(page - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {page} of {state.result.meta.totalPages}
                </span>
                <button
                  type="button"
                  className="secondary"
                  disabled={page >= state.result.meta.totalPages}
                  onClick={() => go(page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}

const workspaceAliases = [
  ['catalog/products', 'products'],
  ['catalog/packages', 'packages'],
  ['dispatch', 'dispatches'],
  ['support/tickets', 'tickets'],
  ['finance/invoices', 'invoices'],
  ['finance/payments', 'payments'],
  ['finance/subsidies', 'subsidies'],
  ['admin/users', 'users'],
]

function DetailPage({ section, token }) {
  const { id } = useParams()
  const navigate = useNavigate()
  return (
    <div className="records">
      <RecordDetail
        id={id}
        section={section.path}
        token={token}
        onClose={() => navigate('/' + section.path)}
      />
    </div>
  )
}

function Workspace({ session, onLogout }) {
  const allowed = sections.filter((section) =>
    (section.capabilities ?? [section.capability]).some((capability) =>
      session.user.capabilities.includes(capability),
    ),
  )
  const hasReports = session.user.capabilities.includes('reports:view')
  const [error, setError] = useState('')

  async function logout() {
    try {
      await api('/auth/logout', { token: session.accessToken, method: 'POST' })
      onLogout()
    } catch (failure) {
      setError(failure.message)
    }
  }

  return (
    <AppShell session={session} sections={sections} onLogout={logout}>
      <Notice>{error}</Notice>
      <Routes>
        {hasReports && <Route path="overview" element={<Dashboard session={session} />} />}
        {hasReports &&
          ['dashboard', 'reports/operations', 'reports/profitability'].map((path) => (
            <Route key={path} path={path} element={<Navigate to="/overview" replace />} />
          ))}
        {workspaceAliases
          .filter(([, path]) => allowed.some((section) => section.path === path))
          .map(([alias, path]) => (
            <Route key={alias} path={alias} element={<Navigate to={'/' + path} replace />} />
          ))}
        {allowed
          .filter((section) => hasDetail(section.path))
          .map((section) => (
            <Route
              key={section.path + '/:id'}
              path={section.path + '/:id'}
              element={<DetailPage section={section} token={session.accessToken} />}
            />
          ))}
        {allowed.map((section) => (
          <Route
            key={section.path}
            path={section.path}
            element={
              <Records
                key={section.path}
                section={section}
                token={session.accessToken}
                capabilities={session.user.capabilities}
              />
            }
          />
        ))}
        <Route
          path="*"
          element={
            hasReports ? (
              <Navigate to="/overview" replace />
            ) : allowed.length ? (
              <Navigate to={'/' + allowed[0].path} replace />
            ) : (
              <PageHeader
                title="Workspace"
                subtitle="No pages are assigned to your role yet."
              />
            )
          }
        />
      </Routes>
    </AppShell>
  )
}

export default function App() {
  const [session, setSession] = useState(null)

  useEffect(() => {
    const expired = () => setSession(null)
    window.addEventListener('suryadesk:session-expired', expired)
    return () => window.removeEventListener('suryadesk:session-expired', expired)
  }, [])

  return (
    <Routes>
      <Route path="/enquiry" element={<Enquiry />} />
      <Route path="/request-quote" element={<Navigate to="/enquiry" replace />} />
      <Route
        path="/login"
        element={session ? <Navigate to="/" replace /> : <Login onLogin={setSession} />}
      />
      <Route
        path="*"
        element={
          session ? (
            <Workspace session={session} onLogout={() => setSession(null)} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  )
}
