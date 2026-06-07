import { Router } from 'express'
import {
  getCart,
  addToCart,
  updateCartItemQuantity,
  removeFromCart,
  clearStoreCart,
  calculateCart,
} from '../controllers/cartController'
import { authMiddleware } from '../middleware/auth'

const router = Router()

router.get('/', authMiddleware(['CUSTOMER']), getCart)
router.post('/', authMiddleware(['CUSTOMER']), addToCart)
router.delete('/store/:storeId', authMiddleware(['CUSTOMER']), clearStoreCart)
router.put('/:id', authMiddleware(['CUSTOMER']), updateCartItemQuantity)
router.delete('/:id', authMiddleware(['CUSTOMER']), removeFromCart)
router.post('/calculate', authMiddleware(['CUSTOMER']), calculateCart)

export default router
