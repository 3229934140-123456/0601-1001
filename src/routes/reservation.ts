import { Router } from 'express'
import {
  createReservation,
  getMyReservations,
  getReservationDetail,
  cancelReservation,
  getStoreReservations,
  confirmReservation,
  getStoreTables,
  createTable,
} from '../controllers/reservationController'
import { authMiddleware } from '../middleware/auth'

const router = Router()

router.post('/', authMiddleware(['CUSTOMER']), createReservation)
router.get('/my', authMiddleware(['CUSTOMER']), getMyReservations)
router.get('/:id', authMiddleware(), getReservationDetail)
router.post('/:id/cancel', authMiddleware(['CUSTOMER']), cancelReservation)
router.get('/store/:storeId', authMiddleware(['MERCHANT', 'ADMIN']), getStoreReservations)
router.put('/:id/confirm', authMiddleware(['MERCHANT', 'ADMIN']), confirmReservation)
router.get('/store/:storeId/tables', authMiddleware(['MERCHANT', 'ADMIN']), getStoreTables)
router.post('/store/:storeId/tables', authMiddleware(['MERCHANT', 'ADMIN']), createTable)

export default router
