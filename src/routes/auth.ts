import { Router } from 'express'
import { register, login, merchantLogin, getCurrentUser } from '../controllers/authController'
import { authMiddleware } from '../middleware/auth'

const router = Router()

router.post('/register', register)
router.post('/login', login)
router.post('/merchant-login', merchantLogin)
router.get('/me', authMiddleware(), getCurrentUser)

export default router
