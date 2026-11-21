export function catalogController(catalog) {
  const list = method => async (request, response) => {
    response.json({ success: true, ...await catalog[method](request.validated.query) })
  }
  return {
    products: list('products'),
    packages: list('packages'),
    async packageDetail(request, response) {
      response.json({ success: true, data: await catalog.packageDetail(request.validated.params.id) })
    },
    async createProduct(request, response) {
      response.status(201).json({ success: true, data: await catalog.createProduct(request.validated.body) })
    },
    async updateProduct(request, response) {
      response.json({ success: true, data: await catalog.updateProduct(request.validated.params.id, request.validated.body) })
    },
    async createPackage(request, response) {
      response.status(201).json({ success: true, data: await catalog.createPackage(request.validated.body) })
    },
    async updatePackage(request, response) {
      response.json({ success: true, data: await catalog.updatePackage(request.validated.params.id, request.validated.body) })
    },
  }
}
