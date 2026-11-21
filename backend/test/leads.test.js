import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import test from 'node:test'
import bcrypt from 'bcrypt'
import { createApp } from '../src/app.js'
import { readRuntimeConfig } from '../src/config/env.js'
import { createDatabase } from '../src/lib/prisma.js'

test('public enquiry reaches the sales queue and requires qualification evidence', {
  skip: !process.env.DATABASE_URL,
}, async t => {
  const config = readRuntimeConfig()
  const db = createDatabase(config.DATABASE_URL)
  const email = randomUUID() + '@example.invalid'
  const password = randomUUID()
  const user = await db.user.create({ data: {
    email, name: 'Sales test', role: 'SALES', passwordHash: await bcrypt.hash(password, 12),
  } })
  let leadNumber
  const fixture = { name: randomUUID(), phone: '+919876543210', address: 'Test residence', desiredKw: 3 }
  t.after(async () => {
    try {
      const lead = leadNumber && await db.lead.findUnique({ where: { leadNumber } })
      if (lead) await db.$transaction([
        db.leadActivity.deleteMany({ where: { leadId: lead.id } }),
        db.lead.delete({ where: { id: lead.id } }),
        db.customer.delete({ where: { id: lead.customerId } }),
      ])
      await db.$transaction([
        db.staffSession.deleteMany({ where: { userId: user.id } }),
        db.user.delete({ where: { id: user.id } }),
      ])
    } finally {
      await db.$disconnect()
    }
  })
  const server = createApp(config, db).listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise(resolve => server.close(resolve)))
  const base = 'http://127.0.0.1:' + server.address().port + '/api/v1'
  let token
  async function request(path, method = 'GET', data) {
    const headers = { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }
    const response = await fetch(base + path, { method, headers, body: JSON.stringify(data) })
    return { status: response.status, body: await response.json() }
  }
  assert.equal((await request('/leads')).status, 401)
  assert.equal((await request('/public/enquiries', 'POST', { ...fixture, phone: '123' })).status, 400)
  const enquiry = await request('/public/enquiries', 'POST', fixture)
  assert.equal(enquiry.status, 201, JSON.stringify(enquiry.body))
  leadNumber = enquiry.body.data.leadNumber
  token = (await request('/auth/login', 'POST', { email, password })).body.data.accessToken
  const list = await request('/leads?q=' + fixture.name)
  assert.equal(list.body.meta.total, 1)
  const customers = await request('/customers?q=' + fixture.name)
  assert.equal(customers.status, 200)
  assert.equal(customers.body.data[0].id, list.body.data[0].customerId)
  const { id } = list.body.data[0]
  assert.equal((await request('/leads/' + id, 'PATCH', { status: 'CONTACTED' })).status, 200)
  assert.equal((await request('/leads/' + id, 'PATCH', { status: 'QUALIFIED' })).status, 409)
  const qualified = await request('/leads/' + id, 'PATCH', {
    status: 'QUALIFIED', roofArea: 50, monthlyBill: '4800.50', gridSuitable: true,
  })
  assert.equal(qualified.status, 200, JSON.stringify(qualified.body))
  assert.equal(qualified.body.data.status, 'QUALIFIED')
  const detail = await request('/leads/' + id)
  assert.equal(detail.body.data.leadActivitiesByLead.length, 3)
})
