function csvValue(value) {
  if (value == null) return ''
  let text = value instanceof Date ? value.toISOString() : String(value)
  if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = "'" + text
  return '"' + text.replaceAll('"', '""') + '"'
}

function toCsv(rows) {
  if (!rows.length) return ''
  const columns = Object.keys(rows[0])
  return [columns.map(csvValue).join(','), ...rows.map(row => columns.map(key => csvValue(row[key])).join(','))].join('\r\n') + '\r\n'
}

export function reportsController(reports) {
  return {
    async overview(request, response) {
      response.json({ success: true, data: await reports.overview(request.validated.query) })
    },
    async operations(request, response) {
      response.json({ success: true, data: await reports.operations(request.validated.query) })
    },
    async profitability(request, response) {
      response.json({ success: true, ...await reports.profitability(request.validated.query) })
    },
    async export(request, response) {
      const { query } = request.validated
      const rows = await reports.export(query)
      response.attachment(query.type + '.csv').type('text/csv').send(toCsv(rows))
    },
  }
}
