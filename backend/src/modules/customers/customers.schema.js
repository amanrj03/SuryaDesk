import { z } from 'zod'

export const params = z.object({ id: z.string().min(1).max(100) })
export const query = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
})
