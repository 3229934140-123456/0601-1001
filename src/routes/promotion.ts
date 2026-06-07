import { Router } from 'express'
import {
  getPromotionsByStore,
  getPromotionsManageList,
  createPromotion,
  updatePromotion,
  deletePromotion,
  togglePromotion,
} from '../controllers/promotionController'
import { authMiddleware } from '../middleware/auth'

const router = Router()

router.get('/manage', authMiddleware(['MERCHANT', 'ADMIN']), getPromotionsManageList)
router.get('/store/:storeId', getPromotionsByStore)

router.post('/', authMiddleware(['MERCHANT', 'ADMIN']), createPromotion)
router.put('/:id', authMiddleware(['MERCHANT', 'ADMIN']), updatePromotion)
router.delete('/:id', authMiddleware(['MERCHANT', 'ADMIN']), deletePromotion)
router.post('/:id/toggle', authMiddleware(['MERCHANT', 'ADMIN']), togglePromotion)

export default router
