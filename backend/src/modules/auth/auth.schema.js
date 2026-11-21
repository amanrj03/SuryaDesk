import { z } from 'zod'

export const loginBody = z.strictObject({
  email: z.email().trim().toLowerCase().max(254),
  password: z.string().min(1).refine(password => Buffer.byteLength(password) <= 72),
})
