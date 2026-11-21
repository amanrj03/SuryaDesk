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
      const app = createApp({ CORS_ORIGIN: 'http://localhost:5173', JWT_SECRET: process.env.JWT_SECRET }, database)
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
      try {
        const enquiry = await post('/public/enquiries', { name: key, phone: '+910000000000', address: 'Test residence', desiredKw: '2.00' })
        token = (await post('/auth/login', { email, password })).accessToken
        const [lead] = await request('GET', '/leads?q=' + enquiry.leadNumber)
        await patch('/leads/' + lead.id, { status: 'CONTACTED' })
        await patch('/leads/' + lead.id, { status: 'QUALIFIED', roofArea: 40, monthlyBill: '2100.00', gridSuitable: true })
        const survey = await post('/leads/' + lead.id + '/surveys', { surveyorId: admin.id, scheduledAt: new Date().toISOString() })
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
        await post('/quotes/' + quote.id + '/send')
        const accepted = await post('/quotes/' + quote.id + '/accept')
        assert.ok(accepted.orderByQuotation?.id)
        const order = await post('/quotes/' + quote.id + '/convert-to-order')
        assert.equal(order.id, accepted.orderByQuotation.id)
        assert.equal(order.tax, '12.5')
        assert.equal(order.orderLinesByOrder.find(line => line.productId === product.id).taxRateSnapshot, '5')
        const payment = await post('/orders/' + order.id + '/payments', { amount: '262.50', method: 'UPI', reference: key })
        assert.equal(payment.balance, '0')
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
        const invoice = await post('/invoices/for-order/' + order.id)
        assert.equal(invoice.status, 'DRAFT')
        assert.equal(invoice.invoiceLinesByInvoice.length, 1)
        assert.equal(invoice.invoiceLinesByInvoice[0].taxAmount, '12.5')
        assert.equal(invoice.total, '262.5')
        assert.equal((await post('/invoices/for-order/' + order.id)).id, invoice.id)
        assert.equal((await fetch(url + '/invoices/' + invoice.id + '/pdf')).status, 401)
        const pdf = await fetch(url + '/invoices/' + invoice.id + '/pdf', {
          headers: { Authorization: 'Bearer ' + token },
        })
        assert.equal(pdf.status, 200)
        assert.match(pdf.headers.get('content-type'), /^application\/pdf/)
        assert.match(pdf.headers.get('content-disposition'), /attachment;.*\.pdf/)
        assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), '%PDF-')
        await post(dispatch + '/dispatch')
        const tracking = await post('/orders/' + order.id + '/tracking-link')
        const inTransit = await post('/public/tracking', { token: tracking.token })
        assert.deepEqual(inTransit.timeline.map(event => event.stage), [
          'ENQUIRY_RECEIVED', 'SITE_SURVEYED', 'SURVEY_APPROVED', 'QUOTATION_ISSUED',
          'QUOTATION_ACCEPTED', 'ORDER_CONFIRMED', 'DISPATCHED', 'DELIVERED',
        ])
        assert.ok(inTransit.timeline.slice(0, -1).every(event => event.at))
        assert.equal(inTransit.timeline.at(-1).at, null)
        const delivered = await post(dispatch + '/deliver', { recipientName: key })
        const tracked = await post('/public/tracking', { token: tracking.token })
        assert.equal(tracked.timeline.at(-1).at, delivered.deliveredAt)
        const coverage = await request('GET', '/assets/' + key + '/warranty')
        assert.equal(coverage.coveredAsOf, true)
        assert.equal(coverage.warranty.startAt, delivered.deliveredAt)

        const installationId = order.installationByOrder.id
        const installation = '/installations/' + installationId
        await patch(installation, { technicianIds: [admin.id], scheduledAt: new Date().toISOString() })
        await patch(installation, { startedAt: new Date().toISOString(), generationReading: 1.8 })
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
        const ticket = await post('/tickets', { customerId: order.customerId, assetId: coverage.asset.id,
          description: 'Test alarm on supplied panel circuit', priority: 'LOW' })
        const resolution = await post('/tickets/' + ticket.id + '/resolve', { coverageDecision: 'COVERED', resolutionNotes: 'Reconnected the circuit.' })
        assert.equal(resolution.invoiceByTicket, null)
        const closed = await post('/tickets/' + ticket.id + '/confirm', { customerConfirmationName: key })
        assert.equal(closed.status, 'CLOSED')
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
