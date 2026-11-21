import { Prisma } from '@prisma/client'

export function apportion(amount, weights, quantities) {
  const total = weights.reduce((sum, weight) => sum.plus(weight), new Prisma.Decimal(0))
  const shares = total.isZero() ? quantities : weights
  const basis = total.isZero() ? quantities.reduce((sum, quantity) => sum + quantity, 0) : total
  let cumulative = new Prisma.Decimal(0)
  let billed = new Prisma.Decimal(0)
  return shares.map(weight => {
    cumulative = cumulative.plus(weight)
    const next = amount.mul(cumulative).div(basis).toDecimalPlaces(2)
    const share = next.minus(billed)
    billed = next
    return share
  })
}

export function pricingBreakdown(lines) {
  if (lines.some(line => line.taxAmount != null)) {
    return {
      packageName: lines.find(line => line.taxAmount == null)?.descriptionSnapshot ?? null,
      lines: lines.filter(line => line.taxAmount != null).map(line => ({
        description: line.descriptionSnapshot, quantity: line.quantity, amount: line.lineTotal,
        taxRate: line.taxRateSnapshot, taxAmount: line.taxAmount,
      })),
    }
  }
  // The core package is snapshotted before any optional installation charge.
  const packageLine = lines.find(line => line.lineKind === 'SERVICE')
  const bundled = lines.filter(line => line.lineKind === 'MATERIAL' && line.lineTotal.isZero())
  const allocated = new Map()
  if (packageLine && bundled.length) {
    const amounts = apportion(packageLine.lineTotal,
      bundled.map(line => line.unitCostSnapshot.mul(line.quantity)), bundled.map(line => line.quantity))
    bundled.forEach((line, index) => allocated.set(line.id, amounts[index]))
  }
  return {
    packageName: allocated.size ? packageLine.descriptionSnapshot : null,
    lines: lines.filter(line => !allocated.size || line !== packageLine).map(line => ({
      description: line.descriptionSnapshot, quantity: line.quantity,
      amount: allocated.get(line.id) ?? line.lineTotal,
    })),
  }
}
