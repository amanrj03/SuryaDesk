import { roleCapabilities } from '../../config/permissions.js'
import { ApiError } from '../../utils/ApiError.js'

const missing = entity => new ApiError(404, 'NOT_FOUND', entity + ' not found.')
const transition = message => new ApiError(409, 'INVALID_TRANSITION', message)
const required = ['visitedAt', 'roofDirection', 'tiltDegrees', 'cableDistanceMeters', 'shadowFreeArea', 'gridSuitable', 'findings']
const complete = survey => required.every(key => survey[key] != null)
const include = { lead: { include: { customer: true } } }

function scope(user) {
  const { capabilities } = user
  return capabilities.includes('surveys:record') && !capabilities.includes('surveys:approve')
    ? { surveyorId: user.id } : {}
}

async function updateLead(tx, leadId, current, status, actorId) {
  const changed = await tx.lead.updateMany({ where: { id: leadId, status: current }, data: { status } })
  if (!changed.count) throw transition('The enquiry is no longer at the required stage.')
  await tx.leadActivity.create({ data: { leadId, type: 'STATUS_CHANGE', actorId, notes: current + ' to ' + status } })
}

async function updateSurvey(tx, survey, data) {
  const changed = await tx.siteSurvey.updateMany({
    where: { id: survey.id, updatedAt: survey.updatedAt, status: survey.status }, data,
  })
  if (!changed.count) throw new ApiError(409, 'CONFLICT', 'Another user updated this survey.')
  return tx.siteSurvey.findUnique({ where: { id: survey.id }, include })
}

export function surveysService(db) {
  return {
    async schedule(leadId, data, user) {
      return db.$transaction(async tx => {
        const lead = await tx.lead.findUnique({ where: { id: leadId } })
        if (!lead) throw missing('Lead')
        const surveyor = await tx.user.findUnique({ where: { id: data.surveyorId } })
        if (!surveyor?.isActive || !roleCapabilities[surveyor.role]?.includes('surveys:record')) {
          throw new ApiError(400, 'VALIDATION_ERROR', 'Choose an active surveyor.')
        }
        await updateLead(tx, leadId, 'QUALIFIED', 'SURVEY_SCHEDULED', user.id)
        return tx.siteSurvey.create({ data: { ...data, leadId, status: 'SCHEDULED' }, include })
      })
    },
    async list({ page, limit, status, surveyorId }, user) {
      const where = { AND: [scope(user), { status, surveyorId }] }
      const [data, total] = await db.$transaction([
        db.siteSurvey.findMany({
          where, include, skip: (page - 1) * limit, take: limit,
          orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
        }),
        db.siteSurvey.count({ where }),
      ], { isolationLevel: 'RepeatableRead' })
      return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
    },
    async detail(id, user) {
      const survey = await db.siteSurvey.findFirst({ where: { id, ...scope(user) }, include })
      if (!survey) throw missing('Survey')
      const attachments = await db.attachment.findMany({
        where: { ownerId: id, ownerType: 'SURVEY' },
        select: { id: true, originalName: true, mimeType: true, sizeBytes: true },
      })
      return { ...survey, attachments }
    },
    async record(id, data, user) {
      return db.$transaction(async tx => {
        const survey = await tx.siteSurvey.findFirst({ where: { id, ...scope(user) }, include })
        if (!survey) throw missing('Survey')
        if (!['SCHEDULED', 'IN_PROGRESS'].includes(survey.status) || survey.lead.status !== 'SURVEY_SCHEDULED') {
          throw transition('This survey is no longer open for recording.')
        }
        if (data.status === 'SUBMITTED') {
          if (!complete({ ...survey, ...data })) throw transition('Complete the survey measurements and findings before submitting.')
          await updateLead(tx, survey.leadId, 'SURVEY_SCHEDULED', 'SURVEY_PENDING_APPROVAL', user.id)
        }
        return updateSurvey(tx, survey, data)
      })
    },
    async approve(id, { approved, rejectionReason }, user) {
      return db.$transaction(async tx => {
        const survey = await tx.siteSurvey.findUnique({ where: { id } })
        if (!survey) throw missing('Survey')
        if (survey.status !== 'SUBMITTED' || !complete(survey)) throw transition('Only a complete submitted survey can be reviewed.')
        await updateLead(tx, survey.leadId, 'SURVEY_PENDING_APPROVAL', approved ? 'SURVEY_APPROVED' : 'QUALIFIED', user.id)
        const status = approved ? 'APPROVED' : 'REJECTED'
        const result = await updateSurvey(tx, survey, {
          status, approvedById: approved ? user.id : null, approvedAt: approved ? new Date() : null, rejectionReason,
        })
        await tx.auditLog.create({ data: {
          actorId: user.id, entityType: 'SiteSurvey', entityId: id, action: status, summary: { from: survey.status },
        } })
        return result
      })
    },
  }
}
