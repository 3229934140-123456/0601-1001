import { Response } from 'express'
import prisma from '../lib/prisma'
import { successResponse, errorResponse, haversineDistance, isStoreOpen } from '../utils'
import { AuthRequest } from '../middleware/auth'

export async function getStores(req: AuthRequest, res: Response) {
  try {
    const { keyword, lat, lon, distance, page = '1', pageSize = '10' } = req.query

    const pageNum = parseInt(page as string)
    const pageSizeNum = parseInt(pageSize as string)
    const skip = (pageNum - 1) * pageSizeNum

    const where: any = {}

    if (keyword) {
      where.OR = [
        { name: { contains: keyword as string } },
        { description: { contains: keyword as string } },
        { address: { contains: keyword as string } },
      ]
    }

    const stores = await prisma.store.findMany({
      where,
      skip,
      take: pageSizeNum,
      orderBy: { createdAt: 'desc' },
    })

    const total = await prisma.store.count({ where })

    let storesWithDistance = stores.map((store) => ({
      ...store,
      isOpen: isStoreOpen(store.openingTime, store.closingTime),
      distance: null as number | null,
    }))

    if (lat && lon) {
      const latNum = parseFloat(lat as string)
      const lonNum = parseFloat(lon as string)

      storesWithDistance = storesWithDistance.map((store) => ({
        ...store,
        distance: haversineDistance(latNum, lonNum, store.latitude, store.longitude),
      }))

      if (distance) {
        const distanceNum = parseFloat(distance as string)
        storesWithDistance = storesWithDistance.filter((store) => store.distance !== null && store.distance <= distanceNum)
      }

      storesWithDistance.sort((a, b) => (a.distance || 0) - (b.distance || 0))
    }

    res.json(successResponse({
      list: storesWithDistance,
      total,
      page: pageNum,
      pageSize: pageSizeNum,
    }))
  } catch (error) {
    console.error(error)
    res.status(500).json(errorResponse('获取门店列表失败', 500))
  }
}

export async function getStoreDetail(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params
    const storeId = parseInt(id)

    if (isNaN(storeId)) {
      return res.status(400).json(errorResponse('无效的门店ID', 400))
    }

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      include: {
        announcements: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!store) {
      return res.status(404).json(errorResponse('门店不存在', 404))
    }

    const storeWithStatus = {
      ...store,
      isOpen: isStoreOpen(store.openingTime, store.closingTime),
    }

    res.json(successResponse(storeWithStatus))
  } catch (error) {
    console.error(error)
    res.status(500).json(errorResponse('获取门店详情失败', 500))
  }
}

export async function getStoreAnnouncements(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params
    const storeId = parseInt(id)

    if (isNaN(storeId)) {
      return res.status(400).json(errorResponse('无效的门店ID', 400))
    }

    const store = await prisma.store.findUnique({
      where: { id: storeId },
    })

    if (!store) {
      return res.status(404).json(errorResponse('门店不存在', 404))
    }

    const announcements = await prisma.storeAnnouncement.findMany({
      where: {
        storeId,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json(successResponse(announcements))
  } catch (error) {
    console.error(error)
    res.status(500).json(errorResponse('获取门店公告失败', 500))
  }
}

export async function createAnnouncement(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id
    const userRole = req.user?.role
    const { id } = req.params
    const storeId = parseInt(id)
    const { title, content, isActive } = req.body

    if (!userId) {
      return res.status(401).json(errorResponse('未登录', 401))
    }

    if (isNaN(storeId)) {
      return res.status(400).json(errorResponse('无效的门店ID', 400))
    }

    if (!title || !content) {
      return res.status(400).json(errorResponse('标题和内容不能为空', 400))
    }

    const store = await prisma.store.findUnique({
      where: { id: storeId },
    })

    if (!store) {
      return res.status(404).json(errorResponse('门店不存在', 404))
    }

    if (userRole === 'MERCHANT') {
      if (store.merchantId !== userId) {
        return res.status(403).json(errorResponse('无权限操作', 403))
      }
    }

    const announcement = await prisma.storeAnnouncement.create({
      data: {
        storeId,
        title,
        content,
        isActive: isActive !== undefined ? isActive : true,
      },
    })

    res.json(successResponse(announcement, '发布公告成功'))
  } catch (error) {
    console.error(error)
    res.status(500).json(errorResponse('发布公告失败', 500))
  }
}

function getTodayStart(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
}

export async function getMerchantOverview(req: AuthRequest, res: Response) {
  try {
    const merchantId = req.merchant?.id || req.user?.id

    if (!merchantId) {
      return res.status(401).json(errorResponse('未登录', 401))
    }

    const todayStart = getTodayStart()

    const stores = await prisma.store.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
    })

    const storeIds = stores.map((s) => s.id)
    const storeCount = stores.length

    if (storeCount === 0) {
      return res.json(successResponse({
        storeCount: 0,
        todayOrders: 0,
        pendingOrders: 0,
        todayRevenue: 0,
        avgRating: 0,
        hotDishes: [],
        stores: [],
      }))
    }

    const todayOrders = await prisma.order.count({
      where: {
        storeId: { in: storeIds },
        createdAt: { gte: todayStart },
      },
    })

    const pendingOrders = await prisma.order.count({
      where: {
        storeId: { in: storeIds },
        status: { in: ['PAID', 'PREPARING'] },
      },
    })

    const todayCompletedOrders = await prisma.order.findMany({
      where: {
        storeId: { in: storeIds },
        status: 'COMPLETED',
        createdAt: { gte: todayStart },
      },
      select: { payAmount: true },
    })

    const todayRevenue = todayCompletedOrders.reduce((sum, order) => sum + order.payAmount, 0)

    const reviews = await prisma.review.findMany({
      where: {
        storeId: { in: storeIds },
        status: 'APPROVED',
      },
      select: { rating: true },
    })

    const avgRating = reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0

    const orderItems = await prisma.orderItem.findMany({
      where: {
        order: {
          storeId: { in: storeIds },
        },
      },
      select: {
        dishId: true,
        dishName: true,
        dishImage: true,
        price: true,
        quantity: true,
      },
    })

    const dishMap = new Map<number, { dishId: number; dishName: string; dishImage: string | null; price: number; salesCount: number }>()

    for (const item of orderItems) {
      const existing = dishMap.get(item.dishId)
      if (existing) {
        existing.salesCount += item.quantity
      } else {
        dishMap.set(item.dishId, {
          dishId: item.dishId,
          dishName: item.dishName,
          dishImage: item.dishImage,
          price: item.price,
          salesCount: item.quantity,
        })
      }
    }

    const hotDishes = Array.from(dishMap.values())
      .sort((a, b) => b.salesCount - a.salesCount)
      .slice(0, 10)

    const storeOverviews = []
    for (const store of stores) {
      const storeTodayOrders = await prisma.order.count({
        where: {
          storeId: store.id,
          createdAt: { gte: todayStart },
        },
      })

      const storePendingOrders = await prisma.order.count({
        where: {
          storeId: store.id,
          status: { in: ['PAID', 'PREPARING'] },
        },
      })

      const storeTodayCompleted = await prisma.order.findMany({
        where: {
          storeId: store.id,
          status: 'COMPLETED',
          createdAt: { gte: todayStart },
        },
        select: { payAmount: true },
      })

      const storeTodayRevenue = storeTodayCompleted.reduce((sum, order) => sum + order.payAmount, 0)

      storeOverviews.push({
        id: store.id,
        name: store.name,
        coverImage: store.coverImage,
        address: store.address,
        rating: store.rating,
        todayOrders: storeTodayOrders,
        pendingOrders: storePendingOrders,
        todayRevenue: storeTodayRevenue,
        isOpen: isStoreOpen(store.openingTime, store.closingTime),
      })
    }

    res.json(successResponse({
      storeCount,
      todayOrders,
      pendingOrders,
      todayRevenue,
      avgRating,
      hotDishes,
      stores: storeOverviews,
    }))
  } catch (error) {
    console.error('获取商家概览失败:', error)
    res.status(500).json(errorResponse('获取商家概览失败', 500))
  }
}

export async function getAdminOverview(req: AuthRequest, res: Response) {
  try {
    const { storeId } = req.query

    const todayStart = getTodayStart()

    const storeWhere: any = {}

    if (storeId) {
      const storeIdNum = parseInt(storeId as string)
      if (isNaN(storeIdNum)) {
        return res.status(400).json(errorResponse('无效的门店ID', 400))
      }
      storeWhere.id = storeIdNum
    }

    const stores = await prisma.store.findMany({
      where: storeWhere,
      orderBy: { createdAt: 'desc' },
    })

    const storeIds = stores.map((s) => s.id)
    const storeCount = stores.length

    if (storeCount === 0) {
      return res.json(successResponse({
        storeCount: 0,
        todayOrders: 0,
        pendingOrders: 0,
        todayRevenue: 0,
        avgRating: 0,
        hotDishes: [],
        stores: [],
      }))
    }

    const todayOrders = await prisma.order.count({
      where: {
        storeId: { in: storeIds },
        createdAt: { gte: todayStart },
      },
    })

    const pendingOrders = await prisma.order.count({
      where: {
        storeId: { in: storeIds },
        status: { in: ['PAID', 'PREPARING'] },
      },
    })

    const todayCompletedOrders = await prisma.order.findMany({
      where: {
        storeId: { in: storeIds },
        status: 'COMPLETED',
        createdAt: { gte: todayStart },
      },
      select: { payAmount: true },
    })

    const todayRevenue = todayCompletedOrders.reduce((sum, order) => sum + order.payAmount, 0)

    const reviews = await prisma.review.findMany({
      where: {
        storeId: { in: storeIds },
        status: 'APPROVED',
      },
      select: { rating: true },
    })

    const avgRating = reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0

    const orderItems = await prisma.orderItem.findMany({
      where: {
        order: {
          storeId: { in: storeIds },
        },
      },
      select: {
        dishId: true,
        dishName: true,
        dishImage: true,
        price: true,
        quantity: true,
      },
    })

    const dishMap = new Map<number, { dishId: number; dishName: string; dishImage: string | null; price: number; salesCount: number }>()

    for (const item of orderItems) {
      const existing = dishMap.get(item.dishId)
      if (existing) {
        existing.salesCount += item.quantity
      } else {
        dishMap.set(item.dishId, {
          dishId: item.dishId,
          dishName: item.dishName,
          dishImage: item.dishImage,
          price: item.price,
          salesCount: item.quantity,
        })
      }
    }

    const hotDishes = Array.from(dishMap.values())
      .sort((a, b) => b.salesCount - a.salesCount)
      .slice(0, 10)

    const storeOverviews = []
    for (const store of stores) {
      const storeTodayOrders = await prisma.order.count({
        where: {
          storeId: store.id,
          createdAt: { gte: todayStart },
        },
      })

      const storePendingOrders = await prisma.order.count({
        where: {
          storeId: store.id,
          status: { in: ['PAID', 'PREPARING'] },
        },
      })

      const storeTodayCompleted = await prisma.order.findMany({
        where: {
          storeId: store.id,
          status: 'COMPLETED',
          createdAt: { gte: todayStart },
        },
        select: { payAmount: true },
      })

      const storeTodayRevenue = storeTodayCompleted.reduce((sum, order) => sum + order.payAmount, 0)

      storeOverviews.push({
        id: store.id,
        name: store.name,
        coverImage: store.coverImage,
        address: store.address,
        rating: store.rating,
        todayOrders: storeTodayOrders,
        pendingOrders: storePendingOrders,
        todayRevenue: storeTodayRevenue,
        isOpen: isStoreOpen(store.openingTime, store.closingTime),
      })
    }

    res.json(successResponse({
      storeCount,
      todayOrders,
      pendingOrders,
      todayRevenue,
      avgRating,
      hotDishes,
      stores: storeOverviews,
    }))
  } catch (error) {
    console.error('获取管理员概览失败:', error)
    res.status(500).json(errorResponse('获取管理员概览失败', 500))
  }
}
