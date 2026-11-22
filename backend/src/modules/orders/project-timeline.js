export function projectTimeline(lead, survey, quotation, order, dispatch, installation) {
  return [
    ['ENQUIRY_RECEIVED', lead.createdAt],
    ['SITE_SURVEYED', survey?.visitedAt],
    ['SURVEY_APPROVED', survey?.approvedAt],
    ['QUOTATION_ISSUED', quotation?.sentAt],
    ['QUOTATION_ACCEPTED', quotation?.acceptedAt],
    ['ORDER_CONFIRMED', order?.confirmedAt],
    ['DISPATCHED', dispatch?.dispatchedAt],
    ['DELIVERED', dispatch?.deliveredAt],
    ['INSTALLATION_IN_PROGRESS', installation?.startedAt],
    ['INSTALLATION_COMPLETED', installation?.signedAt],
  ].map(([stage, at]) => ({ stage, at: at ?? null }))
}
