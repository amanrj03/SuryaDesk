import bcrypt from 'bcrypt'

export async function seedCustomerAccounts(db) {
  const password = process.env.SEED_DEMO_PASSWORD
  if (!password) return
  const customers = await db.customer.findMany({
    where: { id: { startsWith: 'DEMO-CUSTOMER-' }, email: { endsWith: '@demo.suryadesk.test' },
      ordersByCustomer: { some: { status: 'COMPLETED' } } },
    select: { id: true, email: true, name: true, phone: true, address: true },
    orderBy: { id: 'asc' }, take: 3,
  })
  if (!customers.length) return
  const passwordHash = await bcrypt.hash(password, 12)
  await db.customerAccount.createMany({
    data: customers.map(({ id, ...details }) => ({
      ...details, id: 'DEMO-PORTAL-' + id, customerId: id, historicalAccess: true, passwordHash,
    })),
    skipDuplicates: true,
  })
  console.log('Portal demo logins use SEED_DEMO_PASSWORD:', customers.map(row => row.email).join(', '))
}
