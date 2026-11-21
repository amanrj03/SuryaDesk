import { z } from 'zod'
import { AssetStatus } from '@prisma/client'

const id = z.string().trim().min(1).max(100)
const serial = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9 ._:/-]{0,119}$/)
const pagination = {
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
}
export const inventory = z.object({ ...pagination, lowStock: z.enum(['true', 'false']).optional().transform(value => value === 'true') })
export const assets = z.object({ ...pagination, status: z.enum(AssetStatus).optional(), productId: id.optional() })
export const receipt = z.strictObject({
  productId: id, quantity: z.number().int().min(1).max(10000),
  unitCost: z.union([z.number(), z.string().trim()]).transform(String).pipe(z.string().regex(/^\d{1,10}(\.\d{1,2})?$/)),
  serialNumbers: z.array(serial).max(10000).default([]).refine(items => items.length === new Set(items).size, 'Serial numbers must be unique.'),
  reference: z.string().trim().min(1).max(120).optional(),
})

export const adjustment = z.strictObject({
  productId: id, delta: z.number().int().min(-10000).max(10000).refine(value => value !== 0),
  reason: z.string().trim().min(1).max(500),
})
