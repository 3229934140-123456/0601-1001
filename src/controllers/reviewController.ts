import { Response } from 'express'
import prisma from '../lib/prisma'
import { successResponse, errorResponse } from '../utils'
import { AuthRequest } from '../middleware/auth'

export async function createReview(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id

    if (!userId) {
      return res.status(401).json(errorResponse('未登录', 401))
    }

    const { orderId, storeId, rating, content, images } = req.body

    if (!orderId || !storeId || !rating) {
      return res.status(400).json(errorResponse('订单ID、门店ID和评分不能为空', 400))
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json(errorResponse('评分必须在1-5之间', 400))
    }

    const order = await prisma.order.findUnique({
      where: { id: parseInt(orderId) },
      include: { items: true },
    })

    if (!order) {
      return res.status(404).json(errorResponse('订单不存在', 404))
    }

    if (order.userId !== userId) {
      return res.status(403).json(errorResponse('只能评价自己的订单', 403))
    }

    const existingReview = await prisma.review.findUnique({
      where: { orderId: parseInt(orderId) },
    })

    if (existingReview) {
      return res.status(400).json(errorResponse('该订单已评价', 400))
    }

    const review = await prisma.review.create({
      data: {
        orderId: parseInt(orderId),
        userId,
        storeId: parseInt(storeId),
        rating: parseInt(rating),
        content,
        images: images ? JSON.stringify(images) : undefined,
        status: 'APPROVED',
      },
    })

    const storeReviews = await prisma.review.findMany({
      where: {
        storeId: parseInt(storeId),
        status: 'APPROVED',
      },
      select: { rating: true },
    })

    const avgRating = storeReviews.length > 0
      ? storeReviews.reduce((sum: number, r: typeof storeReviews[0]) => sum + r.rating, 0) / storeReviews.length
      : 5.0

    await prisma.store.update({
      where: { id: parseInt(storeId) },
      data: { rating: parseFloat(avgRating.toFixed(1)) },
    })

    res.json(successResponse(review, '评价发布成功'))
  } catch (error) {
    console.error(error)
    res.status(500).json(errorResponse('发布评价失败', 500))
  }
}

export async function getStoreReviews(req: AuthRequest, res: Response) {
  try {
    const { storeId } = req.params
    const { rating, page = '1', pageSize = '10' } = req.query

    const pageNum = parseInt(page as string)
    const pageSizeNum = parseInt(pageSize as string)
    const skip = (pageNum - 1) * pageSizeNum

    const where: any = {
      storeId: parseInt(storeId),
      status: 'APPROVED',
    }

    if (rating) {
      where.rating = parseInt(rating as string)
    }

    const reviews = await prisma.review.findMany({
      where,
      skip,
      take: pageSizeNum,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            avatar: true,
          },
        },
      },
    })

    const reviewsWithImages = reviews.map((review: typeof reviews[0]) => ({
      ...review,
      images: review.images ? JSON.parse(review.images) : [],
    }))

    const total = await prisma.review.count({ where })

    res.json(successResponse({
      list: reviewsWithImages,
      total,
      page: pageNum,
      pageSize: pageSizeNum,
    }))
  } catch (error) {
    console.error(error)
    res.status(500).json(errorResponse('获取门店评价失败', 500))
  }
}

export async function getMyReviews(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id

    if (!userId) {
      return res.status(401).json(errorResponse('未登录', 401))
    }

    const { page = '1', pageSize = '10' } = req.query

    const pageNum = parseInt(page as string)
    const pageSizeNum = parseInt(pageSize as string)
    const skip = (pageNum - 1) * pageSizeNum

    const reviews = await prisma.review.findMany({
      where: { userId },
      skip,
      take: pageSizeNum,
      orderBy: { createdAt: 'desc' },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            coverImage: true,
          },
        },
      },
    })

    const reviewsWithImages = reviews.map((review: typeof reviews[0]) => ({
      ...review,
      images: review.images ? JSON.parse(review.images) : [],
    }))

    const total = await prisma.review.count({ where: { userId } })

    res.json(successResponse({
      list: reviewsWithImages,
      total,
      page: pageNum,
      pageSize: pageSizeNum,
    }))
  } catch (error) {
    console.error(error)
    res.status(500).json(errorResponse('获取我的评价失败', 500))
  }
}

export async function getReviewDetail(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params
    const reviewId = parseInt(id)

    if (isNaN(reviewId)) {
      return res.status(400).json(errorResponse('无效的评价ID', 400))
    }

    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            avatar: true,
          },
        },
        store: {
          select: {
            id: true,
            name: true,
            coverImage: true,
          },
        },
      },
    })

    if (!review) {
      return res.status(404).json(errorResponse('评价不存在', 404))
    }

    const reviewWithImages = {
      ...review,
      images: review.images ? JSON.parse(review.images) : [],
    }

    res.json(successResponse(reviewWithImages))
  } catch (error) {
    console.error(error)
    res.status(500).json(errorResponse('获取评价详情失败', 500))
  }
}

export async function appealReview(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id
    const userRole = req.user?.role

    if (!userId) {
      return res.status(401).json(errorResponse('未登录', 401))
    }

    const { id } = req.params
    const { appealReason } = req.body

    if (!appealReason) {
      return res.status(400).json(errorResponse('申诉理由不能为空', 400))
    }

    const reviewId = parseInt(id)

    if (isNaN(reviewId)) {
      return res.status(400).json(errorResponse('无效的评价ID', 400))
    }

    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      include: { store: true },
    })

    if (!review) {
      return res.status(404).json(errorResponse('评价不存在', 404))
    }

    if (review.isAppealed) {
      return res.status(400).json(errorResponse('该评价已申诉', 400))
    }

    if (userRole === 'MERCHANT') {
      const store = await prisma.store.findUnique({
        where: { id: review.storeId },
      })
      if (store?.merchantId !== userId) {
        return res.status(403).json(errorResponse('只能申诉自己门店的评价', 403))
      }
    } else if (userRole !== 'ADMIN') {
      return res.status(403).json(errorResponse('无权限申诉', 403))
    }

    const updatedReview = await prisma.review.update({
      where: { id: reviewId },
      data: {
        isAppealed: true,
        appealReason,
        status: 'APPEALED',
      },
    })

    res.json(successResponse(updatedReview, '申诉提交成功'))
  } catch (error) {
    console.error(error)
    res.status(500).json(errorResponse('申诉失败', 500))
  }
}

export async function replyAppeal(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params
    const { appealReply, status } = req.body

    if (!appealReply) {
      return res.status(400).json(errorResponse('申诉回复不能为空', 400))
    }

    const reviewId = parseInt(id)

    if (isNaN(reviewId)) {
      return res.status(400).json(errorResponse('无效的评价ID', 400))
    }

    const review = await prisma.review.findUnique({
      where: { id: reviewId },
    })

    if (!review) {
      return res.status(404).json(errorResponse('评价不存在', 404))
    }

    if (!review.isAppealed) {
      return res.status(400).json(errorResponse('该评价未申诉', 400))
    }

    if (status && !['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json(errorResponse('无效的状态值', 400))
    }

    const updatedReview = await prisma.review.update({
      where: { id: reviewId },
      data: {
        appealReply,
        status: status || 'APPROVED',
      },
    })

    res.json(successResponse(updatedReview, '申诉回复成功'))
  } catch (error) {
    console.error(error)
    res.status(500).json(errorResponse('回复申诉失败', 500))
  }
}

export async function getHotDishes(req: AuthRequest, res: Response) {
  try {
    const { storeId } = req.params
    const { limit = '10' } = req.query

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

    const dishes = await prisma.dish.findMany({
      where: {
        storeId: storeIdNum,
        isOnSale: true,
      },
      orderBy: [
        { salesCount: 'desc' },
        { isHot: 'desc' },
      ],
      take: parseInt(limit as string),
    })

    const dishIds = dishes.map((d: typeof dishes[0]) => d.id)

    const orderItems = await prisma.orderItem.findMany({
      where: {
        dishId: { in: dishIds },
        order: {
          storeId: storeIdNum,
          status: { not: 'CANCELLED' },
        },
      },
      select: {
        dishId: true,
        quantity: true,
      },
    })

    const salesMap: Record<number, number> = {}
    orderItems.forEach((item: typeof orderItems[0]) => {
      salesMap[item.dishId] = (salesMap[item.dishId] || 0) + item.quantity
    })

    const hotDishes = dishes.map((dish: typeof dishes[0]) => ({
      ...dish,
      realSalesCount: salesMap[dish.id] || dish.salesCount,
    }))

    hotDishes.sort((a: typeof hotDishes[0], b: typeof hotDishes[0]) => b.realSalesCount - a.realSalesCount)

    res.json(successResponse(hotDishes))
  } catch (error) {
    console.error(error)
    res.status(500).json(errorResponse('获取热门菜品失败', 500))
  }
}
