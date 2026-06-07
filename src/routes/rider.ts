import { Router } from 'express'
import {
  getRiders,
  getRiderDetail,
  updateRiderStatus,
  updateRiderLocation,
  assignRiderToOrder,
  createRider,
} from '../controllers/riderController'
import { authMiddleware } from '../middleware/auth'

const router = Router()

router.get('/', getRiders)
router.get('/:id', getRiderDetail)
router.put('/:id/status', authMiddleware(), updateRiderStatus)
router.put('/:id/location', authMiddleware(), updateRiderLocation)
router.post('/assign', authMiddleware(['ADMIN']), assignRiderToOrder)
router.post('/', authMiddleware(['ADMIN']), createRider)

export default router
