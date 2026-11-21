import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRightIcon, ArrowUpRightIcon, ClipboardDocumentCheckIcon, MapPinIcon,
  ShieldCheckIcon, SunIcon, TruckIcon, UserCircleIcon,
} from '@heroicons/react/24/outline'
import { Brand } from '../../components/ui/Brand.jsx'
import { trackingToken } from './trackingLocation.js'

const shortcuts = [
  { to: '/track', title: 'Track order', description: 'See where your project stands, from enquiry to installation.', icon: TruckIcon },
  { to: '/warranty', title: 'Warranty status', description: 'Check equipment coverage with your order ID.', icon: ShieldCheckIcon },
  { to: '/customer', title: 'Customer portal', description: 'Manage quotes, invoices, warranties, and service requests.', icon: UserCircleIcon },
]

const steps = [
  ['Request a quote', 'Tell us about your property and how you use electricity.', ClipboardDocumentCheckIcon],
  ['Site survey and proposal', 'Our team checks your roof and prepares a proposal for your site.', MapPinIcon],
  ['Get installed and supported', 'Follow delivery and installation, then manage your warranties and service online.', SunIcon],
]

function QuickLookup() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('tracking')
  const [error, setError] = useState('')
  const tracking = mode === 'tracking'

  function submit(event) {
    event.preventDefault()
    const value = new FormData(event.currentTarget).get('reference').trim()
    const reference = tracking ? trackingToken(value) : value.toUpperCase()
    if (!reference) {
      setError(tracking ? 'Enter your tracking ID or paste the full tracking link.' : 'Enter your order ID.')
      return
    }
    const query = tracking ? { token: reference } : { order: reference }
    navigate((tracking ? '/track#' : '/warranty#') + new URLSearchParams(query))
  }

  return (
    <section id="lookup" className="scroll-mt-4 rounded-[1.6rem] border border-[#e1e7d9] bg-[#eef2e8] p-5 sm:p-8">
      <div className="grid gap-5 lg:grid-cols-[1fr_1.35fr] lg:items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Look up your project</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#4b5f56]">Have a tracking reference or order ID? Check progress or warranty coverage here.</p>
        </div>
        <div>
          <div className="mb-3 flex w-fit gap-1 rounded-full bg-white p-1" role="group" aria-label="Lookup type">
            {[['tracking', 'Tracking'], ['warranty', 'Warranty']].map(([key, label]) => <button key={key} type="button"
              aria-pressed={mode === key} onClick={() => { setMode(key); setError('') }}
              className={'rounded-full px-4 py-2 text-sm font-semibold transition ' + (mode === key ? 'bg-[#173a30] text-white' : 'text-[#3c5449] hover:bg-[#eef2e8]')}>
              {label}
            </button>)}
          </div>
          <form className="grid gap-2" onSubmit={submit}>
            <label className="text-sm font-semibold" htmlFor="quick-reference">{tracking ? 'Tracking ID or link' : 'Order ID'}</label>
            <div className="flex flex-wrap gap-2 sm:flex-nowrap">
              <input key={mode} id="quick-reference" className="min-w-0 flex-1 rounded-xl border border-[#cbd6cd] bg-white px-4 py-3 text-sm outline-offset-2 placeholder:text-gray-500"
                name="reference" placeholder={tracking ? 'LEAD-... or your tracking link' : 'ORD-...'} maxLength={tracking ? 2500 : 80} required autoComplete="off" spellCheck={false} />
              <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#173a30] px-5 py-3 text-sm font-semibold whitespace-nowrap text-white transition hover:bg-[#285243] sm:w-auto">
                {tracking ? 'Check progress' : 'Check coverage'} <ArrowRightIcon className="size-4" aria-hidden="true" />
              </button>
            </div>
            {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
          </form>
        </div>
      </div>
    </section>
  )
}

export default function LandingPage({ signedIn }) {
  return (
    <div className="min-h-screen bg-[#f8f8f2] text-[#152c25]">
      <header className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-5 gap-y-3 px-4 py-4 sm:px-8 lg:px-12">
        <Link to="/" aria-label="SuryaDesk home"><Brand /></Link>
        <nav className="hidden items-center gap-8 text-sm font-semibold lg:flex" aria-label="Public navigation">
          <a className="hover:underline" href="#project-tools">Project tools</a>
          <a className="hover:underline" href="#how-it-works">How it works</a>
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <Link className="rounded-full bg-[#173a30] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#285243] sm:px-5 sm:text-sm"
            to="/customer/login">Customer sign in</Link>
          <Link className="inline-flex items-center gap-1.5 rounded-full border border-[#cbd6cd] bg-white px-3.5 py-2 text-xs font-semibold transition hover:border-[#3c5449] sm:px-5 sm:text-sm"
            to={signedIn ? '/workspace' : '/login'}>
            {signedIn ? 'Open workspace' : 'Staff sign in'} <ArrowUpRightIcon className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 pb-14 sm:px-8 lg:px-12">
        <section className="relative isolate flex min-h-[32rem] items-end overflow-hidden rounded-[1.65rem] bg-[#173a30] text-white sm:min-h-[36rem] sm:items-center sm:rounded-[2.1rem]">
          <img src="/images/solar-rooftop.webp" alt="" fetchPriority="high"
            className="absolute inset-0 -z-20 size-full object-cover object-[63%_center] brightness-110 lg:object-center" />
          <div className="absolute inset-0 -z-10 bg-linear-to-t from-[#10251d]/95 via-[#10251d]/55 to-transparent sm:bg-linear-to-r sm:from-[#10251d]/90 sm:via-[#10251d]/35" />
          <div className="px-6 pt-24 pb-11 sm:max-w-[35rem] sm:p-12 lg:p-16">
            <p className="mb-3 flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[.13em] text-[#f5df91] uppercase">
              <SunIcon className="size-4" aria-hidden="true" /> Rooftop solar
            </p>
            <h1 className="text-[clamp(2.125rem,4.7vw,3.8rem)] leading-[1.04] font-bold tracking-[-.045em]">Solar for the place you call yours.</h1>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-[#eff2eb] sm:text-base">
              Plan a rooftop solar installation for your home or business, and follow every step through sign-off and support.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link className="inline-flex items-center gap-2 rounded-full bg-[#f6df8a] px-5 py-3 text-xs font-bold text-[#152c25] transition hover:bg-[#fff0af]" to="/enquiry">
                Request a quote <ArrowRightIcon className="size-4" aria-hidden="true" />
              </Link>
              <a className="rounded-full px-3 py-3 text-xs font-semibold underline decoration-white/55 underline-offset-5 hover:decoration-white" href="#lookup">Look up a project</a>
            </div>
          </div>
        </section>

        <section id="project-tools" className="my-8 scroll-mt-4 sm:my-11" aria-labelledby="project-tools-heading">
          <h2 id="project-tools-heading" className="mb-4 text-2xl font-bold tracking-tight">Your project tools</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {shortcuts.map(({ to, title, description, icon: Icon }) => (
              <Link key={to} to={to} aria-label={title}
                className="group rounded-[1.4rem] border border-[#e1e7d9] bg-white p-5 transition hover:-translate-y-0.5 hover:border-[#7b9b88] hover:shadow-md motion-reduce:transition-none">
                <span className="mb-4 flex items-center justify-between">
                  <span className="grid size-10 place-items-center rounded-xl bg-[#eef2e8] text-[#255642]"><Icon className="size-5" aria-hidden="true" /></span>
                  <ArrowUpRightIcon className="size-4 text-[#3f6854]" aria-hidden="true" />
                </span>
                <span className="block text-lg font-bold">{title}</span>
                <span className="mt-1 block text-sm leading-relaxed text-[#4b5f56]">{description}</span>
              </Link>
            ))}
          </div>
        </section>

        <QuickLookup />

        <section id="how-it-works" className="mt-12 grid scroll-mt-6 items-center gap-7 sm:mt-16 lg:grid-cols-2 lg:gap-14">
          <img src="/images/solar-crew.webp" alt="Two technicians checking panels on a solar rooftop" loading="lazy" width="900" height="675"
            className="aspect-[4/3] w-full rounded-[1.6rem] object-cover" />
          <div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">From first quote to switch-on</h2>
            <ol className="mt-5 divide-y divide-[#dbe3d9]">
              {steps.map(([title, description, Icon]) => (
                <li key={title} className="flex items-start gap-4 py-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#e9efe5] text-[#255642]"><Icon className="size-5" aria-hidden="true" /></span>
                  <div><h3 className="font-bold">{title}</h3><p className="mt-1 text-sm leading-relaxed text-[#4b5f56]">{description}</p></div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>
      <footer className="border-t border-[#dbe3d9] bg-[#eaf0e7]">
        <div className="mx-auto max-w-[1440px] px-4 pt-9 pb-5 sm:px-8 lg:px-12">
          <div className="grid grid-cols-2 gap-x-5 gap-y-7 pb-8 sm:grid-cols-[1.4fr_1fr_1fr]">
            <div className="col-span-2 sm:col-span-1">
              <Link to="/" className="inline-block" aria-label="SuryaDesk home"><Brand /></Link>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-[#4b5f56]">Rooftop solar for homes and businesses, from site survey to installation and support.</p>
            </div>
            <nav aria-label="Solar services" className="grid content-start gap-2 text-sm">
              <h2 className="font-bold">Solar services</h2>
              <Link className="hover:underline" to="/enquiry">Get a solar quote</Link>
              <a className="hover:underline" href="#how-it-works">Installation process</a>
              <a className="hover:underline" href="#lookup">Project lookup</a>
            </nav>
            <nav aria-label="Customer support" className="grid content-start gap-2 text-sm">
              <h2 className="font-bold">Customer support</h2>
              <Link className="hover:underline" to="/track">Follow your order</Link>
              <Link className="hover:underline" to="/warranty">Check warranty coverage</Link>
              <Link className="hover:underline" to="/customer">Sign in for service support</Link>
            </nav>
          </div>
          <p className="border-t border-[#cbd6cd] pt-4 text-xs text-[#4b5f56]">© {new Date().getFullYear()} SuryaDesk</p>
        </div>
      </footer>
    </div>
  )
}
