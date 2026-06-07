import { Router } from 'express'
import {
  getStores,
  getStoreDetail,
  getStoreAnnouncements,
  createAnnouncement,
  getMerchantOverview,
  getAdminOverview,
} from '../controllers/storeController'
import { authMiddleware } from '../middleware/auth'

const router = Router()

router.get('/me/overview', authMiddleware(['MERCHANT']), getMerchantOverview)
router.get('/admin/overview', authMiddleware(['ADMIN']), getAdminOverview)
router.get('/', getStores)
router.get('/:id', getStoreDetail)
router.get('/:id/announcements', getStoreAnnouncements)
router.post('/:id/announcements', authMiddleware(['MERCHANT', 'ADMIN']), createAnnouncement)

export default router
