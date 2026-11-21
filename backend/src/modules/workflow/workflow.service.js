import { ApiError } from '../../utils/ApiError.js'
import { installationScope } from '../installations/installations.service.js'
import { leadScope } from '../leads/leads.service.js'
import { surveyScope } from '../surveys/surveys.service.js'

const quoteKeys = { id: true, leadId: true, surveyId: true }
const orderKeys = { quotation: { select: quoteKeys } }
const record = { id: true, status: true }
const byDate = [{ createdAt: 'asc' }, { id: 'asc' }]

export const workflowSections = {
  leads: { model: 'lead', capability: 'leads:read', scope: leadScope, select: { id: true }, branch: row => ({ leadId: row.id }) },
  surveys: { model: 'siteSurvey', capability: 'surveys:read', scope: surveyScope, select: { id: true, leadId: true },
    branch: row => ({ leadId: row.leadId, surveyId: row.id }) },
  quotes: { model: 'quotation', capability: 'quotes:read', select: quoteKeys, branch: quotationBranch },
  orders: { model: 'order', capability: 'orders:read', select: orderKeys, branch: row => quotationBranch(row.quotation) },
  dispatches: { model: 'dispatch', capability: 'dispatch:prepare', select: { order: { select: orderKeys } },
    branch: row => quotationBranch(row.order.quotation) },
  installations: { model: 'installation', capability: 'installations:read', scope: installationScope, select: { order: { select: orderKeys } },
    branch: row => quotationBranch(row.order.quotation) },
  invoices: {
    model: 'invoice', capability: 'invoices:read',
    select: { order: { select: orderKeys }, ticket: { select: { order: { select: orderKeys } } } },
    branch: row => {
      const order = row.order ?? row.ticket?.order
      return order && quotationBranch(order.quotation)
    },
  },
}

function quotationBranch(quote) {
  return { leadId: quote.leadId, surveyId: quote.surveyId, quoteId: quote.id }
}

export async function relatedWorkflowRecords(db, user, section, id) {
  const canRead = target => user.capabilities.includes(workflowSections[target].capability)
  if (!canRead(section)) throw new ApiError(403, 'FORBIDDEN', 'You do not have permission for this action.')
  return db.$transaction(async tx => {
    const source = workflowSections[section]
    const current = await tx[source.model].findFirst({
      where: { id, ...source.scope?.(user) }, select: source.select,
    })
    if (!current) throw new ApiError(404, 'NOT_FOUND', 'Record not found.')
    const branch = source.branch(current)
    if (!branch) return []
    const { leadId, surveyId, quoteId } = branch
    const lead = await tx.lead.findUniqueOrThrow({
      where: { id: leadId },
      select: {
        ...record, leadNumber: true, assignedToId: true,
        siteSurveysByLead: {
          where: { id: surveyId, ...surveyScope(user) }, orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
          select: { ...record, scheduledAt: true },
        },
        quotationsByLead: {
          where: { id: quoteId, surveyId }, orderBy: byDate,
          select: {
            ...record, quoteNumber: true,
            orderByQuotation: { select: {
              ...record, orderNumber: true,
              dispatchesByOrder: { orderBy: byDate, select: { ...record, dispatchNumber: true } },
              installationByOrder: { select: { ...record, scheduledAt: true, installationAssignmentsByInstallation: {
                where: { technicianId: user.id }, select: { technicianId: true },
              } } },
              invoiceByOrder: { select: { ...record, invoiceNumber: true } },
            } },
          },
        },
      },
    })
    const links = []
    function add(target, row, reference = null, date = null) {
      if (row && canRead(target) && (target !== section || row.id !== id)) {
        links.push({ section: target, id: row.id, reference, status: row.status, date })
      }
    }
    const leadAccess = leadScope(user)
    if (!leadAccess.assignedToId || leadAccess.assignedToId === lead.assignedToId) add('leads', lead, lead.leadNumber)
    for (const survey of lead.siteSurveysByLead) add('surveys', survey, null, survey.scheduledAt)
    for (const quote of lead.quotationsByLead) {
      add('quotes', quote, quote.quoteNumber)
      const order = quote.orderByQuotation
      if (!order) continue
      add('orders', order, order.orderNumber)
      for (const dispatch of order.dispatchesByOrder) add('dispatches', dispatch, dispatch.dispatchNumber)
      const job = order.installationByOrder
      if (job && (!installationScope(user).installationAssignmentsByInstallation || job.installationAssignmentsByInstallation.length)) {
        add('installations', job, order.orderNumber, job.scheduledAt)
      }
      add('invoices', order.invoiceByOrder, order.invoiceByOrder?.invoiceNumber)
    }
    return links
  }, { isolationLevel: 'RepeatableRead' })
}
