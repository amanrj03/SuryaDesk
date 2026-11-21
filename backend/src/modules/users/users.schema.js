import { z } from 'zod'
import { Role } from '@prisma/client'

const name = z.string().trim().min(1).max(120)
const id = z.string().trim().min(1).max(100)
export const params = z.object({ id })
export const list = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(), role: z.enum(Role).optional(),
})
export const options = z.object({ kind: z.enum(['surveyor', 'technician']) })
export const create = z.strictObject({
  name, email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  password: z.string().min(12).refine(value => Buffer.byteLength(value) <= 72),
  role: z.enum(Role), isActive: z.boolean().default(true),
})
export const update = z.strictObject({
  name: name.optional(), role: z.enum(Role).optional(), isActive: z.boolean().optional(),
  hourlyCost: z.string().trim().regex(/^\d{1,10}(?:\.\d{1,2})?$/).nullable().optional(),
}).refine(value => Object.keys(value).length > 0)
