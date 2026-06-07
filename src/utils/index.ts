export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371
  const dLat = deg2rad(lat2 - lat1)
  const dLon = deg2rad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180)
}

export function isStoreOpen(openingTime: string, closingTime: string): boolean {
  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  
  const [openHour, openMin] = openingTime.split(':').map(Number)
  const [closeHour, closeMin] = closingTime.split(':').map(Number)
  
  const openMinutes = openHour * 60 + openMin
  const closeMinutes = closeHour * 60 + closeMin
  
  if (closeMinutes > openMinutes) {
    return currentMinutes >= openMinutes && currentMinutes <= closeMinutes
  } else {
    return currentMinutes >= openMinutes || currentMinutes <= closeMinutes
  }
}

export function generateOrderNo(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const random = Math.random().toString(36).substring(2, 10).toUpperCase()
  return `${year}${month}${day}${random}`
}

export function calculateDiscount(totalAmount: number, promotions: Array<{ minAmount: number; discount: number }>): number {
  let maxDiscount = 0
  for (const promo of promotions) {
    if (totalAmount >= promo.minAmount && promo.discount > maxDiscount) {
      maxDiscount = promo.discount
    }
  }
  return maxDiscount
}

export function calculateBestPromotion(totalAmount: number, promotions: Array<{ minAmount: number; discount: number }>): {
  discount: number
  usedPromotion: { minAmount: number; discount: number } | null
  availablePromotions: Array<{ minAmount: number; discount: number }>
  nextPromotion: { minAmount: number; discount: number; diff: number } | null
} {
  const sortedPromotions = [...promotions].sort((a, b) => a.minAmount - b.minAmount)
  const availablePromotions = sortedPromotions.filter(p => totalAmount >= p.minAmount)
  
  let usedPromotion: { minAmount: number; discount: number } | null = null
  let maxDiscount = 0
  
  for (const promo of availablePromotions) {
    if (promo.discount > maxDiscount) {
      maxDiscount = promo.discount
      usedPromotion = promo
    }
  }
  
  const unavailablePromotions = sortedPromotions.filter(p => totalAmount < p.minAmount)
  let nextPromotion: { minAmount: number; discount: number; diff: number } | null = null
  
  if (unavailablePromotions.length > 0) {
    const next = unavailablePromotions[0]
    nextPromotion = {
      minAmount: next.minAmount,
      discount: next.discount,
      diff: parseFloat((next.minAmount - totalAmount).toFixed(2)),
    }
  }
  
  return {
    discount: maxDiscount,
    usedPromotion,
    availablePromotions,
    nextPromotion,
  }
}

export function successResponse(data: any, message: string = 'success') {
  return {
    code: 0,
    message,
    data,
  }
}

export function errorResponse(message: string, code: number = 1, data?: any) {
  return {
    code,
    message,
    data: data || null,
  }
}

export function generateQueueNumber(): number {
  return Math.floor(1000 + Math.random() * 9000)
}
