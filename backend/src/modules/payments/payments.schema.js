import { z } from 'zod'
import { PaymentMethod } from '@prisma/client'

const id = z.string().trim().min(1).max(100)
const date = z.iso.datetime({ offset: true }).transform(value => new Date(value))
const amount = z.union([z.string().trim(), z.number()]).transform(String)
  .pipe(z.string().regex(/^\d{1,10}(\.\d{1,2})?$/).refine(value => Number(value) > 0))
export const params = z.object({ id })
export const payment = z.strictObject({
  amount, method: z.enum(PaymentMethod), reference: z.string().trim().min(1).max(120).optional(),
  receivedAt: date.optional(), requestId: z.uuid().optional(),
}).refine(value => !value.requestId || !value.reference, 'Provide a request ID or a payment reference.')
export const query = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  orderId: id.optional(), method: z.enum(PaymentMethod).optional(), from: date.optional(), to: date.optional(),
}).refine(value => !value.from || !value.to || value.from < value.to, 'Choose a valid date range.')
