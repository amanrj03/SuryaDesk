import { Router } from 'express'
import multer from 'multer'
import { authenticate, authorize } from '../../middleware/authenticate.js'
import { validate } from '../../middleware/validate.js'
import { ApiError } from '../../utils/ApiError.js'
import { attachmentsController } from './attachments.controller.js'
import * as schema from './attachments.schema.js'
import { attachmentsService } from './attachments.service.js'

const upload = multer({ limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 2, fieldSize: 120 } }).single('file')
function parse(request, response, next) {
  upload(request, response, error => {
    if (!error) return next()
    if (error.code === 'LIMIT_FILE_SIZE') return next(new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Upload an image of 8 MB or less.'))
    next(new ApiError(400, 'VALIDATION_ERROR', 'Use one image and one installation owner.'))
  })
}

export function attachmentsRoutes(db, auth) {
  const router = Router()
  const staff = authenticate(auth)
  const controller = attachmentsController(attachmentsService(db))
  router.post('/attachments', staff, authorize('attachments:upload'), parse,
    validate({ body: schema.owner }), controller.upload)
  router.get('/attachments/:id', staff, validate({ params: schema.params }), controller.download)
  return router
}
