import { Link } from 'react-router-dom'
import { Brand } from '../../components/ui/Brand.jsx'
import { BackToHome } from '../../components/ui/BackToHome.jsx'

export function CustomerFrame({ title, children }) {
  return (
    <main className="min-h-screen bg-[#FAF9F6] px-4 py-8 text-gray-900 sm:px-8 flex items-center justify-center">
      <div className="w-full max-w-md">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <Link to="/" aria-label="SuryaDesk home"><Brand /></Link>
          <BackToHome />
        </header>
        <section className="rounded-3xl border border-gray-200/80 bg-white p-6 shadow-xl sm:p-8">
          <h1 className="mb-6 text-2xl font-bold tracking-tight text-gray-900">{title}</h1>
          {children}
        </section>
      </div>
    </main>
  )
}

export function CodeField() {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-gray-700">
      Six-digit email code
      <input
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        placeholder="123456"
        className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-xs text-gray-900 placeholder-gray-400 shadow-2xs focus:border-gray-400 focus:outline-hidden focus:ring-2 focus:ring-black/10 sm:text-sm"
      />
    </label>
  )
}

export function NewPasswordFields() {
  return (
    <>
      <label className="grid gap-1 text-xs font-semibold text-gray-700">
        New password
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={72}
          required
          placeholder="At least 12 characters"
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 placeholder-gray-400 shadow-2xs focus:border-gray-400 focus:outline-hidden focus:ring-2 focus:ring-black/10"
        />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-gray-700">
        Confirm password
        <input
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={72}
          required
          placeholder="Repeat password"
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 placeholder-gray-400 shadow-2xs focus:border-gray-400 focus:outline-hidden focus:ring-2 focus:ring-black/10"
        />
      </label>
    </>
  )
}

export function CodeNotice({ remaining, resend }) {
  return (
    <div className="grid gap-2 text-sm text-gray-600">
      <p>Check your email for a code. It expires in five minutes.</p>
      <button type="button" className="secondary w-fit" onClick={resend} disabled={remaining > 0}>
        {remaining ? 'Resend in ' + remaining + 's' : 'Resend code'}
      </button>
    </div>
  )
}
