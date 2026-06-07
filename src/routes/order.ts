import { Router } from 'express'
import {
  createOrder,
  getOrders,
  getOrderDetail,
  cancelOrder,
  payOrder,
  applyRefund,
  getStoreOrders,
  updateOrderStatus,
  remindOrder,
  assignRider,
} from '../controllers/orderController'
import { authMiddleware } from '../middleware/auth'

const router = Router()

router.get('/', authMiddleware(['CUSTOMER']), getOrders)
router.get('/store/:storeId', authMiddleware(['MERCHANT', 'ADMIN']), getStoreOrders)
router.get('/:id', authMiddleware(['CUSTOMER', 'MERCHANT', 'ADMIN']), getOrderDetail)
router.post('/', authMiddleware(['CUSTOMER']), createOrder)
router.post('/:id/cancel', authMiddleware(['CUSTOMER']), cancelOrder)
router.post('/:id/pay', authMiddleware(['CUSTOMER']), payOrder)
router.post('/:id/refund', authMiddleware(['CUSTOMER']), applyRefund)
router.put('/:id/status', authMiddleware(['MERCHANT', 'ADMIN']), updateOrderStatus)
router.post('/:id/remind', authMiddleware(['MERCHANT', 'ADMIN']), remindOrder)
router.post('/:id/assign-rider', authMiddleware(['MERCHANT', 'ADMIN']), assignRider)

export default router
