import { Response } from 'express'
import prisma from '../lib/prisma'
import { successResponse, errorResponse } from '../utils'
import { AuthRequest } from '../middleware/auth'

export async function createReservation(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id
    const { storeId, peopleCount, reservationTime, contactName, contactPhone, remark } = req.body

    if (!userId) {
      return res.status(401).json(errorResponse('未登录', 401))
    }

    if (!storeId || !reservationTime || !contactName || !contactPhone) {
      return res.status(400).json(errorResponse('门店ID、预约时间、联系人和联系电话不能为空', 400))
    }

    const store = await prisma.store.findUnique({
      where: { id: parseInt(storeId) },
    })

    if (!store) {
      return res.status(404).json(errorResponse('门店不存在', 404))
    }

    const reservation = await prisma.reservation.create({
      data: {
        storeId: parseInt(storeId),
        userId,
        peopleCount: peopleCount || 2,
        reservationTime: new Date(reservationTime),
        contactName,
        contactPhone,
        remark,
        status: 'PENDING',
      },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
      },
    })

    return res.json(successResponse(reservation, '预约成功'))
  } catch (error) {
    console.error('创建预约失败:', error)
    return res.status(500).json(errorResponse('创建预约失败', 500))
  }
}

export async function getMyReservations(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id

    if (!userId) {
      return res.status(401).json(errorResponse('未登录', 401))
    }

    const reservations = await prisma.reservation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
        table: true,
      },
    })

    return res.json(successResponse(reservations))
  } catch (error) {
    console.error('获取我的预约列表失败:', error)
    return res.status(500).json(errorResponse('获取我的预约列表失败', 500))
  }
}

export async function getReservationDetail(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params
    const reservationId = parseInt(id)

    if (isNaN(reservationId)) {
      return res.status(400).json(errorResponse('无效的预约ID', 400))
    }

    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
          },
        },
        user: {
          select: {
            id: true,
            nickname: true,
            phone: true,
          },
        },
        table: true,
      },
    })

    if (!reservation) {
      return res.status(404).json(errorResponse('预约记录不存在', 404))
    }

    return res.json(successResponse(reservation))
  } catch (error) {
    console.error('获取预约详情失败:', error)
    return res.status(500).json(errorResponse('获取预约详情失败', 500))
  }
}

export async function cancelReservation(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id
    const { id } = req.params
    const reservationId = parseInt(id)

    if (!userId) {
      return res.status(401).json(errorResponse('未登录', 401))
    }

    if (isNaN(reservationId)) {
      return res.status(400).json(errorResponse('无效的预约ID', 400))
    }

    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
    })

    if (!reservation) {
      return res.status(404).json(errorResponse('预约记录不存在', 404))
    }

    if (reservation.userId !== userId) {
      return res.status(403).json(errorResponse('无权限操作', 403))
    }

    if (reservation.status !== 'PENDING' && reservation.status !== 'CONFIRMED') {
      return res.status(400).json(errorResponse('当前状态无法取消', 400))
    }

    const updatedReservation = await prisma.reservation.update({
      where: { id: reservationId },
      data: { status: 'CANCELLED' },
    })

    return res.json(successResponse(updatedReservation, '取消预约成功'))
  } catch (error) {
    console.error('取消预约失败:', error)
    return res.status(500).json(errorResponse('取消预约失败', 500))
  }
}

export async function getStoreReservations(req: AuthRequest, res: Response) {
  try {
    const { storeId } = req.params
    const { status, date } = req.query

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

    const where: any = { storeId: storeIdNum }

    if (status) {
      where.status = status
    }

    if (date) {
      const dateStr = date as string
      const startOfDay = new Date(dateStr)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(dateStr)
      endOfDay.setHours(23, 59, 59, 999)
      where.reservationTime = {
        gte: startOfDay,
        lte: endOfDay,
      }
    }

    const reservations = await prisma.reservation.findMany({
      where,
      orderBy: { reservationTime: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            phone: true,
          },
        },
        table: true,
      },
    })

    return res.json(successResponse(reservations))
  } catch (error) {
    console.error('获取门店预约列表失败:', error)
    return res.status(500).json(errorResponse('获取门店预约列表失败', 500))
  }
}

export async function confirmReservation(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params
    const { tableId } = req.body
    const reservationId = parseInt(id)

    if (isNaN(reservationId)) {
      return res.status(400).json(errorResponse('无效的预约ID', 400))
    }

    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
    })

    if (!reservation) {
      return res.status(404).json(errorResponse('预约记录不存在', 404))
    }

    if (reservation.status !== 'PENDING') {
      return res.status(400).json(errorResponse('当前状态无法确认', 400))
    }

    const updateData: any = { status: 'CONFIRMED' }

    if (tableId) {
      const table = await prisma.table.findUnique({
        where: { id: parseInt(tableId) },
      })

      if (!table) {
        return res.status(404).json(errorResponse('桌号不存在', 404))
      }

      if (!table.isAvailable) {
        return res.status(400).json(errorResponse('该桌号不可用', 400))
      }

      updateData.tableId = parseInt(tableId)
    }

    const updatedReservation = await prisma.reservation.update({
      where: { id: reservationId },
      data: updateData,
      include: {
        table: true,
      },
    })

    return res.json(successResponse(updatedReservation, '确认预约成功'))
  } catch (error) {
    console.error('确认预约失败:', error)
    return res.status(500).json(errorResponse('确认预约失败', 500))
  }
}

export async function getStoreTables(req: AuthRequest, res: Response) {
  try {
    const { storeId } = req.params

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

    const tables = await prisma.table.findMany({
      where: { storeId: storeIdNum },
      orderBy: { tableNo: 'asc' },
    })

    return res.json(successResponse(tables))
  } catch (error) {
    console.error('获取桌号列表失败:', error)
    return res.status(500).json(errorResponse('获取桌号列表失败', 500))
  }
}

export async function createTable(req: AuthRequest, res: Response) {
  try {
    const { storeId } = req.params
    const { tableNo, seats, isAvailable } = req.body

    const storeIdNum = parseInt(storeId)

    if (isNaN(storeIdNum)) {
      return res.status(400).json(errorResponse('无效的门店ID', 400))
    }

    if (!tableNo) {
      return res.status(400).json(errorResponse('桌号不能为空', 400))
    }

    const store = await prisma.store.findUnique({
      where: { id: storeIdNum },
    })

    if (!store) {
      return res.status(404).json(errorResponse('门店不存在', 404))
    }

    const existingTable = await prisma.table.findFirst({
      where: {
        storeId: storeIdNum,
        tableNo,
      },
    })

    if (existingTable) {
      return res.status(400).json(errorResponse('该桌号已存在', 400))
    }

    const table = await prisma.table.create({
      data: {
        storeId: storeIdNum,
        tableNo,
        seats: seats || 4,
        isAvailable: isAvailable !== undefined ? isAvailable : true,
      },
    })

    return res.json(successResponse(table, '新增桌号成功'))
  } catch (error) {
    console.error('新增桌号失败:', error)
    return res.status(500).json(errorResponse('新增桌号失败', 500))
  }
}
