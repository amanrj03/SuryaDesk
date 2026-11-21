import { randomBytes } from 'node:crypto'
import bcrypt from 'bcrypt'
import { seedInstallations } from './seed-installations.js'
import { seedProcurement } from './seed-procurement.js'
import { seedOperations } from './seed-operations.js'
import { seedFinance } from './seed-finance.js'
import { seedWarehouse } from './seed-warehouse.js'
import { seedSales } from './seed-sales.js'
import { createDatabase } from '../src/lib/prisma.js'

const roles = [
  ['ADMIN', 'Aarav Sharma'], ['DIRECTOR', 'Ananya Rao'], ['SALES', 'Riya Desai'],
  ['SURVEYOR', 'Karan Patel'], ['WAREHOUSE', 'Ishaan Nair'], ['TECHNICIAN', 'Meera Verma'],
  ['SUPPORT', 'Dev Joshi'], ['FINANCE', 'Nisha Iyer'],
]
const crew = ['Arjun', 'Diya', 'Kabir', 'Ira', 'Om', 'Leena', 'Vihaan', 'Asha', 'Sai', 'Neha', 'Rohan', 'Ritika', 'Raj', 'Tarun', 'Priya', 'Laksh', 'Sana']
const materials = [
  ['PANEL', '550 W mono solar panel', 'PANEL', 7100, 10900, true, 240, 40],
  ['INVERTER', 'Maximum power point inverter', 'INVERTER', 27000, 36500, true, 24, 8],
  ['BATTERY', 'Lithium storage module', 'BATTERY', 42000, 57000, true, 24, 8],
  ['CONTROLLER', 'Solar charge controller', 'CONTROLLER', 3600, 5200, true, 24, 8],
  ['STAND', 'Galvanized roof mounting kit', 'STAND', 3500, 5300, false, 0, 10],
  ['WIRING', 'UV-rated DC solar cable kit', 'WIRING', 1800, 2600, false, 0, 10],
  ['BOX', 'Weatherproof wiring box', 'WIRING', 1600, 2400, false, 0, 10],
  ['SWITCH', 'DC disconnect switch', 'SWITCH', 1400, 2100, false, 0, 10],
  ['EARTH', 'Earthing and surge protection kit', 'SAFETY', 2400, 3850, false, 0, 10],
  ['CONNECTOR', 'Solar connector pair', 'WIRING', 140, 240, false, 0, 30],
]

function packageTemplates(products) {
  const component = (code, quantity) => ({ productId: products.get(code).id, quantity })
  const standard = [
    component('BOX', 1), component('SWITCH', 1), component('WIRING', 1),
    component('EARTH', 1), component('CONTROLLER', 1), component('INVERTER', 1),
  ]
  const templates = []
  for (let capacityKw = 1; capacityKw <= 5; capacityKw++) {
    const panelCount = Math.ceil(capacityKw / 0.55)
    const hardware = [component('PANEL', panelCount), component('CONNECTOR', panelCount), component('WIRING', 1)]
    for (const [type, label, basePrice, components] of [
      ['PANEL_SET', 'Panel set', 12300 * panelCount, hardware],
      ['INSTALLATION', 'Installation', 5500 + 2400 * capacityKw, []],
      ['ON_GRID', 'On-grid system', 57000 + 16400 * capacityKw, [...standard, component('PANEL', panelCount), component('STAND', capacityKw), component('CONNECTOR', panelCount)]],
      ['OFF_GRID', 'Off-grid system', 110000 + 19400 * capacityKw, [...standard, component('PANEL', panelCount), component('STAND', capacityKw), component('CONNECTOR', panelCount), component('BATTERY', Math.ceil(capacityKw / 2))]],
    ]) {
      templates.push({ code: 'DEMO-' + type.replaceAll('_', '-') + '-' + capacityKw, type, name: label + ' · ' + capacityKw + ' kW',
        capacityKw, basePrice, description: 'Demonstration package. Equipment and sizing are illustrative.', components })
    }
  }
  return templates
}

async function seed(db) {
  const explicit = process.env.SEED_DEMO_PASSWORD
  if (explicit && (explicit.length < 12 || Buffer.byteLength(explicit) > 72)) {
    throw new Error('SEED_DEMO_PASSWORD must contain at least 12 characters and no more than 72 bytes.')
  }
  const password = explicit ?? randomBytes(18).toString('base64url')
  const passwordHash = await bcrypt.hash(password, 12)
  let addedUsers = 0
  await db.$transaction(async tx => {
    for (const [role, name, email] of [
      ...roles.map(([role, name]) => [role, name, role.toLowerCase() + '@demo.suryadesk.test']),
      ...crew.map((name, index) => ['TECHNICIAN', name + ' ' + ['Shah', 'Kulkarni', 'Pillai'][index % 3], 'crew' + (index + 1) + '@demo.suryadesk.test']),
    ]) {
      const data = { role, name, email, passwordHash, ...(role === 'TECHNICIAN' && { hourlyCost: '460.00' }) }
      const inserted = await tx.user.createMany({ data: [data], skipDuplicates: true })
      addedUsers += inserted.count
    }
    const products = new Map()
    for (const [code, name, category, cost, salePrice, serialized, warrantyMonths, reorderLevel] of materials) {
      const sku = 'DEMO-' + code
      const product = await tx.product.upsert({
        where: { sku }, update: {},
        create: { sku, name, category, cost, salePrice, serialized, warrantyMonths, reorderLevel, unit: 'unit',
          stockBalanceByProduct: { create: { onHand: 0, reserved: 0 } } },
      })
      products.set(code, product)
    }
    for (const { components, ...entry } of packageTemplates(products)) {
      const existing = await tx.solarPackage.findFirst({ where: {
        OR: [{ code: entry.code }, { type: entry.type, capacityKw: entry.capacityKw }],
      } })
      if (!existing) {
        await tx.solarPackage.create({
          data: { ...entry, packageComponentsByPackage: { createMany: { data: components } } },
        })
      }
    }
  }, { timeout: 20000 })
  console.log('Demo staff and catalog seeded. New staff accounts:', addedUsers)
  if (addedUsers && !explicit) console.log('Password for newly created demo accounts:', password)
}

const databaseUrl = process.env.DATABASE_URL
if (process.env.NODE_ENV === 'production' || !databaseUrl ||
  !['localhost', '127.0.0.1', '[::1]'].includes(new URL(databaseUrl).hostname)) {
  throw new Error('Demo seeding requires a local development PostgreSQL database.')
}
const db = createDatabase(databaseUrl)
try {
  await seed(db)
  await seedSales(db)
  await seedWarehouse(db)
  await seedFinance(db)
  await seedOperations(db)
  await seedInstallations(db)
  await seedProcurement(db)
  console.log('Relational SuryaDesk demo records seeded.')
} finally {
  await db.$disconnect()
}
