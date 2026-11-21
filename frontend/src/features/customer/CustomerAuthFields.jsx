import { Link } from 'react-router-dom'
import { Brand } from '../../components/ui/Brand.jsx'

export function CustomerFrame({ title, children }) {
  return (
    <main className="min-h-screen bg-[#FAF9F6] px-4 py-6 text-gray-900 sm:px-8">
      <div className="mx-auto max-w-lg">
        <Link to="/" aria-label="SuryaDesk home"><Brand /></Link>
        <section className="mt-8 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="mb-5 text-2xl font-bold tracking-tight">{title}</h1>
          {children}
        </section>
      </div>
    </main>
  )
}

export function CodeField() {
  return (
    <label>Six-digit email code
      <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required />
    </label>
  )
}

export function NewPasswordFields() {
  return (
    <>
      <label>New password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /></label>
      <label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /></label>
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
