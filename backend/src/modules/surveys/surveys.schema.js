import { z } from 'zod'
import { SurveyStatus } from '@prisma/client'

const id = z.string().trim().min(1).max(100)
const instant = z.iso.datetime({ offset: true }).transform(value => new Date(value))
const notes = z.string().trim().min(1).max(2000)
export const params = z.object({ id })
export const schedule = z.strictObject({ surveyorId: id, scheduledAt: instant })
export const list = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(SurveyStatus).optional(),
  surveyorId: id.optional(),
  q: z.string().trim().max(120).optional(),
})
export const record = z.strictObject({
  visitedAt: instant,
  roofDirection: z.enum(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']),
  tiltDegrees: z.number().min(0).max(90),
  cableDistanceMeters: z.number().min(0).max(99999999),
  shadowFreeArea: z.number().positive().max(99999999),
  gridSuitable: z.boolean(),
  findings: notes,
  status: z.enum(['IN_PROGRESS', 'SUBMITTED']),
  approveOnSubmit: z.boolean(),
}).partial().refine(value => Object.keys(value).length > 0)
  .refine(value => !value.approveOnSubmit || value.status === 'SUBMITTED', 'Submit the survey to approve it.')
export const approval = z.discriminatedUnion('approved', [
  z.strictObject({ approved: z.literal(true) }),
  z.strictObject({ approved: z.literal(false), rejectionReason: notes }),
])
