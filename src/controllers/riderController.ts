import { Response } from 'express'
import prisma from '../lib/prisma'
import { successResponse, errorResponse, haversineDistance } from '../utils'
import { AuthRequest } from '../middleware/auth'

export async function getRiders(req: AuthRequest, res: Response) {
  try {
    const { status, lat, lon, distance, page = '1', pageSize = '10' } = req.query

    const pageNum = parseInt(page as string)
    const pageSizeNum = parseInt(pageSize as string)
    const skip = (pageNum - 1) * pageSizeNum

    const where: any = {}

    if (status) {
      where.status = status
    }

    const riders = await prisma.rider.findMany({
      where,
      skip,
      take: pageSizeNum,
      orderBy: { createdAt: 'desc' },
    })

    const total = await prisma.rider.count({ where })

    type RiderWithDistance = typeof riders[0] & { distance: number | null }

    let ridersWithDistance: RiderWithDistance[] = riders.map((rider: typeof riders[0]) => ({
      ...rider,
      distance: null as number | null,
    }))

    if (lat && lon) {
      const latNum = parseFloat(lat as string)
      const lonNum = parseFloat(lon as string)

      ridersWithDistance = ridersWithDistance.map((rider: RiderWithDistance) => ({
        ...rider,
        distance: rider.latitude && rider.longitude
          ? haversineDistance(latNum, lonNum, rider.latitude, rider.longitude)
          : null,
      }))

      if (distance) {
        const distanceNum = parseFloat(distance as string)
        ridersWithDistance = ridersWithDistance.filter(
          (rider: RiderWithDistance) => rider.distance !== null && rider.distance <= distanceNum
        )
      }

      ridersWithDistance.sort((a: RiderWithDistance, b: RiderWithDistance) => (a.distance || Infinity) - (b.distance || Infinity))
    }

    res.json(successResponse({
      list: ridersWithDistance,
      total,
      page: pageNum,
      pageSize: pageSizeNum,
    }))
  } catch (error) {
    console.error(error)
    res.status(500).json(errorResponse('获取骑手列表失败', 500))
  }
}

export async function getRiderDetail(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params
    const riderId = parseInt(id)

    if (isNaN(riderId)) {
      return res.status(400).json(errorResponse('无效的骑手ID', 400))
    }

    const rider = await prisma.rider.findUnique({
      where: { id: riderId },
    })

    if (!rider) {
      return res.status(404).json(errorResponse('骑手不存在', 404))
    }

    res.json(successResponse(rider))
  } catch (error) {
    console.error(error)
    res.status(500).json(errorResponse('获取骑手详情失败', 500))
  }
}

export async function updateRiderStatus(req: AuthRequest, res: Response) {
  try {
    const userRole = req.user?.role
    const { id } = req.params
    const riderId = parseInt(id)
    const { status } = req.body

    if (!userRole) {
      return res.status(401).json(errorResponse('未登录', 401))
    }

    if (userRole !== 'ADMIN' && userRole !== 'MERCHANT') {
      return res.status(403).json(errorResponse('无权限操作', 403))
    }

    if (isNaN(riderId)) {
      return res.status(400).json(errorResponse('无效的骑手ID', 400))
    }

    if (!status || !['IDLE', 'DELIVERING', 'OFFLINE'].includes(status)) {
      return res.status(400).json(errorResponse('无效的状态值', 400))
    }

    const rider = await prisma.rider.findUnique({
      where: { id: riderId },
    })

    if (!rider) {
      return res.status(404).json(errorResponse('骑手不存在', 404))
    }

    const updatedRider = await prisma.rider.update({
      where: { id: riderId },
      data: { status },
    })

    res.json(successResponse(updatedRider, '状态更新成功'))
  } catch (error) {
    console.error(error)
    res.status(500).json(errorResponse('更新骑手状态失败', 500))
  }
}

export async function updateRiderLocation(req: AuthRequest, res: Response) {
  try {
    const userRole = req.user?.role
    const { id } = req.params
    const riderId = parseInt(id)
    const { latitude, longitude } = req.body

    if (!userRole) {
      return res.status(401).json(errorResponse('未登录', 401))
    }

    if (userRole !== 'ADMIN' && userRole !== 'MERCHANT') {
      return res.status(403).json(errorResponse('无权限操作', 403))
    }

    if (isNaN(riderId)) {
      return res.status(400).json(errorResponse('无效的骑手ID', 400))
    }

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json(errorResponse('纬度和经度不能为空', 400))
    }

    const rider = await prisma.rider.findUnique({
      where: { id: riderId },
    })

    if (!rider) {
      return res.status(404).json(errorResponse('骑手不存在', 404))
    }

    const updatedRider = await prisma.rider.update({
      where: { id: riderId },
      data: {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
      },
    })

    res.json(successResponse(updatedRider, '位置更新成功'))
  } catch (error) {
    console.error(error)
    res.status(500).json(errorResponse('更新骑手位置失败', 500))
  }
}

export async function assignRiderToOrder(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id
    const userRole = req.user?.role
    const { riderId, orderId } = req.body

    if (!userId) {
      return res.status(401).json(errorResponse('未登录', 401))
    }

    if (!riderId || !orderId) {
      return res.status(400).json(errorResponse('骑手ID和订单ID不能为空', 400))
    }

    const riderIdNum = parseInt(riderId)
    const orderIdNum = parseInt(orderId)

    if (isNaN(riderIdNum) || isNaN(orderIdNum)) {
      return res.status(400).json(errorResponse('无效的骑手ID或订单ID', 400))
    }

    const rider = await prisma.rider.findUnique({
      where: { id: riderIdNum },
    })

    if (!rider) {
      return res.status(404).json(errorResponse('骑手不存在', 404))
    }

    if (rider.status !== 'IDLE') {
      return res.status(400).json(errorResponse('骑手当前不是空闲状态', 400))
    }

    const order = await prisma.order.findUnique({
      where: { id: orderIdNum },
    })

    if (!order) {
      return res.status(404).json(errorResponse('订单不存在', 404))
    }

    if (userRole === 'MERCHANT') {
      const store = await prisma.store.findUnique({
        where: { id: order.storeId },
      })
      if (!store || store.merchantId !== userId) {
        return res.status(403).json(errorResponse('无权限操作', 403))
      }
    }

    if (order.status !== 'READY') {
      return res.status(400).json(errorResponse('订单状态必须是已出餐才能分配骑手', 400))
    }

    const [updatedOrder, updatedRider] = await prisma.$transaction([
      prisma.order.update({
        where: { id: orderIdNum },
        data: {
          riderId: riderIdNum,
          status: 'DELIVERING',
        },
      }),
      prisma.rider.update({
        where: { id: riderIdNum },
        data: { status: 'DELIVERING' },
      }),
    ])

    res.json(successResponse({
      order: updatedOrder,
      rider: updatedRider,
    }, '骑手分配成功'))
  } catch (error) {
    console.error(error)
    res.status(500).json(errorResponse('分配骑手失败', 500))
  }
}

export async function createRider(req: AuthRequest, res: Response) {
  try {
    const { name, phone, avatar } = req.body

    if (!name || !phone) {
      return res.status(400).json(errorResponse('姓名和手机号不能为空', 400))
    }

    const existingRider = await prisma.rider.findUnique({
      where: { phone },
    })

    if (existingRider) {
      return res.status(400).json(errorResponse('该手机号已被使用', 400))
    }

    const rider = await prisma.rider.create({
      data: {
        name,
        phone,
        avatar,
        status: 'OFFLINE',
      },
    })

    res.json(successResponse(rider, '创建骑手成功'))
  } catch (error) {
    console.error(error)
    res.status(500).json(errorResponse('创建骑手失败', 500))
  }
}
