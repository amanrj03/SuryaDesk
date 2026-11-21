import { z } from 'zod'
import { PackageType, ProductCategory } from '@prisma/client'

const label = z.string().trim().min(1).max(120)
const amount = z.union([z.string().trim(), z.number()]).transform(String)
  .pipe(z.string().regex(/^\d{1,10}(\.\d{1,2})?$/))
const code = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{0,63}$/)
const pagination = {
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
}
export const params = z.object({ id: z.string().min(1).max(100) })
export const products = z.object({ ...pagination, category: z.enum(ProductCategory).optional() })
export const packages = z.object({
  ...pagination, type: z.enum(PackageType).optional(),
  capacityKw: z.coerce.number().min(1).max(5).optional(),
})
export const product = z.strictObject({
  sku: code.optional(), name: label, category: z.enum(ProductCategory), unit: label,
  cost: amount, salePrice: amount, serialized: z.boolean(),
  warrantyMonths: z.number().int().min(0).max(600),
  reorderLevel: z.number().int().min(0).max(1000000), isActive: z.boolean().optional(),
})
const components = z.array(z.strictObject({
  productId: z.string().min(1).max(100), quantity: z.number().int().min(1).max(100000),
})).max(100).refine(rows => rows.length === new Set(rows.map(row => row.productId)).size, 'Products must be distinct.')
export const packageBody = z.strictObject({
  code: code.optional(), name: label, type: z.enum(PackageType), capacityKw: z.number().min(1).max(5).nullable().optional(),
  description: z.string().trim().max(2000).optional(), basePrice: amount,
  isActive: z.boolean().optional(), components,
})
const provided = value => Object.keys(value).length > 0
export const productPatch = product.partial().refine(provided)
export const packagePatch = packageBody.partial().refine(provided)
