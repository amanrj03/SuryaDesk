import { createHash, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { deflateSync } from 'node:zlib'
import { installationsService } from '../src/modules/installations/installations.service.js'
import { roleCapabilities } from '../src/config/permissions.js'

const width = 240
const height = 120
const hour = 3600_000

function pngChunk(type, data) {
  const tag = Buffer.from(type)
  let crc = 0xffffffff
  for (const byte of Buffer.concat([tag, data])) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
  return Buffer.concat([length, tag, data, checksum])
}

function illustration(index, signature) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  const stride = width * 3 + 1
  const pixels = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let color
      if (signature) {
        const stroke = Math.abs(y - (66 + Math.sin(x / (7 + index % 4)) * 12 + Math.sin(x / 3) * 3)) < 1.5
        color = x > 35 && x < 194 && stroke ? [23, 49, 82] : [255, 255, 255]
      } else {
        const roof = y > 52 && x > 25 && x < 220
        const panel = y > 57 && y < 103 && x > 42 && x < 202
        const lattice = (x - 42) % 20 < 2 || (y - 57) % 15 < 2
        color = panel ? lattice ? [169, 190, 213] : [30 + index % 8, 69, 110]
          : roof ? [133, 127, 107] : [126, 188, 229]
      }
      const offset = y * stride + 1 + x * 3
      pixels.set(color, offset)
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(pixels)), pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function key(id, kind) {
  const hash = createHash('sha256').update(id + ':' + kind).digest('hex').slice(0, 32)
  return hash.replace(/^(........)(....)(....)(....)(............)$/, '$1-$2-$3-$4-$5')
}

export async function seedInstallations(db, writtenMedia) {
  const root = resolve(process.env.UPLOAD_DIR ?? 'uploads')
  const admin = await db.user.findUniqueOrThrow({ where: { email: 'admin@demo.suryadesk.test' } })
  const actor = { ...admin, capabilities: roleCapabilities[admin.role] }
  const rows = await db.installation.findMany({
    where: { orderId: { startsWith: 'DEMO-ORDER-' }, order: { status: { in: ['DELIVERED', 'COMPLETED'] } } },
    orderBy: { orderId: 'asc' }, take: 49,
    include: { order: { include: { customer: true, dispatchesByOrder: true } } },
  })
  await mkdir(root, { recursive: true })
  for (const [index, job] of rows.entries()) {
    if (job.status !== 'SCHEDULED' || job.startedAt) continue
    const deliveredAt = job.order.dispatchesByOrder.find(row => row.status === 'DELIVERED')?.deliveredAt
    if (!deliveredAt) continue
    const startedAt = new Date(deliveredAt.getTime() + 48 * hour)
    const finishedAt = new Date(startedAt.getTime() + (4 + index % 3) * hour)
    if (finishedAt >= new Date()) continue
    const existing = await db.attachment.count({ where: { ownerType: 'INSTALLATION', ownerId: job.id } })
    if (existing) continue

    if (index >= 40) {
      const service = installationsService(db)
      await service.update(job.id, {
        startedAt, generationReading: job.capacityKw.mul('0.81'),
        ...(index >= 45 && { finishedAt }),
      }, actor)
      continue
    }

    const files = []
    for (const [kind, signature] of [['roof-illustration', false], ['signature-sample', true]]) {
      const storageKey = key(job.id + (writtenMedia ? randomUUID() : ''), kind)
      const content = illustration(index, signature)
      await writeFile(resolve(root, storageKey), content, { mode: 0o600 })
      writtenMedia?.push(storageKey)
      files.push({ id: 'DEMO-' + storageKey, storageKey, ownerType: 'INSTALLATION', ownerId: job.id,
        originalName: kind + '-demo.png', mimeType: 'image/png', sizeBytes: content.length,
        uploadedById: admin.id, createdAt: finishedAt })
    }
    await db.$transaction(async tx => {
      await tx.attachment.createMany({ data: files })
      const service = installationsService({ $transaction: callback => callback(tx) }, () => new Date(finishedAt.getTime() + 300_000))
      await service.update(job.id, { startedAt, generationReading: job.capacityKw.mul('0.86') }, actor)
      await service.complete(job.id, {
        finishedAt, capacityKw: job.capacityKw, customerSignerName: job.order.customer.name,
        checklist: { mounting: true, electrical: true, earthing: true, generation: true },
        generationTestPassed: true, signatureAttachmentId: files[1].id,
      }, actor)
      await tx.jobCost.create({ data: {
        orderId: job.orderId, recordedById: admin.id, category: 'TRANSPORT',
        description: index % 7 === 0 ? 'Second mobilization and lift rental' : 'Crew travel and material handling',
        amount: index % 7 === 0 ? 18500 : 850 + index * 35, incurredAt: finishedAt,
      } })
      await tx.installation.update({ where: { id: job.id }, data: {
        notes: 'Demo completion with synthetic roof illustration and signature sample.',
      } })
    })
  }
}
