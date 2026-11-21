import { z } from 'zod'

export const owner = z.strictObject({
  ownerType: z.enum(['INSTALLATION', 'SURVEY', 'TICKET', 'SUBSIDY']),
  ownerId: z.string().trim().min(1).max(100),
})
export const params = z.object({ id: z.string().trim().min(1).max(100) })
