import PDFDocument from 'pdfkit'

const margin = 36
const ink = '#1f2430'
const rule = '#a6aab2'
const currency = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const date = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' })
const reference = value => value?.replace(/^DEMO-/, '')
const small = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

function words(number) {
  if (number < 20) return small[number]
  if (number < 100) return tens[Math.floor(number / 10)] + (number % 10 ? '-' + words(number % 10) : '')
  const [scale, label] = [[10000000, 'crore'], [100000, 'lakh'], [1000, 'thousand'], [100, 'hundred']]
    .find(([size]) => number >= size)
  return words(Math.floor(number / scale)) + ' ' + label + (number % scale ? ' ' + words(number % scale) : '')
}

function amountInWords(value) {
  const paise = Math.round(Number(value) * 100)
  return 'Rupees ' + words(Math.floor(paise / 100)) + (paise % 100 ? ' and ' + words(paise % 100) + ' paise' : '') + ' only'
}

export function invoicePdf(invoice, seller) {
  const pdf = new PDFDocument({ size: 'A4', margin, bufferPages: true, info: {
    Title: 'Invoice ' + reference(invoice.invoiceNumber), Author: seller.name,
  } })
  const output = new Promise((resolve, reject) => {
    const chunks = []
    pdf.on('data', chunk => chunks.push(chunk))
    pdf.on('error', reject)
    pdf.on('end', () => resolve(Buffer.concat(chunks)))
  })
  const width = pdf.page.width - 2 * margin
  const bottom = pdf.page.height - margin - 25
  const pricing = invoice.pricing
  const invoiceLines = pricing
    ? pricing.lines.map(line => ({ description: line.description, quantity: line.quantity, lineTotal: line.amount }))
    : invoice.invoiceLinesByInvoice
  const detailedTax = invoice.invoiceLinesByInvoice.some(line => line.taxRateSnapshot != null)
  const columns = detailedTax ? [26, width - 26 - 32 - 71 - 44 - 74 - 82, 32, 71, 44, 74, 82]
    : pricing ? [26, width - 26 - 44 - 98, 44, 98] : [26, width - 26 - 44 - 88 - 98, 44, 88, 98]
  const draft = invoice.status === 'DRAFT'
  const title = draft ? 'Draft invoice' : invoice.status === 'VOID' ? 'Void invoice' : 'Invoice'

  function text(value, x, y, options = {}) {
    const { bold = false, size = 10, ...layout } = options
    pdf.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(ink).text(value, x, y, layout)
    return pdf.y
  }

  function block(heading, values, x, y, align) {
    const layout = { width: (width - 28) / 2, align }
    y = text(heading, x, y, { ...layout, bold: true })
    for (const value of values.filter(Boolean)) y = text(value, x, y + 3, layout)
    return y
  }

  function tableRow(values, y, height, shaded = false) {
    if (shaded) pdf.rect(margin, y, width, height).fill('#e9ebee')
    let x = margin
    values.forEach((value, index) => {
      const column = columns[index]
      pdf.rect(x, y, column, height).lineWidth(0.5).stroke(rule)
      text(value, x + 5, y + 6, {
        width: column - 10, align: index >= 2 ? 'right' : 'left', size: 9, bold: shaded,
      })
      x += column
    })
  }

  const header = y => {
    tableRow(detailedTax
      ? ['No.', 'Description', 'Qty', 'Net (INR)', 'Rate %', 'Tax (INR)', 'Total (INR)']
      : pricing ? ['No.', 'Description', 'Qty', 'Amount (INR)']
        : ['No.', 'Description', 'Qty', 'Unit price (INR)', 'Amount (INR)'], y, 24, true)
    return y + 24
  }

  function continuation() {
    pdf.addPage()
    text(title + '  |  ' + reference(invoice.invoiceNumber), margin, margin, { bold: true })
    return header(margin + 26)
  }

  text('SuryaDesk', margin, margin, { size: 28, bold: true, width: width / 2 })
  text(title, margin + width / 2, margin, { size: 20, bold: true, width: width / 2, align: 'right' })
  text(draft ? 'Preview only' : 'Customer copy', margin + width / 2, margin + 27, { width: width / 2, align: 'right' })
  pdf.moveTo(margin, 84).lineTo(margin + width, 84).lineWidth(1).stroke(ink)

  const right = margin + (width + 28) / 2
  const sellerEnd = block('Sold by', [
    seller.name, seller.address, seller.pan && 'PAN: ' + seller.pan, seller.gstin && 'GSTIN: ' + seller.gstin,
  ], margin, 105, 'left')
  const customerEnd = block('Customer address', [invoice.customer.name, invoice.customer.address], right, 105, 'right')
  const details = Math.max(sellerEnd, customerEnd) + 22
  const orderEnd = block(invoice.order ? 'Order details' : 'Service details', [
    invoice.order ? 'Order number: ' + reference(invoice.order.orderNumber)
      : invoice.ticket && 'Ticket number: ' + reference(invoice.ticket.ticketNumber),
    invoice.order?.confirmedAt && 'Order date: ' + date.format(invoice.order.confirmedAt),
  ], margin, details, 'left')
  const invoiceEnd = block('Invoice details', [
    'Invoice number: ' + reference(invoice.invoiceNumber),
    (draft ? 'Prepared: ' : 'Invoice date: ') + date.format(invoice.issuedAt),
    invoice.status === 'PAID' && invoice.paidAt && 'Paid on: ' + date.format(invoice.paidAt),
    invoice.dueAt && 'Due date: ' + date.format(invoice.dueAt),
  ], right, details, 'right')

  let y = Math.max(orderEnd, invoiceEnd) + 20
  if (pricing) {
    y = text('Package: ' + pricing.packageName, margin, y, { bold: true, width })
    y = text('Product amounts are allocated shares of the original package price.', margin, y + 3, { width }) + 10
  }
  y = header(y)
  for (const [index, line] of invoiceLines.entries()) {
    pdf.font('Helvetica').fontSize(9)
    const description = line.description
    const height = Math.max(26, pdf.heightOfString(description, { width: columns[1] - 10 }) + 12)
    if (y + height > bottom) y = continuation()
    const prices = detailedTax
      ? [currency.format(Number(line.lineTotal)), String(line.taxRateSnapshot), currency.format(Number(line.taxAmount)),
        currency.format(Number(line.lineTotal) + Number(line.taxAmount))]
      : pricing ? [currency.format(Number(line.lineTotal))]
        : [currency.format(Number(line.unitPrice)), currency.format(Number(line.lineTotal))]
    tableRow([String(index + 1), description, String(line.quantity), ...prices], y, height)
    y += height
  }
  if (y + 137 > bottom) y = continuation()
  for (const [label, amount] of [['Subtotal', invoice.subtotal], ['Tax', invoice.tax], ['Total', invoice.total]]) {
    tableRow(['', label, ...Array(columns.length - 3).fill(''), currency.format(Number(amount))], y, 24, label === 'Total')
    y += 24
  }
  y = text('Amount in words', margin, y + 16, { bold: true })
  text(amountInWords(invoice.total), margin, y + 4, { width })
  const pages = pdf.bufferedPageRange().count
  for (let page = 0; page < pages; page++) {
    pdf.switchToPage(page)
    text('Page ' + (page + 1) + ' of ' + pages, margin, bottom + 12, { size: 8, width, align: 'right' })
  }
  pdf.end()
  return output
}
