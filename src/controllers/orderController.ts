import { Response } from 'express'
import prisma from '../lib/prisma'
import { successResponse, errorResponse, generateOrderNo, calculateBestPromotion } from '../utils'
import { AuthRequest } from '../middleware/auth'

export async function createOrder(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id
    const {
      storeId,
      items,
      type = 'delivery',
      tableNo,
      address,
      contactName,
      contactPhone,
      remark,
      invoiceInfo,
    } = req.body

    if (!userId) {
      return res.status(401).json(errorResponse('未登录', 401))
    }

    if (!storeId || !items || items.length === 0) {
      return res.status(400).json(errorResponse('门店ID和商品列表不能为空', 400))
    }

    if (type === 'delivery' && (!address || !contactName || !contactPhone)) {
      return res.status(400).json(errorResponse('配送订单需要填写地址、联系人和电话', 400))
    }

    if (type === 'dineIn' && !tableNo) {
      return res.status(400).json(errorResponse('堂食订单需要填写桌号', 400))
    }

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      include: {
        promotions: {
          where: {
            type: 'full_reduce',
            isActive: true,
          },
          orderBy: { minAmount: 'asc' },
        },
      },
    })

    if (!store) {
      return res.status(404).json(errorResponse('门店不存在', 404))
    }

    const dishIds = items.map((item: any) => item.dishId)
    const dishes = await prisma.dish.findMany({
      where: { id: { in: dishIds } },
    })

    if (dishes.length !== dishIds.length) {
      return res.status(400).json(errorResponse('存在无效的菜品', 400))
    }

    let totalAmount = 0
    const orderItemsData: any[] = []

    for (const item of items) {
      const dish = dishes.find((d: any) => d.id === item.dishId)
      if (!dish) continue

      if (!dish.isOnSale) {
        return res.status(400).json(errorResponse(`菜品"${dish.name}"已下架`, 400))
      }

      if (dish.stock < item.quantity) {
        return res.status(400).json(errorResponse(`菜品"${dish.name}"库存不足`, 400))
      }

      const itemTotal = dish.price * item.quantity
      totalAmount += itemTotal

      orderItemsData.push({
        dishId: dish.id,
        dishName: dish.name,
        dishImage: dish.image,
        price: dish.price,
        quantity: item.quantity,
        specs: item.specs ? JSON.stringify(item.specs) : null,
        remark: item.remark || null,
      })
    }

    const promotions = store.promotions.map((p: any) => ({
      minAmount: p.minAmount,
      discount: p.discount,
    }))

    const promoResult = calculateBestPromotion(totalAmount, promotions)
    const discountAmount = promoResult.discount
    const deliveryFee = type === 'delivery' ? store.deliveryFee : 0
    const payAmount = totalAmount - discountAmount + deliveryFee

    if (totalAmount < store.minOrderAmount) {
      return res.status(400).json(errorResponse(`未达到起送价${store.minOrderAmount}元`, 400))
    }

    const orderNo = generateOrderNo()
    const invoiceInfoStr = invoiceInfo ? JSON.stringify(invoiceInfo) : null

    const order = await prisma.$transaction(async (tx: any) => {
      const newOrder = await tx.order.create({
        data: {
          orderNo,
          userId,
          storeId,
          totalAmount,
          discountAmount,
          deliveryFee,
          payAmount,
          status: 'PENDING',
          type,
          tableNo,
          address,
          contactName,
          contactPhone,
          remark,
          invoiceInfo: invoiceInfoStr,
          items: {
            create: orderItemsData,
          },
        },
        include: {
          items: true,
        },
      })

      for (const item of items) {
        await tx.dish.update({
          where: { id: item.dishId },
          data: {
            stock: { decrement: item.quantity },
            salesCount: { increment: item.quantity },
          },
        })
      }

      await tx.cartItem.deleteMany({
        where: {
          userId,
          storeId,
        },
      })

      return newOrder
    })

    res.json(successResponse({
      ...order,
      usedPromotion: promoResult.usedPromotion,
      availablePromotions: promoResult.availablePromotions,
    }, '创建订单成功'))
  } catch (error) {
    console.error('创建订单失败:', error)
    res.status(500).json(errorResponse('创建订单失败', 500))
  }
}

export async function getOrders(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id
    const { status, page = '1', pageSize = '10' } = req.query

    if (!userId) {
      return res.status(401).json(errorResponse('未登录', 401))
    }

    const pageNum = parseInt(page as string)
    const pageSizeNum = parseInt(pageSize as string)
    const skip = (pageNum - 1) * pageSizeNum

    const where: any = { userId }

    if (status) {
      where.status = status
    }

    const orders = await prisma.order.findMany({
      where,
      skip,
      take: pageSizeNum,
      include: {
        items: true,
        store: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const total = await prisma.order.count({ where })

    res.json(successResponse({
      list: orders,
      total,
      page: pageNum,
      pageSize: pageSizeNum,
    }, '获取订单列表成功'))
  } catch (error) {
    console.error('获取订单列表失败:', error)
    res.status(500).json(errorResponse('获取订单列表失败', 500))
  }
}

export async function getOrderDetail(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id
    const userRole = req.user?.role
    const { id } = req.params

    if (!userId) {
      return res.status(401).json(errorResponse('未登录', 401))
    }

    const orderId = parseInt(id)

    if (isNaN(orderId)) {
      return res.status(400).json(errorResponse('无效的订单ID', 400))
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        store: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
          },
        },
        payment: true,
        refunds: true,
      },
    })

    if (!order) {
      return res.status(404).json(errorResponse('订单不存在', 404))
    }

    if (userRole === 'CUSTOMER' && order.userId !== userId) {
      return res.status(403).json(errorResponse('无权限查看', 403))
    }

    if (userRole === 'MERCHANT') {
      const store = await prisma.store.findUnique({
        where: { id: order.storeId },
      })
      if (!store || store.merchantId !== userId) {
        return res.status(403).json(errorResponse('无权限查看', 403))
      }
    }

    const orderWithParsed = {
      ...order,
      invoiceInfo: order.invoiceInfo ? JSON.parse(order.invoiceInfo) : null,
      items: order.items.map((item: any) => ({
        ...item,
        specs: item.specs ? JSON.parse(item.specs) : null,
      })),
    }

    res.json(successResponse(orderWithParsed, '获取订单详情成功'))
  } catch (error) {
    console.error('获取订单详情失败:', error)
    res.status(500).json(errorResponse('获取订单详情失败', 500))
  }
}

export async function cancelOrder(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id
    const { id } = req.params

    if (!userId) {
      return res.status(401).json(errorResponse('未登录', 401))
    }

    const orderId = parseInt(id)

    if (isNaN(orderId)) {
      return res.status(400).json(errorResponse('无效的订单ID', 400))
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    })

    if (!order) {
      return res.status(404).json(errorResponse('订单不存在', 404))
    }

    if (order.userId !== userId) {
      return res.status(403).json(errorResponse('无权限操作', 403))
    }

    if (order.status !== 'PENDING' && order.status !== 'PAID') {
      return res.status(400).json(errorResponse('当前订单状态不能取消', 400))
    }

    await prisma.$transaction(async (tx: any) => {
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'CANCELLED' },
      })

      for (const item of order.items) {
        await tx.dish.update({
          where: { id: item.dishId },
          data: {
            stock: { increment: item.quantity },
            salesCount: { decrement: item.quantity },
          },
        })
      }
    })

    res.json(successResponse(null, '取消订单成功'))
  } catch (error) {
    console.error('取消订单失败:', error)
    res.status(500).json(errorResponse('取消订单失败', 500))
  }
}

export async function payOrder(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id
    const { id } = req.params
    const { paymentMethod = 'wechat' } = req.body

    if (!userId) {
      return res.status(401).json(errorResponse('未登录', 401))
    }

    const orderId = parseInt(id)

    if (isNaN(orderId)) {
      return res.status(400).json(errorResponse('无效的订单ID', 400))
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
    })

    if (!order) {
      return res.status(404).json(errorResponse('订单不存在', 404))
    }

    if (order.userId !== userId) {
      return res.status(403).json(errorResponse('无权限操作', 403))
    }

    if (order.status !== 'PENDING') {
      return res.status(400).json(errorResponse('当前订单状态不能支付', 400))
    }

    const paymentNo = 'PAY' + generateOrderNo()

    const payment = await prisma.$transaction(async (tx: any) => {
      const newPayment = await tx.payment.create({
        data: {
          orderId,
          paymentNo,
          amount: order.payAmount,
          status: 'PAID',
          paymentMethod,
          paidAt: new Date(),
        },
      })

      await tx.order.update({
        where: { id: orderId },
        data: { status: 'PAID' },
      })

      return newPayment
    })

    res.json(successResponse(payment, '支付成功'))
  } catch (error) {
    console.error('支付失败:', error)
    res.status(500).json(errorResponse('支付失败', 500))
  }
}

export async function applyRefund(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id
    const { id } = req.params
    const { reason } = req.body

    if (!userId) {
      return res.status(401).json(errorResponse('未登录', 401))
    }

    const orderId = parseInt(id)

    if (isNaN(orderId)) {
      return res.status(400).json(errorResponse('无效的订单ID', 400))
    }

    if (!reason) {
      return res.status(400).json(errorResponse('退款原因不能为空', 400))
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
    })

    if (!order) {
      return res.status(404).json(errorResponse('订单不存在', 404))
    }

    if (order.userId !== userId) {
      return res.status(403).json(errorResponse('无权限操作', 403))
    }

    if (order.status !== 'PAID' && order.status !== 'PREPARING' && order.status !== 'READY') {
      return res.status(400).json(errorResponse('当前订单状态不能申请退款', 400))
    }

    const refund = await prisma.$transaction(async (tx: any) => {
      const newRefund = await tx.refund.create({
        data: {
          orderId,
          reason,
          amount: order.payAmount,
          status: 'PENDING',
        },
      })

      await tx.order.update({
        where: { id: orderId },
        data: { status: 'REFUND_REQUESTED' },
      })

      return newRefund
    })

    res.json(successResponse(refund, '退款申请已提交'))
  } catch (error) {
    console.error('退款申请失败:', error)
    res.status(500).json(errorResponse('退款申请失败', 500))
  }
}

export async function getStoreOrders(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id
    const { storeId } = req.params
    const { status, page = '1', pageSize = '10' } = req.query

    if (!userId) {
      return res.status(401).json(errorResponse('未登录', 401))
    }

    const storeIdNum = parseInt(storeId)

    if (isNaN(storeIdNum)) {
      return res.status(400).json(errorResponse('无效的门店ID', 400))
    }

    const store = await prisma.store.findUnique({
      where: { id: storeIdNum },
    })

    if (!store) {
      return res.status(404).json(errorResponse('门店不存在', 404))
    }

    if (store.merchantId !== userId && req.user?.role !== 'ADMIN') {
      return res.status(403).json(errorResponse('无权限查看', 403))
    }

    const pageNum = parseInt(page as string)
    const pageSizeNum = parseInt(pageSize as string)
    const skip = (pageNum - 1) * pageSizeNum

    const where: any = { storeId: storeIdNum }

    if (status) {
      where.status = status
    }

    const orders = await prisma.order.findMany({
      where,
      skip,
      take: pageSizeNum,
      include: {
        items: true,
        user: {
          select: {
            id: true,
            nickname: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const total = await prisma.order.count({ where })

    res.json(successResponse({
      list: orders,
      total,
      page: pageNum,
      pageSize: pageSizeNum,
    }, '获取商家订单列表成功'))
  } catch (error) {
    console.error('获取商家订单列表失败:', error)
    res.status(500).json(errorResponse('获取商家订单列表失败', 500))
  }
}

export async function updateOrderStatus(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id
    const { id } = req.params
    const { status } = req.body

    if (!userId) {
      return res.status(401).json(errorResponse('未登录', 401))
    }

    const orderId = parseInt(id)

    if (isNaN(orderId)) {
      return res.status(400).json(errorResponse('无效的订单ID', 400))
    }

    if (!status) {
      return res.status(400).json(errorResponse('订单状态不能为空', 400))
    }

    const validStatuses = ['PREPARING', 'READY', 'DELIVERING', 'COMPLETED', 'REFUNDED', 'CANCELLED']
    if (!validStatuses.includes(status)) {
      return res.status(400).json(errorResponse('无效的订单状态', 400))
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    })

    if (!order) {
      return res.status(404).json(errorResponse('订单不存在', 404))
    }

    const store = await prisma.store.findUnique({
      where: { id: order.storeId },
    })

    if (!store || (store.merchantId !== userId && req.user?.role !== 'ADMIN')) {
      return res.status(403).json(errorResponse('无权限操作', 403))
    }

    if (status === 'COMPLETED' && order.status !== 'DELIVERING' && order.status !== 'READY') {
      return res.status(400).json(errorResponse('当前状态不能标记为已完成', 400))
    }

    if (status === 'REFUNDED' && order.status !== 'REFUND_REQUESTED') {
      return res.status(400).json(errorResponse('当前状态不能执行退款', 400))
    }

    await prisma.$transaction(async (tx: any) => {
      await tx.order.update({
        where: { id: orderId },
        data: { status },
      })

      if (status === 'REFUNDED') {
        await tx.payment.update({
          where: { orderId },
          data: { status: 'REFUNDED' },
        })

        await tx.refund.updateMany({
          where: { orderId, status: 'PENDING' },
          data: { status: 'APPROVED' },
        })

        for (const item of order.items) {
          await tx.dish.update({
            where: { id: item.dishId },
            data: {
              stock: { increment: item.quantity },
              salesCount: { decrement: item.quantity },
            },
          })
        }
      }
    })

    res.json(successResponse(null, '订单状态更新成功'))
  } catch (error) {
    console.error('更新订单状态失败:', error)
    res.status(500).json(errorResponse('更新订单状态失败', 500))
  }
}

export async function remindOrder(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id
    const { id } = req.params

    if (!userId) {
      return res.status(401).json(errorResponse('未登录', 401))
    }

    const orderId = parseInt(id)

    if (isNaN(orderId)) {
      return res.status(400).json(errorResponse('无效的订单ID', 400))
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
    })

    if (!order) {
      return res.status(404).json(errorResponse('订单不存在', 404))
    }

    const store = await prisma.store.findUnique({
      where: { id: order.storeId },
    })

    if (!store || (store.merchantId !== userId && req.user?.role !== 'ADMIN')) {
      return res.status(403).json(errorResponse('无权限操作', 403))
    }

    if (order.status !== 'PREPARING') {
      return res.status(400).json(errorResponse('当前订单状态不能出餐', 400))
    }

    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'READY' },
    })

    res.json(successResponse(null, '出餐提醒已发送'))
  } catch (error) {
    console.error('出餐提醒失败:', error)
    res.status(500).json(errorResponse('出餐提醒失败', 500))
  }
}
