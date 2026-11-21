import { ApiError } from '../../utils/ApiError.js'

const include = { order: { include: { customer: true } } }
const transitions = {
  NOT_STARTED: ['DOCUMENTS_PENDING'], DOCUMENTS_PENDING: ['SUBMITTED'],
  SUBMITTED: ['APPROVED', 'REJECTED'], REJECTED: ['DOCUMENTS_PENDING'], APPROVED: ['PAID'],
}
const invalid = message => new ApiError(409, 'INVALID_TRANSITION', message)

async function audit(tx, id, action, userId, summary) {
  await tx.auditLog.create({ data: {
    actorId: userId, entityType: 'SubsidyApplication', entityId: id, action, summary,
  } })
}

export function subsidiesService(db) {
  return {
    async create({ orderId, notes }, user) {
      return db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`
        const order = await tx.order.findUnique({ where: { id: orderId } })
        if (!order || order.status === 'CANCELLED') throw invalid('Choose an active order for this application.')
        const existing = await tx.subsidyApplication.findUnique({ where: { orderId }, include })
        if (existing) return { existing: true, data: existing }
        const data = await tx.subsidyApplication.create({
          data: { orderId, notes, status: 'NOT_STARTED', documentChecklist: {} }, include,
        })
        await audit(tx, data.id, 'CREATED', user.id, { orderId })
        return { existing: false, data }
      })
    },
    async list({ page, limit, status }) {
      return db.$transaction(async tx => {
        const where = { status }
        const data = await tx.subsidyApplication.findMany({
          where, include, take: limit, skip: (page - 1) * limit, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        })
        const total = await tx.subsidyApplication.count({ where })
        return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
      }, { isolationLevel: 'RepeatableRead' })
    },
    async update(id, { status, documentChecklist, ...fields }, user) {
      return db.$transaction(async tx => {
        const row = await tx.subsidyApplication.findUnique({ where: { id } })
        if (!row) throw new ApiError(404, 'NOT_FOUND', 'Subsidy application not found.')
        if (status !== row.status && !transitions[row.status]?.includes(status)) throw invalid('This subsidy status transition is invalid.')
        const merged = { ...(row.documentChecklist ?? {}), ...documentChecklist }
        const submittedAt = fields.submittedAt ?? row.submittedAt
        const decisionAt = fields.decisionAt ?? row.decisionAt
        const now = new Date()
        if (submittedAt > now || decisionAt > now || (decisionAt && (!submittedAt || decisionAt < submittedAt))) {
          throw invalid('Enter valid submission and decision dates.')
        }
        if (['SUBMITTED', 'APPROVED', 'REJECTED', 'PAID'].includes(status) && (!submittedAt || !(fields.reference ?? row.reference))) {
          throw invalid('Record the submission date and application reference.')
        }
        if (['APPROVED', 'REJECTED', 'PAID'].includes(status) && !decisionAt) throw invalid('Record the decision date.')
        const changed = await tx.subsidyApplication.updateMany({
          where: { id, updatedAt: row.updatedAt, status: row.status },
          data: { status, ...fields, ...(documentChecklist && { documentChecklist: merged }) },
        })
        if (!changed.count) throw new ApiError(409, 'CONFLICT', 'Another user updated this subsidy.')
        await audit(tx, id, 'UPDATED', user.id, { from: row.status, to: status })
        return tx.subsidyApplication.findUnique({ where: { id }, include })
      })
    },
  }
}
