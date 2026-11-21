import { z } from 'zod'
import { WarrantyStatus } from '@prisma/client'

const instant = z.iso.datetime({ offset: true }).transform(value => new Date(value))
export const serial = z.object({ serial: z.string().trim().min(1).max(120).toUpperCase() })
export const coverage = z.object({ asOf: instant.optional() })
export const query = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
  status: z.enum(WarrantyStatus).optional(),
})
