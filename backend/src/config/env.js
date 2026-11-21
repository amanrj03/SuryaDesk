import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CORS_ORIGIN: z.url().default('http://localhost:5173'),
})

const runtime = schema.extend({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  JWT_SECRET: z.string().min(32),
})

export function readRuntimeConfig(environment = process.env) {
  return runtime.parse(environment)
}

export function readConfig(environment = process.env) {
  return schema.parse(environment)
}
