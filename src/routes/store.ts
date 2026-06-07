import { Router } from 'express'
import {
  getStores,
  getStoreDetail,
  getStoreAnnouncements,
  createAnnouncement,
} from '../controllers/storeController'
import { authMiddleware } from '../middleware/auth'

const router = Router()

router.get('/', getStores)
router.get('/:id', getStoreDetail)
router.get('/:id/announcements', getStoreAnnouncements)
router.post('/:id/announcements', authMiddleware(['MERCHANT', 'ADMIN']), createAnnouncement)

export default router
