import { Response } from 'express'
import prisma from '../lib/prisma'
import { successResponse, errorResponse, generateQueueNumber } from '../utils'
import { AuthRequest } from '../middleware/auth'

export async function takeQueueNumber(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id
    const { storeId, queueType, peopleCount } = req.body

    if (!userId) {
      return res.status(401).json(errorResponse('未登录', 401))
    }

    if (!storeId || !queueType) {
      return res.status(400).json(errorResponse('门店ID和排队类型不能为空', 400))
    }

    const validTypes = ['small', 'medium', 'large']
    if (!validTypes.includes(queueType)) {
      return res.status(400).json(errorResponse('无效的排队类型', 400))
    }

    const store = await prisma.store.findUnique({
      where: { id: parseInt(storeId) },
    })

    if (!store) {
      return res.status(404).json(errorResponse('门店不存在', 404))
    }

    const existingQueue = await prisma.queueNumber.findFirst({
      where: {
        userId,
        storeId: parseInt(storeId),
        status: {
          in: ['WAITING', 'CALLED'],
        },
      },
    })

    if (existingQueue) {
      return res.status(400).json(errorResponse('您已在该门店排队中', 400))
    }

    const number = generateQueueNumber()

    const queue = await prisma.queueNumber.create({
      data: {
        storeId: parseInt(storeId),
        userId,
        queueType,
        number,
        peopleCount: peopleCount || 2,
        status: 'WAITING',
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

    const waitingCount = await prisma.queueNumber.count({
      where: {
        storeId: parseInt(storeId),
        queueType,
        status: 'WAITING',
        id: {
          lt: queue.id,
        },
      },
    })

    return res.json(successResponse({
      ...queue,
      waitingCount,
    }, '取号成功'))
  } catch (error) {
    console.error('取号失败:', error)
    return res.status(500).json(errorResponse('取号失败', 500))
  }
}

export async function getMyQueues(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id

    if (!userId) {
      return res.status(401).json(errorResponse('未登录', 401))
    }

    const queues = await prisma.queueNumber.findMany({
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
      },
    })

    return res.json(successResponse(queues))
  } catch (error) {
    console.error('获取我的排队列表失败:', error)
    return res.status(500).json(errorResponse('获取我的排队列表失败', 500))
  }
}

export async function getQueueDetail(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params
    const queueId = parseInt(id)

    if (isNaN(queueId)) {
      return res.status(400).json(errorResponse('无效的排队ID', 400))
    }

    const queue = await prisma.queueNumber.findUnique({
      where: { id: queueId },
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
      },
    })

    if (!queue) {
      return res.status(404).json(errorResponse('排队记录不存在', 404))
    }

    const waitingCount = await prisma.queueNumber.count({
      where: {
        storeId: queue.storeId,
        queueType: queue.queueType,
        status: 'WAITING',
        id: {
          lt: queueId,
        },
      },
    })

    return res.json(successResponse({
      ...queue,
      waitingCount,
    }))
  } catch (error) {
    console.error('获取排队详情失败:', error)
    return res.status(500).json(errorResponse('获取排队详情失败', 500))
  }
}

export async function cancelQueue(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id
    const { id } = req.params
    const queueId = parseInt(id)

    if (!userId) {
      return res.status(401).json(errorResponse('未登录', 401))
    }

    if (isNaN(queueId)) {
      return res.status(400).json(errorResponse('无效的排队ID', 400))
    }

    const queue = await prisma.queueNumber.findUnique({
      where: { id: queueId },
    })

    if (!queue) {
      return res.status(404).json(errorResponse('排队记录不存在', 404))
    }

    if (queue.userId !== userId) {
      return res.status(403).json(errorResponse('无权限操作', 403))
    }

    if (queue.status !== 'WAITING') {
      return res.status(400).json(errorResponse('当前状态无法取消', 400))
    }

    const updatedQueue = await prisma.queueNumber.update({
      where: { id: queueId },
      data: { status: 'CANCELLED' },
    })

    return res.json(successResponse(updatedQueue, '取消排队成功'))
  } catch (error) {
    console.error('取消排队失败:', error)
    return res.status(500).json(errorResponse('取消排队失败', 500))
  }
}

export async function getStoreQueues(req: AuthRequest, res: Response) {
  try {
    const { storeId } = req.params
    const { status, queueType } = req.query

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

    if (queueType) {
      where.queueType = queueType
    }

    const queues = await prisma.queueNumber.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            phone: true,
          },
        },
      },
    })

    return res.json(successResponse(queues))
  } catch (error) {
    console.error('获取门店排队列表失败:', error)
    return res.status(500).json(errorResponse('获取门店排队列表失败', 500))
  }
}

export async function callQueueNumber(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params
    const queueId = parseInt(id)

    if (isNaN(queueId)) {
      return res.status(400).json(errorResponse('无效的排队ID', 400))
    }

    const queue = await prisma.queueNumber.findUnique({
      where: { id: queueId },
    })

    if (!queue) {
      return res.status(404).json(errorResponse('排队记录不存在', 404))
    }

    if (queue.status !== 'WAITING') {
      return res.status(400).json(errorResponse('当前状态无法叫号', 400))
    }

    const updatedQueue = await prisma.queueNumber.update({
      where: { id: queueId },
      data: {
        status: 'CALLED',
        calledAt: new Date(),
      },
    })

    return res.json(successResponse(updatedQueue, '叫号成功'))
  } catch (error) {
    console.error('叫号失败:', error)
    return res.status(500).json(errorResponse('叫号失败', 500))
  }
}

export async function serveQueueNumber(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params
    const queueId = parseInt(id)

    if (isNaN(queueId)) {
      return res.status(400).json(errorResponse('无效的排队ID', 400))
    }

    const queue = await prisma.queueNumber.findUnique({
      where: { id: queueId },
    })

    if (!queue) {
      return res.status(404).json(errorResponse('排队记录不存在', 404))
    }

    if (queue.status !== 'CALLED') {
      return res.status(400).json(errorResponse('当前状态无法完成叫号', 400))
    }

    const updatedQueue = await prisma.queueNumber.update({
      where: { id: queueId },
      data: { status: 'SERVED' },
    })

    return res.json(successResponse(updatedQueue, '完成叫号成功'))
  } catch (error) {
    console.error('完成叫号失败:', error)
    return res.status(500).json(errorResponse('完成叫号失败', 500))
  }
}
