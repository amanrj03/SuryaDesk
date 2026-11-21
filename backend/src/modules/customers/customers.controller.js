import { assertCustomerAccess } from './customers.service.js'

export function customersController(customers) {
  return {
    async list(request, response) {
      assertCustomerAccess(request.user)
      response.json({ success: true, ...await customers.list(request.validated.query) })
    },
    async detail(request, response) {
      assertCustomerAccess(request.user)
      const data = await customers.detail(request.validated.params.id, request.user)
      response.json({ success: true, data })
    },
  }
}
