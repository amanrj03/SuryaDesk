import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { ApiError } from '../../utils/ApiError.js'
import { apportion, pricingBreakdown } from '../../lib/line-pricing.js'
import { createAcceptedOrder } from '../orders/orders.service.js'

const missing = entity => new ApiError(404, 'NOT_FOUND', entity + ' not found.')
const invalid = message => new ApiError(409, 'INVALID_TRANSITION', message)
const context = {
  lead: { include: { customer: true } },
  orderByQuotation: { select: { id: true, orderNumber: true } },
}
const include = {
  ...context,
  quotationLinesByQuotation: { orderBy: { id: 'asc' } },
  survey: true,
}

function priceLine(title, price) {
  return {
    descriptionSnapshot: title, quantity: 1, unitPriceSnapshot: price,
    unitCostSnapshot: 0, lineTotal: price, lineKind: 'SERVICE',
  }
}

function lineTax(name, amount, rate) {
  if (rate == null) {
    throw new ApiError(409, 'TAX_RATE_REQUIRED', 'Set a catalog tax rate for ' + name + ' before creating the quotation.')
  }
  return { taxRateSnapshot: rate, taxAmount: amount.mul(rate).div(100).toDecimalPlaces(2) }
}

function snapshotPackage(pack) {
  const components = pack.packageComponentsByPackage
  if (!components.length) {
    return [{ ...priceLine(pack.name, pack.basePrice), ...lineTax(pack.name, pack.basePrice, pack.taxRate) }]
  }
  const amounts = apportion(pack.basePrice,
    components.map(({ product, quantity }) => product.salePrice.mul(quantity)),
    components.map(({ quantity }) => quantity))
  return [
    priceLine(pack.name, 0),
    ...components.map(({ product, quantity }, index) => ({
      productId: product.id, descriptionSnapshot: product.name, quantity,
      unitPriceSnapshot: amounts[index].div(quantity).toDecimalPlaces(2), unitCostSnapshot: product.cost,
      lineTotal: amounts[index], lineKind: 'MATERIAL', ...lineTax(product.name, amounts[index], product.taxRate),
    })),
  ]
}

async function audit(tx, id, action, actorId, summary = {}) {
  await tx.auditLog.create({ data: { actorId, entityType: 'Quotation', entityId: id, action, summary } })
}

export function quotesService(db) {
  return {
    async create({ leadId, surveyId, packageId, includeInstallation, notes, validUntil }, user) {
      return db.$transaction(async tx => {
        const survey = await tx.siteSurvey.findUnique({ where: { id: surveyId }, include: { lead: true } })
        if (!survey || survey.leadId !== leadId || survey.status !== 'APPROVED' ||
          !['SURVEY_APPROVED', 'QUOTED'].includes(survey.lead.status)) {
          throw new ApiError(409, 'SURVEY_NOT_APPROVED', 'Choose an approved survey for this enquiry.')
        }
        if (validUntil && validUntil <= new Date()) throw invalid('Choose a future quotation expiry.')
        const pack = await tx.solarPackage.findUnique({
          where: { id: packageId }, include: { packageComponentsByPackage: { include: { product: true }, orderBy: { productId: 'asc' } } },
        })
        if (!pack?.isActive) throw missing('Active package')
        if (pack.packageComponentsByPackage.some(({ product }) => !product.isActive)) {
          throw invalid('Update the package to use active products before quoting.')
        }
        const lines = snapshotPackage(pack)
        if (includeInstallation && pack.type !== 'INSTALLATION') {
          const installation = await tx.solarPackage.findFirst({
            where: { type: 'INSTALLATION', isActive: true, OR: [{ capacityKw: pack.capacityKw }, { capacityKw: null }] },
            orderBy: [{ capacityKw: { sort: 'desc', nulls: 'last' } }, { code: 'asc' }],
            include: { packageComponentsByPackage: { include: { product: true }, orderBy: { productId: 'asc' } } },
          })
          if (!installation) throw missing('Installation package')
          if (installation.packageComponentsByPackage.some(({ product }) => !product.isActive)) {
            throw invalid('Update the installation package to use active products.')
          }
          lines.push(...snapshotPackage(installation))
        }
        const subtotal = lines.reduce((total, line) => total.plus(line.lineTotal), new Prisma.Decimal(0))
        const tax = lines.reduce((total, line) => total.plus(line.taxAmount ?? 0), new Prisma.Decimal(0))
        const quote = await tx.quotation.create({
          data: {
            quoteNumber: 'QUO-' + randomUUID().toUpperCase(), leadId, surveyId, packageId,
            status: 'DRAFT', createdById: user.id, subtotal, tax, total: subtotal.plus(tax), notes, validUntil,
            quotationLinesByQuotation: { createMany: { data: lines } },
          }, include,
        })
        await audit(tx, quote.id, 'CREATED', user.id)
        return quote
      }, { isolationLevel: 'RepeatableRead' })
    },
    async list({ page, limit, q, status }) {
      const search = { contains: q, mode: 'insensitive' }
      const where = { status, ...(q && { OR: [{ quoteNumber: search }, { lead: { customer: { name: search } } }] }) }
      const [data, total] = await db.$transaction([
        db.quotation.findMany({
          where, skip: (page - 1) * limit, take: limit,
          include: context, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
        db.quotation.count({ where }),
      ], { isolationLevel: 'RepeatableRead' })
      return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
    },
    async detail(id) {
      const quote = await db.quotation.findUnique({ where: { id }, include })
      if (!quote) throw missing('Quotation')
      const timeline = await db.auditLog.findMany({
        where: { entityType: 'Quotation', entityId: id }, orderBy: { createdAt: 'asc' },
        select: { action: true, createdAt: true, summary: true },
      })
      return { ...quote, timeline, pricing: pricingBreakdown(quote.quotationLinesByQuotation) }
    },
    async transition(id, status, options, user) {
      return db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Quotation" WHERE id = ${id} FOR UPDATE`
        const quote = await tx.quotation.findUnique({ where: { id }, include: { lead: true } })
        if (!quote) throw missing('Quotation')
        const now = new Date()
        const sending = status === 'SENT'
        const accepting = status === 'ACCEPTED'
        if (accepting && quote.status === 'ACCEPTED') {
          await createAcceptedOrder(tx, id, {}, user)
          return tx.quotation.findUnique({ where: { id }, include })
        }
        const issueTogether = accepting && quote.status === 'DRAFT' && options.issuedAndAccepted === true
        if (issueTogether && !user.capabilities.includes('quotes:send')) {
          throw new ApiError(403, 'FORBIDDEN', 'You do not have permission to issue quotations.')
        }
        const from = sending || issueTogether ? 'DRAFT' : 'SENT'
        if (quote.status !== from) throw invalid('This quotation cannot move to the requested status.')
        const validUntil = options.validUntil ?? quote.validUntil
        if (status !== 'REJECTED' && validUntil && validUntil <= now) throw invalid('This quotation has expired.')
        if (sending || accepting) {
          const leadChanged = await tx.lead.updateMany({
            where: { id: quote.leadId, status: { in: sending || issueTogether ? ['SURVEY_APPROVED', 'QUOTED'] : ['QUOTED'] } },
            data: { status: accepting ? 'WON' : 'QUOTED' },
          })
          if (!leadChanged.count) throw invalid('The lead is no longer open for this quotation.')
        }
        const acceptedAt = options.acceptedAt ?? now
        if (accepting && (acceptedAt > now || (!issueTogether && acceptedAt < quote.sentAt))) {
          throw invalid('Acceptance must be between quotation issue and the current time.')
        }
        const changed = await tx.quotation.updateMany({
          where: { id, status: from },
          data: { status, ...(sending && { sentAt: now, validUntil }), ...(accepting && { acceptedAt }),
            ...(issueTogether && { sentAt: acceptedAt }) },
        })
        if (!changed.count) throw invalid('This quotation changed during the request.')
        if (issueTogether) await audit(tx, id, 'SENT', user.id, { from })
        await audit(tx, id, status, user.id, { from: issueTogether ? 'SENT' : from, ...(options.reason && { reason: options.reason }) })
        if (accepting) await createAcceptedOrder(tx, id, {}, user)
        return tx.quotation.findUnique({ where: { id }, include })
      })
    },
  }
}
