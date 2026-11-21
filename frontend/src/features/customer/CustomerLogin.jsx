import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Notice } from '../../components/ui/Notice.jsx'
import { customerApi } from './customerApi.js'
import { CodeField, CodeNotice, CustomerFrame, NewPasswordFields } from './CustomerAuthFields.jsx'
import { useResend } from './useResend.js'

const labels = { password: 'Password', otp: 'Email code', reset: 'Reset password' }

export default function CustomerLogin() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('password')
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [remaining, cooldown] = useResend()

  function choose(next) {
    setMode(next)
    setSent(false)
    setError('')
    setMessage('')
  }

  async function sendCode() {
    await customerApi(mode === 'reset' ? '/password/request' : '/otp/request', { method: 'POST', body: { email } })
    setSent(true)
    cooldown()
  }

  async function perform(action) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  function submit(event) {
    event.preventDefault()
    const body = Object.fromEntries(new FormData(event.currentTarget))
    perform(async () => {
      if (mode !== 'password' && !sent) return sendCode()
      if (mode === 'reset') {
        await customerApi('/password/reset', { method: 'POST', body })
        choose('password')
        setMessage('Password updated. Sign in with your new password.')
        return
      }
      await customerApi(mode === 'otp' ? '/otp/verify' : '/login', { method: 'POST', body })
      navigate('/customer', { replace: true })
    })
  }

  return (
    <CustomerFrame title={mode === 'reset' ? 'Reset your password' : 'Customer sign in'}>
      <div className="mb-5 flex flex-wrap gap-2">
        {['password', 'otp'].map(item => <button key={item} type="button" className={mode === item ? 'primary' : 'secondary'} disabled={busy}
          aria-pressed={mode === item} onClick={() => choose(item)}>{labels[item]}</button>)}
      </div>
      <form className="form" onSubmit={submit}>
        <label>Email address<input name="email" type="email" autoComplete="email" required readOnly={sent} value={email} onChange={event => setEmail(event.target.value)} /></label>
        {mode === 'password' && <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>}
        {sent && <>
          <CodeNotice remaining={remaining} resend={() => !busy && perform(sendCode)} />
          <CodeField />
          {mode === 'reset' && <NewPasswordFields />}
        </>}
        <Notice>{error}</Notice>
        {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
        <button className="primary w-fit" disabled={busy}>
          {mode === 'password' ? 'Sign in' : !sent ? 'Send email code' : mode === 'reset' ? 'Reset password' : 'Verify and sign in'}
        </button>
      </form>
      <div className="mt-5 flex flex-wrap gap-4 text-sm font-medium">
        {mode !== 'reset' && <button className="underline" onClick={() => choose('reset')} type="button" disabled={busy}>Forgot password?</button>}
        <Link className="underline" to="/enquiry">Request a solar quote</Link>
      </div>
    </CustomerFrame>
  )
}
