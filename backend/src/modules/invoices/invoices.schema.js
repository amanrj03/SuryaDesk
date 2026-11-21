import { z } from 'zod'
import { InvoiceStatus } from '@prisma/client'

const id = z.string().trim().min(1).max(100)
const date = z.iso.datetime({ offset: true }).transform(value => new Date(value))
const amount = z.union([z.string().trim(), z.number()]).transform(String).pipe(z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/))
export const params = z.object({ id })
export const query = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(), status: z.enum(InvoiceStatus).optional(),
})
export const create = z.strictObject({
  orderId: id.optional(), ticketId: id.optional(), customerId: id, dueAt: date.optional(),
  taxRate: z.number().min(0).max(100).default(0),
  lines: z.array(z.strictObject({
    description: z.string().trim().min(1).max(500), quantity: z.number().int().min(1).max(100000), unitPrice: amount,
  })).min(1).max(100).optional(),
}).refine(value => Boolean(value.orderId) !== Boolean(value.ticketId), 'Choose either an order or a service ticket.')
export const issue = z.strictObject({ dueAt: date.optional() }).default({})
