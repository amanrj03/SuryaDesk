import { z } from 'zod'
import { QuoteStatus } from '@prisma/client'

const id = z.string().trim().min(1).max(100)
const date = z.iso.datetime({ offset: true }).transform(value => new Date(value))
const notes = z.string().trim().min(1).max(2000)
export const params = z.object({ id })
export const create = z.strictObject({
  leadId: id, surveyId: id, packageId: id, includeInstallation: z.boolean().default(false),
  taxRate: z.union([z.number(), z.string().trim().regex(/^\d+(?:\.\d{1,2})?$/).transform(Number)])
    .pipe(z.number().min(0).max(100)).default(0), notes: notes.optional(), validUntil: date.optional(),
})
export const send = z.strictObject({ validUntil: date.optional() }).default({})
export const accept = z.strictObject({ acceptedAt: date.optional() }).default({})
export const reject = z.strictObject({ reason: notes.optional() }).default({})
export const list = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
  status: z.enum(QuoteStatus).optional(),
})
