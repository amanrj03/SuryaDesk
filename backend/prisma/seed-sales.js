import { Prisma } from '@prisma/client'

const firstNames = ['Aditi', 'Aman', 'Anika', 'Ayaan', 'Bhavna', 'Chirag', 'Deepa', 'Farhan', 'Gauri', 'Harish', 'Jaya', 'Kunal', 'Manav', 'Mitali', 'Nitin', 'Pallavi', 'Ravi', 'Rekha', 'Shruti', 'Vikram']
const surnames = ['Agarwal', 'Bhat', 'Das', 'Iyer', 'Kadam', 'Mehta', 'Naik', 'Patel', 'Rao', 'Shah']
const places = ['Baner, Pune', 'Vastrapur, Ahmedabad', 'Indiranagar, Bengaluru', 'Kothrud, Pune', 'Navrangpura, Ahmedabad', 'Whitefield, Bengaluru']
const stamp = n => String(n + 1).padStart(4, '0')
const key = (entity, n) => 'DEMO-' + entity + '-' + stamp(n)
const day = 86400_000
const at = (start, days) => new Date(start.getTime() + day * days)

async function customers(tx) {
  await tx.customer.createMany({ skipDuplicates: true, data: Array.from({ length: 200 }, (_, i) => ({
    id: key('CUSTOMER', i), name: firstNames[i % firstNames.length] + ' ' + surnames[Math.floor(i / firstNames.length)],
    phone: '+91000000' + stamp(i), email: 'customer' + stamp(i) + '@demo.suryadesk.test',
    address: (11 + i % 80) + ', Example Housing, ' + places[i % places.length],
    notes: 'Fictional local demonstration customer.',
  })) })
}

function enquiryData(i, start, salesId) {
  const id = key('LEAD', i)
  const stage = i < 120 ? 'WON' : i < 150 ? 'QUOTED'
    : ['NEW', 'CONTACTED', 'QUALIFIED', 'LOST'][i % 4]
  const createdAt = at(start, i % 150)
  const qualified = ['WON', 'QUOTED', 'QUALIFIED'].includes(stage)
  return {
    id, leadNumber: id, customerId: key('CUSTOMER', i % 200),
    source: ['WEB', 'WHATSAPP', 'PHONE'][i % 3], desiredKw: i % 5 + 1,
    systemType: i % 3 ? 'ON_GRID' : 'OFF_GRID', subsidyInterest: i % 3 !== 0,
    status: stage, createdAt, assignedToId: salesId,
    monthlyBill: 1150 + (i * 73 % 5100),
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

async function project(tx, lead, surveyId, pack, i, salesId, financeId) {
  const id = key('QUOTATION', i)
  if (await tx.quotation.findUnique({ where: { id }, select: { id: true } })) return
  const accepted = i < 120
  const followUp = i >= 150
  const subtotal = pack.basePrice
  const tax = subtotal.mul('0.05').toDecimalPlaces(2)
  const total = subtotal.plus(tax)
  const createdAt = at(lead.createdAt, followUp ? 10 : 6)
  const sentAt = at(createdAt, 1)
  const acceptedAt = accepted ? at(sentAt, 2) : null
  const lines = quoteLines(pack)
  await tx.quotation.create({ data: {
    id, quoteNumber: key('QUO', i), leadId: lead.id, surveyId, packageId: pack.id,
    status: accepted ? 'ACCEPTED' : followUp ? 'DRAFT' : i % 5 === 0 ? 'REJECTED' : 'SENT',
    subtotal, tax, total, createdAt, sentAt: followUp ? null : sentAt, acceptedAt,
    validUntil: at(sentAt, 30), createdById: salesId, quotationLinesByQuotation: { createMany: { data: lines } },
  } })
  if (!accepted) return
  const orderId = key('ORDER', i)
  const advance = total.mul('0.35').toDecimalPlaces(2)
  const confirmedAt = at(acceptedAt, 1)
  const payment = (amount, index, when) => ({
    amount, method: index === 0 ? 'UPI' : 'BANK_TRANSFER', reference: key('PAY' + index, i),
    receivedAt: when, recordedById: financeId, createdAt: when,
  })
  await tx.order.create({ data: {
    id: orderId, orderNumber: key('ORD', i), quotationId: id, customerId: lead.customerId,
    status: 'CONFIRMED', confirmedAt, createdAt: confirmedAt, subtotal, tax, total,
    orderLinesByOrder: { createMany: { data: lines } },
    dispatchesByOrder: { create: { dispatchNumber: key('DSP', i), status: 'DRAFT', createdAt: confirmedAt } },
    installationByOrder: { create: { capacityKw: pack.capacityKw, status: 'UNSCHEDULED', checklist: {}, createdAt: confirmedAt } },
    paymentsByOrder: { createMany: { data: [payment(advance, 0, confirmedAt),
      ...(i < 80 ? [payment(new Prisma.Decimal(total).minus(advance), 1, at(confirmedAt, 1))] : [])] } },
  } })
}

export async function seedSales(db) {
  const start = new Date('2026-04-01T06:00:00.000Z')
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
    await tx.lead.createMany({
      skipDuplicates: true, data: Array.from({ length: 300 }, (_, i) => enquiryData(i, start, sales.id)),
    })
    await tx.siteSurvey.createMany({ skipDuplicates: true, data: Array.from({ length: 150 }, (_, i) => {
      const lead = enquiryData(i, start, sales.id)
      return {
        id: key('SURVEY', i), leadId: lead.id, surveyorId: surveyor.id, scheduledAt: at(lead.createdAt, 2),
        visitedAt: at(lead.createdAt, 3), approvedAt: at(lead.createdAt, 4), createdAt: at(lead.createdAt, 1),
        approvedById: director.id, status: 'APPROVED', roofDirection: ['S', 'SW', 'SE'][i % 3],
        tiltDegrees: 10 + i % 21, cableDistanceMeters: 9 + i % 19,
        shadowFreeArea: lead.roofArea, gridSuitable: lead.gridSuitable,
        findings: 'Roof access and mounting area verified. Cable route measured to main distribution board.',
      }
    }) })
  })

  for (let startIndex = 0; startIndex < 180; startIndex += 20) {
    await db.$transaction(async tx => {
      for (let i = startIndex; i < startIndex + 20; i++) {
        const leadIndex = i % 150
        const lead = enquiryData(leadIndex, start, sales.id)
        const pack = packages.get(lead.systemType + '-' + lead.desiredKw)
        await project(tx, lead, key('SURVEY', leadIndex), pack, i, sales.id, finance.id)
      }
    }, { timeout: 20000 })
  }
}
