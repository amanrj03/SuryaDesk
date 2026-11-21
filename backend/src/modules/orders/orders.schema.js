import { z } from 'zod'
import { OrderStatus } from '@prisma/client'

export const params = z.object({ id: z.string().min(1).max(100) })
export const convert = z.strictObject({ notes: z.string().trim().min(1).max(2000).optional() }).default({})
export const query = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
  status: z.enum(OrderStatus).optional(),
})

export const cost = z.strictObject({
  category: z.enum(['TRANSPORT', 'LABOR', 'MATERIAL', 'OTHER']),
  description: z.string().trim().min(1).max(500),
  amount: z.string().trim().regex(/^\d{1,10}(?:\.\d{1,2})?$/).refine(value => Number(value) > 0),
  incurredAt: z.iso.datetime({ offset: true }).transform(value => new Date(value)).optional(),
})
