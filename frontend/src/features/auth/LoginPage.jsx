import { useState } from 'react'
import DemoAccounts from './DemoAccounts.jsx'
import { Link, useNavigate } from 'react-router-dom'
import { Brand } from '../../components/ui/Brand.jsx'
import { BackToHome } from '../../components/ui/BackToHome.jsx'
import { Notice } from '../../components/ui/Notice.jsx'
import { api } from '../../lib/api.js'
import { BoltIcon, EnvelopeIcon, LockClosedIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'

export default function Login({ onLogin }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()

  async function submit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const body = Object.fromEntries(new FormData(event.currentTarget))
      const { data } = await api('/auth/login', { method: 'POST', body })
      onLogin(data)
      navigate('/workspace', { replace: true })
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
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
            <Brand />
            <BackToHome />
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
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  autoComplete="username"
                  placeholder="Enter your work email"
                  required
                  className="w-full rounded-xl border border-gray-200 bg-white py-2 sm:py-2.5 !pl-10 pr-3 text-xs text-gray-900 placeholder-gray-400 shadow-2xs focus:border-gray-400 focus:outline-hidden focus:ring-2 focus:ring-black/10 sm:text-sm"
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
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  required
                  className="w-full rounded-xl border border-gray-200 bg-white py-2 sm:py-2.5 !pl-10 !pr-10 text-xs text-gray-900 placeholder-gray-400 shadow-2xs focus:border-gray-400 focus:outline-hidden focus:ring-2 focus:ring-black/10 sm:text-sm"
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
          {import.meta.env.DEV && (
            <DemoAccounts disabled={busy} onSelect={(demoEmail, demoPassword) => {
              setError('')
              setShowPassword(false)
              setEmail(demoEmail)
              setPassword(demoPassword)
            }} />
          )}

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
