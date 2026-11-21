import assert from 'node:assert/strict'
import { once } from 'node:events'
import { after, before, test } from 'node:test'
import { createApp } from '../src/app.js'
import { readConfig } from '../src/config/env.js'

const origin = 'http://localhost:5173'
let server
let baseUrl

before(async () => {
  server = createApp(readConfig({ NODE_ENV: 'test', CORS_ORIGIN: origin })).listen(0)
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`
})

after(() => new Promise((resolve, reject) => {
  server.close(error => error ? reject(error) : resolve())
}))

test('health reports API liveness and allows the configured frontend origin', async () => {
  const response = await fetch(`${baseUrl}/health`, { headers: { Origin: origin } })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('access-control-allow-origin'), origin)
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.deepEqual(await response.json(), { success: true, data: { status: 'ok' } })
})

test('unknown routes return a JSON error and omit unapproved origins', async () => {
  const response = await fetch(`${baseUrl}/unknown`, {
    headers: { Origin: 'https://other.example' },
  })
  assert.equal(response.status, 404)
  assert.equal(response.headers.get('access-control-allow-origin'), null)
  assert.equal((await response.json()).error.code, 'NOT_FOUND')
})

test('malformed request bodies return a validation error envelope', async () => {
  const response = await fetch(`${baseUrl}/unknown`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  })
  assert.equal(response.status, 400)
  assert.equal((await response.json()).error.code, 'INVALID_JSON')
})

test('invalid environment values fail validation', () => {
  assert.throws(() => readConfig({ PORT: 'invalid' }))
})
