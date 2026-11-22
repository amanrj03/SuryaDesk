import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { ApiError } from '../../utils/ApiError.js'
import { paymentTotals, recordOrderPayment } from '../payments/payments.service.js'
import { ownership } from './portal.service.js'

const missing = () => new ApiError(404, 'NOT_FOUND', 'This payment record is unavailable.')
const conflict = message => new ApiError(409, 'PAYMENT_CONFLICT', message)
const unavailable = () => new ApiError(503, 'RAZORPAY_UNAVAILABLE', 'Razorpay Test Checkout is temporarily unavailable.')
const gatewayMethods = { card: 'CARD', upi: 'UPI', netbanking: 'BANK_TRANSFER' }

export function razorpayCheckout(db, config, fetchGateway = fetch) {
  const key = config.RAZORPAY_KEY_ID
  const secret = config.RAZORPAY_KEY_SECRET
  const enabled = config.NODE_ENV !== 'production' && /^rzp_test_[A-Za-z0-9]+$/.test(key ?? '') && Boolean(secret)

  async function gateway(path, body) {
    try {
      const response = await fetchGateway('https://api.razorpay.com/v1' + path, {
        method: body ? 'POST' : 'GET',
        headers: {
          Authorization: 'Basic ' + Buffer.from(key + ':' + secret).toString('base64'),
          ...(body && { 'Content-Type': 'application/json' }),
        },
        body: body && JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      })
      if (response.ok) return await response.json()
    } catch {
      throw unavailable()
    }
    throw unavailable()
  }

  async function target(tx, account, kind, id) {
    const scope = ownership(account)
    if (kind === 'orders') {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${id} FOR UPDATE`
      const row = await tx.order.findFirst({ where: { id, ...scope.order } })
      if (!row) throw missing()
      const paid = await tx.payment.aggregate({ where: { orderId: id, voidedAt: null }, _sum: { amount: true } })
      return { eligible: row.status !== 'CANCELLED', balance: paymentTotals(row.total, paid._sum.amount ?? undefined).balance }
    }
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${id} FOR UPDATE`
    const row = await tx.invoice.findFirst({ where: { ...scope.invoices, id, orderId: null, ticketId: { not: null } } })
    if (!row) throw missing()
    return { eligible: row.status === 'ISSUED', balance: row.total }
  }

  async function settle(tx, account, attempt, due, payment) {
    if (payment.order_id !== attempt.providerOrderId || payment.currency !== 'INR' ||
      payment.amount !== Number(attempt.amountPaise) || payment.status !== 'captured' ||
      payment.captured !== true || payment.amount_refunded !== 0 || !/^pay_[A-Za-z0-9]+$/.test(payment.id)) {
      throw conflict('The captured payment could not be matched to this checkout.')
    }
    const amount = due.balance
    if (!due.eligible || !amount.mul(100).eq(payment.amount)) {
      throw conflict('The balance changed after checkout opened. Contact support with your Razorpay payment reference.')
    }
    const capturedAt = new Date()
    if (attempt.kind === 'orders') {
      await recordOrderPayment(tx, attempt.targetId, {
        amount, reference: payment.id, method: gatewayMethods[payment.method] ?? 'OTHER', receivedAt: capturedAt,
      }, { customerAccountId: account.id })
    } else {
      await tx.invoice.update({ where: { id: attempt.targetId }, data: { status: 'PAID', paidAt: capturedAt } })
      await tx.auditLog.create({ data: {
        entityType: 'Invoice', entityId: attempt.targetId, action: 'PAYMENT_RECORDED',
        summary: { customerAccountId: account.id, amount: amount.toFixed(2), reference: payment.id },
      } })
    }
    await tx.razorpayCheckout.update({
      where: { id: attempt.id }, data: { providerPaymentId: payment.id, capturedAt },
    })
    return { paid: true }
  }

  function transact(account, kind, id, callback) {
    if (!enabled) throw unavailable()
    return db.$transaction(async tx => {
      const due = await target(tx, account, kind, id)
      return callback(tx, due)
    }, { timeout: 30_000 })
  }

  return {
    enabled,
    start(account, kind, id) {
      return transact(account, kind, id, async (tx, due) => {
        const pending = await tx.razorpayCheckout.findMany({
          where: { kind, targetId: id, providerPaymentId: null }, orderBy: { createdAt: 'desc' },
        })
        let reusable
        for (const attempt of pending) {
          const { items } = await gateway('/orders/' + attempt.providerOrderId + '/payments')
          const captured = items.find(payment => payment.status === 'captured')
          if (captured) return settle(tx, account, attempt, due, captured)
          if (items.some(payment => payment.status === 'authorized')) {
            throw conflict('Razorpay is still confirming a payment. Try again shortly.')
          }
          if (due.balance.mul(100).eq(attempt.amountPaise.toString())) reusable = attempt
        }
        if (!due.eligible || !due.balance.greaterThan(0)) throw conflict('This record has no balance available for online payment.')
        const amount = due.balance.mul(100).toNumber()
        if (!Number.isSafeInteger(amount) || amount < 100) throw conflict('Razorpay Checkout requires a balance of at least ₹1.')
        if (!reusable) {
          const order = await gateway('/orders', { amount, currency: 'INR', receipt: randomUUID(), partial_payment: false })
          if (order.amount !== amount || order.currency !== 'INR' || !/^order_[A-Za-z0-9]+$/.test(order.id)) throw unavailable()
          reusable = await tx.razorpayCheckout.create({
            data: { kind, targetId: id, providerOrderId: order.id, amountPaise: BigInt(amount) },
          })
        }
        return { key, amount, currency: 'INR', orderId: reusable.providerOrderId }
      })
    },
    verify(account, kind, id, body) {
      return transact(account, kind, id, async (tx, due) => {
        const attempt = await tx.razorpayCheckout.findFirst({
          where: { kind, targetId: id, providerOrderId: body.razorpay_order_id },
        })
        if (!attempt) throw missing()
        const digest = createHmac('sha256', secret).update(attempt.providerOrderId + '|' + body.razorpay_payment_id).digest()
        if (!timingSafeEqual(digest, Buffer.from(body.razorpay_signature, 'hex'))) {
          throw new ApiError(400, 'INVALID_PAYMENT_SIGNATURE', 'The Razorpay payment signature is invalid.')
        }
        if (attempt.providerPaymentId === body.razorpay_payment_id) return { paid: true }
        if (attempt.providerPaymentId) throw conflict('This checkout already has a recorded payment.')
        const payment = await gateway('/payments/' + body.razorpay_payment_id)
        if (payment.id !== body.razorpay_payment_id) throw conflict('Razorpay returned a different payment reference.')
        if (payment.status === 'authorized') throw conflict('Razorpay is still confirming the payment. Try again shortly.')
        return settle(tx, account, attempt, due, payment)
      })
    },
  }
}
