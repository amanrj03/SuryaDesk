import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { roleCapabilities } from '../src/config/permissions.js'
import { ticketsService } from '../src/modules/tickets/tickets.service.js'
import { isCovered } from '../src/modules/warranties/coverage.js'
import { daysFrom } from './seed-clock.js'
import { illustration } from './seed-installations.js'

export function seedServiceRate(tx) {
  return tx.serviceLabourRate.upsert({
    where: { id: 'default' }, update: {}, create: { id: 'default', hourlyRate: '900.00' },
  })
}

export async function signSeedRepair(tx, tickets, ticket, technician, { endedAt, repairNotes, signer, index }, writtenMedia) {
  const storageKey = randomUUID()
  const content = illustration(index, true)
  const directory = resolve(process.env.UPLOAD_DIR ?? 'uploads')
  await mkdir(directory, { recursive: true })
  await writeFile(resolve(directory, storageKey), content, { flag: 'wx', mode: 0o600 })
  writtenMedia.push(storageKey)
  const proof = await tx.attachment.create({ data: {
    id: 'DEMO-SIGN-' + storageKey, ownerType: 'TICKET', ownerId: ticket.id, originalName: 'service-customer-signature.png',
    storageKey, mimeType: 'image/png', sizeBytes: content.length, uploadedById: technician.id, createdAt: endedAt,
  } })
  return tickets.reportRepair(ticket.id, { repairNotes, customerSignerName: signer, signatureAttachmentId: proof.id }, technician)
}

export async function seedServiceScenarios(db, writtenMedia) {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(73126)`
    await seedServiceRate(tx)
    const staff = await tx.user.findMany({
      where: { email: { in: ['support@demo.suryadesk.test', 'technician@demo.suryadesk.test'] }, isActive: true },
    })
    const actor = role => {
      const user = staff.find(row => row.role === role)
      if (!user) throw new Error('Seed the active demo support and technician accounts first.')
      return { ...user, capabilities: roleCapabilities[user.role] }
    }
    const support = actor('SUPPORT')
    const technician = actor('TECHNICIAN')
    const assets = await tx.serializedAsset.findMany({
      where: { status: 'INSTALLED', orderId: { startsWith: 'DEMO-ORDER-' }, serialNumber: { startsWith: 'SD-' } },
      orderBy: { serialNumber: 'asc' }, include: { warrantyByAsset: true, customer: true },
    })
    const part = await tx.product.findUnique({
      where: { sku: 'DEMO-CONNECTOR' }, include: { stockBalanceByProduct: true },
    })
    const cases = [
      { key: 'VISIT-ASSIGNED', age: 1, description: 'Inspect a connector that trips during peak generation.' },
      { key: 'VISIT-ACTIVE', age: 0.02, minutes: 0, description: 'Trace the source of intermittent string voltage readings.' },
      { key: 'VISIT-COVERED', age: 3, minutes: 45, description: 'A DC connection became intermittent after heavy rain.',
        notes: 'Replaced the damaged connector and verified stable output under load.' },
      { key: 'VISIT-BILLABLE', age: 5, minutes: 95, billable: true, description: 'Equipment intermittently shuts down under load after warranty expiry.',
        notes: 'Repaired the DC connection and completed a load test with the customer present.' },
    ]
    const usedOrders = new Set((await tx.serviceTicket.findMany({
      where: { ticketNumber: { startsWith: 'DEMO-TKT-VISIT-' } }, select: { orderId: true },
    })).map(row => row.orderId))
    let added = 0
    for (const [index, sample] of cases.entries()) {
      const ticketNumber = 'DEMO-TKT-' + sample.key
      if (await tx.serviceTicket.findUnique({ where: { ticketNumber }, select: { id: true } })) continue
      const incidentAt = daysFrom(new Date(), -sample.age)
      const asset = assets.find(row => row.customer && !usedOrders.has(row.orderId)
        && row.warrantyByAsset?.startAt <= incidentAt
        && (sample.billable ? row.warrantyByAsset.endAt <= incidentAt : isCovered(row.warrantyByAsset, incidentAt)))
      if (!asset) continue
      usedOrders.add(asset.orderId)
      const startedAt = new Date(incidentAt.getTime() + 15 * 60_000)
      const endedAt = new Date(startedAt.getTime() + (sample.minutes ?? 0) * 60_000)
      let clock = startedAt
      const tickets = ticketsService({ $transaction: callback => callback(tx) }, () => clock)
      const ticket = await tickets.create({
        customerId: asset.customerId, assetId: asset.id, description: sample.description,
        incidentAt, priority: sample.billable ? 'HIGH' : 'MEDIUM',
      }, support)
      await tx.serviceTicket.update({ where: { id: ticket.id }, data: { ticketNumber, createdAt: incidentAt } })
      await tickets.update(ticket.id, { assignedToId: technician.id }, support)
      if (sample.minutes !== undefined) await tickets.update(ticket.id, { status: 'IN_PROGRESS' }, technician)
      if (sample.notes) {
        const balance = part?.stockBalanceByProduct
        if (part?.isActive && balance && balance.onHand > balance.reserved + 1) {
          await tickets.part(ticket.id, { productId: part.id, quantity: 1 }, technician)
        }
        clock = endedAt
        const closed = await signSeedRepair(tx, tickets, ticket, technician, {
          endedAt, repairNotes: sample.notes, signer: asset.customer.name, index,
        }, writtenMedia)
        if (closed.invoiceByTicket) await tx.invoice.update({
          where: { id: closed.invoiceByTicket.id }, data: { invoiceNumber: 'DEMO-SVC-' + sample.key },
        })
      }
      added++
    }
    return added
  })
}
