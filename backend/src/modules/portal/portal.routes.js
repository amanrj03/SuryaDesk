import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import multer from 'multer'
import { z } from 'zod'
import { authenticate, authorize } from '../../middleware/authenticate.js'
import { validate } from '../../middleware/validate.js'
import { ApiError } from '../../utils/ApiError.js'
import { customerAuthService } from './customer-auth.service.js'
import { portalService } from './portal.service.js'
import { razorpayCheckout } from './razorpay.service.js'
import { invoicePdf } from '../invoices/invoice-pdf.js'
import { attachmentsService } from '../attachments/attachments.service.js'
import { quotationPdf, receiptPdf, warrantyPdf } from './portal-pdf.js'
import * as schema from './portal.schema.js'

const params = z.object({ id: z.string().min(1).max(100) })
const checkoutParams = params.extend({ kind: z.enum(['orders', 'invoices']) })
const checkoutAmount = z.strictObject({ amountPaise: z.number().int().min(100).optional() }).default({})
const checkoutProof = z.strictObject({
  razorpay_order_id: z.string().max(100).regex(/^order_[A-Za-z0-9]+$/),
  razorpay_payment_id: z.string().max(100).regex(/^pay_[A-Za-z0-9]+$/),
  razorpay_signature: z.string().regex(/^[a-fA-F0-9]{64}$/),
})
const decision = z.strictObject({ status: z.enum(['ACCEPTED', 'REJECTED']) })
const ticket = z.strictObject({ assetId: z.string().min(1).max(100), description: z.string().trim().min(10).max(2000) })
const access = schema.requestCode.extend({ approved: z.boolean() })
const cookie = 'suryadesk_customer'
const seller = () => ({
  name: process.env.INVOICE_SELLER_NAME || 'SuryaDesk',
  address: process.env.INVOICE_SELLER_ADDRESS,
  pan: process.env.INVOICE_SELLER_PAN,
  gstin: process.env.INVOICE_SELLER_GSTIN,
})

function sendPdf(response, reference, file) {
  const name = reference.replace(/^DEMO-/, '').replace(/[^a-z0-9_-]/gi, '-')
  response.attachment(name + '.pdf').send(file)
}

export function customerPortalRoutes(db, staffAuth, config, sendEmail, fetchRazorpay) {
  const router = Router()
  const accounts = customerAuthService(db, config.JWT_SECRET, sendEmail)
  const portal = portalService(db)
  const checkout = razorpayCheckout(db, config, fetchRazorpay)
  const cookieOptions = {
    httpOnly: true, secure: config.NODE_ENV === 'production', sameSite: 'strict', path: '/api/v1/customer-portal',
  }
  const api = (response, data, status = 200) => response.status(status).json({ success: true, data })
  const login = (response, token) => response.cookie(cookie, token, { ...cookieOptions, maxAge: 8 * 60 * 60 * 1000 })
  const limit = rateLimit({
    windowMs: 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { success: false, error: { message: 'Too many requests. Try again in a minute.' } },
  })
  const files = attachmentsService(db, undefined, (_db, type, id, account, write) => {
    if (type !== 'TICKET') throw new ApiError(404, 'NOT_FOUND', 'Attachment not found.')
    return portal.authorizeTicket(account, id, write)
  })
  const upload = multer({ limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 0 } }).single('file')

  router.use((request, response, next) => {
    response.set('Cache-Control', 'private, no-store')
    if (['POST', 'PATCH'].includes(request.method) && request.headers.origin &&
      request.headers.origin !== config.CORS_ORIGIN &&
      request.headers.origin !== request.protocol + '://' + request.get('host')) {
      return next(new ApiError(403, 'FORBIDDEN', 'The request origin is not allowed.'))
    }
    next()
  })

  router.patch('/staff/customers/:id/access', authenticate(staffAuth), authorize('users:manage'),
    validate({ params, body: access }), async (request, response) => {
      const { id } = request.validated.params
      const { email, approved } = request.validated.body
      await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${id} FOR UPDATE`
        const changed = await tx.customerAccount.updateMany({ where: { email, customerId: id }, data: { historicalAccess: approved } })
        if (!changed.count) throw new ApiError(404, 'NOT_FOUND', 'No verified account is linked to this customer and email.')
        if (approved && await tx.customerAccount.count({ where: { customerId: id, historicalAccess: true } }) > 1) {
          throw new ApiError(409, 'CONFLICT', 'Revoke the existing historical access before granting it to another account.')
        }
        await tx.auditLog.create({ data: {
          actorId: request.user.id, entityType: 'Customer', entityId: id, action: 'PORTAL_ACCESS_UPDATED', summary: { email, approved },
        } })
      })
      api(response, { approved })
    })

  const codeRequest = (path, validator, handler) => router.post(path, limit, validate({ body: validator }), async (request, response) => {
    const info = await handler(request.validated.body)
    api(response, { requested: true, ...info }, 202)
  })
  codeRequest('/enquiries/start', schema.signup, accounts.signup)
  codeRequest('/enquiries/resend', schema.signupRequest, accounts.resendSignup)
  codeRequest('/otp/request', schema.requestCode, accounts.requestLogin)
  codeRequest('/password/request', schema.requestCode, accounts.requestReset)

  router.post('/enquiries/verify', limit, validate({ body: schema.verifySignup }), async (request, response) => {
    const { token, lead } = await accounts.activate(request.validated.body)
    api(login(response, token), lead, 201)
  })
  for (const [path, validator, handler] of [
    ['/login', schema.login, accounts.login], ['/otp/verify', schema.verifyCode, accounts.loginCode],
  ]) {
    router.post(path, limit, validate({ body: validator }), async (request, response) => {
      api(login(response, await handler(request.validated.body)), { authenticated: true })
    })
  }
  router.post('/password/reset', limit, validate({ body: schema.reset }), async (request, response) => {
    await accounts.reset(request.validated.body)
    api(response.clearCookie(cookie, cookieOptions), { reset: true })
  })

  router.use(async (request, _response, next) => {
    const value = request.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(cookie + '='))
    request.account = await accounts.verify(value?.slice(cookie.length + 1))
    next()
  })
  router.get('/profile', async (request, response) => api(response, await accounts.profile(request.account.id)))
  router.patch('/profile', validate({ body: schema.profile }), async (request, response) => {
    api(response, await accounts.updateProfile(request.account.id, request.validated.body))
  })
  router.post('/password/change', limit, validate({ body: schema.changePassword }), async (request, response) => {
    api(login(response, await accounts.changePassword(request.account, request.validated.body)), { changed: true })
  })
  router.post('/logout', async (request, response) => {
    await accounts.logout(request.account.sessionId)
    api(response.clearCookie(cookie, cookieOptions), { authenticated: false })
  })
  router.post('/enquiries', limit, validate({ body: schema.extraEnquiry }), async (request, response) => {
    api(response, await accounts.enquiry(request.account, request.validated.body), 201)
  })
  router.get('/records', async (request, response) => api(response, {
    ...await portal.records(request.account), razorpayEnabled: checkout.enabled,
  }))
  router.post('/checkout/:kind/:id', limit, validate({ params: checkoutParams, body: checkoutAmount }), async (request, response) => {
    const { kind, id } = request.validated.params
    api(response, await checkout.start(request.account, kind, id, request.validated.body.amountPaise))
  })
  router.post('/checkout/:kind/:id/verify', limit, validate({ params: checkoutParams, body: checkoutProof }), async (request, response) => {
    const { kind, id } = request.validated.params
    api(response, await checkout.verify(request.account, kind, id, request.validated.body))
  })
  router.post('/quotations/:id/decision', validate({ params, body: decision }), async (request, response) => {
    api(response, await portal.decide(request.account, request.validated.params.id, request.validated.body.status))
  })
  router.get('/quotations/:id/pdf', validate({ params }), async (request, response) => {
    const row = await portal.quote(request.account, request.validated.params.id)
    sendPdf(response, row.quoteNumber, await quotationPdf(row))
  })
  router.get('/invoices/:id/pdf', validate({ params }), async (request, response) => {
    const row = await portal.invoice(request.account, request.validated.params.id)
    sendPdf(response, row.invoiceNumber, await invoicePdf(row, seller()))
  })
  router.get('/payments/:id/receipt', validate({ params }), async (request, response) => {
    const row = await portal.payment(request.account, request.validated.params.id)
    sendPdf(response, row.reference || row.order.orderNumber, await receiptPdf(row))
  })
  router.get('/warranties/:id/pdf', validate({ params }), async (request, response) => {
    const row = await portal.warranty(request.account, request.validated.params.id)
    sendPdf(response, row.serialNumber, await warrantyPdf(row))
  })
  router.post('/tickets', limit, validate({ body: ticket }), async (request, response) => {
    api(response, await portal.createTicket(request.account, request.validated.body), 201)
  })
  router.post('/tickets/:id/confirm', validate({ params }), async (request, response) => {
    api(response, await portal.confirmTicket(request.account, request.validated.params.id))
  })
  router.post('/tickets/:id/photo', limit, validate({ params }), (request, response, next) => {
    upload(request, response, error => next(error && new ApiError(400, 'INVALID_PHOTO', 'Upload one image up to 8 MB.')))
  }, async (request, response) => {
    api(response, await files.upload({ ownerType: 'TICKET', ownerId: request.validated.params.id }, request.file, request.account, null), 201)
  })
  router.get('/photos/:id', validate({ params }), async (request, response, next) => {
    const row = await files.open(request.validated.params.id, request.account, { uploadedById: null })
    response.type(row.mimeType).sendFile(row.path, error => error && next(error))
  })
  return router
}
