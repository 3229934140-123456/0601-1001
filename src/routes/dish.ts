import { Router } from 'express'
import {
  getDishesByStore,
  getDishDetail,
  getHotDishes,
  createDish,
  updateDish,
  deleteDish,
  decreaseStock,
} from '../controllers/dishController'
import { authMiddleware } from '../middleware/auth'

const router = Router()

router.get('/store/:storeId', getDishesByStore)
router.get('/hot/store/:storeId', getHotDishes)
router.get('/:id', getDishDetail)

router.post('/', authMiddleware(['MERCHANT', 'ADMIN']), createDish)
router.put('/:id', authMiddleware(['MERCHANT', 'ADMIN']), updateDish)
router.delete('/:id', authMiddleware(['MERCHANT', 'ADMIN']), deleteDish)

router.post('/stock/decrease', decreaseStock)

export default router
