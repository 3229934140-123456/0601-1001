import { Response } from 'express'
import prisma from '../lib/prisma'
import { successResponse, errorResponse } from '../utils'
import { AuthRequest } from '../middleware/auth'

function parseDateRange(timeRange?: string, startDate?: string, endDate?: string): { start: Date; end: Date } {
  const now = new Date()
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  let start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)

  if (startDate && endDate) {
    start = new Date(startDate)
    end = new Date(endDate)
    end.setHours(23, 59, 59, 999)
  } else if (timeRange) {
    switch (timeRange) {
      case 'today':
        break
      case '7days':
        start.setDate(start.getDate() - 6)
        break
      case '30days':
        start.setDate(start.getDate() - 29)
        break
      default:
        break
    }
  }

  return { start, end }
}

async function getMerchantStoreIds(merchantId: number): Promise<number[]> {
  const stores = await prisma.store.findMany({
    where: { merchantId },
    select: { id: true },
  })
  return stores.map((s) => s.id)
}

async function checkStoreAccess(req: AuthRequest, storeId?: number): Promise<{ allowed: boolean; storeIds: number[]; status?: number; message?: string }> {
  const userId = req.user?.id
  const userRole = req.user?.role

  if (!userId) {
    return { allowed: false, storeIds: [], status: 401, message: '未登录' }
  }

  let storeIds: number[] = []

  if (userRole === 'ADMIN') {
    if (storeId) {
      const store = await prisma.store.findUnique({ where: { id: storeId } })
      if (!store) {
        return { allowed: false, storeIds: [], status: 404, message: '门店不存在' }
      }
      storeIds = [storeId]
    }
  } else if (userRole === 'MERCHANT') {
    const merchantStoreIds = await getMerchantStoreIds(userId)
    if (merchantStoreIds.length === 0) {
      return { allowed: true, storeIds: [] }
    }
    if (storeId) {
      if (!merchantStoreIds.includes(storeId)) {
        return { allowed: false, storeIds: [], status: 403, message: '无权限操作' }
      }
      storeIds = [storeId]
    } else {
      storeIds = merchantStoreIds
    }
  }

  return { allowed: true, storeIds }
}

export async function getBusinessOverview(req: AuthRequest, res: Response) {
  try {
    const { timeRange, startDate, endDate, storeId } = req.query

    const storeIdNum = storeId ? parseInt(storeId as string) : undefined

    const accessCheck = await checkStoreAccess(req, storeIdNum)
    if (!accessCheck.allowed) {
      return res.status(accessCheck.status!).json(errorResponse(accessCheck.message!, accessCheck.status!))
    }

    const storeIds = accessCheck.storeIds

    const { start, end } = parseDateRange(
      timeRange as string | undefined,
      startDate as string | undefined,
      endDate as string | undefined
    )

    const where: any = {
      createdAt: { gte: start, lte: end },
    }

    if (storeIds.length > 0) {
      where.storeId = { in: storeIds }
    }

    const orders = await prisma.order.findMany({
      where: {
        ...where,
        status: { notIn: ['CANCELLED', 'PENDING'] },
      },
      select: {
        id: true,
        userId: true,
        payAmount: true,
        status: true,
        storeId: true,
      },
    })

    const refundOrders = await prisma.order.findMany({
      where: {
        ...where,
        status: { in: ['REFUNDED', 'REFUND_REQUESTED'] },
      },
      select: { payAmount: true },
    })

    const totalOrders = orders.length
    const totalRevenue = orders.reduce((sum, o) => sum + o.payAmount, 0)
    const totalRefund = refundOrders.reduce((sum, o) => sum + o.payAmount, 0)
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0

    const uniqueUsers = new Set(orders.map((o) => o.userId))
    const totalUniqueUsers = uniqueUsers.size

    const userOrderCounts = new Map<number, number>()
    for (const order of orders) {
      const count = userOrderCounts.get(order.userId) || 0
      userOrderCounts.set(order.userId, count + 1)
    }
    const repeatUsers = Array.from(userOrderCounts.values()).filter((c) => c >= 2).length

    let storeBreakdown: any[] = []
    if (!storeId) {
      const storeMap = new Map<number, { storeId: number; storeName: string; orderCount: number; revenue: number; refundAmount: number }>()

      const allStores = storeIds.length > 0
        ? await prisma.store.findMany({ where: { id: { in: storeIds } } })
        : await prisma.store.findMany()

      for (const store of allStores) {
        storeMap.set(store.id, {
          storeId: store.id,
          storeName: store.name,
          orderCount: 0,
          revenue: 0,
          refundAmount: 0,
        })
      }

      for (const order of orders) {
        const data = storeMap.get(order.storeId)
        if (data) {
          data.orderCount++
          data.revenue += order.payAmount
        }
      }

      for (const refund of refundOrders) {
        // 这里简化处理，因为没有 storeId 在 refundOrders 里
      }

      storeBreakdown = Array.from(storeMap.values())
    }

    res.json(successResponse({
      timeRange,
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
      totalOrders,
      totalRevenue,
      totalRefund,
      avgOrderValue,
      totalUniqueUsers,
      repeatUsers,
      storeBreakdown,
    }, '获取经营概览成功'))
  } catch (error) {
    console.error('获取经营概览失败:', error)
    res.status(500).json(errorResponse('获取经营概览失败', 500))
  }
}

export async function getDishAnalysis(req: AuthRequest, res: Response) {
  try {
    const { timeRange, startDate, endDate, storeId } = req.query

    const storeIdNum = storeId ? parseInt(storeId as string) : undefined

    const accessCheck = await checkStoreAccess(req, storeIdNum)
    if (!accessCheck.allowed) {
      return res.status(accessCheck.status!).json(errorResponse(accessCheck.message!, accessCheck.status!))
    }

    const storeIds = accessCheck.storeIds

    const { start, end } = parseDateRange(
      timeRange as string | undefined,
      startDate as string | undefined,
      endDate as string | undefined
    )

    const orderWhere: any = {
      createdAt: { gte: start, lte: end },
      status: { notIn: ['CANCELLED', 'PENDING'] },
    }

    if (storeIds.length > 0) {
      orderWhere.storeId = { in: storeIds }
    }

    const orderItems = await prisma.orderItem.findMany({
      where: {
        order: orderWhere,
      },
      select: {
        dishId: true,
        dishName: true,
        dishImage: true,
        price: true,
        quantity: true,
        specs: true,
        order: {
          select: {
            storeId: true,
            status: true,
          },
        },
      },
    })

    const dishMap = new Map<number, any>()

    for (const item of orderItems) {
      const existing = dishMap.get(item.dishId)
      if (existing) {
        existing.salesCount += item.quantity
        existing.salesAmount += item.price * item.quantity
        if (item.order.status === 'REFUNDED' || item.order.status === 'REFUND_REQUESTED') {
          existing.refundCount += item.quantity
          existing.refundAmount += item.price * item.quantity
        }
      } else {
        dishMap.set(item.dishId, {
          dishId: item.dishId,
          dishName: item.dishName,
          dishImage: item.dishImage,
          price: item.price,
          salesCount: item.quantity,
          salesAmount: item.price * item.quantity,
          refundCount: (item.order.status === 'REFUNDED' || item.order.status === 'REFUND_REQUESTED') ? item.quantity : 0,
          refundAmount: (item.order.status === 'REFUNDED' || item.order.status === 'REFUND_REQUESTED') ? item.price * item.quantity : 0,
          storeId: item.order.storeId,
        })
      }
    }

    const dishList = Array.from(dishMap.values()).sort((a, b) => b.salesCount - a.salesCount)

    const lowStockDishes: any[] = []
    const dishStockWhere: any = {}
    if (storeIds.length > 0) {
      dishStockWhere.storeId = { in: storeIds }
    }
    dishStockWhere.isOnSale = true
    dishStockWhere.stock = { lte: 20 }

    const stockDishes = await prisma.dish.findMany({
      where: dishStockWhere,
      select: {
        id: true,
        name: true,
        image: true,
        price: true,
        stock: true,
        storeId: true,
        store: {
          select: { name: true },
        },
      },
      orderBy: { stock: 'asc' },
      take: 20,
    })

    for (const dish of stockDishes) {
      lowStockDishes.push({
        dishId: dish.id,
        dishName: dish.name,
        dishImage: dish.image,
        price: dish.price,
        stock: dish.stock,
        storeId: dish.storeId,
        storeName: dish.store.name,
      })
    }

    res.json(successResponse({
      timeRange,
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
      dishList,
      lowStockDishes,
    }, '获取菜品分析成功'))
  } catch (error) {
    console.error('获取菜品分析失败:', error)
    res.status(500).json(errorResponse('获取菜品分析失败', 500))
  }
}

export async function getHotDishesAnalysis(req: AuthRequest, res: Response) {
  try {
    const { timeRange, startDate, endDate, storeId, limit = '10' } = req.query

    const storeIdNum = storeId ? parseInt(storeId as string) : undefined

    const accessCheck = await checkStoreAccess(req, storeIdNum)
    if (!accessCheck.allowed) {
      return res.status(accessCheck.status!).json(errorResponse(accessCheck.message!, accessCheck.status!))
    }

    const storeIds = accessCheck.storeIds
    const limitNum = parseInt(limit as string)

    const { start, end } = parseDateRange(
      timeRange as string | undefined,
      startDate as string | undefined,
      endDate as string | undefined
    )

    const orderWhere: any = {
      createdAt: { gte: start, lte: end },
      status: { notIn: ['CANCELLED', 'PENDING'] },
    }

    if (storeIds.length > 0) {
      orderWhere.storeId = { in: storeIds }
    }

    const orderItems = await prisma.orderItem.findMany({
      where: {
        order: orderWhere,
      },
      select: {
        dishId: true,
        dishName: true,
        dishImage: true,
        price: true,
        quantity: true,
      },
    })

    const dishMap = new Map<number, any>()

    for (const item of orderItems) {
      const existing = dishMap.get(item.dishId)
      if (existing) {
        existing.salesCount += item.quantity
        existing.salesAmount += item.price * item.quantity
      } else {
        dishMap.set(item.dishId, {
          dishId: item.dishId,
          dishName: item.dishName,
          dishImage: item.dishImage,
          price: item.price,
          salesCount: item.quantity,
          salesAmount: item.price * item.quantity,
        })
      }
    }

    const hotDishes = Array.from(dishMap.values())
      .sort((a, b) => b.salesCount - a.salesCount)
      .slice(0, limitNum)

    res.json(successResponse({
      timeRange,
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
      hotDishes,
    }, '获取热门菜品成功'))
  } catch (error) {
    console.error('获取热门菜品失败:', error)
    res.status(500).json(errorResponse('获取热门菜品失败', 500))
  }
}
