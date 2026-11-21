import { z } from 'zod'
import { ActivityType, LeadSource, LeadStatus, SystemType } from '@prisma/client'

const notes = z.string().trim().min(1).max(2000)
const amount = z.union([z.string().trim(), z.number()]).transform(String)
  .pipe(z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/))
const customer = z.strictObject({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().regex(/^\+?[\d ()-]{7,19}$/).refine(value => value.replace(/\D/g, '').length >= 7),
  address: z.string().trim().min(1).max(500),
  email: z.string().trim().toLowerCase().pipe(z.email()).optional(),
  desiredKw: z.union([z.number(), z.string().trim().regex(/^\d+(?:\.\d{1,2})?$/).transform(Number)])
    .pipe(z.number().min(1).max(5)).optional(),
  systemType: z.enum(SystemType).optional(),
  subsidyInterest: z.boolean().default(false),
  monthlyBill: amount.optional(),
  notes: notes.optional(),
})
export const enquiry = customer
export const createLead = customer.extend({ source: z.enum(LeadSource) })
export const params = z.object({ id: z.string().min(1).max(100) })
export const query = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
  status: z.enum(LeadStatus).optional(),
  assignedToId: z.string().optional(),
})
export const patch = z.strictObject({
  assignedToId: z.string().min(1).nullable().optional(),
  status: z.enum(['CONTACTED', 'QUALIFIED', 'LOST']).optional(),
  roofArea: z.number().positive().max(99999999).optional(),
  monthlyBill: amount.optional(),
  gridSuitable: z.boolean().optional(),
  notes: notes.optional(),
}).refine(value => Object.keys(value).length > 0)
export const activity = z.strictObject({
  type: z.enum(ActivityType).exclude(['STATUS_CHANGE']),
  notes,
})
