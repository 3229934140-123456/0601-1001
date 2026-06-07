import { Response } from 'express'
import prisma from '../lib/prisma'
import { successResponse, errorResponse } from '../utils'
import { AuthRequest } from '../middleware/auth'

const DEFAULT_SERVICE_FEE_RATE = 0.05

function parseDateRange(timeRange?: string, startDate?: string, endDate?: string): { start: Date; end: Date } {
  const now = new Date()
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  let start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)

  if (startDate && endDate) {
    start = new Date(startDate)
    const endParsed = new Date(endDate)
    endParsed.setHours(23, 59, 59, 999)
    return { start, end: endParsed }
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

async function getStoreMap(): Promise<Map<number, { id: number; name: string; merchantId: number }>> {
  const stores = await prisma.store.findMany({
    select: { id: true, name: true, merchantId: true },
  })
  const map = new Map()
  for (const s of stores) map.set(s.id, s)
  return map
}

async function checkAnalysisAccess(
  req: AuthRequest,
  storeId?: number,
  merchantId?: number
): Promise<{ allowed: boolean; storeIds: number[]; status?: number; message?: string }> {
  const userId = req.user?.id
  const userRole = req.user?.role

  if (!userId) {
    return { allowed: false, storeIds: [], status: 401, message: '未登录' }
  }

  let storeIds: number[] = []

  if (userRole === 'ADMIN') {
    if (merchantId) {
      const merchantStoreIds = await getMerchantStoreIds(merchantId)
      storeIds = merchantStoreIds
    } else if (storeId) {
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

function getDateKey(date: Date, period: string): string {
  const d = new Date(date)
  switch (period) {
    case 'day':
      return d.toISOString().split('T')[0]
    case 'week': {
      const day = d.getDay()
      const diff = d.getDate() - day + (day === 0 ? -6 : 1)
      const monday = new Date(d.setDate(diff))
      return monday.toISOString().split('T')[0]
    }
    case 'month':
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    default:
      return d.toISOString().split('T')[0]
  }
}

export async function getBusinessOverview(req: AuthRequest, res: Response) {
  try {
    const { timeRange, startDate, endDate, storeId, merchantId } = req.query

    const storeIdNum = storeId ? parseInt(storeId as string) : undefined
    const merchantIdNum = merchantId ? parseInt(merchantId as string) : undefined

    const accessCheck = await checkAnalysisAccess(req, storeIdNum, merchantIdNum)
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
        orderNo: true,
        userId: true,
        payAmount: true,
        discountAmount: true,
        status: true,
        storeId: true,
        createdAt: true,
      },
    })

    const refundOrders = orders.filter((o) => o.status === 'REFUNDED' || o.status === 'REFUND_REQUESTED')

    const totalOrders = orders.length
    const totalRevenue = orders.reduce((sum, o) => sum + o.payAmount, 0)
    const totalRefund = refundOrders.reduce((sum, o) => sum + o.payAmount, 0)
    const totalDiscount = orders.reduce((sum, o) => sum + (o.discountAmount || 0), 0)
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
    const storeMap = await getStoreMap()

    const breakdownMap = new Map<number, any>()
    const storeIdList = storeIds.length > 0 ? storeIds : Array.from(storeMap.keys())
    for (const storeIdKey of storeIdList) {
      const store = storeMap.get(storeIdKey)
      if (store) {
        breakdownMap.set(storeIdKey, {
          storeId: storeIdKey,
          storeName: store.name,
          merchantId: store.merchantId,
          orderCount: 0,
          revenue: 0,
          refundAmount: 0,
          discountAmount: 0,
        })
      }
    }

    for (const order of orders) {
      const data = breakdownMap.get(order.storeId)
      if (data) {
        data.orderCount++
        data.revenue += order.payAmount
        data.discountAmount += order.discountAmount || 0
      }
    }

    for (const refund of refundOrders) {
      const data = breakdownMap.get(refund.storeId)
      if (data) {
        data.refundAmount += refund.payAmount
      }
    }

    storeBreakdown = Array.from(breakdownMap.values())

    res.json(successResponse({
      timeRange: timeRange || 'custom',
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
      totalOrders,
      totalRevenue,
      totalRefund,
      totalDiscount,
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
    const { timeRange, startDate, endDate, storeId, merchantId } = req.query

    const storeIdNum = storeId ? parseInt(storeId as string) : undefined
    const merchantIdNum = merchantId ? parseInt(merchantId as string) : undefined

    const accessCheck = await checkAnalysisAccess(req, storeIdNum, merchantIdNum)
    if (!accessCheck.allowed) {
      return res.status(accessCheck.status!).json(errorResponse(accessCheck.message!, accessCheck.status!))
    }

    const storeIds = accessCheck.storeIds

    const { start, end } = parseDateRange(
      timeRange as string | undefined,
      startDate as string | undefined,
      endDate as string | undefined
    )

    const orderItems = await prisma.orderItem.findMany({
      where: {
        order: {
          is: {
            createdAt: { gte: start, lte: end },
            status: { notIn: ['CANCELLED', 'PENDING'] },
            ...(storeIds.length > 0 ? { storeId: { in: storeIds } } : {}),
          },
        },
      },
      include: {
        order: {
          include: {
            store: { select: { id: true, name: true } },
          },
        },
      },
    })

    const dishMap = new Map<number, any>()

    for (const item of orderItems) {
      const isRefund = item.order.status === 'REFUNDED' || item.order.status === 'REFUND_REQUESTED'
      const specsKey = item.specs || 'default'
      const specsLabel = item.specs ? JSON.parse(item.specs) : null
      const existing = dishMap.get(item.dishId)

      if (existing) {
        existing.salesCount += item.quantity
        existing.salesAmount += item.price * item.quantity

        if (isRefund) {
          existing.refundCount += item.quantity
          existing.refundAmount += item.price * item.quantity
          existing.refundOrderCount += 1
        }

        const specData = existing.specsBreakdown.get(specsKey)
        if (specData) {
          specData.salesCount += item.quantity
          specData.salesAmount += item.price * item.quantity
          if (isRefund) {
            specData.refundCount += item.quantity
            specData.refundAmount += item.price * item.quantity
          }
        } else {
          existing.specsBreakdown.set(specsKey, {
            specs: specsLabel,
            specsRaw: item.specs,
            salesCount: item.quantity,
            salesAmount: item.price * item.quantity,
            refundCount: isRefund ? item.quantity : 0,
            refundAmount: isRefund ? item.price * item.quantity : 0,
          })
        }
      } else {
        const specsBreakdown = new Map()
        specsBreakdown.set(specsKey, {
          specs: specsLabel,
          specsRaw: item.specs,
          salesCount: item.quantity,
          salesAmount: item.price * item.quantity,
          refundCount: isRefund ? item.quantity : 0,
          refundAmount: isRefund ? item.price * item.quantity : 0,
        })

        dishMap.set(item.dishId, {
          dishId: item.dishId,
          dishName: item.dishName,
          dishImage: item.dishImage,
          price: item.price,
          storeId: item.order.storeId,
          storeName: item.order.store.name,
          salesCount: item.quantity,
          salesAmount: item.price * item.quantity,
          refundCount: isRefund ? item.quantity : 0,
          refundAmount: isRefund ? item.price * item.quantity : 0,
          refundOrderCount: isRefund ? 1 : 0,
          specsBreakdown,
        })
      }
    }

    const dishList = Array.from(dishMap.values())
      .map((d) => ({
        ...d,
        specsBreakdown: Array.from(d.specsBreakdown.values()),
      }))
      .sort((a, b) => b.salesCount - a.salesCount)

    const lowStockDishes: any[] = []
    const dishStockWhere: any = {}
    if (storeIds.length > 0) {
      dishStockWhere.storeId = { in: storeIds }
    }
    dishStockWhere.isOnSale = true
    dishStockWhere.stock = { lte: 20 }

    const stockDishes = await prisma.dish.findMany({
      where: dishStockWhere,
      include: {
        store: { select: { name: true } },
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
      timeRange: timeRange || 'custom',
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
    const { timeRange, startDate, endDate, storeId, merchantId, limit = '10' } = req.query

    const storeIdNum = storeId ? parseInt(storeId as string) : undefined
    const merchantIdNum = merchantId ? parseInt(merchantId as string) : undefined

    const accessCheck = await checkAnalysisAccess(req, storeIdNum, merchantIdNum)
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

    const orderItems = await prisma.orderItem.findMany({
      where: {
        order: {
          is: {
            createdAt: { gte: start, lte: end },
            status: { notIn: ['CANCELLED', 'PENDING'] },
            ...(storeIds.length > 0 ? { storeId: { in: storeIds } } : {}),
          },
        },
      },
      include: {
        order: {
          include: { store: { select: { id: true, name: true } } },
        },
      },
    })

    const dishMap = new Map<number, any>()

    for (const item of orderItems) {
      const specsKey = item.specs || 'default'
      const specsLabel = item.specs ? JSON.parse(item.specs) : null
      const existing = dishMap.get(item.dishId)

      if (existing) {
        existing.salesCount += item.quantity
        existing.salesAmount += item.price * item.quantity

        const specData = existing.specsContribution.get(specsKey)
        if (specData) {
          specData.salesCount += item.quantity
        } else {
          existing.specsContribution.set(specsKey, {
            specs: specsLabel,
            salesCount: item.quantity,
          })
        }
      } else {
        const specsContribution = new Map()
        specsContribution.set(specsKey, {
          specs: specsLabel,
          salesCount: item.quantity,
        })

        dishMap.set(item.dishId, {
          dishId: item.dishId,
          dishName: item.dishName,
          dishImage: item.dishImage,
          price: item.price,
          storeId: item.order.storeId,
          storeName: item.order.store.name,
          salesCount: item.quantity,
          salesAmount: item.price * item.quantity,
          specsContribution,
        })
      }
    }

    const hotDishes = Array.from(dishMap.values())
      .map((d) => ({
        ...d,
        specsContribution: Array.from(d.specsContribution.values()).sort(
          (a, b) => b.salesCount - a.salesCount
        ),
      }))
      .sort((a, b) => b.salesCount - a.salesCount)
      .slice(0, limitNum)

    res.json(successResponse({
      timeRange: timeRange || 'custom',
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
      hotDishes,
    }, '获取热门菜品成功'))
  } catch (error) {
    console.error('获取热门菜品失败:', error)
    res.status(500).json(errorResponse('获取热门菜品失败', 500))
  }
}

export async function getFinancialReconciliation(req: AuthRequest, res: Response) {
  try {
    const {
      timeRange,
      startDate,
      endDate,
      storeId,
      merchantId,
      period = 'day',
      page = '1',
      pageSize = '20',
    } = req.query

    const storeIdNum = storeId ? parseInt(storeId as string) : undefined
    const merchantIdNum = merchantId ? parseInt(merchantId as string) : undefined

    const accessCheck = await checkAnalysisAccess(req, storeIdNum, merchantIdNum)
    if (!accessCheck.allowed) {
      return res.status(accessCheck.status!).json(errorResponse(accessCheck.message!, accessCheck.status!))
    }

    const storeIds = accessCheck.storeIds
    const periodStr = period as string

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
      include: {
        store: { select: { id: true, name: true, merchantId: true } },
        items: { select: { dishName: true, quantity: true, price: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const refundOrders = orders.filter((o) => o.status === 'REFUNDED' || o.status === 'REFUND_REQUESTED')

    const totalIncome = orders.reduce((sum, o) => sum + o.payAmount, 0)
    const totalRefund = refundOrders.reduce((sum, o) => sum + o.payAmount, 0)
    const totalServiceFee = orders.reduce((sum, o) => {
      if (o.status === 'REFUNDED' || o.status === 'REFUND_REQUESTED') return sum
      return sum + o.payAmount * DEFAULT_SERVICE_FEE_RATE
    }, 0)
    const totalMerchantIncome = totalIncome - totalRefund - totalServiceFee

    const periodMap = new Map<string, any>()

    for (const order of orders) {
      const key = getDateKey(order.createdAt, periodStr)
      const existing = periodMap.get(key)

      const isRefund = order.status === 'REFUNDED' || order.status === 'REFUND_REQUESTED'
      const serviceFee = isRefund ? 0 : order.payAmount * DEFAULT_SERVICE_FEE_RATE
      const merchantIncome = order.payAmount - (isRefund ? order.payAmount : 0) - serviceFee

      if (existing) {
        existing.orderCount += 1
        existing.income += order.payAmount
        existing.discount += order.discountAmount || 0
        if (isRefund) {
          existing.refundAmount += order.payAmount
          existing.refundOrderCount += 1
        }
        existing.serviceFee += serviceFee
        existing.merchantIncome += merchantIncome
      } else {
        periodMap.set(key, {
          period: key,
          orderCount: 1,
          income: order.payAmount,
          discount: order.discountAmount || 0,
          refundAmount: isRefund ? order.payAmount : 0,
          refundOrderCount: isRefund ? 1 : 0,
          serviceFee,
          merchantIncome,
        })
      }
    }

    const periodData = Array.from(periodMap.values()).sort((a, b) => a.period.localeCompare(b.period))

    const pageNum = parseInt(page as string)
    const pageSizeNum = parseInt(pageSize as string)
    const skip = (pageNum - 1) * pageSizeNum

    const orderDetails = orders.slice(skip, skip + pageSizeNum).map((order) => {
      const isRefund = order.status === 'REFUNDED' || order.status === 'REFUND_REQUESTED'
      const serviceFee = isRefund ? 0 : order.payAmount * DEFAULT_SERVICE_FEE_RATE
      const merchantIncome = order.payAmount - (isRefund ? order.payAmount : 0) - serviceFee

      return {
        id: order.id,
        orderNo: order.orderNo,
        storeId: order.storeId,
        storeName: order.store.name,
        payAmount: order.payAmount,
        discountAmount: order.discountAmount || 0,
        deliveryFee: order.deliveryFee || 0,
        status: order.status,
        isRefund,
        refundAmount: isRefund ? order.payAmount : 0,
        serviceFee,
        merchantIncome,
        itemCount: order.items.length,
        createdAt: order.createdAt,
        calculation: {
          payAmount: order.payAmount,
          minusDiscount: `-${order.discountAmount || 0}`,
          minusServiceFee: `-${serviceFee.toFixed(2)}`,
          minusRefund: isRefund ? `-${order.payAmount}` : '-0',
          equalsMerchantIncome: merchantIncome.toFixed(2),
        },
      }
    })

    res.json(successResponse({
      timeRange: timeRange || 'custom',
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
      period,
      summary: {
        totalIncome,
        totalRefund,
        totalDiscount: orders.reduce((sum, o) => sum + (o.discountAmount || 0), 0),
        totalServiceFee,
        totalMerchantIncome,
        orderCount: orders.length,
        refundOrderCount: refundOrders.length,
      },
      periodData,
      orderDetails: {
        list: orderDetails,
        total: orders.length,
        page: pageNum,
        pageSize: pageSizeNum,
      },
    }, '获取财务对账成功'))
  } catch (error) {
    console.error('获取财务对账失败:', error)
    res.status(500).json(errorResponse('获取财务对账失败', 500))
  }
}

export async function exportReport(req: AuthRequest, res: Response) {
  try {
    const { type, timeRange, startDate, endDate, storeId, merchantId, period = 'day' } = req.query

    const storeIdNum = storeId ? parseInt(storeId as string) : undefined
    const merchantIdNum = merchantId ? parseInt(merchantId as string) : undefined

    const accessCheck = await checkAnalysisAccess(req, storeIdNum, merchantIdNum)
    if (!accessCheck.allowed) {
      return res.status(accessCheck.status!).json(errorResponse(accessCheck.message!, accessCheck.status!))
    }

    const storeIds = accessCheck.storeIds
    const reportType = type as string

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

    let reportData: any = {
      exportType: reportType,
      exportTime: new Date().toISOString(),
      timeRange: timeRange || 'custom',
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
      filters: {
        storeIds,
        merchantId: merchantIdNum,
      },
    }

    if (reportType === 'business') {
      const orders = await prisma.order.findMany({
        where: {
          ...where,
          status: { notIn: ['CANCELLED', 'PENDING'] },
        },
        include: { store: { select: { id: true, name: true } } },
      })

      const refundOrders = orders.filter(
        (o) => o.status === 'REFUNDED' || o.status === 'REFUND_REQUESTED'
      )

      const storeMap = new Map()
      for (const order of orders) {
        const existing = storeMap.get(order.storeId)
        const isRefund = order.status === 'REFUNDED' || order.status === 'REFUND_REQUESTED'
        if (existing) {
          existing.orderCount++
          existing.revenue += order.payAmount
          existing.discount += order.discountAmount || 0
          if (isRefund) existing.refundAmount += order.payAmount
        } else {
          storeMap.set(order.storeId, {
            storeId: order.storeId,
            storeName: order.store.name,
            orderCount: 1,
            revenue: order.payAmount,
            discount: order.discountAmount || 0,
            refundAmount: isRefund ? order.payAmount : 0,
          })
        }
      }

      reportData.summary = {
        totalOrders: orders.length,
        totalRevenue: orders.reduce((sum, o) => sum + o.payAmount, 0),
        totalRefund: refundOrders.reduce((sum, o) => sum + o.payAmount, 0),
        totalDiscount: orders.reduce((sum, o) => sum + (o.discountAmount || 0), 0),
        avgOrderValue: orders.length > 0
          ? orders.reduce((sum, o) => sum + o.payAmount, 0) / orders.length
          : 0,
      }
      reportData.storeBreakdown = Array.from(storeMap.values())
      reportData.orderCount = orders.length
    } else if (reportType === 'dish') {
      const orderItems = await prisma.orderItem.findMany({
        where: {
          order: {
            is: {
              createdAt: { gte: start, lte: end },
              status: { notIn: ['CANCELLED', 'PENDING'] },
              ...(storeIds.length > 0 ? { storeId: { in: storeIds } } : {}),
            },
          },
        },
        include: {
          order: { include: { store: { select: { id: true, name: true } } } },
        },
      })

      const dishMap = new Map()
      for (const item of orderItems) {
        const existing = dishMap.get(item.dishId)
        if (existing) {
          existing.salesCount += item.quantity
          existing.salesAmount += item.price * item.quantity
        } else {
          dishMap.set(item.dishId, {
            dishId: item.dishId,
            dishName: item.dishName,
            storeId: item.order.storeId,
            storeName: item.order.store.name,
            salesCount: item.quantity,
            salesAmount: item.price * item.quantity,
          })
        }
      }

      reportData.dishList = Array.from(dishMap.values()).sort(
        (a, b) => b.salesCount - a.salesCount
      )
      reportData.totalDishTypes = dishMap.size
    } else if (reportType === 'financial') {
      const orders = await prisma.order.findMany({
        where: {
          ...where,
          status: { notIn: ['CANCELLED', 'PENDING'] },
        },
        include: {
          store: { select: { id: true, name: true } },
          items: { select: { dishName: true, quantity: true, price: true } },
        },
        orderBy: { createdAt: 'desc' },
      })

      const refundOrders = orders.filter(
        (o) => o.status === 'REFUNDED' || o.status === 'REFUND_REQUESTED'
      )

      const totalIncome = orders.reduce((sum, o) => sum + o.payAmount, 0)
      const totalRefund = refundOrders.reduce((sum, o) => sum + o.payAmount, 0)
      const totalServiceFee = orders.reduce((sum, o) => {
        if (o.status === 'REFUNDED' || o.status === 'REFUND_REQUESTED') return sum
        return sum + o.payAmount * DEFAULT_SERVICE_FEE_RATE
      }, 0)

      reportData.summary = {
        totalIncome,
        totalRefund,
        totalDiscount: orders.reduce((sum, o) => sum + (o.discountAmount || 0), 0),
        totalServiceFee,
        totalMerchantIncome: totalIncome - totalRefund - totalServiceFee,
        orderCount: orders.length,
        refundOrderCount: refundOrders.length,
      }

      reportData.orderList = orders.map((order) => {
        const isRefund = order.status === 'REFUNDED' || order.status === 'REFUND_REQUESTED'
        const serviceFee = isRefund ? 0 : order.payAmount * DEFAULT_SERVICE_FEE_RATE
        return {
          orderNo: order.orderNo,
          storeName: order.store.name,
          payAmount: order.payAmount,
          discountAmount: order.discountAmount || 0,
          status: order.status,
          isRefund,
          serviceFee: serviceFee.toFixed(2),
          merchantIncome: (order.payAmount - (isRefund ? order.payAmount : 0) - serviceFee).toFixed(2),
          createdAt: order.createdAt,
        }
      })
    } else {
      return res.status(400).json(errorResponse('不支持的报表类型', 400))
    }

    res.json(successResponse(reportData, '导出成功'))
  } catch (error) {
    console.error('导出报表失败:', error)
    res.status(500).json(errorResponse('导出报表失败', 500))
  }
}
