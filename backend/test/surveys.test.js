import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { createDatabase } from '../src/lib/prisma.js'
import { roleCapabilities } from '../src/config/permissions.js'
import { surveysService } from '../src/modules/surveys/surveys.service.js'

test('assigned survey submission and approval advance the lead atomically', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const db = createDatabase(process.env.DATABASE_URL)
  const key = randomUUID()
  try {
    await assert.rejects(db.$transaction(async tx => {
      const users = await Promise.all(['SALES', 'SURVEYOR', 'DIRECTOR'].map(role => tx.user.create({
        data: { name: role, email: role + key + '@example.invalid', role, passwordHash: 'fixture' },
      })))
      const [sales, surveyor, director] = users.map(user => ({ ...user, capabilities: roleCapabilities[user.role] }))
      const lead = await tx.lead.create({ data: {
        leadNumber: 'LEAD-' + key, source: 'WEB', status: 'QUALIFIED', subsidyInterest: false,
        customer: { create: { name: 'Survey fixture', phone: '+919876543210', address: 'Test residence' } },
      } })
      const surveys = surveysService({ $transaction: callback => callback(tx) })
      const scheduled = await surveys.schedule(lead.id, { surveyorId: surveyor.id, scheduledAt: new Date() }, sales)
      await assert.rejects(surveys.record(scheduled.id, { status: 'SUBMITTED' }, surveyor), { code: 'INVALID_TRANSITION' })
      await assert.rejects(surveys.approve(scheduled.id, { approved: true }, director), { code: 'INVALID_TRANSITION' })
      await assert.rejects(surveys.record(scheduled.id, { status: 'IN_PROGRESS' }, { ...surveyor, id: sales.id }), { code: 'NOT_FOUND' })
      await surveys.record(scheduled.id, {
        status: 'SUBMITTED', visitedAt: new Date(), roofDirection: 'S', tiltDegrees: 0,
        cableDistanceMeters: 15, shadowFreeArea: 50, gridSuitable: false, findings: 'Suitable for off-grid.',
      }, surveyor)
      const approved = await surveys.approve(scheduled.id, { approved: true }, director)
      assert.equal(approved.status, 'APPROVED')
      assert.equal(approved.lead.status, 'SURVEY_APPROVED')
      assert.equal(await tx.auditLog.count({ where: { entityId: scheduled.id } }), 1)
      throw new Error('Rollback verified survey fixture')
    }), { message: 'Rollback verified survey fixture' })
  } finally {
    await db.$disconnect()
  }
})
