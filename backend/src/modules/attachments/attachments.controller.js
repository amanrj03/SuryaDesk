import { ApiError } from '../../utils/ApiError.js'

export function attachmentsController(attachments) {
  return {
    async upload(request, response) {
      const data = await attachments.upload(request.validated.body, request.file, request.user)
      response.status(201).json({ success: true, data })
    },
    async download(request, response, next) {
      const file = await attachments.open(request.validated.params.id, request.user)
      response.type(file.mimeType).set('Cache-Control', 'private, no-store')
      if (file.mimeType === 'application/pdf') response.set('Content-Disposition', 'attachment')
      response.sendFile(file.path, error => {
        if (error) next(error.status === 404 ? new ApiError(404, 'NOT_FOUND', 'Attachment file not found.') : error)
      })
    },
  }
}
