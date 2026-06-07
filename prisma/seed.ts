import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 开始生成种子数据...')

  console.log('🧹 清理现有数据...')
  await prisma.review.deleteMany()
  await prisma.refund.deleteMany()
  await prisma.payment.deleteMany()
  await prisma.orderItem.deleteMany()
  await prisma.order.deleteMany()
  await prisma.cartItem.deleteMany()
  await prisma.dishSpec.deleteMany()
  await prisma.dish.deleteMany()
  await prisma.category.deleteMany()
  await prisma.promotion.deleteMany()
  await prisma.storeAnnouncement.deleteMany()
  await prisma.queueNumber.deleteMany()
  await prisma.reservation.deleteMany()
  await prisma.table.deleteMany()
  await prisma.store.deleteMany()
  await prisma.merchant.deleteMany()
  await prisma.user.deleteMany()
  await prisma.rider.deleteMany()

  const hashedPassword = bcrypt.hashSync('123456', 10)

  console.log('👤 创建用户...')
  const user1 = await prisma.user.create({
    data: {
      phone: '13800138001',
      nickname: '美食家小王',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=user1',
      role: 'CUSTOMER',
      password: hashedPassword,
    },
  })

  const user2 = await prisma.user.create({
    data: {
      phone: '13800138002',
      nickname: '吃货小李',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=user2',
      role: 'CUSTOMER',
      password: hashedPassword,
    },
  })

  const admin = await prisma.user.create({
    data: {
      phone: '13600136000',
      nickname: '管理员',
      role: 'ADMIN',
      password: hashedPassword,
    },
  })

  console.log('🏪 创建商家...')
  const merchant1 = await prisma.merchant.create({
    data: {
      name: '美味轩餐饮',
      phone: '13900139001',
      password: hashedPassword,
    },
  })

  const merchant2 = await prisma.merchant.create({
    data: {
      name: '川味坊',
      phone: '13900139002',
      password: hashedPassword,
    },
  })

  console.log('🏬 创建门店...')
  const store1 = await prisma.store.create({
    data: {
      merchantId: merchant1.id,
      name: '美味轩（南京路店）',
      description: '经典粤菜，匠心制作，传承百年味道',
      coverImage: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800',
      address: '上海市黄浦区南京东路100号',
      latitude: 31.2304,
      longitude: 121.4737,
      phone: '021-88888888',
      openingTime: '10:00',
      closingTime: '22:00',
      deliveryFee: 5,
      minOrderAmount: 20,
      rating: 4.8,
      salesCount: 1256,
      isOpen: true,
    },
  })

  const store2 = await prisma.store.create({
    data: {
      merchantId: merchant2.id,
      name: '川味坊（徐家汇店）',
      description: '正宗川味，麻辣鲜香，地道四川味',
      coverImage: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800',
      address: '上海市徐汇区徐家汇路200号',
      latitude: 31.1943,
      longitude: 121.4365,
      phone: '021-66666666',
      openingTime: '11:00',
      closingTime: '23:00',
      deliveryFee: 3,
      minOrderAmount: 15,
      rating: 4.6,
      salesCount: 892,
      isOpen: true,
    },
  })

  const store3 = await prisma.store.create({
    data: {
      merchantId: merchant1.id,
      name: '美味轩（陆家嘴店）',
      description: '精致粤菜，海景餐厅，商务宴请首选',
      coverImage: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800',
      address: '上海市浦东新区陆家嘴环路500号',
      latitude: 31.2397,
      longitude: 121.4998,
      phone: '021-77777777',
      openingTime: '09:30',
      closingTime: '21:30',
      deliveryFee: 8,
      minOrderAmount: 30,
      rating: 4.9,
      salesCount: 567,
      isOpen: true,
    },
  })

  console.log('📢 创建门店公告...')
  await prisma.storeAnnouncement.createMany({
    data: [
      { storeId: store1.id, title: '新店优惠', content: '全场满100减20，新用户首单立减10元！', isActive: true },
      { storeId: store1.id, title: '营业时间调整', content: '夏季营业时间延长至22:30，欢迎品尝夜宵', isActive: true },
      { storeId: store2.id, title: '新品上市', content: '新增水煮鱼、毛血旺等经典川菜，欢迎品鉴', isActive: true },
    ],
  })

  console.log('📂 创建菜品分类...')
  const cat1 = await prisma.category.create({ data: { storeId: store1.id, name: '招牌菜', sort: 1 } })
  const cat2 = await prisma.category.create({ data: { storeId: store1.id, name: '热菜', sort: 2 } })
  const cat3 = await prisma.category.create({ data: { storeId: store1.id, name: '主食', sort: 3 } })
  const cat4 = await prisma.category.create({ data: { storeId: store2.id, name: '川菜经典', sort: 1 } })
  const cat5 = await prisma.category.create({ data: { storeId: store2.id, name: '小吃', sort: 2 } })

  console.log('🍽️  创建菜品...')
  const dish1 = await prisma.dish.create({
    data: {
      storeId: store1.id,
      categoryId: cat1.id,
      name: '白切鸡',
      description: '精选三黄鸡，皮爽肉滑，原汁原味',
      image: 'https://images.unsplash.com/photo-1598103442097-8b74394b95c6?w=400',
      price: 58,
      originalPrice: 68,
      salesCount: 320,
      stock: 50,
      isHot: true,
      isOnSale: true,
      sort: 1,
    },
  })

  const dish2 = await prisma.dish.create({
    data: {
      storeId: store1.id,
      categoryId: cat1.id,
      name: '烧鹅',
      description: '港式深井烧鹅，皮脆肉嫩',
      image: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400',
      price: 88,
      originalPrice: 108,
      salesCount: 256,
      stock: 30,
      isHot: true,
      isOnSale: true,
      sort: 2,
    },
  })

  const dish3 = await prisma.dish.create({
    data: {
      storeId: store1.id,
      categoryId: cat2.id,
      name: '清蒸鲈鱼',
      description: '新鲜鲈鱼，清蒸保留原汁原味',
      image: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=400',
      price: 68,
      salesCount: 180,
      stock: 40,
      isOnSale: true,
      sort: 1,
    },
  })

  const dish4 = await prisma.dish.create({
    data: {
      storeId: store1.id,
      categoryId: cat3.id,
      name: '叉烧饭',
      description: '蜜汁叉烧配米饭，经典港式美味',
      image: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400',
      price: 28,
      salesCount: 450,
      stock: 100,
      isHot: true,
      isOnSale: true,
      sort: 1,
    },
  })

  const dish5 = await prisma.dish.create({
    data: {
      storeId: store2.id,
      categoryId: cat4.id,
      name: '麻婆豆腐',
      description: '麻辣鲜香，正宗川味',
      image: 'https://images.unsplash.com/photo-1582576163090-09d3b6f8a969?w=400',
      price: 22,
      salesCount: 280,
      stock: 80,
      isHot: true,
      isOnSale: true,
      sort: 1,
    },
  })

  const dish6 = await prisma.dish.create({
    data: {
      storeId: store2.id,
      categoryId: cat4.id,
      name: '水煮牛肉',
      description: '麻辣鲜香，牛肉嫩滑',
      image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400',
      price: 48,
      originalPrice: 58,
      salesCount: 190,
      stock: 50,
      isOnSale: true,
      sort: 2,
    },
  })

  const dish7 = await prisma.dish.create({
    data: {
      storeId: store2.id,
      categoryId: cat5.id,
      name: '担担面',
      description: '经典川味小吃，麻辣鲜香',
      image: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400',
      price: 18,
      salesCount: 350,
      stock: 120,
      isHot: true,
      isOnSale: true,
      sort: 1,
    },
  })

  console.log('📋 创建菜品规格...')
  await prisma.dishSpec.createMany({
    data: [
      { dishId: dish1.id, name: '份量', options: JSON.stringify(['半只', '整只']), isRequired: true },
      { dishId: dish1.id, name: '口味', options: JSON.stringify(['原味', '姜葱', '沙姜']), isRequired: false },
      { dishId: dish2.id, name: '份量', options: JSON.stringify(['例牌', '半只', '整只']), isRequired: true },
      { dishId: dish4.id, name: '加蛋', options: JSON.stringify(['不加', '煎蛋', '卤蛋', '太阳蛋']), isRequired: false },
      { dishId: dish5.id, name: '辣度', options: JSON.stringify(['微辣', '中辣', '特辣']), isRequired: true },
      { dishId: dish6.id, name: '辣度', options: JSON.stringify(['微辣', '中辣', '特辣', '变态辣']), isRequired: true },
      { dishId: dish7.id, name: '份量', options: JSON.stringify(['小份', '大份']), isRequired: false },
    ],
  })

  console.log('🎁 创建促销活动...')
  await prisma.promotion.createMany({
    data: [
      { storeId: store1.id, type: 'full_reduce', minAmount: 50, discount: 5, isActive: true },
      { storeId: store1.id, type: 'full_reduce', minAmount: 100, discount: 15, isActive: true },
      { storeId: store1.id, type: 'full_reduce', minAmount: 200, discount: 40, isActive: true },
      { storeId: store2.id, type: 'full_reduce', minAmount: 30, discount: 3, isActive: true },
      { storeId: store2.id, type: 'full_reduce', minAmount: 60, discount: 8, isActive: true },
      { storeId: store2.id, type: 'full_reduce', minAmount: 100, discount: 18, isActive: true },
      { storeId: store3.id, type: 'full_reduce', minAmount: 80, discount: 10, isActive: true },
      { storeId: store3.id, type: 'full_reduce', minAmount: 150, discount: 25, isActive: true },
    ],
  })

  console.log('🪑 创建桌号...')
  await prisma.table.createMany({
    data: [
      { storeId: store1.id, tableNo: 'A01', seats: 2, isAvailable: true },
      { storeId: store1.id, tableNo: 'A02', seats: 2, isAvailable: true },
      { storeId: store1.id, tableNo: 'B01', seats: 4, isAvailable: true },
      { storeId: store1.id, tableNo: 'B02', seats: 4, isAvailable: false },
      { storeId: store1.id, tableNo: 'C01', seats: 6, isAvailable: true },
      { storeId: store1.id, tableNo: 'D01', seats: 10, isAvailable: true },
      { storeId: store2.id, tableNo: '1号桌', seats: 2, isAvailable: true },
      { storeId: store2.id, tableNo: '2号桌', seats: 4, isAvailable: true },
      { storeId: store2.id, tableNo: '3号桌', seats: 4, isAvailable: true },
      { storeId: store2.id, tableNo: '4号桌', seats: 6, isAvailable: true },
    ],
  })

  console.log('🚴 创建骑手...')
  await prisma.rider.createMany({
    data: [
      { name: '张师傅', phone: '13700137001', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=rider1', status: 'IDLE', latitude: 31.2300, longitude: 121.4700 },
      { name: '李师傅', phone: '13700137002', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=rider2', status: 'IDLE', latitude: 31.2350, longitude: 121.4800 },
      { name: '王师傅', phone: '13700137003', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=rider3', status: 'DELIVERING', latitude: 31.2400, longitude: 121.4750 },
      { name: '赵师傅', phone: '13700137004', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=rider4', status: 'OFFLINE' },
    ],
  })

  console.log('🛒 创建购物车数据...')
  await prisma.cartItem.createMany({
    data: [
      { userId: user1.id, storeId: store2.id, dishId: dish5.id, quantity: 2, specs: JSON.stringify({ 辣度: '微辣' }), remark: '' },
      { userId: user1.id, storeId: store2.id, dishId: dish7.id, quantity: 1, specs: JSON.stringify({ 份量: '大份' }) },
      { userId: user2.id, storeId: store1.id, dishId: dish2.id, quantity: 1, specs: JSON.stringify({ 份量: '例牌' }) },
    ],
  })

  console.log('📦 创建订单数据...')
  const order1 = await prisma.order.create({
    data: {
      orderNo: '20240601ABCDEFGH',
      userId: user1.id,
      storeId: store1.id,
      totalAmount: 116,
      discountAmount: 15,
      deliveryFee: 5,
      payAmount: 106,
      status: 'COMPLETED',
      type: 'delivery',
      address: '上海市黄浦区西藏中路500号',
      contactName: '小王',
      contactPhone: '13800138001',
      remark: '不要香菜，谢谢',
    },
  })

  await prisma.orderItem.createMany({
    data: [
      { orderId: order1.id, dishId: dish1.id, dishName: '白切鸡', dishImage: dish1.image, price: 58, quantity: 1, specs: JSON.stringify({ 份量: '半只', 口味: '姜葱' }) },
      { orderId: order1.id, dishId: dish4.id, dishName: '叉烧饭', dishImage: dish4.image, price: 28, quantity: 2, specs: JSON.stringify({ 加蛋: '煎蛋' }), remark: '饭多一点' },
    ],
  })

  await prisma.payment.create({
    data: {
      orderId: order1.id,
      paymentNo: 'PAY20240601001',
      amount: 106,
      status: 'PAID',
      paymentMethod: 'wechat',
      paidAt: new Date(),
    },
  })

  const order2 = await prisma.order.create({
    data: {
      orderNo: '20240602IJKLMNOP',
      userId: user2.id,
      storeId: store2.id,
      totalAmount: 70,
      discountAmount: 8,
      deliveryFee: 3,
      payAmount: 65,
      status: 'DELIVERING',
      type: 'delivery',
      address: '上海市徐汇区漕溪北路300号',
      contactName: '小李',
      contactPhone: '13800138002',
      remark: '微辣即可',
    },
  })

  await prisma.orderItem.createMany({
    data: [
      { orderId: order2.id, dishId: dish5.id, dishName: '麻婆豆腐', dishImage: dish5.image, price: 22, quantity: 1, specs: JSON.stringify({ 辣度: '微辣' }) },
      { orderId: order2.id, dishId: dish6.id, dishName: '水煮牛肉', dishImage: dish6.image, price: 48, quantity: 1, specs: JSON.stringify({ 辣度: '中辣' }) },
    ],
  })

  await prisma.payment.create({
    data: {
      orderId: order2.id,
      paymentNo: 'PAY20240602001',
      amount: 65,
      status: 'PAID',
      paymentMethod: 'wechat',
      paidAt: new Date(),
    },
  })

  console.log('⭐ 创建评价数据...')
  await prisma.review.create({
    data: {
      orderId: order1.id,
      userId: user1.id,
      storeId: store1.id,
      rating: 5,
      content: '味道非常好，白切鸡皮脆肉嫩，叉烧饭也很香，配送也很快！',
      images: JSON.stringify(['https://images.unsplash.com/photo-1544025162-d76694265947?w=400']),
      status: 'APPROVED',
    },
  })

  console.log('📱 创建排队数据...')
  await prisma.queueNumber.create({
    data: {
      storeId: store1.id,
      userId: user1.id,
      queueType: 'medium',
      number: 1008,
      peopleCount: 3,
      status: 'WAITING',
    },
  })

  console.log('📅 创建预约数据...')
  const futureDate = new Date()
  futureDate.setDate(futureDate.getDate() + 1)
  futureDate.setHours(19, 0, 0, 0)

  await prisma.reservation.create({
    data: {
      storeId: store2.id,
      userId: user2.id,
      peopleCount: 4,
      reservationTime: futureDate,
      contactName: '小李',
      contactPhone: '13800138002',
      remark: '靠窗位置优先',
      status: 'CONFIRMED',
    },
  })

  console.log('')
  console.log('✅ 种子数据生成完成！')
  console.log('')
  console.log('📋 测试账号：')
  console.log('   用户：13800138001 / 123456')
  console.log('   用户：13800138002 / 123456')
  console.log('   商家：13900139001 / 123456')
  console.log('   商家：13900139002 / 123456')
  console.log('   管理员：13600136000 / 123456')
  console.log('')
  console.log('🏪 门店数量：3')
  console.log('🍽️  菜品数量：7')
  console.log('🛒 购物车数据：已添加')
  console.log('📦 订单数据：2 条')
  console.log('⭐ 评价数据：已添加')
  console.log('🚴 骑手数据：4 位')
  console.log('🪑 桌号数据：10 个')
  console.log('📢 公告数据：3 条')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
