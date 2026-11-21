import { z } from 'zod'
import { enquiry } from '../leads/leads.schema.js'

const email = z.string().trim().toLowerCase().max(254).pipe(z.email())
const withinPasswordLimit = value => Buffer.byteLength(value) <= 72
const password = z.string().min(12).max(72).refine(withinPasswordLimit, 'Use at most 72 bytes.')
const currentPassword = z.string().min(1).max(72).refine(withinPasswordLimit, 'Use at most 72 bytes.')
const match = value => value.password === value.confirmPassword
export const signup = enquiry.extend({ email, password, confirmPassword: password }).refine(match, 'Passwords must match.')
export const extraEnquiry = enquiry.omit({ email: true, name: true, phone: true })
export const requestCode = z.strictObject({ email })
export const verifyCode = requestCode.extend({ code: z.string().regex(/^\d{6}$/) })
export const signupRequest = requestCode.extend({ requestId: z.uuid() })
export const verifySignup = verifyCode.extend({ requestId: z.uuid() })
export const login = requestCode.extend({ password: currentPassword })
export const reset = verifyCode.extend({ password, confirmPassword: password }).refine(match, 'Passwords must match.')
export const profile = z.strictObject({ name: z.string().trim().min(1).max(120), address: z.string().trim().min(1).max(500) })
export const changePassword = z.strictObject({ currentPassword, password, confirmPassword: password })
  .refine(match, 'Passwords must match.')
