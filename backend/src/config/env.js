import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CORS_ORIGIN: z.url().default('http://localhost:5173'),
})

const runtime = schema.extend({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  JWT_SECRET: z.string().min(32),
  CUSTOMER_EMAIL_FROM: z.string().trim().min(1).optional(),
  RESEND_API_KEY: z.string().trim().min(1).optional(),
  GMAIL_USER: z.string().trim().pipe(z.email()).optional(),
  GMAIL_APP_PASSWORD: z.string().transform(value => value.replace(/\s/g, '')).pipe(z.string().length(16)).optional(),
}).refine(config => Boolean(config.GMAIL_USER) === Boolean(config.GMAIL_APP_PASSWORD), {
  path: ['GMAIL_APP_PASSWORD'],
  message: 'Set both GMAIL_USER and GMAIL_APP_PASSWORD to enable Gmail delivery.',
})

export function readRuntimeConfig(environment = process.env) {
  return runtime.parse(environment)
}

export function readConfig(environment = process.env) {
  return schema.parse(environment)
}
