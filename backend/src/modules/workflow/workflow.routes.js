import { Router } from 'express'
import { z } from 'zod'
import { authenticate } from '../../middleware/authenticate.js'
import { validate } from '../../middleware/validate.js'
import { relatedWorkflowRecords, workflowSections } from './workflow.service.js'

const params = z.object({ section: z.enum(Object.keys(workflowSections)), id: z.string().trim().min(1).max(100) })

export function workflowRoutes(db, auth) {
  const router = Router()
  router.get('/workflow/:section/:id/related', authenticate(auth), validate({ params }), async (request, response) => {
    const { section, id } = request.validated.params
    response.set('Cache-Control', 'private, no-store').json({
      success: true, data: await relatedWorkflowRecords(db, request.user, section, id),
    })
  })
  return router
}
