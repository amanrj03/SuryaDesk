import { z } from 'zod'
import { PurchaseStatus } from '@prisma/client'

const id = z.string().trim().min(1).max(100)
const name = z.string().trim().min(1).max(120)
const date = z.iso.datetime({ offset: true }).transform(value => new Date(value))
const quantity = z.number().int().min(1).max(10000)
export const params = z.object({ id })
export const query = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
})
export const orders = query.extend({ status: z.enum(PurchaseStatus).optional() })
export const supplier = z.strictObject({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{0,63}$/).optional(),
  name, email: z.email().optional(), phone: name.optional(), address: z.string().trim().min(1).max(500).optional(),
})
export const purchase = z.strictObject({
  supplierId: id, expectedAt: date.optional(), notes: z.string().trim().max(2000).optional(),
  lines: z.array(z.strictObject({
    productId: id, quantity, unitCost: z.string().trim().regex(/^\d{1,10}(\.\d{1,2})?$/),
  })).min(1).max(50).refine(rows => rows.length === new Set(rows.map(row => row.productId)).size, 'Products must be distinct.'),
})
export const receipt = z.strictObject({
  productId: id, quantity,
  serialNumbers: z.array(z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9 ._:/-]{0,119}$/))
    .max(10000).default([]).refine(items => items.length === new Set(items).size, 'Serial numbers must be unique.'),
})
