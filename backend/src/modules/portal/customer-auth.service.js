import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { Prisma } from '@prisma/client'
import { ApiError } from '../../utils/ApiError.js'

const lifetime = 60 * 60 * 8
const issuer = 'suryadesk'
const audience = 'suryadesk-customer'
const dummyHash = bcrypt.hash(randomUUID(), 12)
const unauthenticated = () => new ApiError(401, 'UNAUTHENTICATED', 'Invalid credentials or expired session.')
const invalidCode = () => new ApiError(400, 'INVALID_CODE', 'Invalid or expired code. Request a new code and try again.')
const publicAccount = { id: true, email: true, name: true, phone: true, address: true }

async function lockEmail(tx, email) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${email}, 0))`
}

async function createEnquiry(tx, account, { address = account.address, ...enquiry }) {
  return tx.lead.create({
    data: {
      ...enquiry, source: 'WEB', status: 'NEW', leadNumber: 'LEAD-' + randomUUID().toUpperCase(),
      customerId: account.customerId, portalAccountId: account.id, siteAddress: address,
      leadActivitiesByLead: { create: { type: 'STATUS_CHANGE', notes: 'Enquiry received from the customer portal.' } },
    },
    select: { id: true, leadNumber: true, status: true },
  })
}

export function customerAuthService(db, secret, sendEmail) {
  const jwtKey = createHmac('sha256', secret).update(audience).digest()
  const digest = (email, purpose, code) => createHmac('sha256', secret).update(JSON.stringify([audience, email, purpose, code])).digest('hex')

  async function issue(email, purpose, payload, resendId) {
    if (!sendEmail) throw new ApiError(503, 'MAIL_UNAVAILABLE', 'Email verification is currently unavailable.')
    await db.customerChallenge.deleteMany({ where: { expiresAt: { lte: new Date(Date.now() - 600_000) } } })
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    const value = digest(email, purpose, code)
    const outcome = await db.$transaction(async tx => {
      await lockEmail(tx, email)
      const where = { email_purpose: { email, purpose } }
      const old = await tx.customerChallenge.findUnique({ where })
      const now = new Date()
      if (old?.resendAfter > now) return null
      const account = await tx.customerAccount.findUnique({ where: { email }, select: { id: true } })
      if (resendId && !account && (old?.payload?.requestId !== resendId || +old.expiresAt + 600_000 <= +now)) return null
      const deliver = purpose === 'signup' || Boolean(account)
      const fields = {
        digest: value, attempts: 0, expiresAt: new Date(+now + 300_000), resendAfter: new Date(+now + 60_000),
        payload: account ? Prisma.DbNull : payload ?? (resendId ? old?.payload : null) ?? Prisma.DbNull,
      }
      await tx.customerChallenge.upsert({ where, create: { email, purpose, ...fields }, update: fields })
      return { deliver, existing: purpose === 'signup' && Boolean(account) }
    })
    async function deliver() {
      try {
        await sendEmail({
          email, subject: 'SuryaDesk verification',
          message: outcome.existing
            ? 'Sign in to your existing SuryaDesk account to request another quotation.'
            : 'Your SuryaDesk verification code is ' + code + '. It expires in five minutes.',
        })
      } catch {
        await db.customerChallenge.deleteMany({ where: { email, purpose, digest: value } }).catch(() => {})
        if (purpose === 'signup') throw new ApiError(503, 'MAIL_UNAVAILABLE', 'Email delivery is temporarily unavailable. Try again.')
      }
    }
    if (outcome?.deliver && purpose === 'signup') await deliver()
    else if (outcome?.deliver) void deliver()
  }

  async function consume(email, purpose, code, action, requestId) {
    const result = await db.$transaction(async tx => {
      await lockEmail(tx, email)
      const where = { email_purpose: { email, purpose } }
      const row = await tx.customerChallenge.findUnique({ where })
      if (!row || row.expiresAt <= new Date() || row.attempts >= 5) return null
      if (requestId && requestId !== row.payload?.requestId) return null
      if (!timingSafeEqual(Buffer.from(digest(email, purpose, code), 'hex'), Buffer.from(row.digest, 'hex'))) {
        await tx.customerChallenge.update({ where, data: { attempts: { increment: 1 } } })
        return null
      }
      await tx.customerChallenge.delete({ where })
      return action(tx, row.payload)
    })
    if (!result) throw invalidCode()
    return result
  }

  async function session(tx, account) {
    await tx.customerSession.deleteMany({ where: { accountId: account.id, expiresAt: { lte: new Date() } } })
    const row = await tx.customerSession.create({ data: { accountId: account.id, expiresAt: new Date(Date.now() + lifetime * 1000) } })
    return jwt.sign({}, jwtKey, { issuer, audience, subject: account.id, jwtid: row.id, algorithm: 'HS256', expiresIn: lifetime })
  }

  return {
    async signup({ email, password, confirmPassword: _confirm, ...enquiry }) {
      const requestId = randomUUID()
      await issue(email, 'signup', { ...enquiry, requestId, passwordHash: await bcrypt.hash(password, 12) })
      return { requestId }
    },
    async activate({ email, code, requestId }) {
      return consume(email, 'signup', code, async (tx, payload) => {
        if (!payload || await tx.customerAccount.findUnique({ where: { email } })) return null
        const { name, phone, address, passwordHash, requestId: _requestId, ...enquiry } = payload
        const matches = await tx.customer.findMany({
          where: { email: { equals: email, mode: 'insensitive' } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 1, select: { id: true },
        })
        const savedPhone = phone.replace(/\D/g, '')
        const unclaimed = matches.length ? [] : await tx.$queryRaw`
          SELECT id FROM "Customer"
          WHERE email IS NULL AND regexp_replace(phone, '[^0-9]', '', 'g') = ${savedPhone}
          ORDER BY id LIMIT 2
        `
        const customer = matches[0] ?? (unclaimed.length === 1 ? unclaimed[0]
          : await tx.customer.create({ data: { name, phone, email, address } }))
        const account = await tx.customerAccount.create({ data: { email, passwordHash, name, phone, address, customerId: customer.id } })
        const lead = await createEnquiry(tx, account, { ...enquiry, address })
        return { token: await session(tx, account), lead }
      }, requestId)
    },
    requestLogin: ({ email }) => issue(email, 'login'),
    resendSignup: ({ email, requestId }) => issue(email, 'signup', undefined, requestId),
    requestReset: ({ email }) => issue(email, 'reset'),
    async login({ email, password }) {
      const account = await db.customerAccount.findUnique({ where: { email } })
      if (!await bcrypt.compare(password, account?.passwordHash ?? await dummyHash) || !account) throw unauthenticated()
      return db.$transaction(async tx => {
        await lockEmail(tx, email)
        const current = await tx.customerAccount.findUnique({ where: { email } })
        if (current?.passwordHash !== account.passwordHash) throw unauthenticated()
        return session(tx, current)
      })
    },
    async loginCode({ email, code }) {
      return consume(email, 'login', code, async tx => {
        const account = await tx.customerAccount.findUnique({ where: { email } })
        return account ? session(tx, account) : null
      })
    },
    async reset({ email, code, password }) {
      const passwordHash = await bcrypt.hash(password, 12)
      return consume(email, 'reset', code, async tx => {
        const account = await tx.customerAccount.findUnique({ where: { email } })
        if (!account) return null
        await tx.customerAccount.update({ where: { email }, data: { passwordHash } })
        await tx.customerSession.deleteMany({ where: { accountId: account.id } })
        await tx.customerChallenge.deleteMany({ where: { email, purpose: 'login' } })
        return true
      })
    },
    async verify(token) {
      let claims
      try {
        claims = jwt.verify(token, jwtKey, { issuer, audience, algorithms: ['HS256'] })
      } catch {
        throw unauthenticated()
      }
      const row = await db.customerSession.findUnique({
        where: { id: claims.jti },
        include: { account: { select: { ...publicAccount, customerId: true, historicalAccess: true } } },
      })
      if (!row || row.accountId !== claims.sub || row.expiresAt <= new Date()) throw unauthenticated()
      return { ...row.account, sessionId: row.id }
    },
    logout: sessionId => db.customerSession.deleteMany({ where: { id: sessionId } }),
    profile: id => db.customerAccount.findUniqueOrThrow({ where: { id }, select: publicAccount }),
    updateProfile: (id, data) => db.customerAccount.update({ where: { id }, data, select: publicAccount }),
    enquiry: (account, enquiry) => createEnquiry(db, account, enquiry),
    async changePassword(account, { currentPassword, password }) {
      const current = await db.customerAccount.findUniqueOrThrow({ where: { id: account.id } })
      if (!await bcrypt.compare(currentPassword, current.passwordHash)) throw unauthenticated()
      const passwordHash = await bcrypt.hash(password, 12)
      return db.$transaction(async tx => {
        await lockEmail(tx, account.email)
        const changed = await tx.customerAccount.updateMany({ where: { id: account.id, passwordHash: current.passwordHash }, data: { passwordHash } })
        if (!changed.count) throw unauthenticated()
        await tx.customerSession.deleteMany({ where: { accountId: account.id } })
        await tx.customerChallenge.deleteMany({ where: { email: account.email, purpose: { in: ['login', 'reset'] } } })
        return session(tx, account)
      })
    },
  }
}
