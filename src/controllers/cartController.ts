import { Response } from 'express'
import prisma from '../lib/prisma'
import { successResponse, errorResponse, calculateBestPromotion } from '../utils'
import { AuthRequest } from '../middleware/auth'

export async function getCart(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id

    if (!userId) {
      return res.status(401).json(errorResponse('未登录', 401))
    }

    const cartItems = await prisma.cartItem.findMany({
      where: { userId },
      include: {
        dish: true,
        store: {
          select: {
            id: true,
            name: true,
            deliveryFee: true,
            minOrderAmount: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const storeGroups: Record<number, any> = {}

    for (const item of cartItems) {
      const storeId = item.storeId

      if (!storeGroups[storeId]) {
        storeGroups[storeId] = {
          storeId,
          storeName: item.store.name,
          deliveryFee: item.store.deliveryFee,
          minOrderAmount: item.store.minOrderAmount,
          items: [],
          totalAmount: 0,
        }
      }

      const itemTotal = item.dish.price * item.quantity
      storeGroups[storeId].totalAmount += itemTotal
      storeGroups[storeId].items.push({
        id: item.id,
        dishId: item.dishId,
        dishName: item.dish.name,
        dishImage: item.dish.image,
        price: item.dish.price,
        quantity: item.quantity,
        specs: item.specs ? JSON.parse(item.specs) : null,
        remark: item.remark,
      })
    }

    const cartList = Object.values(storeGroups)

    res.json(successResponse(cartList, '获取购物车成功'))
  } catch (error) {
    console.error('获取购物车失败:', error)
    res.status(500).json(errorResponse('获取购物车失败', 500))
  }
}

export async function addToCart(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id
    const { dishId, quantity = 1, specs, remark } = req.body

    if (!userId) {
      return res.status(401).json(errorResponse('未登录', 401))
    }

    if (!dishId) {
      return res.status(400).json(errorResponse('菜品ID不能为空', 400))
    }

    const dish = await prisma.dish.findUnique({
      where: { id: dishId },
    })

    if (!dish) {
      return res.status(404).json(errorResponse('菜品不存在', 404))
    }

    if (!dish.isOnSale) {
      return res.status(400).json(errorResponse('菜品已下架', 400))
    }

    const specsStr = specs ? JSON.stringify(specs) : null

    const existingCartItem = await prisma.cartItem.findFirst({
      where: {
        userId,
        dishId,
        specs: specsStr,
      },
    })

    let cartItem

    if (existingCartItem) {
      cartItem = await prisma.cartItem.update({
        where: { id: existingCartItem.id },
        data: {
          quantity: existingCartItem.quantity + quantity,
          remark: remark || existingCartItem.remark,
        },
        include: { dish: true },
      })
    } else {
      cartItem = await prisma.cartItem.create({
        data: {
          userId,
          storeId: dish.storeId,
          dishId,
          quantity,
          specs: specsStr,
          remark,
        },
        include: { dish: true },
      })
    }

    res.json(successResponse(cartItem, '添加购物车成功'))
  } catch (error) {
    console.error('添加购物车失败:', error)
    res.status(500).json(errorResponse('添加购物车失败', 500))
  }
}

export async function updateCartItemQuantity(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id
    const { id } = req.params
    const { quantity } = req.body

    if (!userId) {
      return res.status(401).json(errorResponse('未登录', 401))
    }

    const cartItemId = parseInt(id)

    if (isNaN(cartItemId)) {
      return res.status(400).json(errorResponse('无效的购物车项ID', 400))
    }

    if (!quantity || quantity <= 0) {
      return res.status(400).json(errorResponse('数量必须大于0', 400))
    }

    const cartItem = await prisma.cartItem.findUnique({
      where: { id: cartItemId },
    })

    if (!cartItem) {
      return res.status(404).json(errorResponse('购物车项不存在', 404))
    }

    if (cartItem.userId !== userId) {
      return res.status(403).json(errorResponse('无权限操作', 403))
    }

    const updatedCartItem = await prisma.cartItem.update({
      where: { id: cartItemId },
      data: { quantity },
      include: { dish: true },
    })

    res.json(successResponse(updatedCartItem, '更新数量成功'))
  } catch (error) {
    console.error('更新购物车数量失败:', error)
    res.status(500).json(errorResponse('更新购物车数量失败', 500))
  }
}

export async function removeFromCart(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id
    const { id } = req.params

    if (!userId) {
      return res.status(401).json(errorResponse('未登录', 401))
    }

    const cartItemId = parseInt(id)

    if (isNaN(cartItemId)) {
      return res.status(400).json(errorResponse('无效的购物车项ID', 400))
    }

    const cartItem = await prisma.cartItem.findUnique({
      where: { id: cartItemId },
    })

    if (!cartItem) {
      return res.status(404).json(errorResponse('购物车项不存在', 404))
    }

    if (cartItem.userId !== userId) {
      return res.status(403).json(errorResponse('无权限操作', 403))
    }

    await prisma.cartItem.delete({
      where: { id: cartItemId },
    })

    res.json(successResponse(null, '删除商品成功'))
  } catch (error) {
    console.error('删除购物车商品失败:', error)
    res.status(500).json(errorResponse('删除购物车商品失败', 500))
  }
}

export async function clearStoreCart(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id
    const { storeId } = req.params

    if (!userId) {
      return res.status(401).json(errorResponse('未登录', 401))
    }

    const storeIdNum = parseInt(storeId)

    if (isNaN(storeIdNum)) {
      return res.status(400).json(errorResponse('无效的门店ID', 400))
    }

    await prisma.cartItem.deleteMany({
      where: {
        userId,
        storeId: storeIdNum,
      },
    })

    res.json(successResponse(null, '清空购物车成功'))
  } catch (error) {
    console.error('清空购物车失败:', error)
    res.status(500).json(errorResponse('清空购物车失败', 500))
  }
}

export async function calculateCart(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id
    const { storeId } = req.body

    if (!userId) {
      return res.status(401).json(errorResponse('未登录', 401))
    }

    if (!storeId) {
      return res.status(400).json(errorResponse('门店ID不能为空', 400))
    }

    const cartItems = await prisma.cartItem.findMany({
      where: {
        userId,
        storeId,
      },
      include: { dish: true },
    })

    if (cartItems.length === 0) {
      return res.status(400).json(errorResponse('购物车为空', 400))
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

    let totalAmount = 0

    for (const item of cartItems) {
      totalAmount += item.dish.price * item.quantity
    }

    const promotions = store.promotions.map((p: any) => ({
      minAmount: p.minAmount,
      discount: p.discount,
    }))

    const promoResult = calculateBestPromotion(totalAmount, promotions)
    const discountAmount = promoResult.discount
    const deliveryFee = store.deliveryFee
    const payAmount = totalAmount - discountAmount + deliveryFee

    res.json(successResponse({
      totalAmount,
      discountAmount,
      deliveryFee,
      payAmount,
      usedPromotion: promoResult.usedPromotion,
      availablePromotions: promoResult.availablePromotions,
      nextPromotion: promoResult.nextPromotion,
      allPromotions: promotions,
    }, '计算成功'))
  } catch (error) {
    console.error('计算购物车失败:', error)
    res.status(500).json(errorResponse('计算购物车失败', 500))
  }
}
