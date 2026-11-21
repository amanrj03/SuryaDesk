export function inventoryController(inventory) {
  const list = method => async (request, response) => {
    response.json({ success: true, ...await inventory[method](request.validated.query) })
  }
  return {
    inventory: list('inventory'),
    assets: list('assets'),
    async receive(request, response) {
      response.status(201).json({ success: true, data: await inventory.receive(request.validated.body, request.user) })
    },
  }
}
