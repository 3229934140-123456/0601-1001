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
