import { z } from 'zod'

const date = z.iso.datetime({ offset: true }).transform(value => new Date(value))
export const period = z.object({
  period: z.enum(['today', 'week', 'month', 'custom']).default('month'),
  from: date.optional(), to: date.optional(),
}).refine(value => value.period !== 'custom' || (value.from && value.to &&
  value.to > value.from && value.to - value.from <= 366 * 86400_000), 'Choose a valid range up to 366 days.')
export const profitability = period.safeExtend({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})
export const exportQuery = period.safeExtend({
  type: z.enum(['profitability', 'operations', 'tickets', 'orders']),
})
