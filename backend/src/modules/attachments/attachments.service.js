import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { ApiError } from '../../utils/ApiError.js'

const preview = { id: true, ownerType: true, ownerId: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true }
const notFound = () => new ApiError(404, 'NOT_FOUND', 'Attachment not found.')
const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'application/pdf': 'pdf' }
const permittedSuffix = /\.(png|jpe?g|webp|pdf)$/i

function imageType(buffer) {
  if (buffer.length < 12) return null
  if (buffer.subarray(0, 8).equals(pngHeader)) return 'image/png'
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'image/jpeg'
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

async function allow(db, ownerId, user, write) {
  const { capabilities } = user
  const manage = capabilities.includes('installations:manage')
  const readAll = !write && capabilities.includes('installations:read') && !capabilities.includes('installations:complete_assigned')
  const job = await db.installation.findUnique({
    where: { id: ownerId },
    select: { status: true, installationAssignmentsByInstallation: { where: { technicianId: user.id }, select: { technicianId: true } } },
  })
  if (!job) throw notFound()
  const assigned = capabilities.includes('installations:complete_assigned') && job.installationAssignmentsByInstallation.length > 0
  if (!manage && !readAll && !assigned) throw new ApiError(403, 'FORBIDDEN', 'This installation is outside your assignment.')
  if (write && job.status === 'COMPLETED') throw new ApiError(409, 'INVALID_TRANSITION', 'Signed installation evidence is closed.')
}


async function allowRelated(db, ownerType, ownerId, user, write) {
  const can = capability => user.capabilities.includes(capability)
  let row, allowed, closed
  if (ownerType === 'SURVEY') {
    row = await db.siteSurvey.findUnique({ where: { id: ownerId } })
    const assigned = can('surveys:record') && row?.surveyorId === user.id
    allowed = can('surveys:approve') || assigned || (!write && can('surveys:read') && !can('surveys:record'))
    closed = ['APPROVED', 'REJECTED'].includes(row?.status)
  } else if (ownerType === 'TICKET') {
    row = await db.serviceTicket.findUnique({ where: { id: ownerId } })
    const assigned = can('tickets:manage') && row?.assignedToId === user.id
    allowed = can('tickets:resolve') || assigned || (!write && can('tickets:read') && !can('installations:complete_assigned'))
    closed = row?.status === 'CLOSED'
  } else if (ownerType === 'SUBSIDY') {
    row = await db.subsidyApplication.findUnique({ where: { id: ownerId } })
    allowed = can(write ? 'subsidies:manage' : 'subsidies:read')
  }
  if (!row) throw notFound()
  if (!allowed) throw new ApiError(403, 'FORBIDDEN', 'You do not have access to this evidence.')
  if (write && closed) throw new ApiError(409, 'INVALID_TRANSITION', 'This evidence record is closed.')
}

function authorizeOwner(db, ownerType, ownerId, user, write) {
  return ownerType === 'INSTALLATION' ? allow(db, ownerId, user, write) : allowRelated(db, ownerType, ownerId, user, write)
}

export function attachmentsService(db, uploadDirectory = process.env.UPLOAD_DIR ?? 'uploads') {
  return {
    async upload(owner, file, user) {
      await authorizeOwner(db, owner.ownerType, owner.ownerId, user, true)
      const pdf = owner.ownerType === 'SUBSIDY' && file?.buffer.toString('ascii', 0, 5) === '%PDF-'
      const mimeType = pdf ? 'application/pdf' : file && imageType(file.buffer)
      const suffix = file?.originalname.match(permittedSuffix)?.[0].toLowerCase().slice(1)
      const expected = extensions[mimeType]
      if (!mimeType || mimeType !== file.mimetype || (suffix !== expected && !(mimeType === 'image/jpeg' && suffix === 'jpeg'))) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Upload a matching PNG, JPEG, or WebP image. Subsidy documents can also be PDFs.')
      }
      const storageKey = randomUUID()
      const root = resolve(uploadDirectory)
      const target = resolve(root, storageKey)
      const originalName = basename(file.originalname.replaceAll('\\', '/')).slice(0, 200)
      await mkdir(root, { recursive: true })
      await writeFile(target, file.buffer, { flag: 'wx', mode: 0o600 })
      try {
        return await db.attachment.create({ data: {
          ...owner, originalName, mimeType, storageKey, sizeBytes: file.size, uploadedById: user.id,
        }, select: preview })
      } catch (error) {
        await unlink(target)
        throw error
      }
    },
    async open(id, user) {
      const row = await db.attachment.findUnique({ where: { id } })
      if (!row || !/^[a-f0-9-]{36}$/.test(row.storageKey)) throw notFound()
      await authorizeOwner(db, row.ownerType, row.ownerId, user, false)
      return { path: resolve(uploadDirectory, row.storageKey), mimeType: row.mimeType }
    },
  }
}
