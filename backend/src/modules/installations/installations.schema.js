import { z } from 'zod'
import { InstallationStatus } from '@prisma/client'

const id = z.string().trim().min(1).max(100)
const date = z.iso.datetime({ offset: true }).transform(value => new Date(value))
const checks = z.strictObject({ mounting: z.boolean(), electrical: z.boolean(), earthing: z.boolean(), generation: z.boolean() })
const reading = z.number().min(0).max(99999999)
export const params = z.object({ id })
export const query = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
  status: z.enum(InstallationStatus).optional(), technicianId: id.optional(),
})
export const update = z.strictObject({
  scheduledAt: date.optional(), technicianIds: z.array(id).min(1).max(15).optional(),
  startedAt: date.optional(), finishedAt: date.optional(), checklist: checks.partial().optional(),
  generationTestPassed: z.boolean().optional(), generationReading: reading.optional(),
  notes: z.string().trim().max(2000).optional(),
}).refine(value => Object.keys(value).length > 0)
export const complete = z.strictObject({
  finishedAt: date, capacityKw: z.number().positive().max(99999999), checklist: checks,
  generationTestPassed: z.literal(true), signatureAttachmentId: id,
  customerSignerName: z.string().trim().min(1).max(120),
})
