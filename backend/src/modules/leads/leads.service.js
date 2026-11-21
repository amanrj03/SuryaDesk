import { randomUUID } from 'node:crypto'
import { ApiError } from '../../utils/ApiError.js'

const missing = () => new ApiError(404, 'NOT_FOUND', 'Lead not found.')
const invalidTransition = message => new ApiError(409, 'INVALID_TRANSITION', message)
const transitions = {
  NEW: ['CONTACTED', 'QUALIFIED', 'LOST'],
  CONTACTED: ['QUALIFIED', 'LOST'],
  QUALIFIED: ['LOST'],
  SURVEY_SCHEDULED: ['LOST'],
  SURVEY_PENDING_APPROVAL: ['LOST'],
  SURVEY_APPROVED: ['LOST'],
  QUOTED: ['LOST'],
}

export function leadScope(user) {
  return user.capabilities.includes('surveys:record') && !user.capabilities.includes('leads:write')
    ? { assignedToId: user.id } : {}
}

export function leadsService(db) {
  return {
    async create({ name, email, phone, address, source = 'WEB', ...data }, actorId) {
      return db.lead.create({
        data: {
          ...data, source, status: 'NEW', leadNumber: 'LEAD-' + randomUUID().toUpperCase(),
          customer: { create: { name, email, phone, address } },
          leadActivitiesByLead: { create: { actorId, type: 'STATUS_CHANGE', notes: 'Enquiry received.' } },
        },
        select: { id: true, leadNumber: true, status: true },
      })
    },
    async list({ page, limit, q, status, assignedToId }, user) {
      const search = { contains: q, mode: 'insensitive' }
      const where = {
        AND: [leadScope(user), { status, assignedToId }],
        ...(q && { OR: [{ leadNumber: search }, { customer: { name: search } }, { customer: { phone: search } }] }),
      }
      const [data, total] = await db.$transaction([
        db.lead.findMany({
          where, skip: (page - 1) * limit, take: limit,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          include: { customer: true, leadActivitiesByLead: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 } },
        }),
        db.lead.count({ where }),
      ], { isolationLevel: 'RepeatableRead' })
      return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
    },
    async detail(id, user) {
      const lead = await db.lead.findFirst({
        where: { id, ...leadScope(user) },
        include: {
          customer: true, siteSurveysByLead: true,
          leadActivitiesByLead: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] },
          ...(user.capabilities.includes('quotes:read') && { quotationsByLead: true }),
        },
      })
      if (!lead) throw missing()
      return lead
    },
    async update(id, { contactNote, ...data }, user) {
      return db.$transaction(async tx => {
        const lead = await tx.lead.findUnique({ where: { id } })
        if (!lead) throw missing()
        const status = data.status
        if (status && status !== lead.status && !transitions[lead.status]?.includes(status)) {
          throw invalidTransition('This lead cannot move to the requested status.')
        }
        if (status === 'QUALIFIED' && ['roofArea', 'monthlyBill', 'gridSuitable'].some(key => (data[key] ?? lead[key]) == null)) {
          throw invalidTransition('Record roof area, monthly bill, and grid suitability before qualification.')
        }
        if (data.assignedToId && !await tx.user.findFirst({ where: { id: data.assignedToId, isActive: true } })) {
          throw new ApiError(400, 'VALIDATION_ERROR', 'Choose an active staff member.')
        }
        const changed = await tx.lead.updateMany({ where: { id, updatedAt: lead.updatedAt }, data })
        if (!changed.count) throw new ApiError(409, 'CONFLICT', 'Another user updated this lead.')
        if (status && status !== lead.status) {
          const notes = lead.status === 'NEW' && status === 'QUALIFIED'
            ? ['NEW to CONTACTED', 'CONTACTED to QUALIFIED']
            : [lead.status + ' to ' + status]
          await tx.leadActivity.createMany({
            data: notes.map(note => ({ leadId: id, actorId: user.id, type: 'STATUS_CHANGE', notes: note })),
          })
        }
        if (contactNote) {
          await tx.leadActivity.create({
            data: { leadId: id, actorId: user.id, type: 'NOTE', notes: contactNote },
          })
        }
        return tx.lead.findUnique({ where: { id }, include: { customer: true } })
      })
    },
    async addActivity(leadId, data, user) {
      if (!await db.lead.findUnique({ where: { id: leadId }, select: { id: true } })) throw missing()
      return db.leadActivity.create({ data: { ...data, leadId, actorId: user.id } })
    },
  }
}
