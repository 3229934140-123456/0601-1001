import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import prisma from '../lib/prisma'
import { generateToken, AuthRequest } from '../middleware/auth'
import { successResponse, errorResponse } from '../utils'

export async function register(req: Request, res: Response) {
  try {
    const { phone, password, nickname } = req.body

    if (!phone || !password) {
      return res.status(400).json(errorResponse('手机号和密码不能为空', 400))
    }

    const existingUser = await prisma.user.findUnique({
      where: { phone },
    })

    if (existingUser) {
      return res.status(400).json(errorResponse('该手机号已注册', 400))
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const user = await prisma.user.create({
      data: {
        phone,
        password: hashedPassword,
        nickname: nickname || `用户${phone.slice(-4)}`,
        role: 'CUSTOMER',
      },
      select: {
        id: true,
        phone: true,
        nickname: true,
        avatar: true,
        role: true,
        createdAt: true,
      },
    })

    const token = generateToken(user.id, user.role)

    return res.json(successResponse({
      user,
      token,
    }, '注册成功'))
  } catch (error) {
    console.error('注册失败:', error)
    return res.status(500).json(errorResponse('注册失败', 500))
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { phone, password } = req.body

    if (!phone || !password) {
      return res.status(400).json(errorResponse('手机号和密码不能为空', 400))
    }

    const user = await prisma.user.findUnique({
      where: { phone },
    })

    if (!user) {
      return res.status(401).json(errorResponse('手机号或密码错误', 401))
    }

    const isValidPassword = await bcrypt.compare(password, user.password)

    if (!isValidPassword) {
      return res.status(401).json(errorResponse('手机号或密码错误', 401))
    }

    const token = generateToken(user.id, user.role)

    const userData = {
      id: user.id,
      phone: user.phone,
      nickname: user.nickname,
      avatar: user.avatar,
      role: user.role,
      createdAt: user.createdAt,
    }

    return res.json(successResponse({
      user: userData,
      token,
    }, '登录成功'))
  } catch (error) {
    console.error('登录失败:', error)
    return res.status(500).json(errorResponse('登录失败', 500))
  }
}

export async function merchantLogin(req: Request, res: Response) {
  try {
    const { phone, password } = req.body

    if (!phone || !password) {
      return res.status(400).json(errorResponse('手机号和密码不能为空', 400))
    }

    const user = await prisma.user.findUnique({
      where: { phone },
    })

    if (!user) {
      return res.status(401).json(errorResponse('手机号或密码错误', 401))
    }

    if (user.role !== 'MERCHANT' && user.role !== 'ADMIN') {
      return res.status(403).json(errorResponse('无商家权限', 403))
    }

    const isValidPassword = await bcrypt.compare(password, user.password)

    if (!isValidPassword) {
      return res.status(401).json(errorResponse('手机号或密码错误', 401))
    }

    const token = generateToken(user.id, user.role)

    const userData = {
      id: user.id,
      phone: user.phone,
      nickname: user.nickname,
      avatar: user.avatar,
      role: user.role,
      createdAt: user.createdAt,
    }

    return res.json(successResponse({
      user: userData,
      token,
    }, '商家登录成功'))
  } catch (error) {
    console.error('商家登录失败:', error)
    return res.status(500).json(errorResponse('商家登录失败', 500))
  }
}

export async function getCurrentUser(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id

    if (!userId) {
      return res.status(401).json(errorResponse('未登录', 401))
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        nickname: true,
        avatar: true,
        role: true,
        createdAt: true,
      },
    })

    if (!user) {
      return res.status(404).json(errorResponse('用户不存在', 404))
    }

    return res.json(successResponse(user, '获取用户信息成功'))
  } catch (error) {
    console.error('获取用户信息失败:', error)
    return res.status(500).json(errorResponse('获取用户信息失败', 500))
  }
}
