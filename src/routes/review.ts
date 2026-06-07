import { Router } from 'express'
import {
  createReview,
  getStoreReviews,
  getMyReviews,
  getReviewDetail,
  appealReview,
  replyAppeal,
  getHotDishes,
} from '../controllers/reviewController'
import { authMiddleware } from '../middleware/auth'

const router = Router()

router.post('/', authMiddleware(['CUSTOMER']), createReview)
router.get('/my', authMiddleware(), getMyReviews)
router.get('/store/:storeId', getStoreReviews)
router.get('/store/:storeId/hot-dishes', getHotDishes)
router.get('/:id', getReviewDetail)
router.post('/:id/appeal', authMiddleware(['MERCHANT', 'ADMIN']), appealReview)
router.put('/:id/appeal-reply', authMiddleware(['ADMIN']), replyAppeal)

export default router
