import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import bcrypt from 'bcrypt'
import { roleCapabilities } from '../src/config/permissions.js'
import { dispatchService } from '../src/modules/dispatch/dispatch.service.js'
import { installationsService } from '../src/modules/installations/installations.service.js'
import { inventoryService } from '../src/modules/inventory/inventory.service.js'
import { leadsService } from '../src/modules/leads/leads.service.js'
import { paymentsService } from '../src/modules/payments/payments.service.js'
import { quotesService } from '../src/modules/quotes/quotes.service.js'
import { subsidiesService } from '../src/modules/subsidies/subsidies.service.js'
import { surveysService } from '../src/modules/surveys/surveys.service.js'
import { ticketsService } from '../src/modules/tickets/tickets.service.js'
import { daysFrom } from './seed-clock.js'
import { illustration } from './seed-installations.js'

const stages = [
  'new', 'contacted', 'lost', 'qualified', 'survey-booked', 'survey-in-progress', 'survey-review',
  'survey-rejected', 'survey-approved', 'quote-draft', 'quote-sent', 'quote-expired', 'quote-declined',
  'unpaid-order', 'deposit-order', 'paid-before-dispatch', 'cancelled-order', 'awaiting-stock', 'allocated',
  'dispatched-part-paid', 'dispatched-paid', 'delivered-part-paid', 'installation-in-progress',
  'pending-signoff', 'completed-unpaid-balance', 'completed-paid', 'covered-repair', 'expired-warranty',
]

const sites = [
  { type: 'ON_GRID', capacity: '3.30', label: 'On-grid 3.3 kW', price: 149800,
    names: ['Isha Kapoor', 'Naveen Kulkarni', 'Meera Joshi', 'Vivek Goswami', 'Ananya Menon', 'Rohan Sethi', 'Leena Bansal'],
    locality: 'Pashan, Pune', properties: ['Lakeview Row House', 'Aaranya Apartments', 'Saffron Bakery', 'Silver Oak Dental Clinic'],
    need: 'Offset daytime consumption on a concrete terrace. Keep access to the water tank.' },
  { type: 'OFF_GRID', capacity: '4.40', label: 'Off-grid 4.4 kW', price: 298600,
    names: ['Kavya Reddy', 'Dhruv Jain', 'Pooja Soni', 'Nikhil Shetty', 'Ritu Arora', 'Sameer Prabhu', 'Vidya Shah'],
    locality: 'Sanand, Ahmedabad', properties: ['Neem Grove Farm', 'Harit Cold Storage', 'Meridian Workshop', 'Kaveri Learning Centre'],
    need: 'Provide battery backup for essential circuits during feeder outages.' },
]

const products = [
  { code: 'PANEL', name: '550 W mono rooftop panel', category: 'PANEL', cost: 9200, salePrice: 12500, taxRate: 5, warrantyMonths: 240, stock: 190, reorderLevel: 18 },
  { code: 'GRID-INVERTER', name: '3.6 kW grid-tie inverter', category: 'INVERTER', cost: 22000, salePrice: 33500, taxRate: 18, warrantyMonths: 60, stock: 24, reorderLevel: 4 },
  { code: 'HYBRID-INVERTER', name: '5 kW hybrid inverter', category: 'INVERTER', cost: 39800, salePrice: 58500, taxRate: 18, warrantyMonths: 12, stock: 24, reorderLevel: 4 },
  { code: 'BATTERY', name: '5.12 kWh lithium battery', category: 'BATTERY', cost: 68300, salePrice: 92000, taxRate: 18, warrantyMonths: 60, stock: 24, reorderLevel: 3 },
  { code: 'BOS', name: 'Rooftop mounting and electrical protection kit', category: 'STAND', cost: 16900, salePrice: 24800, taxRate: 18, warrantyMonths: 0, stock: 48, reorderLevel: 6 },
]

const keyFor = index => 'SCN-' + String(index + 1).padStart(3, '0')
const allChecks = { mounting: true, electrical: true, earthing: true, generation: true }

async function catalog(tx, client, actor) {
  const items = {}
  for (const { code, stock, ...fields } of products) {
    const sku = 'SCN-' + code
    const serialized = code !== 'BOS'
    const product = await tx.product.upsert({
      where: { sku }, update: {}, create: { ...fields, sku, unit: 'unit', serialized },
    })
    items[code] = product.id
    const referenceId = sku + '-OPENING'
    if (await tx.stockMovement.findFirst({ where: { productId: product.id, type: 'RECEIPT', referenceId } })) continue
    await inventoryService(client).receive({
      productId: product.id, quantity: stock, unitCost: fields.cost, reference: referenceId,
      serialNumbers: serialized ? Array.from({ length: stock }, (_, index) => sku + '-' + String(index + 1).padStart(4, '0')) : [],
    }, actor)
    const receivedAt = new Date('2020-01-01T06:00:00.000Z')
    await tx.stockMovement.updateMany({ where: { productId: product.id, referenceId }, data: { createdAt: receivedAt } })
    if (serialized) await tx.serializedAsset.updateMany({ where: { productId: product.id }, data: { receivedAt } })
  }

  const packages = new Map()
  for (const site of sites) {
    const offGrid = site.type === 'OFF_GRID'
    const code = 'SCN-' + site.type.replace('_', '-') + '-' + site.capacity
    const components = [[items.PANEL, offGrid ? 8 : 6], [items.BOS, 1],
      [items[offGrid ? 'HYBRID-INVERTER' : 'GRID-INVERTER'], 1], ...(offGrid ? [[items.BATTERY, 1]] : [])]
    const pack = await tx.solarPackage.upsert({
      where: { code }, update: {},
      create: { code, name: site.label, type: site.type, capacityKw: site.capacity, basePrice: site.price,
        description: site.need, packageComponentsByPackage: { create: components.map(([productId, quantity]) => ({ productId, quantity })) } },
    })
    packages.set(site.type, pack)
  }
  return packages
}

async function signedEvidence(tx, installationId, actorId, index, when, writtenMedia) {
  const directory = resolve(process.env.UPLOAD_DIR ?? 'uploads')
  await mkdir(directory, { recursive: true })
  let signatureAttachmentId
  for (const [name, signature] of [['rooftop-evidence.png', false], ['customer-signature.png', true]]) {
    const storageKey = randomUUID()
    const content = illustration(index, signature)
    await writeFile(resolve(directory, storageKey), content, { flag: 'wx', mode: 0o600 })
    writtenMedia.push(storageKey)
    const row = await tx.attachment.create({ data: {
      ownerType: 'INSTALLATION', ownerId: installationId, originalName: name, storageKey, mimeType: 'image/png',
      sizeBytes: content.length, uploadedById: actorId, createdAt: when,
    } })
    if (signature) signatureAttachmentId = row.id
  }
  return signatureAttachmentId
}

async function allocate(tx, dispatches, row, actor) {
  const options = await dispatches.allocationOptions(row.id)
  const items = []
  for (const option of options) {
    const serials = option.serialized ? await tx.serializedAsset.findMany({
      where: { productId: option.productId, status: 'IN_STOCK' },
      orderBy: { serialNumber: 'asc' }, take: option.quantity, select: { serialNumber: true },
    }) : []
    items.push({ productId: option.productId, quantity: option.quantity, serialNumbers: serials.map(asset => asset.serialNumber) })
  }
  await dispatches.allocate(row.id, { items }, actor)
}

async function subsidy(client, orderId, actor, index, when) {
  const service = subsidiesService(client)
  const { data } = await service.create({ orderId, notes: 'Synthetic grid-connected rooftop application.' }, actor)
  const target = index % 6
  if (!target) return
  await service.update(data.id, {
    status: 'DOCUMENTS_PENDING', documentChecklist: { identity: true, utilityBill: true, installationCertificate: target > 1, bankDetails: target > 1 },
  }, actor)
  if (target === 1) return
  await service.update(data.id, { status: 'SUBMITTED', reference: 'SCN-SUB-' + keyFor(index).slice(4), submittedAt: when }, actor)
  if (target === 2) return
  await service.update(data.id, { status: target === 3 ? 'REJECTED' : 'APPROVED', decisionAt: daysFrom(when, 1) }, actor)
  if (target === 5) await service.update(data.id, { status: 'PAID' }, actor)
}

async function scenario(tx, client, actors, packages, index, now, passwordHash, writtenMedia) {
  const key = keyFor(index)
  const stage = stages[index % stages.length]
  const site = sites[Math.floor(index / stages.length)]
  const slot = index % stages.length
  const first = site.names[slot % site.names.length].split(' ')[0]
  const last = site.names[(slot + Math.floor(slot / site.names.length)) % site.names.length].split(' ')[1]
  const name = first + ' ' + last
  const address = (14 + index) + ', ' + site.properties[index % site.properties.length] + ', ' + site.locality
  const old = stage === 'expired-warranty' || stage === 'quote-expired'
  const expiryAge = site.type === 'ON_GRID' ? -1950 : -520
  const start = daysFrom(now, stage === 'expired-warranty' ? expiryAge : stage === 'quote-expired' ? -54 : -12 - index % 18)
  const when = days => daysFrom(start, days)
  const interest = site.type === 'ON_GRID' && index % 4 !== 1
  const email = key.toLowerCase() + '@demo.suryadesk.test'
  const customer = await tx.customer.create({ data: {
    name, address, email, phone: '+91000010' + String(index + 1).padStart(4, '0'), createdAt: start,
  } })
  const portalCases = ['paid-before-dispatch', 'delivered-part-paid', 'covered-repair', 'expired-warranty']
  const account = passwordHash && portalCases.includes(stage) ? await tx.customerAccount.create({ data: {
    email, name, phone: customer.phone, address, passwordHash, customerId: customer.id, verifiedAt: start,
  } }) : null
  const lead = await tx.lead.create({ data: {
    leadNumber: key + '-ENQ', customerId: customer.id, createdAt: start,
    source: ['WEB', 'PHONE', 'WHATSAPP', 'OTHER'][index % 4], desiredKw: site.capacity, systemType: site.type,
    assignedToId: actors.sales.id, siteAddress: address, subsidyInterest: interest, status: 'NEW',
    portalAccountId: account?.id, monthlyBill: 2600 + index % 17 * 236, notes: site.need,
  } })
  if (stage === 'new') return
  const leads = leadsService(client)
  await leads.update(lead.id, { status: 'CONTACTED', contactNote: 'Discussed metering, roof access, and expected site usage.' }, actors.sales)
  if (stage === 'contacted') return
  if (stage === 'lost') {
    await leads.update(lead.id, { status: 'LOST' }, actors.sales)
    return
  }
  await leads.update(lead.id, { status: 'QUALIFIED', roofArea: 36 + index % 13, gridSuitable: site.type === 'ON_GRID' }, actors.sales)
  if (stage === 'qualified') return

  const surveys = surveysService(client)
  const appointment = stage === 'survey-booked' ? daysFrom(now, 2) : when(2)
  const survey = await surveys.schedule(lead.id, { surveyorId: actors.surveyor.id, scheduledAt: appointment }, actors.sales)
  await tx.siteSurvey.update({ where: { id: survey.id }, data: { createdAt: when(1.5) } })
  if (stage === 'survey-booked') return
  if (stage === 'survey-in-progress') {
    await surveys.record(survey.id, { status: 'IN_PROGRESS' }, actors.surveyor)
    return
  }
  await surveys.record(survey.id, {
    status: 'SUBMITTED', visitedAt: appointment, roofDirection: index % 2 ? 'SW' : 'S',
    tiltDegrees: 10 + index % 12, cableDistanceMeters: 12 + index % 16,
    shadowFreeArea: 35 + index % 10, gridSuitable: site.type === 'ON_GRID',
    findings: stage === 'survey-rejected' ? 'Cracked parapet and failed anchoring inspection.' : site.need,
  }, actors.surveyor)
  if (stage === 'survey-review') return
  const approved = stage !== 'survey-rejected'
  await surveys.approve(survey.id, { approved, ...(approved ? {} : { rejectionReason: 'Structural repairs required before mounting.' }) }, actors.admin)
  if (!approved || stage === 'survey-approved') return
  await tx.siteSurvey.update({ where: { id: survey.id }, data: { approvedAt: when(3) } })

  const quotes = quotesService(client)
  const quote = await quotes.create({
    leadId: lead.id, surveyId: survey.id, packageId: packages.get(site.type).id, notes: 'Synthetic workflow case ' + key,
    validUntil: daysFrom(now, 21),
  }, actors.sales)
  await tx.quotation.update({ where: { id: quote.id }, data: { quoteNumber: key + '-QUO', createdAt: when(4) } })
  if (stage === 'quote-draft') return
  await quotes.transition(quote.id, 'SENT', {}, actors.sales)
  if (stage === 'quote-declined') await quotes.transition(quote.id, 'REJECTED', { reason: 'Customer deferred the capital purchase.' }, actors.sales)
  if (stage === 'quote-expired') await tx.quotation.update({
    where: { id: quote.id }, data: { status: 'EXPIRED', sentAt: when(5), validUntil: when(35) },
  })
  if (['quote-sent', 'quote-declined', 'quote-expired'].includes(stage)) return
  const accepted = await quotes.transition(quote.id, 'ACCEPTED', {}, actors.sales)
  await tx.quotation.update({
    where: { id: quote.id }, data: { sentAt: when(5), acceptedAt: when(6), ...(old && { validUntil: when(35) }) },
  })
  const order = await tx.order.update({
    where: { id: accepted.orderByQuotation.id }, data: { orderNumber: key + '-ORD', confirmedAt: when(7), createdAt: when(7) },
    include: { dispatchesByOrder: true, installationByOrder: true },
  })
  const dispatch = order.dispatchesByOrder[0]
  await tx.dispatch.update({ where: { id: dispatch.id }, data: { dispatchNumber: key + '-DSP', createdAt: when(7) } })
  await tx.installation.update({ where: { id: order.installationByOrder.id }, data: { createdAt: when(7) } })
  if (stage === 'unpaid-order') return
  if (stage === 'cancelled-order') {
    await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED', notes: 'Cancelled before any payment or stock reservation.' } })
    await tx.dispatch.update({ where: { id: dispatch.id }, data: { status: 'CANCELLED' } })
    return
  }
  const payments = paymentsService(client)
  const paidFirst = ['paid-before-dispatch', 'dispatched-paid'].includes(stage)
  const advance = paidFirst ? order.total : order.total.mul(site.type === 'ON_GRID' ? '0.35' : '0.50').toDecimalPlaces(2)
  await payments.record(order.id, { amount: advance, method: index % 2 ? 'UPI' : 'BANK_TRANSFER', reference: key + '-ADV', receivedAt: when(7.125) }, actors.finance)
  if (stage === 'awaiting-stock') {
    await tx.order.update({ where: { id: order.id }, data: { status: 'AWAITING_STOCK', notes: 'Stock for this job is awaiting supplier release.' } })
    return
  }
  if (['deposit-order', 'paid-before-dispatch'].includes(stage)) return
  const dispatches = dispatchService(client)
  await allocate(tx, dispatches, dispatch, actors.warehouse)
  await tx.stockMovement.updateMany({ where: { orderId: order.id, type: 'RESERVE' }, data: { createdAt: when(7.5) } })
  if (stage === 'allocated') return
  await dispatches.dispatch(dispatch.id, { dispatchedAt: when(8) }, actors.warehouse)
  await tx.stockMovement.updateMany({ where: { orderId: order.id, type: 'DISPATCH' }, data: { createdAt: when(8) } })
  if (paidFirst) await tx.invoice.update({ where: { orderId: order.id }, data: { issuedAt: when(8) } })
  if (['dispatched-part-paid', 'dispatched-paid'].includes(stage)) return
  await dispatches.deliver(dispatch.id, { deliveredAt: when(8.5), recipientName: name }, actors.warehouse)
  if (stage === 'delivered-part-paid') return

  const job = order.installationByOrder
  const startedAt = when(9)
  const finishedAt = new Date(+startedAt + (4.5 + index % 5 * 0.75) * 3600_000)
  const signedAt = new Date(+finishedAt + 20 * 60_000)
  const jobs = installationsService(client, () => signedAt)
  await jobs.update(job.id, { scheduledAt: startedAt, technicianIds: [actors.technician.id] }, actors.admin)
  await tx.installationAssignment.updateMany({ where: { installationId: job.id }, data: { assignedAt: when(8.75) } })
  await jobs.update(job.id, { startedAt, ...(stage === 'pending-signoff' && { finishedAt }) }, actors.technician)
  if (['installation-in-progress', 'pending-signoff'].includes(stage)) return
  const signatureAttachmentId = await signedEvidence(tx, job.id, actors.technician.id, index, signedAt, writtenMedia)
  await jobs.complete(job.id, {
    finishedAt, capacityKw: Number(site.capacity), checklist: allChecks, generationTestPassed: true,
    signatureAttachmentId, customerSignerName: name,
  }, actors.technician)
  await tx.jobCost.create({ data: {
    orderId: order.id, recordedById: actors.admin.id, category: 'TRANSPORT',
    description: 'Crew transport and rooftop material handling', incurredAt: startedAt, amount: 1450 + index % 7 * 210,
  } })
  if (stage !== 'completed-unpaid-balance') {
    await payments.record(order.id, {
      amount: order.total.minus(advance), method: 'BANK_TRANSFER', reference: key + '-BAL', receivedAt: when(10),
    }, actors.finance)
    await tx.invoice.update({ where: { orderId: order.id }, data: { issuedAt: when(10) } })
  }
  if (interest) await subsidy(client, order.id, actors.finance, index, when(10))

  if (['covered-repair', 'expired-warranty'].includes(stage)) {
    const asset = await tx.serializedAsset.findFirstOrThrow({
      where: { orderId: order.id, product: { category: stage === 'expired-warranty' ? 'INVERTER' : 'PANEL' } },
    })
    const tickets = ticketsService(client)
    const covered = stage !== 'expired-warranty'
    const ticket = await tickets.create({
      customerId: customer.id, assetId: asset.id, priority: covered ? 'MEDIUM' : 'HIGH', incidentAt: daysFrom(now, -2),
      description: covered ? 'Production dropped on the west string after heavy rain.' : 'Inverter intermittently restarts when the load changes.',
    }, actors.support)
    if (!covered) await tickets.update(ticket.id, { status: 'TRIAGED', laborCharge: '1800.00' }, actors.support)
    await tickets.resolve(ticket.id, {
      coverageDecision: covered ? 'COVERED' : 'NOT_COVERED',
      resolutionNotes: covered ? 'Cleaned and reseated the string connector and confirmed generation.' : 'Adjusted inverter settings and completed a load test.',
    }, actors.support)
    if (covered) await tickets.confirm(ticket.id, { customerConfirmationName: name }, actors.support)
  }
}

export async function seedWorkflowScenarios(db, writtenMedia) {
  const password = process.env.SEED_DEMO_PASSWORD
  if (password && (password.length < 12 || Buffer.byteLength(password) > 72)) throw new Error('Invalid demo password length.')
  const passwordHash = password ? await bcrypt.hash(password, 12) : null
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(73126)`
    const client = new Proxy(tx, { get(target, property, receiver) {
      return property === '$transaction' ? callback => callback(tx) : Reflect.get(target, property, receiver)
    } })
    const actors = {}
    for (const role of ['admin', 'sales', 'surveyor', 'warehouse', 'technician', 'finance', 'support']) {
      const user = await tx.user.findUniqueOrThrow({ where: { email: role + '@demo.suryadesk.test', isActive: true } })
      actors[role] = { ...user, capabilities: roleCapabilities[user.role] }
    }
    const existing = new Set((await tx.lead.findMany({
      where: { leadNumber: { startsWith: 'SCN-' } }, select: { leadNumber: true },
    })).map(row => row.leadNumber))
    const packages = await catalog(tx, client, actors.warehouse)
    const now = new Date()
    let added = 0
    for (let index = 0; index < stages.length * sites.length; index++) {
      if (existing.has(keyFor(index) + '-ENQ')) continue
      await scenario(tx, client, actors, packages, index, now, passwordHash, writtenMedia)
      added++
    }
    return added
  }, { timeout: 120_000 })
}
