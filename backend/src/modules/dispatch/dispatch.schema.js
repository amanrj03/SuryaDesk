import { z } from 'zod'
import { DispatchStatus } from '@prisma/client'

const id = z.string().trim().min(1).max(100)
const date = z.iso.datetime({ offset: true }).transform(value => new Date(value))
const text = z.string().trim().min(1).max(120)
export const params = z.object({ id })
export const query = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(DispatchStatus).optional(), orderId: id.optional(),
  q: z.string().trim().max(120).optional(),
})
export const draft = z.strictObject({ notes: z.string().trim().min(1).max(2000).optional() }).default({})
export const allocation = z.strictObject({
  items: z.array(z.strictObject({
    productId: id, quantity: z.number().int().min(1).max(10000),
    serialNumbers: z.array(text.transform(value => value.toUpperCase())).max(10000).default([]),
  })).max(100),
}).refine(({ items }) => new Set(items.map(item => item.productId)).size === items.length, 'Products must be distinct.')
export const dispatch = z.strictObject({ dispatchedAt: date.optional() }).default({})
export const deliver = z.strictObject({ deliveredAt: date.optional(), recipientName: text })
