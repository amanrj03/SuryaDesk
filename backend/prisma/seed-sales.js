import { Prisma } from '@prisma/client'
import { daysFrom, seedNow } from './seed-clock.js'

const firstNames = ['Aditi', 'Aman', 'Anika', 'Ayaan', 'Bhavna', 'Chirag', 'Deepa', 'Farhan', 'Gauri', 'Harish', 'Jaya', 'Kunal', 'Manav', 'Mitali', 'Nitin', 'Pallavi', 'Ravi', 'Rekha', 'Shruti', 'Vikram']
const surnames = ['Agarwal', 'Bhat', 'Das', 'Iyer', 'Kadam', 'Mehta', 'Naik', 'Patel', 'Rao', 'Shah']
const places = ['Baner, Pune', 'Vastrapur, Ahmedabad', 'Indiranagar, Bengaluru', 'Kothrud, Pune', 'Navrangpura, Ahmedabad', 'Whitefield, Bengaluru']
const stamp = n => String(n + 1).padStart(4, '0')
const key = (entity, n) => 'DEMO-' + entity + '-' + stamp(n)
const at = daysFrom
const visitStages = ['SCHEDULED', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'REJECTED']
const leadStages = ['SURVEY_SCHEDULED', 'SURVEY_SCHEDULED', 'SURVEY_PENDING_APPROVAL', 'SURVEY_APPROVED', 'LOST']
const siteProfiles = [
  ['Row house', 'Concrete terrace; homeowner requested a low-profile mounting frame.'],
  ['Apartment association', 'Common meter offset; society approval recorded by the site contact.'],
  ['Cold storage', 'Daytime refrigeration load; service access needed at the main panel.'],
  ['Textile workshop', 'Three-phase supply; protect cable crossings against machine vibration.'],
  ['School building', 'Use the science-wing terrace and schedule site work outside class hours.'],
  ['Farmhouse', 'Intermittent utility service; customer prioritises battery backup.'],
]
function receivedOn(index) {
  if (index >= 280) return at(seedNow, -(index % 7) / 12)
  if (index >= 220) return at(seedNow, -1 - index % 26)
  if (index >= 150) return at(seedNow, -7 - index % 42)
  if (index >= 120) return at(seedNow, -10 - (index - 120) * 3)
  if (index >= 100) return at(seedNow, -10 - (index - 100) % 10 - 0.125)
  if (index >= 48 && index < 54) return at(seedNow, -900 + index)
  return at(seedNow, -310 + (index * 29 % 259))
}

async function customers(tx) {
  await tx.customer.createMany({ skipDuplicates: true, data: Array.from({ length: 200 }, (_, i) => ({
    id: key('CUSTOMER', i), name: firstNames[i % firstNames.length] + ' ' + surnames[Math.floor(i / firstNames.length)],
    createdAt: at(receivedOn(i), -1), phone: '+91000000' + stamp(i), email: 'customer' + stamp(i) + '@demo.suryadesk.test',
    address: (11 + i % 80) + ', ' + ['Lakeview Court', 'Orchard Lane', 'Shanti Enclave', 'Market Road', 'Silver Oak Estate'][i % 5] + ', ' + places[i % places.length],
    notes: siteProfiles[i % siteProfiles.length].join(' - '),
  })) })
}

function enquiryData(i, salesId) {
  const id = key('LEAD', i)
  const stage = i < 120 ? 'WON' : i < 150 ? 'QUOTED'
    : i < 195 ? leadStages[i % 5] : ['NEW', 'NEW', 'CONTACTED', 'QUALIFIED', 'LOST'][i % 5]
  const createdAt = receivedOn(i)
  const qualified = !['NEW', 'CONTACTED'].includes(stage)
  return {
    id, leadNumber: id, customerId: key('CUSTOMER', i % 200),
    source: ['WEB', 'WHATSAPP', 'PHONE', 'OTHER', 'WEB'][i % 5], desiredKw: i % 5 + 1,
    systemType: i % 3 ? 'ON_GRID' : 'OFF_GRID', subsidyInterest: i % 3 !== 0,
    status: stage, createdAt, assignedToId: salesId,
    monthlyBill: 1150 + (i * 73 % 5100), notes: siteProfiles[i % siteProfiles.length][1],
    ...(qualified && { roofArea: 16 + i % 42, gridSuitable: i % 3 !== 0 }),
  }
}

function quoteLines(pack) {
  return [
    { descriptionSnapshot: pack.name, quantity: 1, unitPriceSnapshot: pack.basePrice,
      unitCostSnapshot: 0, lineTotal: pack.basePrice, lineKind: 'SERVICE' },
    ...pack.packageComponentsByPackage.map(({ product, quantity }) => ({
      productId: product.id, descriptionSnapshot: product.name, quantity,
      unitPriceSnapshot: 0, unitCostSnapshot: product.cost, lineTotal: 0, lineKind: 'MATERIAL',
    })),
  ]
}

async function project(tx, lead, surveyId, pack, i, salesId, { financeId, pendingOrder = false }) {
  const id = key('QUOTATION', i)
  if (await tx.quotation.findUnique({ where: { id }, select: { id: true } })) return
  const accepted = i < 120 || pendingOrder
  const followUp = i >= 150 && !pendingOrder
  const subtotal = pack.basePrice
  const tax = subtotal.mul(i % 8 === 0 ? '0.18' : '0.05').toDecimalPlaces(2)
  const total = subtotal.plus(tax)
  const createdAt = pendingOrder ? at(seedNow, -4) : at(lead.createdAt, followUp ? 10 : 6)
  const sentAt = at(createdAt, 1)
  const acceptedAt = accepted ? at(sentAt, 2) : null
  const lines = quoteLines(pack)
  await tx.quotation.create({ data: {
    id, quoteNumber: key('QUO', i), leadId: lead.id, surveyId, packageId: pack.id,
    status: accepted ? 'ACCEPTED' : followUp ? 'DRAFT' : i % 5 === 0 ? 'REJECTED' : at(sentAt, 30) < seedNow ? 'EXPIRED' : 'SENT',
    subtotal, tax, total, createdAt, sentAt: followUp ? null : sentAt, acceptedAt,
    validUntil: at(sentAt, 30), createdById: salesId, quotationLinesByQuotation: { createMany: { data: lines } },
  } })
  if (!accepted || pendingOrder) return
  const orderId = key('ORDER', i)
  const advance = total.mul(['0.25', '0.35', '0.5', '0.6'][i % 4]).toDecimalPlaces(2)
  const confirmedAt = at(acceptedAt, 1)
  const payment = (amount, index, when) => ({
    amount, method: index === 0 ? ['UPI', 'BANK_TRANSFER', 'CASH', 'CARD'][i % 4] : 'BANK_TRANSFER', reference: key('PAY' + index, i),
    receivedAt: when, recordedById: financeId, createdAt: when,
  })
  await tx.order.create({ data: {
    id: orderId, orderNumber: key('ORD', i), quotationId: id, customerId: lead.customerId,
    status: i >= 112 ? 'CANCELLED' : i >= 104 ? 'AWAITING_STOCK' : 'CONFIRMED', confirmedAt, createdAt: confirmedAt, subtotal, tax, total,
    orderLinesByOrder: { createMany: { data: lines } },
    dispatchesByOrder: { create: { dispatchNumber: key('DSP', i), status: i >= 112 ? 'CANCELLED' : 'DRAFT', createdAt: confirmedAt } },
    installationByOrder: { create: { capacityKw: pack.capacityKw, status: 'UNSCHEDULED', checklist: {}, createdAt: confirmedAt } },
    paymentsByOrder: { createMany: { data: i >= 100 ? [] : i % 7 === 0 ? [payment(total, 0, confirmedAt)] : [payment(advance, 0, confirmedAt),
      ...(i < 80 ? [payment(new Prisma.Decimal(total).minus(advance), 1, at(confirmedAt, 1))] : [])] } },
  } })
}

export async function seedPendingOrderQuotes(db) {
  const sales = await db.user.findUniqueOrThrow({ where: { email: 'sales@demo.suryadesk.test' } })
  return db.$transaction(async tx => {
    let added = 0
    for (const [offset, index] of [173, 178, 183].entries()) {
      const survey = await tx.siteSurvey.findFirst({
        where: { id: key('SURVEY', index), status: 'APPROVED', approvedAt: { lte: at(seedNow, -4) } },
        include: { lead: true },
      })
      if (!survey) continue
      const { lead } = survey
      const pack = await tx.solarPackage.findFirst({
        where: { code: `DEMO-${lead.systemType?.replaceAll('_', '-')}-${lead.desiredKw}`, isActive: true },
        include: { packageComponentsByPackage: { include: { product: true } } },
      })
      if (!pack) continue
      const claimed = await tx.lead.updateMany({
        where: { id: lead.id, status: 'SURVEY_APPROVED', quotationsByLead: { none: {} } },
        data: { status: 'WON' },
      })
      if (!claimed.count) continue
      await project(tx, lead, survey.id, pack, 180 + offset, sales.id, { pendingOrder: true })
      added++
    }
    return added
  })
}

export async function seedSales(db) {
  const [sales, surveyor, director, finance] = await Promise.all(['sales', 'surveyor', 'director', 'finance']
    .map(role => db.user.findUniqueOrThrow({ where: { email: role + '@demo.suryadesk.test' } })))
  const catalog = await db.solarPackage.findMany({
    where: { isActive: true, type: { in: ['ON_GRID', 'OFF_GRID'] } },
    include: { packageComponentsByPackage: { include: { product: true } } },
  })
  const packages = new Map(catalog.map(pack => [pack.type + '-' + pack.capacityKw, pack]))
  if (packages.size < 10) throw new Error('Seed sales requires one on-grid and off-grid package per capacity from 1 to 5 kW.')

  await db.$transaction(async tx => {
    await customers(tx)
    const enquiries = Array.from({ length: 300 }, (_, i) => enquiryData(i, sales.id))
    await tx.lead.createMany({ skipDuplicates: true, data: enquiries })
    await tx.leadActivity.createMany({ skipDuplicates: true, data: enquiries.map((lead, index) => ({
      id: key('LEAD-ACTIVITY', index), leadId: lead.id, actorId: lead.status === 'NEW' ? null : sales.id,
      type: lead.status === 'NEW' ? 'STATUS_CHANGE' : 'NOTE',
      notes: lead.status === 'NEW' ? 'Customer enquiry received.' : siteProfiles[index % siteProfiles.length][1],
      createdAt: lead.createdAt,
    })) })
    await tx.auditLog.createMany({ skipDuplicates: true, data: enquiries.map((lead, index) => ({
      id: key('AUDIT-LEAD', index), entityId: lead.id, entityType: 'Lead', action: 'ENQUIRY_RECEIVED',
      actorId: lead.status === 'NEW' ? null : sales.id, summary: { source: lead.source },
      createdAt: lead.createdAt,
    })) })
    await tx.siteSurvey.createMany({ skipDuplicates: true, data: Array.from({ length: 195 }, (_, i) => {
      const lead = enquiryData(i, sales.id)
      const status = i < 150 ? 'APPROVED' : visitStages[i % 5]
      const visited = status !== 'SCHEDULED'
      return {
        id: key('SURVEY', i), leadId: lead.id, surveyorId: surveyor.id, scheduledAt: status === 'SCHEDULED' && i % 10 === 0 ? at(seedNow, 1 + i % 4) : at(lead.createdAt, 2),
        visitedAt: visited ? at(lead.createdAt, 3) : undefined, approvedAt: status === 'APPROVED' ? at(lead.createdAt, 4) : undefined, createdAt: at(lead.createdAt, 1),
        approvedById: status === 'APPROVED' ? director.id : undefined, status, roofDirection: visited ? ['S', 'SW', 'SE'][i % 3] : null,
        tiltDegrees: visited ? 10 + i % 21 : null, cableDistanceMeters: visited ? 9 + i % 19 : null,
        shadowFreeArea: visited ? lead.roofArea : null, gridSuitable: visited ? lead.gridSuitable : null,
        findings: visited ? siteProfiles[i % siteProfiles.length][1] : null,
        rejectionReason: status === 'REJECTED' ? 'Available shade-free roof area is too small for the requested system.' : null,
      }
    }) })
  })

  for (let startIndex = 0; startIndex < 180; startIndex += 20) {
    await db.$transaction(async tx => {
      for (let i = startIndex; i < startIndex + 20; i++) {
        const leadIndex = i < 150 ? i : i - 30
        const lead = enquiryData(leadIndex, sales.id)
        const pack = packages.get(lead.systemType + '-' + lead.desiredKw)
        await project(tx, lead, key('SURVEY', leadIndex), pack, i, sales.id, { financeId: finance.id })
      }
    }, { timeout: 20000 })
  }
  await seedPendingOrderQuotes(db)
}
