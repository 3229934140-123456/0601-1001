import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import storeRoutes from './routes/store'
import dishRoutes from './routes/dish'
import cartRoutes from './routes/cart'
import orderRoutes from './routes/order'
import queueRoutes from './routes/queue'
import reservationRoutes from './routes/reservation'
import riderRoutes from './routes/rider'
import reviewRoutes from './routes/review'
import authRoutes from './routes/auth'
import { errorResponse } from './utils'

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.get('/', (req, res) => {
  res.json({
    code: 0,
    message: '餐饮美食平台后端服务运行中',
    data: {
      version: '1.0.0',
      endpoints: [
        '/api/stores - 门店相关接口',
        '/api/dishes - 菜品相关接口',
        '/api/cart - 购物车相关接口',
        '/api/orders - 订单相关接口',
        '/api/queue - 排队取号相关接口',
        '/api/reservations - 预约订座相关接口',
        '/api/riders - 骑手相关接口',
        '/api/reviews - 评价相关接口',
        '/api/auth - 认证相关接口',
      ]
    }
  })
})

app.use('/api/stores', storeRoutes)
app.use('/api/dishes', dishRoutes)
app.use('/api/cart', cartRoutes)
app.use('/api/orders', orderRoutes)
app.use('/api/queue', queueRoutes)
app.use('/api/reservations', reservationRoutes)
app.use('/api/riders', riderRoutes)
app.use('/api/reviews', reviewRoutes)
app.use('/api/auth', authRoutes)

app.use((req, res) => {
  res.status(404).json(errorResponse('接口不存在', 404))
})

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack)
  res.status(500).json(errorResponse('服务器内部错误', 500))
})

app.listen(PORT, () => {
  console.log(`🚀 餐饮美食平台后端服务已启动: http://localhost:${PORT}`)
})

export default app
