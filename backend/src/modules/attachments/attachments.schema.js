import { z } from 'zod'

export const owner = z.strictObject({
  ownerType: z.literal('INSTALLATION'),
  ownerId: z.string().trim().min(1).max(100),
})
export const params = z.object({ id: z.string().trim().min(1).max(100) })
