import assert from 'node:assert/strict'
import test from 'node:test'
import { readRuntimeConfig } from '../src/config/env.js'
import { customerMailer } from '../src/modules/portal/portal.mailer.js'

test('Gmail sends the verification email over TLS from the configured mailbox', async () => {
  const environment = { DATABASE_URL: 'postgresql://localhost/test', JWT_SECRET: 'x'.repeat(32), GMAIL_USER: 'sender@example.com' }
  assert.throws(() => readRuntimeConfig(environment), /Set both GMAIL_USER and GMAIL_APP_PASSWORD/)
  const config = readRuntimeConfig({
    ...environment, GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop',
    CUSTOMER_EMAIL_FROM: 'other@example.com', RESEND_API_KEY: 'test-key',
  })
  const message = { email: 'customer@example.com', subject: 'SuryaDesk verification', message: 'Code: 123456' }
  let delivery
  const send = customerMailer(config, {
    createTransport(options) {
      assert.equal(options.host, 'smtp.gmail.com')
      assert.equal(options.port, 465)
      assert.equal(options.secure, true)
      assert.deepEqual(options.auth, { user: environment.GMAIL_USER, pass: 'abcdefghijklmnop' })
      return { async sendMail(mail) { delivery = mail } }
    },
    fetchEmail: () => assert.fail('Resend should not be called when Gmail is configured'),
  })
  await send(message)
  assert.deepEqual(delivery, {
    from: { name: 'SuryaDesk', address: environment.GMAIL_USER },
    to: message.email, subject: message.subject, text: message.message,
  })
})

test('Resend still sends customer email when Gmail is unconfigured', async () => {
  assert.equal(customerMailer({}), null)
  let request
  const send = customerMailer({ CUSTOMER_EMAIL_FROM: 'sender@example.com', RESEND_API_KEY: 'test-key' }, {
    fetchEmail: async (url, options) => {
      request = { url, body: JSON.parse(options.body) }
      return { ok: true }
    },
  })
  await send({ email: 'customer@example.com', subject: 'Verification', message: 'Code: 123456' })
  assert.deepEqual(request, { url: 'https://api.resend.com/emails', body: {
    from: 'sender@example.com', to: ['customer@example.com'], subject: 'Verification', text: 'Code: 123456',
  } })
})
