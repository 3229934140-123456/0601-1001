import { Router } from 'express'
import {
  takeQueueNumber,
  getMyQueues,
  getQueueDetail,
  cancelQueue,
  getStoreQueues,
  callQueueNumber,
  serveQueueNumber,
} from '../controllers/queueController'
import { authMiddleware } from '../middleware/auth'

const router = Router()

router.post('/', authMiddleware(['CUSTOMER']), takeQueueNumber)
router.get('/my', authMiddleware(['CUSTOMER']), getMyQueues)
router.get('/:id', authMiddleware(), getQueueDetail)
router.post('/:id/cancel', authMiddleware(['CUSTOMER']), cancelQueue)
router.get('/store/:storeId', authMiddleware(['MERCHANT', 'ADMIN']), getStoreQueues)
router.post('/:id/call', authMiddleware(['MERCHANT', 'ADMIN']), callQueueNumber)
router.post('/:id/serve', authMiddleware(['MERCHANT', 'ADMIN']), serveQueueNumber)

export default router
