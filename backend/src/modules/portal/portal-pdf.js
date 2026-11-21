import PDFDocument from 'pdfkit'

const money = amount => 'INR ' + Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const date = time => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(time))

function document(title, reference, content) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', margin: 48 })
    const chunks = []
    pdf.on('data', chunk => chunks.push(chunk))
    pdf.on('end', () => resolve(Buffer.concat(chunks)))
    pdf.on('error', reject)
    pdf.fillColor('#166534').fontSize(26).text('SuryaDesk')
    pdf.moveDown(0.5).fillColor('#111827').fontSize(20).text(title)
    pdf.fontSize(11).fillColor('#475569').text(reference).moveDown()
    pdf.fillColor('#111827')
    content(pdf)
    pdf.end()
  })
}

export function quotationPdf(row) {
  return document('Solar quotation', row.quoteNumber, pdf => {
    pdf.fontSize(14).text(row.package.name).moveDown(0.5)
    if (row.package.description) pdf.fontSize(11).text(row.package.description)
    if (row.validUntil) pdf.fontSize(11).text('Valid until ' + date(row.validUntil))
    pdf.moveDown()
    for (const line of row.pricing.lines) {
      pdf.fontSize(11).text(line.description + ' x ' + line.quantity + '  |  ' + money(line.amount))
    }
    pdf.moveDown().text('Subtotal ' + money(row.subtotal)).text('Tax ' + money(row.tax))
    pdf.fontSize(14).text('Total ' + money(row.total))
  })
}

export function receiptPdf(row) {
  return document('Payment receipt', row.reference || row.order.orderNumber, pdf => {
    pdf.text('Order ' + row.order.orderNumber).text('Received ' + date(row.receivedAt))
    pdf.text('Payment method ' + row.method.replaceAll('_', ' ')).moveDown()
    pdf.fontSize(14).text('Amount received ' + money(row.amount))
  })
}

export function warrantyPdf(row) {
  const warranty = row.warrantyByAsset
  return document('Equipment warranty record', row.serialNumber, pdf => {
    pdf.text(row.product.name).text('Status ' + warranty.status).text('Term ' + warranty.months + ' months').moveDown()
    pdf.text('Coverage starts ' + date(warranty.startAt)).text('Coverage ends ' + date(warranty.endAt))
  })
}
