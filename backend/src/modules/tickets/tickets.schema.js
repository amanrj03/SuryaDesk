import { z } from 'zod'
import { TicketPriority, TicketStatus } from '@prisma/client'

const id = z.string().trim().min(1).max(100)
const text = z.string().trim().min(1).max(2000)
const date = z.iso.datetime({ offset: true }).transform(value => new Date(value))
const amount = z.union([z.number(), z.string().trim()]).transform(String)
  .pipe(z.string().regex(/^\d{1,10}(\.\d{1,2})?$/))
export const params = z.object({ id })
export const query = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(), status: z.enum(TicketStatus).optional(), priority: z.enum(TicketPriority).optional(),
})
export const create = z.strictObject({
  customerId: id, assetId: id.optional(), orderId: id.optional(), faultCode: z.string().trim().min(1).max(80).optional(),
  description: text, priority: z.enum(TicketPriority), incidentAt: date.optional(),
})
export const update = z.strictObject({
  assignedToId: id.optional(), priority: z.enum(TicketPriority).optional(),
  status: z.enum(['TRIAGED', 'ASSIGNED', 'IN_PROGRESS']).optional(),
  notes: text.optional(), laborCharge: amount.optional(),
}).refine(value => Object.keys(value).length > 0)
export const part = z.strictObject({ productId: id, quantity: z.number().int().min(1).max(10000), chargePerUnit: amount })
export const repairReport = z.strictObject({ repairNotes: text })
export const resolve = z.strictObject({
  resolutionNotes: text, coverageDecision: z.enum(['COVERED', 'NOT_COVERED']), coverageReason: text.optional(),
})
export const confirm = z.strictObject({
  customerConfirmationName: z.string().trim().min(1).max(120), confirmedAt: date.optional(),
})

export const replacement = z.strictObject({ serialNumber: z.string().trim().min(1).max(120).toUpperCase(), chargePerUnit: amount })
