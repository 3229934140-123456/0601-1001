import { Request, Response } from 'express'
import prisma from '../lib/prisma'
import { successResponse, errorResponse } from '../utils'
import { AuthRequest } from '../middleware/auth'

async function checkStorePermission(req: AuthRequest, storeId: number): Promise<{ allowed: boolean; status?: number; message?: string }> {
  const userId = req.user?.id
  const userRole = req.user?.role

  if (!userId) {
    return { allowed: false, status: 401, message: '未登录' }
  }

  const store = await prisma.store.findUnique({
    where: { id: storeId },
  })

  if (!store) {
    return { allowed: false, status: 404, message: '门店不存在' }
  }

  if (userRole === 'MERCHANT') {
    if (store.merchantId !== userId) {
      return { allowed: false, status: 403, message: '无权限操作' }
    }
  }

  return { allowed: true }
}

export async function getPromotionsByStore(req: Request, res: Response) {
  try {
    const storeId = parseInt(req.params.storeId)

    if (isNaN(storeId)) {
      return res.status(400).json(errorResponse('门店ID无效', 400))
    }

    const promotions = await prisma.promotion.findMany({
      where: {
        storeId,
        isActive: true,
      },
      orderBy: { minAmount: 'asc' },
    })

    res.json(successResponse(promotions, '获取成功'))
  } catch (error) {
    console.error(error)
    res.status(500).json(errorResponse('获取促销列表失败', 500))
  }
}

export async function getPromotionsManageList(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id
    const userRole = req.user?.role
    const { storeId, status, page = '1', pageSize = '20' } = req.query

    if (!userId) {
      return res.status(401).json(errorResponse('未登录', 401))
    }

    const pageNum = parseInt(page as string)
    const pageSizeNum = parseInt(pageSize as string)
    const skip = (pageNum - 1) * pageSizeNum

    const where: any = {}

    if (storeId) {
      const storeIdNum = parseInt(storeId as string)
      if (isNaN(storeIdNum)) {
        return res.status(400).json(errorResponse('无效的门店ID', 400))
      }
      where.storeId = storeIdNum

      const permissionCheck = await checkStorePermission(req, storeIdNum)
      if (!permissionCheck.allowed) {
        return res.status(permissionCheck.status!).json(errorResponse(permissionCheck.message!, permissionCheck.status!))
      }
    } else if (userRole === 'MERCHANT') {
      const merchantStores = await prisma.store.findMany({
        where: { merchantId: userId },
        select: { id: true },
      })
      const storeIds = merchantStores.map((s) => s.id)
      if (storeIds.length === 0) {
        return res.json(successResponse({ list: [], total: 0, page: pageNum, pageSize: pageSizeNum }))
      }
      where.storeId = { in: storeIds }
    }

    if (status !== undefined && status !== null && status !== '') {
      if (status === 'active') {
        where.isActive = true
      } else if (status === 'inactive') {
        where.isActive = false
      }
    }

    const promotions = await prisma.promotion.findMany({
      where,
      skip,
      take: pageSizeNum,
      orderBy: { createdAt: 'desc' },
      include: {
        store: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    const total = await prisma.promotion.count({ where })

    res.json(successResponse({
      list: promotions,
      total,
      page: pageNum,
      pageSize: pageSizeNum,
    }, '获取成功'))
  } catch (error) {
    console.error('获取促销管理列表失败:', error)
    res.status(500).json(errorResponse('获取促销管理列表失败', 500))
  }
}

export async function createPromotion(req: AuthRequest, res: Response) {
  try {
    const { storeId, type, minAmount, discount, isActive } = req.body

    if (!storeId || !type || minAmount === undefined || discount === undefined) {
      return res.status(400).json(errorResponse('缺少必要参数', 400))
    }

    const storeIdNum = parseInt(storeId)
    const minAmountNum = parseFloat(minAmount)
    const discountNum = parseFloat(discount)

    if (isNaN(storeIdNum) || isNaN(minAmountNum) || isNaN(discountNum)) {
      return res.status(400).json(errorResponse('参数格式错误', 400))
    }

    const permissionCheck = await checkStorePermission(req, storeIdNum)
    if (!permissionCheck.allowed) {
      return res.status(permissionCheck.status!).json(errorResponse(permissionCheck.message!, permissionCheck.status!))
    }

    const promotion = await prisma.promotion.create({
      data: {
        storeId: storeIdNum,
        type,
        minAmount: minAmountNum,
        discount: discountNum,
        isActive: isActive !== undefined ? isActive : true,
      },
    })

    res.json(successResponse(promotion, '创建成功'))
  } catch (error) {
    console.error(error)
    res.status(500).json(errorResponse('创建促销失败', 500))
  }
}

export async function updatePromotion(req: AuthRequest, res: Response) {
  try {
    const id = parseInt(req.params.id)
    const { type, minAmount, discount, isActive } = req.body

    if (isNaN(id)) {
      return res.status(400).json(errorResponse('促销ID无效', 400))
    }

    const existingPromotion = await prisma.promotion.findUnique({
      where: { id },
    })

    if (!existingPromotion) {
      return res.status(404).json(errorResponse('促销不存在', 404))
    }

    const permissionCheck = await checkStorePermission(req, existingPromotion.storeId)
    if (!permissionCheck.allowed) {
      return res.status(permissionCheck.status!).json(errorResponse(permissionCheck.message!, permissionCheck.status!))
    }

    const updateData: any = {}
    if (type !== undefined) updateData.type = type
    if (minAmount !== undefined) updateData.minAmount = parseFloat(minAmount)
    if (discount !== undefined) updateData.discount = parseFloat(discount)
    if (isActive !== undefined) updateData.isActive = isActive

    const promotion = await prisma.promotion.update({
      where: { id },
      data: updateData,
    })

    res.json(successResponse(promotion, '更新成功'))
  } catch (error) {
    console.error(error)
    res.status(500).json(errorResponse('更新促销失败', 500))
  }
}

export async function deletePromotion(req: AuthRequest, res: Response) {
  try {
    const id = parseInt(req.params.id)

    if (isNaN(id)) {
      return res.status(400).json(errorResponse('促销ID无效', 400))
    }

    const existingPromotion = await prisma.promotion.findUnique({
      where: { id },
    })

    if (!existingPromotion) {
      return res.status(404).json(errorResponse('促销不存在', 404))
    }

    const permissionCheck = await checkStorePermission(req, existingPromotion.storeId)
    if (!permissionCheck.allowed) {
      return res.status(permissionCheck.status!).json(errorResponse(permissionCheck.message!, permissionCheck.status!))
    }

    await prisma.promotion.delete({
      where: { id },
    })

    res.json(successResponse(null, '删除成功'))
  } catch (error) {
    console.error(error)
    res.status(500).json(errorResponse('删除促销失败', 500))
  }
}

export async function togglePromotion(req: AuthRequest, res: Response) {
  try {
    const id = parseInt(req.params.id)

    if (isNaN(id)) {
      return res.status(400).json(errorResponse('促销ID无效', 400))
    }

    const existingPromotion = await prisma.promotion.findUnique({
      where: { id },
    })

    if (!existingPromotion) {
      return res.status(404).json(errorResponse('促销不存在', 404))
    }

    const permissionCheck = await checkStorePermission(req, existingPromotion.storeId)
    if (!permissionCheck.allowed) {
      return res.status(permissionCheck.status!).json(errorResponse(permissionCheck.message!, permissionCheck.status!))
    }

    const promotion = await prisma.promotion.update({
      where: { id },
      data: {
        isActive: !existingPromotion.isActive,
      },
    })

    res.json(successResponse(promotion, promotion.isActive ? '已启用' : '已停用'))
  } catch (error) {
    console.error(error)
    res.status(500).json(errorResponse('操作失败', 500))
  }
}
