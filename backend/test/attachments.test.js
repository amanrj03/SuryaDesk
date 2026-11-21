import assert from 'node:assert/strict'
import { mkdtemp, readFile, rmdir, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { attachmentsService } from '../src/modules/attachments/attachments.service.js'

test('installation media verifies type and assignment and hides its storage key', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'suryadesk-media-'))
  const user = { id: 'assigned', capabilities: ['installations:complete_assigned'] }
  const owner = { ownerType: 'INSTALLATION', ownerId: 'installation' }
  let saved
  const db = {
    installation: { findUnique: async ({ select }) => ({
      status: 'IN_PROGRESS',
      installationAssignmentsByInstallation: select.installationAssignmentsByInstallation.where.technicianId === user.id ? [user] : [],
    }) },
    attachment: {
      create: async ({ data, select }) => {
        saved = { id: 'attachment', ...data }
        return Object.fromEntries(Object.keys(select).map(key => [key, saved[key]]))
      },
      findUnique: async () => saved,
    },
  }
  const service = attachmentsService(db, directory)
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+Yv1cAAAAASUVORK5CYII=', 'base64')
  const file = { originalname: '../../roof.png', mimetype: 'image/png', size: image.length, buffer: image }
  try {
    await assert.rejects(service.upload(owner, file, { ...user, id: 'other-tech' }), { code: 'FORBIDDEN' })
    await assert.rejects(service.upload(owner, { ...file, buffer: Buffer.from('<script>') }, user), { code: 'VALIDATION_ERROR' })
    const upload = await service.upload(owner, file, user)
    assert.equal(upload.originalName, 'roof.png')
    assert.equal(upload.storageKey, undefined)
    const opened = await service.open(upload.id, user)
    assert.deepEqual(await readFile(opened.path), image)
    await assert.rejects(service.open(upload.id, { ...user, id: 'other-tech' }), { code: 'FORBIDDEN' })
  } finally {
    if (saved) await unlink(join(directory, saved.storageKey))
    await rmdir(directory)
  }
})
