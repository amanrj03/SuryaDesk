import { roleCapabilities } from '../../config/permissions.js'
import { ApiError } from '../../utils/ApiError.js'
import { warrantyEnd } from '../warranties/coverage.js'

const missing = () => new ApiError(404, 'NOT_FOUND', 'Installation not found.')
const forbidden = () => new ApiError(403, 'FORBIDDEN', 'Only assigned technicians can update this installation.')
const invalid = message => new ApiError(409, 'INVALID_TRANSITION', message)
const assigned = technicianId => ({ installationAssignmentsByInstallation: { some: { technicianId } } })
const include = {
  order: { include: { customer: true, quotation: { select: { lead: { select: { siteAddress: true } } } } } },
  installationAssignmentsByInstallation: { include: {
    technician: { select: { id: true, name: true, email: true } },
  } },
}
const manager = user => user.capabilities.includes('installations:manage')
const technician = user => user.capabilities.includes('installations:complete_assigned')
function scope(user) {
  return technician(user) && !manager(user) ? assigned(user.id) : {}
}

async function locked(tx, id) {
  const identity = await tx.installation.findUnique({ where: { id }, select: { orderId: true } })
  if (!identity) throw missing()
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${identity.orderId} FOR UPDATE`
  return tx.installation.findUnique({ where: { id }, include })
}

function authorizeFieldWork(job, user) {
  if (!manager(user) && (!technician(user) ||
    !job.installationAssignmentsByInstallation.some(row => row.technicianId === user.id))) throw forbidden()
}

function requireDelivered(job) {
  if (!['DELIVERED', 'INSTALLATION_IN_PROGRESS'].includes(job.order.status)) {
    throw invalid('Confirm delivery before recording site work.')
  }
}

async function audit(tx, id, action, actorId, summary = {}) {
  await tx.auditLog.create({ data: { actorId, entityType: 'Installation', entityId: id, action, summary } })
}

export function installationsService(db, clock = () => new Date()) {
  return {
    async list({ page, limit, status, technicianId }, user) {
      return db.$transaction(async tx => {
        const where = { status, AND: [scope(user), ...(technicianId ? [assigned(technicianId)] : [])] }
        const data = await tx.installation.findMany({
          where, include, skip: (page - 1) * limit, take: limit,
          orderBy: [{ scheduledAt: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
        })
        const total = await tx.installation.count({ where })
        return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
      }, { isolationLevel: 'RepeatableRead' })
    },

    async detail(id, user) {
      const job = await db.installation.findFirst({ where: { id, ...scope(user) }, include })
      if (!job) throw missing()
      const attachments = await db.attachment.findMany({
        where: { ownerId: id, ownerType: 'INSTALLATION' },
        select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true },
      })
      return { ...job, attachments }
    },

    async update(id, { technicianIds, scheduledAt, ...fields }, user) {
      return db.$transaction(async tx => {
        const job = await locked(tx, id)
        authorizeFieldWork(job, user)
        if (job.status === 'COMPLETED') throw invalid('This signed installation is complete.')
        if (job.order.status === 'CANCELLED') throw invalid('A cancelled order cannot be installed.')
        if ((technicianIds || scheduledAt) && !manager(user)) throw forbidden()
        if ((technicianIds || scheduledAt) && job.startedAt) throw invalid('The installation schedule is fixed once work starts.')
        if (technicianIds) {
          const ids = [...new Set(technicianIds)]
          const workers = await tx.user.findMany({ where: { id: { in: ids }, isActive: true } })
          if (workers.length !== ids.length || workers.some(worker => !roleCapabilities[worker.role]?.includes('installations:complete_assigned'))) {
            throw new ApiError(400, 'VALIDATION_ERROR', 'Select active technicians.')
          }
          await tx.installationAssignment.deleteMany({ where: { installationId: id, technicianId: { notIn: ids } } })
          await tx.installationAssignment.createMany({
            data: ids.map(technicianId => ({ technicianId, installationId: id, assignedAt: new Date() })), skipDuplicates: true,
          })
        }
        const starts = fields.startedAt ?? job.startedAt
        const finishes = fields.finishedAt ?? job.finishedAt
        const now = new Date()
        if (starts > now || finishes > now || (finishes && (!starts || finishes <= starts))) {
          throw invalid('Enter a valid start and finish time.')
        }
        if (starts) {
          requireDelivered(job)
          if (!(technicianIds?.length ?? job.installationAssignmentsByInstallation.length)) {
            throw invalid('Assign a technician before starting.')
          }
          if (job.order.status === 'DELIVERED') {
            await tx.order.update({ where: { id: job.orderId }, data: { status: 'INSTALLATION_IN_PROGRESS' } })
          }
        }
        const status = finishes ? 'PENDING_SIGNOFF' : starts ? 'IN_PROGRESS'
          : scheduledAt || job.scheduledAt ? 'SCHEDULED' : 'UNSCHEDULED'
        await audit(tx, id, 'UPDATED', user.id, { from: job.status, to: status })
        return tx.installation.update({
          where: { id }, data: { ...fields, ...(fields.checklist && { checklist: { ...job.checklist, ...fields.checklist } }), scheduledAt, status },
          include,
        })
      })
    },

    async complete(id, data, user) {
      return db.$transaction(async tx => {
        const job = await locked(tx, id)
        authorizeFieldWork(job, user)
        if (job.status === 'COMPLETED') return job
        requireDelivered(job)
        if (!job.startedAt || data.finishedAt <= job.startedAt || data.finishedAt > new Date() ||
          !job.installationAssignmentsByInstallation.length || !data.generationTestPassed ||
          !['mounting', 'electrical', 'earthing', 'generation'].every(key => data.checklist[key] === true)) {
          throw invalid('Record the crew, valid work times, and all completed checks before sign-off.')
        }
        const media = await tx.attachment.findMany({
          where: { ownerType: 'INSTALLATION', ownerId: id, mimeType: { startsWith: 'image/' } },
          select: { id: true, mimeType: true },
        })
        if (!media.some(row => row.id === data.signatureAttachmentId && row.mimeType === 'image/png') ||
          !media.some(row => row.id !== data.signatureAttachmentId)) {
          throw invalid('Upload a roof photo and a separate PNG signature before sign-off.')
        }
        for (const { technicianId } of job.installationAssignmentsByInstallation) {
          const worker = await tx.user.findUnique({ where: { id: technicianId }, select: { hourlyCost: true } })
          await tx.workLog.create({ data: {
            installationId: id, technicianId, startAt: job.startedAt, endAt: data.finishedAt, hourlyCostSnapshot: worker.hourlyCost ?? 0,
          } })
        }
        const signedAt = clock()
        const installed = await tx.serializedAsset.findMany({
          where: { orderId: job.orderId, status: { in: ['DELIVERED', 'INSTALLED'] } },
          select: { id: true, product: { select: { warrantyMonths: true } }, warrantyByAsset: true },
        })
        for (const asset of installed) {
          const existing = asset.warrantyByAsset
          if (existing && existing.status !== 'PENDING') continue
          const months = existing?.months ?? asset.product.warrantyMonths
          if (months <= 0) continue
          const coverage = { months, startAt: signedAt, endAt: warrantyEnd(signedAt, months), status: 'ACTIVE' }
          if (existing) await tx.warranty.update({ where: { id: existing.id }, data: coverage })
          else await tx.warranty.create({ data: {
            ...coverage, assetId: asset.id, orderId: job.orderId, customerId: job.order.customerId,
          } })
        }
        await tx.serializedAsset.updateMany({ where: { orderId: job.orderId, status: 'DELIVERED' }, data: { status: 'INSTALLED' } })
        await tx.order.update({ where: { id: job.orderId }, data: { status: 'COMPLETED' } })
        await audit(tx, id, 'COMPLETED', user.id, { signer: data.customerSignerName })
        return tx.installation.update({ where: { id }, data: { ...data, status: 'COMPLETED', signedAt }, include })
      })
    },
  }
}
