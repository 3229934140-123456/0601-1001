import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { errorResponse } from '../utils'

const JWT_SECRET = process.env.JWT_SECRET || 'food-delivery-secret-key-2024'

export interface AuthRequest extends Request {
  user?: {
    id: number
    role: string
  }
  merchant?: {
    id: number
    role: string
  }
}

export function authMiddleware(roles: string[] = []) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '')
      
      if (!token) {
        return res.status(401).json(errorResponse('未登录', 401))
      }
      
      const decoded = jwt.verify(token, JWT_SECRET) as { id: number; role: string; entityType?: string }
      
      if (roles.length > 0 && !roles.includes(decoded.role)) {
        return res.status(403).json(errorResponse('无权限访问', 403))
      }
      
      if (decoded.entityType === 'merchant' || decoded.role === 'MERCHANT') {
        req.merchant = { id: decoded.id, role: decoded.role }
        req.user = { id: decoded.id, role: decoded.role }
      } else {
        req.user = { id: decoded.id, role: decoded.role }
      }
      
      next()
    } catch (error) {
      return res.status(401).json(errorResponse('登录已过期', 401))
    }
  }
}

export function generateToken(userId: number, role: string, entityType: string = 'user'): string {
  return jwt.sign(
    { id: userId, role, entityType },
    JWT_SECRET,
    { expiresIn: '7d' }
  )
}
