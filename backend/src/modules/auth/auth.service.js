import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'node:crypto'
import { roleCapabilities } from '../../config/permissions.js'
import { ApiError } from '../../utils/ApiError.js'

const lifetime = 60 * 60
const issuer = 'suryadesk'
const audience = 'suryadesk-staff'
const dummyHash = bcrypt.hash(randomUUID(), 12)
const invalidCredentials = () => new ApiError(401, 'UNAUTHENTICATED', 'Invalid credentials or expired session.')

function publicUser({ id, name, email, role }) {
  return { id, name, email, role, capabilities: roleCapabilities[role] ?? [] }
}

export function authService(db, secret) {
  return {
    async login({ email, password }) {
      const user = await db.user.findUnique({ where: { email } })
      const matches = await bcrypt.compare(password, user?.passwordHash ?? await dummyHash)
      if (!matches || !user?.isActive) throw invalidCredentials()

      const expiresAt = new Date(Date.now() + lifetime * 1000)
      const session = await db.staffSession.create({ data: { userId: user.id, expiresAt } })
      const accessToken = jwt.sign({}, secret, {
        algorithm: 'HS256', issuer, audience, subject: user.id, jwtid: session.id, expiresIn: lifetime,
      })
      return { user: publicUser(user), authenticated: true, accessToken }
    },

    async verify(token) {
      let claims
      try {
        claims = jwt.verify(token, secret, { algorithms: ['HS256'], issuer, audience })
      } catch {
        throw invalidCredentials()
      }
      if (typeof claims.jti !== 'string' || typeof claims.sub !== 'string') throw invalidCredentials()
      const session = await db.staffSession.findUnique({ where: { id: claims.jti }, include: { user: true } })
      if (!session || session.userId !== claims.sub || session.expiresAt <= new Date() || !session.user.isActive) {
        throw invalidCredentials()
      }
      return { ...publicUser(session.user), sessionId: session.id }
    },

    async logout(sessionId) {
      await db.staffSession.deleteMany({ where: { id: sessionId } })
    },
  }
}
