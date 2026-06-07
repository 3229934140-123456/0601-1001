import { Router } from 'express'
import {
  getBusinessOverview,
  getDishAnalysis,
  getHotDishesAnalysis,
  getFinancialReconciliation,
  exportReport,
} from '../controllers/analysisController'
import { authMiddleware } from '../middleware/auth'

const router = Router()

router.get('/business', authMiddleware(['MERCHANT', 'ADMIN']), getBusinessOverview)
router.get('/dishes', authMiddleware(['MERCHANT', 'ADMIN']), getDishAnalysis)
router.get('/hot-dishes', authMiddleware(['MERCHANT', 'ADMIN']), getHotDishesAnalysis)
router.get('/financial', authMiddleware(['MERCHANT', 'ADMIN']), getFinancialReconciliation)
router.get('/export', authMiddleware(['MERCHANT', 'ADMIN']), exportReport)

export default router
