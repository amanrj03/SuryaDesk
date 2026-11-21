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
