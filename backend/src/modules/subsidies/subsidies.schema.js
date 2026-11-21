import { z } from 'zod'
import { SubsidyStatus } from '@prisma/client'

const id = z.string().trim().min(1).max(100)
const instant = z.iso.datetime({ offset: true }).transform(value => new Date(value))
export const params = z.object({ id })
export const create = z.strictObject({ orderId: id, notes: z.string().trim().max(2000).optional() })
export const query = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(SubsidyStatus).optional(),
})
export const update = z.strictObject({
  status: z.enum(SubsidyStatus), reference: z.string().trim().min(1).max(120).optional(),
  submittedAt: instant.optional(), decisionAt: instant.optional(),
  notes: z.string().trim().max(2000).optional(),
  documentChecklist: z.strictObject({
    identity: z.boolean().optional(), utilityBill: z.boolean().optional(),
    installationCertificate: z.boolean().optional(), bankDetails: z.boolean().optional(),
  }).optional(),
})
