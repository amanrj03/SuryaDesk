import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import test from 'node:test'
import bcrypt from 'bcrypt'
import { createApp } from '../src/app.js'
import { readRuntimeConfig } from '../src/config/env.js'
import { createDatabase } from '../src/lib/prisma.js'

test('staff authentication and revocation against PostgreSQL', {
  skip: !process.env.DATABASE_URL,
}, async t => {
  const config = readRuntimeConfig()
  const db = createDatabase(config.DATABASE_URL)
  const email = randomUUID() + '@example.invalid'
  const password = randomUUID()
  const user = await db.user.create({ data: {
    email, name: 'Integration fixture', role: 'SALES', passwordHash: await bcrypt.hash(password, 12),
  } })
  t.after(async () => {
    await db.$transaction([
      db.staffSession.deleteMany({ where: { userId: user.id } }),
      db.user.delete({ where: { id: user.id } }),
    ])
    await db.$disconnect()
  })

  const app = createApp(config, db)
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise(resolve => server.close(resolve)))
  const base = 'http://127.0.0.1:' + server.address().port
  const login = password => fetch(base + '/api/v1/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.toUpperCase(), password }),
  })

  assert.equal((await login('wrong')).status, 401)
  const response = await login(password)
  assert.equal(response.status, 200)
  const { data } = await response.json()
  assert.equal(data.user.email, email)
  assert.equal(data.user.passwordHash, undefined)
  assert.ok(data.user.capabilities.includes('leads:write'))
  const headers = { Authorization: 'Bearer ' + data.accessToken }
  assert.equal((await fetch(base + '/api/v1/auth/me', { headers })).status, 200)
  assert.equal((await fetch(base + '/api/v1/users', { headers })).status, 403)
  assert.equal((await fetch(base + '/api/v1/users/options?kind=surveyor', { headers })).status, 200)
  assert.equal((await fetch(base + '/api/v1/users/options?kind=technician', { headers })).status, 403)
  assert.equal((await fetch(base + '/api/v1/auth/logout', { method: 'POST', headers })).status, 200)
  assert.equal((await fetch(base + '/api/v1/auth/me', { headers })).status, 401)
  await db.user.update({ where: { id: user.id }, data: { isActive: false } })
  assert.equal((await login(password)).status, 401)
})
