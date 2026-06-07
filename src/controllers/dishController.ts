import { Request, Response } from 'express'
import prisma from '../lib/prisma'
import { successResponse, errorResponse } from '../utils'
import { AuthRequest } from '../middleware/auth'

export async function getDishesByStore(req: Request, res: Response) {
  try {
    const storeId = parseInt(req.params.storeId)

    if (isNaN(storeId)) {
      return res.status(400).json(errorResponse('门店ID无效', 400))
    }

    const categories = await prisma.category.findMany({
      where: { storeId },
      orderBy: { sort: 'asc' },
      include: {
        dishes: {
          where: { isOnSale: true },
          orderBy: { sort: 'asc' },
          include: {
            specs: true,
          },
        },
      },
    })

    res.json(successResponse(categories, '获取成功'))
  } catch (error) {
    console.error(error)
    res.status(500).json(errorResponse('获取菜品列表失败', 500))
  }
}

export async function getDishDetail(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id)

    if (isNaN(id)) {
      return res.status(400).json(errorResponse('菜品ID无效', 400))
    }

    const dish = await prisma.dish.findUnique({
      where: { id },
      include: {
        specs: true,
        category: {
          select: { id: true, name: true },
        },
        store: {
          select: { id: true, name: true },
        },
      },
    })

    if (!dish) {
      return res.status(404).json(errorResponse('菜品不存在', 404))
    }

    res.json(successResponse(dish, '获取成功'))
  } catch (error) {
    console.error(error)
    res.status(500).json(errorResponse('获取菜品详情失败', 500))
  }
}

export async function getHotDishes(req: Request, res: Response) {
  try {
    const storeId = parseInt(req.params.storeId)
    const limit = parseInt(req.query.limit as string) || 10

    if (isNaN(storeId)) {
      return res.status(400).json(errorResponse('门店ID无效', 400))
    }

    const dishes = await prisma.dish.findMany({
      where: {
        storeId,
        isOnSale: true,
      },
      orderBy: { salesCount: 'desc' },
      take: limit,
      include: {
        specs: true,
      },
    })

    res.json(successResponse(dishes, '获取成功'))
  } catch (error) {
    console.error(error)
    res.status(500).json(errorResponse('获取热门菜品失败', 500))
  }
}

export async function createDish(req: AuthRequest, res: Response) {
  try {
    const { storeId, categoryId, name, description, image, price, originalPrice, stock, isHot, isOnSale, sort, specs } = req.body

    if (!storeId || !categoryId || !name || price === undefined) {
      return res.status(400).json(errorResponse('缺少必要参数', 400))
    }

    const store = await prisma.store.findUnique({
      where: { id: storeId },
    })

    if (!store) {
      return res.status(404).json(errorResponse('门店不存在', 404))
    }

    const category = await prisma.category.findUnique({
      where: { id: categoryId },
    })

    if (!category || category.storeId !== storeId) {
      return res.status(404).json(errorResponse('分类不存在', 404))
    }

    const dish = await prisma.dish.create({
      data: {
        storeId,
        categoryId,
        name,
        description,
        image,
        price,
        originalPrice,
        stock: stock || 100,
        isHot: isHot || false,
        isOnSale: isOnSale !== undefined ? isOnSale : true,
        sort: sort || 0,
        specs: specs
          ? {
              create: specs.map((spec: any) => ({
                name: spec.name,
                options: typeof spec.options === 'string' ? spec.options : JSON.stringify(spec.options),
                isRequired: spec.isRequired || false,
              })),
            }
          : undefined,
      },
      include: {
        specs: true,
      },
    })

    res.json(successResponse(dish, '创建成功'))
  } catch (error) {
    console.error(error)
    res.status(500).json(errorResponse('创建菜品失败', 500))
  }
}

export async function updateDish(req: AuthRequest, res: Response) {
  try {
    const id = parseInt(req.params.id)
    const { categoryId, name, description, image, price, originalPrice, stock, isHot, isOnSale, sort, specs } = req.body

    if (isNaN(id)) {
      return res.status(400).json(errorResponse('菜品ID无效', 400))
    }

    const existingDish = await prisma.dish.findUnique({
      where: { id },
    })

    if (!existingDish) {
      return res.status(404).json(errorResponse('菜品不存在', 404))
    }

    if (categoryId) {
      const category = await prisma.category.findUnique({
        where: { id: categoryId },
      })
      if (!category || category.storeId !== existingDish.storeId) {
        return res.status(404).json(errorResponse('分类不存在', 404))
      }
    }

    const dish = await prisma.dish.update({
      where: { id },
      data: {
        categoryId,
        name,
        description,
        image,
        price,
        originalPrice,
        stock,
        isHot,
        isOnSale,
        sort,
      },
      include: {
        specs: true,
      },
    })

    if (specs && Array.isArray(specs)) {
      await prisma.dishSpec.deleteMany({
        where: { dishId: id },
      })

      for (const spec of specs) {
        await prisma.dishSpec.create({
          data: {
            dishId: id,
            name: spec.name,
            options: typeof spec.options === 'string' ? spec.options : JSON.stringify(spec.options),
            isRequired: spec.isRequired || false,
          },
        })
      }
    }

    const updatedDish = await prisma.dish.findUnique({
      where: { id },
      include: { specs: true },
    })

    res.json(successResponse(updatedDish, '更新成功'))
  } catch (error) {
    console.error(error)
    res.status(500).json(errorResponse('更新菜品失败', 500))
  }
}

export async function deleteDish(req: AuthRequest, res: Response) {
  try {
    const id = parseInt(req.params.id)

    if (isNaN(id)) {
      return res.status(400).json(errorResponse('菜品ID无效', 400))
    }

    const existingDish = await prisma.dish.findUnique({
      where: { id },
    })

    if (!existingDish) {
      return res.status(404).json(errorResponse('菜品不存在', 404))
    }

    await prisma.dishSpec.deleteMany({
      where: { dishId: id },
    })

    await prisma.dish.delete({
      where: { id },
    })

    res.json(successResponse(null, '删除成功'))
  } catch (error) {
    console.error(error)
    res.status(500).json(errorResponse('删除菜品失败', 500))
  }
}

export async function decreaseStock(req: Request, res: Response) {
  try {
    const { dishId, quantity } = req.body

    if (!dishId || !quantity) {
      return res.status(400).json(errorResponse('缺少必要参数', 400))
    }

    const dish = await prisma.dish.findUnique({
      where: { id: dishId },
    })

    if (!dish) {
      return res.status(404).json(errorResponse('菜品不存在', 404))
    }

    if (dish.stock < quantity) {
      return res.status(400).json(errorResponse('库存不足', 400))
    }

    const updatedDish = await prisma.dish.update({
      where: { id: dishId },
      data: {
        stock: {
          decrement: quantity,
        },
        salesCount: {
          increment: quantity,
        },
      },
    })

    res.json(successResponse(updatedDish, '库存扣减成功'))
  } catch (error) {
    console.error(error)
    res.status(500).json(errorResponse('库存扣减失败', 500))
  }
}
