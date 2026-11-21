import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, readdir, rmdir, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import bcrypt from 'bcrypt'
import { createApp } from '../src/app.js'
import { createDatabase } from '../src/lib/prisma.js'

test('Express connects public intake to paid delivery, signed completion, and covered service', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const db = createDatabase(process.env.DATABASE_URL)
  const key = randomUUID().toUpperCase()
  const email = key.toLowerCase() + '@example.invalid'
  const password = randomUUID()
  const root = await mkdtemp(join(tmpdir(), 'suryadesk-journey-'))
  process.env.UPLOAD_DIR = root
  try {
    await assert.rejects(db.$transaction(async tx => {
      const admin = await tx.user.create({ data: {
        name: 'Journey fixture', email, role: 'ADMIN', passwordHash: await bcrypt.hash(password, 4),
      } })
      const database = new Proxy(tx, {
        get(target, property, receiver) {
          if (property === '$transaction') return work => typeof work === 'function' ? work(tx) : Promise.all(work)
          return Reflect.get(target, property, receiver)
        },
      })
      const messages = new Map()
      const app = createApp({ CORS_ORIGIN: 'http://localhost:5173', JWT_SECRET: process.env.JWT_SECRET }, database, {
        sendCustomerEmail: async ({ email, message }) => messages.set(email, message),
      })
      const server = app.listen(0, '127.0.0.1')
      await once(server, 'listening')
      const url = 'http://127.0.0.1:' + server.address().port + '/api/v1'
      let token
      async function request(method, path, body) {
        const multipart = body instanceof FormData
        const response = await fetch(url + path, {
          method, body: multipart ? body : JSON.stringify(body),
          headers: { ...(!multipart && { 'Content-Type': 'application/json' }),
            ...(token && { Authorization: 'Bearer ' + token }) },
        })
        const result = await response.json()
        assert.ok(response.ok, path + ' returned ' + response.status + ': ' + JSON.stringify(result))
        return result.data
      }
      const post = (path, body = {}) => request('POST', path, body)
      const patch = (path, body) => request('PATCH', path, body)
      let cookie
      const portal = (path, { method = 'GET', body, session = cookie } = {}) => fetch(url + '/customer-portal' + path, {
        method, body: body instanceof FormData ? body : JSON.stringify(body),
        headers: {
          ...(session && { Cookie: session }),
          ...(body != null && !(body instanceof FormData) && { 'Content-Type': 'application/json' }),
        },
      })
      async function portalData(path, options, status = 200) {
        const response = await portal(path, options)
        const result = await response.json()
        assert.equal(response.status, status, path + ' ' + JSON.stringify(result))
        return result.data
      }
      async function portalPdf(path) {
        const response = await portal(path)
        assert.equal(response.status, 200)
        assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString(), '%PDF-')
      }
      const code = () => messages.get(email).match(/\b\d{6}\b/)?.[0]
      try {
        const legacy = await post('/public/enquiries', { name: key, email, phone: '+910000000000', address: 'Test residence' })
        const legacyLead = await tx.lead.findUniqueOrThrow({ where: { leadNumber: legacy.leadNumber } })
        const signup = { name: key, phone: '+910000000000', email, address: 'Test residence', desiredKw: '2.00', password, confirmPassword: password }
        assert.equal((await portal('/records')).status, 401)
        const { requestId } = await portalData('/enquiries/start', { method: 'POST', body: signup }, 202)
        assert.equal(await tx.customerAccount.count({ where: { email } }), 0)
        const activationBody = { email, requestId, code: code() }
        assert.equal((await portal('/enquiries/verify', { method: 'POST', body: { ...activationBody, requestId: randomUUID() } })).status, 400)
        const activation = await portal('/enquiries/verify', { method: 'POST', body: activationBody })
        assert.equal(activation.status, 201, await activation.clone().text())
        cookie = activation.headers.get('set-cookie').split(';')[0]
        const enquiry = (await activation.json()).data
        assert.equal((await portal('/enquiries/verify', { method: 'POST', body: activationBody })).status, 400)
        assert.equal((await portalData('/records')).requests.length, 1)
        assert.equal(await tx.customer.count({ where: { email } }), 1)
        const received = await post('/public/tracking', { token: enquiry.leadNumber.toLowerCase() })
        assert.equal(received.trackingId, enquiry.leadNumber)
        assert.equal(received.status, 'NEW')
        assert.ok(received.timeline[0].at)
        assert.ok(received.timeline.slice(1).every(event => event.at === null))
        token = (await post('/auth/login', { email, password })).accessToken
        const approval = '/customer-portal/staff/customers/' + legacyLead.customerId + '/access'
        assert.equal((await portal('/staff/customers/' + legacyLead.customerId + '/access', {
          method: 'PATCH', body: { email, approved: true },
        })).status, 401)
        await patch(approval, { email, approved: true })
        assert.equal((await portalData('/records')).requests.length, 2)
        await patch(approval, { email, approved: false })
        assert.equal((await portalData('/records')).requests.length, 1)
        const [lead] = await request('GET', '/leads?q=' + enquiry.leadNumber)
        const related = (section, id) => request('GET', '/workflow/' + section + '/' + id + '/related')
        assert.deepEqual(await related('leads', lead.id), [])
        await patch('/leads/' + lead.id, { status: 'CONTACTED' })
        await patch('/leads/' + lead.id, { status: 'QUALIFIED', roofArea: 40, monthlyBill: '2100.00', gridSuitable: true })
        const survey = await post('/leads/' + lead.id + '/surveys', { surveyorId: admin.id, scheduledAt: new Date().toISOString() })
        assert.deepEqual((await related('leads', lead.id)).map(link => link.section), ['surveys'])
        assert.deepEqual((await related('surveys', survey.id)).map(link => link.section), ['leads'])
        await patch('/surveys/' + survey.id, { status: 'SUBMITTED', visitedAt: new Date().toISOString(),
          roofDirection: 'S', tiltDegrees: 12, cableDistanceMeters: 15, shadowFreeArea: 40,
          gridSuitable: true, findings: 'Clear roof and cable route.' })

        const surveyPhoto = new FormData()
        surveyPhoto.set('ownerType', 'SURVEY')
        surveyPhoto.set('ownerId', survey.id)
        surveyPhoto.set('file', new Blob([
          Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+Yv1cAAAAASUVORK5CYII=', 'base64'),
        ], { type: 'image/png' }), 'survey-photo.png')
        const surveyEvidence = await post('/attachments', surveyPhoto)
        const surveyDetail = await request('GET', '/surveys/' + survey.id)
        assert.equal(surveyDetail.attachments[0].id, surveyEvidence.id)
        await post('/surveys/' + survey.id + '/approve', { approved: true })
        const product = await post('/products', { sku: key, name: 'Demo panel', category: 'PANEL', unit: 'unit',
          cost: '120.00', salePrice: '200.00', taxRate: '5', serialized: true, warrantyMonths: 240, reorderLevel: 1 })
        const pack = await post('/packages', { code: key, name: 'Journey package', type: 'PANEL_SET',
          basePrice: '250.00', components: [{ productId: product.id, quantity: 1 }] })
        const quote = await post('/quotes', { leadId: lead.id, surveyId: survey.id, packageId: pack.id })
        assert.deepEqual((await portalData('/records')).requests[0].quotationsByLead, [])
        assert.equal((await portal('/quotations/' + quote.id + '/pdf')).status, 404)
        await post('/quotes/' + quote.id + '/send')
        await portalPdf('/quotations/' + quote.id + '/pdf')
        await portalData('/quotations/' + quote.id + '/decision', { method: 'POST', body: { status: 'ACCEPTED' } })
        const order = await post('/quotes/' + quote.id + '/convert-to-order')
        assert.equal(order.id, (await portalData('/records')).orders[0].id)
        assert.equal((await post('/public/tracking', { token: enquiry.leadNumber })).orderNumber, order.orderNumber)
        const pendingWarranties = await post('/public/warranties', { orderNumber: order.orderNumber })
        assert.equal(pendingWarranties.signedAt, null)
        assert.deepEqual(pendingWarranties.products, [])
        assert.equal(order.tax, '12.5')
        assert.equal(order.orderLinesByOrder.find(line => line.productId === product.id).taxRateSnapshot, '5')
        const payment = await post('/orders/' + order.id + '/payments', { amount: '150.00', method: 'UPI', reference: key })
        assert.equal(payment.balance, '112.5')
        assert.deepEqual((await portalData('/records')).invoices, [])
        await portalPdf('/payments/' + payment.payment.id + '/receipt')
        const items = [{ productId: product.id, quantity: 1, serialNumbers: [key] }]
        const dispatch = '/dispatches/' + order.dispatchesByOrder[0].id
        const options = () => request('GET', dispatch + '/allocation-options')
        assert.deepEqual(await options(), [{
          productId: product.id, name: product.name, quantity: 1, serialized: true, available: 0,
        }])
        await post('/inventory/receipts', { ...items[0], unitCost: '120.00' })
        assert.equal((await options())[0].available, 1)
        const assetQuery = '/assets?status=IN_STOCK&unassigned=true&productId=' + product.id + '&serialNumber=' + key
        assert.equal((await request('GET', assetQuery))[0].serialNumber, key)
        await post(dispatch + '/allocate', { items })
        assert.deepEqual(await request('GET', assetQuery), [])
        assert.equal((await fetch(url + '/invoices/for-order/' + order.id, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token },
        })).status, 409)
        await post(dispatch + '/dispatch')
        const tracking = await post('/orders/' + order.id + '/tracking-link')
        const inTransit = await post('/public/tracking', { token: tracking.token })
        assert.deepEqual(inTransit.timeline.map(event => event.stage), [
          'ENQUIRY_RECEIVED', 'SITE_SURVEYED', 'SURVEY_APPROVED', 'QUOTATION_ISSUED',
          'QUOTATION_ACCEPTED', 'ORDER_CONFIRMED', 'DISPATCHED', 'DELIVERED',
          'INSTALLATION_IN_PROGRESS', 'INSTALLATION_COMPLETED',
        ])
        assert.ok(inTransit.timeline.slice(0, -3).every(event => event.at))
        assert.ok(inTransit.timeline.slice(-3).every(event => event.at === null))
        const delivered = await post(dispatch + '/deliver', { recipientName: key })
        const deliveredRecords = await portalData('/records')
        assert.equal(deliveredRecords.orders[0].balance, '112.5')
        assert.deepEqual(deliveredRecords.invoices, [])
        assert.equal(await tx.invoice.count({ where: { orderId: order.id } }), 0)
        const legacyInvoice = await tx.invoice.create({ data: {
          invoiceNumber: 'LEGACY-' + key, orderId: order.id, customerId: order.customerId,
          subtotal: order.subtotal, total: order.total, tax: order.tax,
          status: 'PARTIALLY_PAID', issuedAt: new Date(),
        } })
        assert.deepEqual((await portalData('/records')).invoices, [])
        assert.equal((await portal('/invoices/' + legacyInvoice.id + '/pdf')).status, 404)
        await tx.invoice.update({ where: { id: legacyInvoice.id }, data: { status: 'PAID' } })
        assert.deepEqual((await portalData('/records')).invoices, [])
        assert.equal((await portal('/invoices/' + legacyInvoice.id + '/pdf')).status, 404)
        await portalPdf('/payments/' + payment.payment.id + '/receipt')
        await tx.invoice.delete({ where: { id: legacyInvoice.id } })
        const final = await post('/orders/' + order.id + '/payments', { amount: '112.50', method: 'BANK_TRANSFER' })
        assert.equal(final.balance, '0')
        const paidRecords = await portalData('/records')
        const [invoice] = paidRecords.invoices
        assert.equal(paidRecords.invoices.length, 1)
        assert.equal(invoice.status, 'PAID')
        assert.equal(invoice.total, '262.5')
        const invoiceDetail = await request('GET', '/invoices/' + invoice.id)
        const workflow = await related('invoices', invoice.id)
        assert.deepEqual(workflow.map(link => [link.section, link.id]), [
          ['leads', lead.id], ['surveys', survey.id], ['quotes', quote.id], ['orders', order.id],
          ['dispatches', order.dispatchesByOrder[0].id], ['installations', order.installationByOrder.id],
        ])
        const staffToken = token
        const salesEmail = 'sales-' + email
        await tx.user.create({ data: { name: 'Sales fixture', email: salesEmail, role: 'SALES', passwordHash: admin.passwordHash } })
        token = (await post('/auth/login', { email: salesEmail, password })).accessToken
        assert.deepEqual((await related('orders', order.id)).map(link => link.section), ['leads', 'surveys', 'quotes'])
        assert.equal((await fetch(url + '/workflow/invoices/' + invoice.id + '/related', {
          headers: { Authorization: 'Bearer ' + token },
        })).status, 403)
        token = staffToken
        assert.equal(invoiceDetail.invoiceLinesByInvoice.length, 1)
        assert.equal(invoiceDetail.invoiceLinesByInvoice[0].taxAmount, '12.5')
        const staffInvoicePdf = id => fetch(url + '/invoices/' + id + '/pdf', { headers: { Authorization: 'Bearer ' + token } })
        await tx.order.update({ where: { id: order.id }, data: { status: 'READY_TO_DISPATCH' } })
        assert.deepEqual((await portalData('/records')).invoices, [])
        assert.equal((await portal('/invoices/' + invoice.id + '/pdf')).status, 404)
        assert.equal((await staffInvoicePdf(invoice.id)).status, 409)
        await portalPdf('/payments/' + final.payment.id + '/receipt')
        await tx.order.update({ where: { id: order.id }, data: { status: 'DELIVERED' } })
        await tx.payment.update({ where: { id: final.payment.id }, data: { voidedAt: new Date() } })
        assert.equal((await request('GET', '/orders/' + order.id)).invoiceByOrder.downloadable, false)
        assert.equal((await request('GET', dispatch)).order.invoiceByOrder.downloadable, false)
        assert.equal((await staffInvoicePdf(invoice.id)).status, 409)
        assert.equal((await portal('/invoices/' + invoice.id + '/pdf')).status, 404)
        await tx.payment.update({ where: { id: final.payment.id }, data: { voidedAt: null } })
        const staffPdf = await staffInvoicePdf(invoice.id)
        assert.equal(staffPdf.status, 200)
        assert.equal(Buffer.from(await staffPdf.arrayBuffer()).subarray(0, 5).toString(), '%PDF-')
        await portalPdf('/invoices/' + invoice.id + '/pdf')
        await portalPdf('/payments/' + final.payment.id + '/receipt')
        const paidOrder = paidRecords.orders[0]
        const tracked = await post('/public/tracking', { token: tracking.token })
        assert.equal(tracked.timeline.find(event => event.stage === 'DELIVERED').at, delivered.deliveredAt)
        assert.deepEqual(tracked.warranties, [])
        assert.deepEqual((await post('/public/warranties', { orderNumber: order.orderNumber })).products, [])
        assert.equal((await request('GET', '/assets/' + key + '/warranty')).coveredAsOf, false)

        const installationId = order.installationByOrder.id
        const installation = '/installations/' + installationId
        await patch(installation, { technicianIds: [admin.id], scheduledAt: new Date().toISOString() })
        for (const value of [order.orderNumber.toLowerCase(), key.toLowerCase()]) {
          const results = await request('GET', '/installations?status=SCHEDULED&q=' + encodeURIComponent(value))
          assert.deepEqual(results.map(row => row.id), [installationId])
        }
        assert.deepEqual(await request('GET', '/installations?status=COMPLETED&q=' + order.orderNumber), [])
        const started = await patch(installation, { startedAt: new Date().toISOString(), generationReading: 1.8 })
        const installing = await post('/public/tracking', { token: tracking.token })
        assert.deepEqual(installing.timeline.slice(-2), [
          { stage: 'INSTALLATION_IN_PROGRESS', at: started.startedAt },
          { stage: 'INSTALLATION_COMPLETED', at: null },
        ])
        const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+Yv1cAAAAASUVORK5CYII=', 'base64')
        async function evidence(filename) {
          const form = new FormData()
          form.set('ownerType', 'INSTALLATION')
          form.set('ownerId', installationId)
          form.set('file', new Blob([png], { type: 'image/png' }), filename)
          return post('/attachments', form)
        }
        await evidence('roof.png')
        const signature = await evidence('signature.png')
        const signed = await post(installation + '/complete', { finishedAt: new Date().toISOString(),
          capacityKw: 2, checklist: { mounting: true, electrical: true, earthing: true, generation: true },
          generationTestPassed: true, signatureAttachmentId: signature.id, customerSignerName: key })
        assert.equal(signed.order.status, 'COMPLETED')
        const completed = await post('/public/tracking', { token: tracking.token })
        assert.equal(completed.timeline.at(-1).at, signed.signedAt)
        const warrantyLookup = await post('/public/warranties', { orderNumber: order.orderNumber.toLowerCase() })
        assert.equal(warrantyLookup.signedAt, signed.signedAt)
        const [warranty] = warrantyLookup.products[0].coverage
        assert.deepEqual(warranty, { startAt: signed.signedAt, endAt: completed.warranties[0].endAt, months: 240, status: 'ACTIVE' })
        const coverage = await request('GET', '/assets/' + key + '/warranty')
        assert.equal(coverage.coveredAsOf, true)
        assert.equal(coverage.warranty.startAt, signed.signedAt)
        const asset = (await portalData('/records')).assets[0]
        assert.equal(asset.warrantyByAsset.startAt, signed.signedAt)
        await portalPdf('/warranties/' + asset.id + '/pdf')
        const ticket = await portalData('/tickets', { method: 'POST', body: {
          assetId: coverage.asset.id, description: 'Test alarm on supplied panel circuit',
        } }, 201)
        const photo = new FormData()
        photo.append('file', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+Yv1cAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'issue.png')
        const ticketPhoto = await portalData('/tickets/' + ticket.id + '/photo', { method: 'POST', body: photo }, 201)
        assert.equal((await portal('/photos/' + ticketPhoto.id)).status, 200)
        const otherEmail = randomUUID() + '@example.invalid'
        await tx.customerAccount.create({ data: {
          email: otherEmail, name: 'Unrelated account', phone: '+910000000001', address: 'Another property',
          passwordHash: await bcrypt.hash(password, 4),
          customer: { create: { name: 'Unrelated account', phone: '+910000000001', address: 'Another property' } },
        } })
        const otherLogin = await portal('/login', { method: 'POST', body: { email: otherEmail, password } })
        assert.equal(otherLogin.status, 200)
        const otherSession = otherLogin.headers.get('set-cookie').split(';')[0]
        assert.deepEqual((await portalData('/records', { session: otherSession })).orders, [])
        for (const path of [
          '/quotations/' + quote.id + '/pdf', '/invoices/' + invoice.id + '/pdf', '/warranties/' + asset.id + '/pdf',
          '/payments/' + paidOrder.paymentsByOrder[0].id + '/receipt', '/photos/' + ticketPhoto.id,
        ]) {
          assert.equal((await portal(path, { session: otherSession })).status, 404, path)
        }
        assert.equal((await portal('/tickets/' + ticket.id + '/confirm', { session: otherSession, method: 'POST' })).status, 404)
        const resolution = await post('/tickets/' + ticket.id + '/resolve', { coverageDecision: 'COVERED', resolutionNotes: 'Reconnected the circuit.' })
        assert.equal(resolution.invoiceByTicket, null)
        const closed = await portalData('/tickets/' + ticket.id + '/confirm', { method: 'POST' })
        assert.equal(closed.status, 'CLOSED')
        await portalData('/enquiries', { method: 'POST', body: { address: 'Another site', notes: 'Second rooftop' } }, 201)
        assert.equal((await portalData('/records')).requests.length, 2)
        assert.equal(await tx.customer.count({ where: { email } }), 1)
        await portalData('/logout', { method: 'POST' })
        assert.equal((await portal('/records')).status, 401)
        const passwordLogin = await portal('/login', { method: 'POST', body: { email, password } })
        assert.equal(passwordLogin.status, 200)
        cookie = passwordLogin.headers.get('set-cookie').split(';')[0]
        await portalData('/otp/request', { method: 'POST', body: { email } }, 202)
        const otp = { email, code: code() }
        const otpLogin = await portal('/otp/verify', { method: 'POST', body: otp })
        assert.equal(otpLogin.status, 200)
        assert.equal((await portal('/otp/verify', { method: 'POST', body: otp })).status, 400)
        await portalData('/password/request', { method: 'POST', body: { email } }, 202)
        const replacement = randomUUID()
        await portalData('/password/reset', { method: 'POST', body: { email, code: code(), password: replacement, confirmPassword: replacement } })
        assert.equal((await portal('/profile')).status, 401)
        assert.equal((await portal('/login', { method: 'POST', body: { email, password: replacement } })).status, 200)
      } finally {
        await new Promise(resolve => server.close(resolve))
      }
      throw new Error('Rollback verified connected journey')
    }, { timeout: 20000 }), { message: 'Rollback verified connected journey' })
  } finally {
    await db.$disconnect()
    for (const name of await readdir(root)) await unlink(join(root, name))
    await rmdir(root)
  }
})

test('customer codes enforce expiry, resend cooldown, and verification limits', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const db = createDatabase(process.env.DATABASE_URL)
  const email = randomUUID() + '@example.invalid'
  try {
    await assert.rejects(db.$transaction(async tx => {
      const { customerAuthService } = await import('../src/modules/portal/customer-auth.service.js')
      const messages = []
      const proxy = new Proxy(tx, { get(target, property, receiver) {
        return property === '$transaction' ? action => action(tx) : Reflect.get(target, property, receiver)
      } })
      const service = customerAuthService(proxy, process.env.JWT_SECRET, async ({ message }) => messages.push(message))
      const password = randomUUID()
      const signup = { email, password, confirmPassword: password, name: 'Verification fixture',
        phone: '+910000000000', address: 'Test property', subsidyInterest: false }
      const { requestId } = await service.signup(signup)
      const code = () => messages.at(-1).match(/\b\d{6}\b/)[0]
      await service.resendSignup({ email, requestId })
      assert.equal(messages.length, 1)
      const wrongCode = code() === '000000' ? '000001' : '000000'
      for (let i = 0; i < 5; i++) {
        await assert.rejects(service.activate({ email, requestId, code: wrongCode }), { code: 'INVALID_CODE' })
      }
      await assert.rejects(service.activate({ email, requestId, code: code() }), { code: 'INVALID_CODE' })
      const where = { email_purpose: { email, purpose: 'signup' } }
      const past = new Date(Date.now() - 1000)
      await tx.customerChallenge.update({ where, data: { expiresAt: past, resendAfter: past, attempts: 0 } })
      await assert.rejects(service.activate({ email, requestId, code: code() }), { code: 'INVALID_CODE' })
      await service.resendSignup({ email, requestId })
      assert.equal(messages.length, 2)
      const account = await service.activate({ email, requestId, code: code() })
      assert.ok(account.lead.leadNumber)
      assert.equal(await tx.customerAccount.count({ where: { email } }), 1)
      throw new Error('Rollback OTP fixture')
    }), { message: 'Rollback OTP fixture' })
  } finally {
    await db.$disconnect()
  }
})
