import { ApiError } from '../../utils/ApiError.js'

const unrestricted = ['leads:write', 'tickets:create', 'reports:view', 'orders:create']
export function assertCustomerAccess(user) {
  if (!unrestricted.some(capability => user.capabilities.includes(capability))) {
    throw new ApiError(403, 'FORBIDDEN', 'Your role cannot access the customer directory.')
  }
}

export function customersService(db) {
  return {
    list({ page, limit, q }) {
      return db.$transaction(async tx => {
        const search = { contains: q, mode: 'insensitive' }
        const where = q ? { OR: [{ name: search }, { phone: search }, { email: search }] } : {}
        const data = await tx.customer.findMany({
          where, skip: (page - 1) * limit, take: limit, orderBy: [{ name: 'asc' }, { id: 'asc' }],
        })
        const total = await tx.customer.count({ where })
        return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } }
      }, { isolationLevel: 'RepeatableRead' })
    },
    async detail(id, user) {
      const can = capability => user.capabilities.includes(capability)
      const row = await db.customer.findUnique({
        where: { id },
        include: {
          ...(can('leads:read') && { leadsByCustomer: { take: 20, orderBy: { createdAt: 'desc' },
            select: { id: true, leadNumber: true, createdAt: true, status: true } } }),
          ...(can('orders:read') && { ordersByCustomer: { take: 20, orderBy: { confirmedAt: 'desc' },
            select: { id: true, orderNumber: true, confirmedAt: true, status: true } } }),
          ...(can('tickets:read') && { serviceTicketsByCustomer: { take: 20, orderBy: { incidentAt: 'desc' },
            select: { id: true, ticketNumber: true, incidentAt: true, status: true } } }),
        },
      })
      if (!row) throw new ApiError(404, 'NOT_FOUND', 'Customer not found.')
      return row
    },
  }
}
