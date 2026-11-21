import bcrypt from 'bcrypt'
import { roleCapabilities } from '../../config/permissions.js'
import { ApiError } from '../../utils/ApiError.js'

const select = { id: true, name: true, email: true, role: true, isActive: true, hourlyCost: true, createdAt: true }
const optionRules = {
  surveyor: { scope: ['surveys:schedule'], skill: 'surveys:record' },
  technician: { scope: ['installations:manage', 'tickets:resolve'], skill: 'installations:complete_assigned' },
}

async function audit(tx, id, userId, action, summary) {
  await tx.auditLog.create({ data: { entityId: id, entityType: 'User', actorId: userId, action, summary } })
}

export function usersService(db) {
  return {
    async list({ page, limit, q, role }) {
      return db.$transaction(async tx => {
        const search = { contains: q, mode: 'insensitive' }
        const where = { role, ...(q && { OR: [{ name: search }, { email: search }] }) }
        const data = await tx.user.findMany({
          where, select, skip: (page - 1) * limit, take: limit, orderBy: [{ name: 'asc' }, { id: 'asc' }],
        })
        const total = await tx.user.count({ where })
        return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
      }, { isolationLevel: 'RepeatableRead' })
    },
    async options(kind, actor) {
      const { scope, skill } = optionRules[kind]
      if (!scope.some(capability => actor.capabilities.includes(capability))) {
        throw new ApiError(403, 'FORBIDDEN', 'You cannot assign staff for this workflow.')
      }
      const choices = Object.keys(roleCapabilities).filter(role => roleCapabilities[role].includes(skill))
      return db.user.findMany({
        where: { role: { in: choices }, isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' },
      })
    },
    async create({ password, ...fields }, actor) {
      const passwordHash = await bcrypt.hash(password, 12)
      return db.$transaction(async tx => {
        const user = await tx.user.create({ data: { ...fields, passwordHash }, select })
        await audit(tx, user.id, actor.id, 'CREATED', { role: user.role })
        return user
      })
    },
    async update(id, fields, actor) {
      return db.$transaction(async tx => {
        await tx.$executeRaw`LOCK TABLE "User" IN SHARE ROW EXCLUSIVE MODE`
        const user = await tx.user.findUnique({ where: { id }, select })
        if (!user) throw new ApiError(404, 'NOT_FOUND', 'Staff member not found.')
        if (user.isActive && user.role === 'ADMIN' && (fields.isActive === false || (fields.role && fields.role !== 'ADMIN'))) {
          if (await tx.user.count({ where: { role: 'ADMIN', isActive: true } }) <= 1) {
            throw new ApiError(409, 'CONFLICT', 'Keep at least one active administrator.')
          }
        }
        const updated = await tx.user.update({ where: { id }, data: fields, select })
        if (!updated.isActive) await tx.staffSession.deleteMany({ where: { userId: id } })
        await audit(tx, id, actor.id, 'UPDATED', { role: updated.role, isActive: updated.isActive })
        return updated
      })
    },
  }
}
