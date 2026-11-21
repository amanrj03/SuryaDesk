import { ApiError } from '../../utils/ApiError.js'

export function customerMailer({ CUSTOMER_EMAIL_FROM, RESEND_API_KEY }, fetchEmail = fetch) {
  if (!CUSTOMER_EMAIL_FROM || !RESEND_API_KEY) return null
  return async ({ email, subject, message }) => {
    const response = await fetchEmail('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: CUSTOMER_EMAIL_FROM, to: [email], subject, text: message }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new ApiError(503, 'MAIL_UNAVAILABLE', 'Email delivery is temporarily unavailable.')
  }
}
