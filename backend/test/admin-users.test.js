import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { createDatabase } from '../src/lib/prisma.js'
import { usersService } from '../src/modules/users/users.service.js'

test('staff role assignment persists and the last active administrator is protected', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const db = createDatabase(process.env.DATABASE_URL)
  const rollback = new Error('rollback fixture')
  try {
    await assert.rejects(db.$transaction(async tx => {
      await tx.$executeRaw`LOCK TABLE "User" IN SHARE ROW EXCLUSIVE MODE`
      const unique = randomUUID()
      const actor = await tx.user.create({ data: {
        name: 'Test administrator', email: unique + '@example.invalid',
        passwordHash: 'fixture', role: 'ADMIN', isActive: true,
      } })
      await tx.user.updateMany({ where: { role: 'ADMIN', id: { not: actor.id } }, data: { isActive: false } })
      const users = usersService({ $transaction: work => work(tx) })
      const created = await users.create({
        name: 'Staff fixture', email: unique + '-staff@example.invalid',
        password: randomUUID(), role: 'SALES', isActive: true,
      }, actor)
      await users.update(created.id, { role: 'WAREHOUSE', isActive: false }, actor)
      const stored = await tx.user.findUniqueOrThrow({ where: { id: created.id } })
      assert.equal(stored.role, 'WAREHOUSE')
      assert.equal(stored.isActive, false)
      await assert.rejects(users.update(actor.id, { isActive: false }, actor), { status: 409 })
      await assert.rejects(users.update(actor.id, { role: 'SALES' }, actor), { status: 409 })
      throw rollback
    }), error => error === rollback)
  } finally {
    await db.$disconnect()
  }
})
