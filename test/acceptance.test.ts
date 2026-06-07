import http from 'http'

const BASE_URL = 'localhost'
const PORT = 3000

interface TestResult {
  name: string
  passed: boolean
  message: string
}

const results: TestResult[] = []

function request(
  method: string,
  path: string,
  data?: any,
  token?: string
): Promise<{ statusCode: number; body: any }> {
  return new Promise((resolve, reject) => {
    const postData = data ? JSON.stringify(data) : null

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    if (postData) {
      headers['Content-Length'] = Buffer.byteLength(postData).toString()
    }

    const options = {
      hostname: BASE_URL,
      port: PORT,
      path,
      method,
      headers,
    }

    const req = http.request(options, (res) => {
      let body = ''

      res.on('data', (chunk) => {
        body += chunk
      })

      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : null
          resolve({ statusCode: res.statusCode || 0, body: parsed })
        } catch (e) {
          resolve({ statusCode: res.statusCode || 0, body })
        }
      })
    })

    req.on('error', (e) => {
      reject(e)
    })

    if (postData) {
      req.write(postData)
    }

    req.end()
  })
}

function assert(name: string, condition: boolean, message: string) {
  results.push({ name, passed: condition, message })
  const status = condition ? '✅ PASS' : '❌ FAIL'
  console.log(`  ${status} - ${name}`)
  if (!condition) {
    console.log(`         ${message}`)
  }
}

async function runTests() {
  console.log('='.repeat(60))
  console.log('餐饮美食平台后端 - 验收测试')
  console.log('='.repeat(60))

  let customerToken = ''
  let merchantToken = ''
  let adminToken = ''
  let testOrderId = 0
  let completedOrderId = 0

  console.log('\n📋 测试1：商家登录')
  console.log('-'.repeat(40))

  try {
    const res = await request('POST', '/api/auth/merchant-login', {
      phone: '13900139001',
      password: '123456',
    })
    merchantToken = res.body?.data?.token || ''
    assert(
      '商家账号登录成功',
      res.statusCode === 200 && res.body?.code === 0 && !!merchantToken,
      `状态码: ${res.statusCode}, 响应: ${JSON.stringify(res.body)}`
    )
    assert(
      '返回商家信息（name字段）',
      !!res.body?.data?.merchant?.name,
      `响应: ${JSON.stringify(res.body?.data)}`
    )
    assert(
      '角色为 MERCHANT',
      res.body?.data?.merchant?.role === 'MERCHANT',
      `角色: ${res.body?.data?.merchant?.role}`
    )
  } catch (e: any) {
    assert('商家登录', false, `请求失败: ${e.message}`)
  }

  console.log('\n📋 测试2：普通用户登录')
  console.log('-'.repeat(40))

  try {
    const res = await request('POST', '/api/auth/login', {
      phone: '13800138001',
      password: '123456',
    })
    customerToken = res.body?.data?.token || ''
    assert(
      '普通用户登录成功',
      res.statusCode === 200 && res.body?.code === 0 && !!customerToken,
      `状态码: ${res.statusCode}`
    )
  } catch (e: any) {
    assert('普通用户登录', false, `请求失败: ${e.message}`)
  }

  console.log('\n📋 测试3：管理员登录')
  console.log('-'.repeat(40))

  try {
    const res = await request('POST', '/api/auth/login', {
      phone: '13600136000',
      password: '123456',
    })
    adminToken = res.body?.data?.token || ''
    assert(
      '管理员登录成功',
      res.statusCode === 200 && res.body?.code === 0 && !!adminToken,
      `状态码: ${res.statusCode}`
    )
    assert(
      '角色为 ADMIN',
      res.body?.data?.user?.role === 'ADMIN',
      `角色: ${res.body?.data?.user?.role}`
    )
  } catch (e: any) {
    assert('管理员登录', false, `请求失败: ${e.message}`)
  }

  console.log('\n📋 测试4：商家权限 - 查看门店订单')
  console.log('-'.repeat(40))

  try {
    const res = await request(
      'GET',
      '/api/orders/store/1?page=1&pageSize=10',
      undefined,
      merchantToken
    )
    assert(
      '商家可以查看自己门店的订单',
      res.statusCode === 200 && res.body?.code === 0,
      `状态码: ${res.statusCode}, 响应: ${JSON.stringify(res.body)}`
    )
  } catch (e: any) {
    assert('商家查看订单', false, `请求失败: ${e.message}`)
  }

  try {
    const res = await request(
      'GET',
      '/api/orders/store/2?page=1&pageSize=10',
      undefined,
      merchantToken
    )
    assert(
      '商家不能查看其他门店的订单',
      res.statusCode === 403 || res.body?.code === 403,
      `状态码: ${res.statusCode}, 响应: ${JSON.stringify(res.body)}`
    )
  } catch (e: any) {
    assert('商家查看其他门店订单', false, `请求失败: ${e.message}`)
  }

  console.log('\n📋 测试5：购物车满减计算')
  console.log('-'.repeat(40))

  try {
    await request('DELETE', '/api/cart/store/2', undefined, customerToken)

    await request(
      'POST',
      '/api/cart',
      { dishId: 5, quantity: 2, specs: { 辣度: '微辣' } },
      customerToken
    )
    await request(
      'POST',
      '/api/cart',
      { dishId: 6, quantity: 1, specs: { 辣度: '中辣' } },
      customerToken
    )

    const res = await request(
      'POST',
      '/api/cart/calculate',
      { storeId: 2 },
      customerToken
    )

    const data = res.body?.data || {}
    const expectedTotal = 22 * 2 + 48 * 1
    const expectedDiscount = 8
    const expectedPay = expectedTotal - expectedDiscount + 3

    assert(
      '购物车计算成功',
      res.statusCode === 200 && res.body?.code === 0,
      `状态码: ${res.statusCode}`
    )
    assert(
      `商品总价正确 (${expectedTotal}元)`,
      data.totalAmount === expectedTotal,
      `实际: ${data.totalAmount}, 期望: ${expectedTotal}`
    )
    assert(
      `满减金额正确 (满60减8)`,
      data.discountAmount === expectedDiscount,
      `实际: ${data.discountAmount}, 期望: ${expectedDiscount}`
    )
    assert(
      `实付金额正确`,
      data.payAmount === expectedPay,
      `实际: ${data.payAmount}, 期望: ${expectedPay}`
    )
    assert(
      '返回了使用的优惠档',
      data.usedPromotion !== null && data.usedPromotion !== undefined,
      `usedPromotion: ${JSON.stringify(data.usedPromotion)}`
    )
    assert(
      '返回了所有可用优惠',
      Array.isArray(data.availablePromotions) && data.availablePromotions.length > 0,
      `availablePromotions: ${JSON.stringify(data.availablePromotions)}`
    )
    assert(
      '返回了下一档优惠提示',
      data.nextPromotion !== null && data.nextPromotion !== undefined,
      `nextPromotion: ${JSON.stringify(data.nextPromotion)}`
    )

    console.log(`         总价: ${data.totalAmount}元, 满减: ${data.discountAmount}元, 配送费: ${data.deliveryFee}元, 实付: ${data.payAmount}元`)
    console.log(`         使用优惠: ${JSON.stringify(data.usedPromotion)}`)
  } catch (e: any) {
    assert('购物车满减计算', false, `请求失败: ${e.message}`)
  }

  console.log('\n📋 测试6：下单满减计算（与购物车一致）')
  console.log('-'.repeat(40))

  try {
    const res = await request(
      'POST',
      '/api/orders',
      {
        storeId: 2,
        items: [
          { dishId: 5, quantity: 2, specs: { 辣度: '微辣' } },
          { dishId: 6, quantity: 1, specs: { 辣度: '中辣' } },
        ],
        type: 'delivery',
        address: '测试地址',
        contactName: '测试用户',
        contactPhone: '13800000000',
        remark: '测试备注',
      },
      customerToken
    )

    const data = res.body?.data || {}
    testOrderId = data.id || 0

    const expectedTotal = 22 * 2 + 48 * 1
    const expectedDiscount = 8
    const expectedPay = expectedTotal - expectedDiscount + 3

    assert(
      '创建订单成功',
      res.statusCode === 200 && res.body?.code === 0,
      `状态码: ${res.statusCode}, 响应: ${JSON.stringify(res.body)}`
    )
    assert(
      `订单总价正确 (${expectedTotal}元)`,
      data.totalAmount === expectedTotal,
      `实际: ${data.totalAmount}, 期望: ${expectedTotal}`
    )
    assert(
      `订单满减金额正确 (满60减8)`,
      data.discountAmount === expectedDiscount,
      `实际: ${data.discountAmount}, 期望: ${expectedDiscount}`
    )
    assert(
      `订单实付金额正确`,
      data.payAmount === expectedPay,
      `实际: ${data.payAmount}, 期望: ${expectedPay}`
    )
    assert(
      '订单返回了使用的优惠档',
      data.usedPromotion !== null && data.usedPromotion !== undefined,
      `usedPromotion: ${JSON.stringify(data.usedPromotion)}`
    )
    assert(
      '订单和购物车计算结果一致',
      data.discountAmount === expectedDiscount && data.payAmount === expectedPay,
      '订单与购物车计算不一致'
    )
  } catch (e: any) {
    assert('下单满减计算', false, `请求失败: ${e.message}`)
  }

  console.log('\n📋 测试7：骑手权限控制')
  console.log('-'.repeat(40))

  try {
    const res = await request(
      'PUT',
      '/api/riders/1/status',
      { status: 'DELIVERING' },
      customerToken
    )
    assert(
      '普通顾客不能修改骑手状态',
      res.statusCode === 403 || res.body?.code === 403,
      `状态码: ${res.statusCode}, 响应: ${JSON.stringify(res.body)}`
    )
  } catch (e: any) {
    assert('普通顾客改骑手状态', false, `请求失败: ${e.message}`)
  }

  try {
    const res = await request(
      'PUT',
      '/api/riders/1/location',
      { latitude: 31.23, longitude: 121.47 },
      customerToken
    )
    assert(
      '普通顾客不能修改骑手位置',
      res.statusCode === 403 || res.body?.code === 403,
      `状态码: ${res.statusCode}, 响应: ${JSON.stringify(res.body)}`
    )
  } catch (e: any) {
    assert('普通顾客改骑手位置', false, `请求失败: ${e.message}`)
  }

  try {
    const res = await request(
      'PUT',
      '/api/riders/1/status',
      { status: 'IDLE' },
      adminToken
    )
    assert(
      '管理员可以修改骑手状态',
      res.statusCode === 200 && res.body?.code === 0,
      `状态码: ${res.statusCode}, 响应: ${JSON.stringify(res.body)}`
    )
  } catch (e: any) {
    assert('管理员改骑手状态', false, `请求失败: ${e.message}`)
  }

  console.log('\n📋 测试8：评价发布 - 订单归属校验')
  console.log('-'.repeat(40))

  let testOrderForReviewId = 0

  try {
    const orderRes = await request(
      'POST',
      '/api/orders',
      {
        storeId: 1,
        items: [
          { dishId: 1, quantity: 1, specs: { 份量: '半只', 口味: '原味' } },
          { dishId: 4, quantity: 1, specs: { 加蛋: '不加' } },
        ],
        type: 'delivery',
        address: '测试评价地址',
        contactName: '评价测试',
        contactPhone: '13900001111',
      },
      customerToken
    )
    testOrderForReviewId = orderRes.body?.data?.id || 0

    await request('POST', `/api/orders/${testOrderForReviewId}/pay`, { paymentMethod: 'wechat' }, customerToken)
    await request('PUT', `/api/orders/${testOrderForReviewId}/status`, { status: 'PREPARING' }, adminToken)
    await request('PUT', `/api/orders/${testOrderForReviewId}/status`, { status: 'READY' }, adminToken)
    await request('PUT', `/api/orders/${testOrderForReviewId}/status`, { status: 'DELIVERING' }, adminToken)
    await request('PUT', `/api/orders/${testOrderForReviewId}/status`, { status: 'COMPLETED' }, adminToken)

    const res = await request(
      'POST',
      '/api/reviews',
      {
        orderId: testOrderForReviewId,
        storeId: 1,
        rating: 5,
        content: '味道非常好，下次还来！',
      },
      customerToken
    )
    assert(
      '已完成订单可以评价',
      res.statusCode === 200 && res.body?.code === 0,
      `状态码: ${res.statusCode}, 响应: ${JSON.stringify(res.body)}`
    )
    completedOrderId = testOrderForReviewId
  } catch (e: any) {
    assert('已完成订单评价', false, `请求失败: ${e.message}`)
  }

  try {
    const res = await request(
      'POST',
      '/api/reviews',
      {
        orderId: completedOrderId,
        storeId: 2,
        rating: 5,
        content: '故意填错门店',
      },
      customerToken
    )
    assert(
      '门店不匹配不能评价',
      res.statusCode === 400 || res.body?.code === 400,
      `状态码: ${res.statusCode}, 响应: ${JSON.stringify(res.body)}`
    )
  } catch (e: any) {
    assert('门店不匹配评价', false, `请求失败: ${e.message}`)
  }

  try {
    const pendingOrderRes = await request(
      'POST',
      '/api/orders',
      {
        storeId: 1,
        items: [{ dishId: 3, quantity: 1 }],
        type: 'delivery',
        address: '待支付订单地址',
        contactName: '待支付',
        contactPhone: '13900002222',
      },
      customerToken
    )
    const pendingOrderId = pendingOrderRes.body?.data?.id

    const res = await request(
      'POST',
      '/api/reviews',
      {
        orderId: pendingOrderId,
        storeId: 1,
        rating: 4,
        content: '待支付的订单不能评价',
      },
      customerToken
    )
    assert(
      '待支付订单不能评价',
      res.statusCode === 400 || res.body?.code === 400,
      `状态码: ${res.statusCode}, 响应: ${JSON.stringify(res.body)}`
    )
  } catch (e: any) {
    assert('待支付订单评价', false, `请求失败: ${e.message}`)
  }

  try {
    const otherUserToken = (
      await request('POST', '/api/auth/login', {
        phone: '13800138002',
        password: '123456',
      })
    ).body?.data?.token

    const res = await request(
      'POST',
      '/api/reviews',
      {
        orderId: completedOrderId,
        storeId: 1,
        rating: 3,
        content: '不是自己的订单',
      },
      otherUserToken
    )
    assert(
      '不能评价别人的订单',
      res.statusCode === 403 || res.body?.code === 403,
      `状态码: ${res.statusCode}, 响应: ${JSON.stringify(res.body)}`
    )
  } catch (e: any) {
    assert('评价别人订单', false, `请求失败: ${e.message}`)
  }

  try {
    const res = await request(
      'POST',
      '/api/reviews',
      {
        orderId: completedOrderId,
        storeId: 1,
        rating: 5,
        content: '重复评价',
      },
      customerToken
    )
    assert(
      '不能重复评价',
      res.statusCode === 400 || res.body?.code === 400,
      `状态码: ${res.statusCode}, 响应: ${JSON.stringify(res.body)}`
    )
  } catch (e: any) {
    assert('重复评价', false, `请求失败: ${e.message}`)
  }

  console.log('\n📋 测试9：商家发布公告 - 权限校验')
  console.log('-'.repeat(40))

  try {
    const res = await request(
      'POST',
      '/api/stores/1/announcements',
      {
        title: '测试公告',
        content: '这是一条测试公告',
        isActive: true,
      },
      merchantToken
    )
    assert(
      '商家可以在自己门店发布公告',
      res.statusCode === 200 && res.body?.code === 0,
      `状态码: ${res.statusCode}, 响应: ${JSON.stringify(res.body)}`
    )
  } catch (e: any) {
    assert('商家发公告', false, `请求失败: ${e.message}`)
  }

  try {
    const res = await request(
      'POST',
      '/api/stores/2/announcements',
      {
        title: '越权发布',
        content: '这是别的门店',
      },
      merchantToken
    )
    assert(
      '商家不能在其他门店发布公告',
      res.statusCode === 403 || res.body?.code === 403,
      `状态码: ${res.statusCode}, 响应: ${JSON.stringify(res.body)}`
    )
  } catch (e: any) {
    assert('商家越权发公告', false, `请求失败: ${e.message}`)
  }

  console.log('\n📋 测试10：门店订单列表入口验证')
  console.log('-'.repeat(40))

  try {
    const res = await request(
      'GET',
      '/api/orders/store/1?page=1&pageSize=10',
      undefined,
      merchantToken
    )
    assert(
      '商家查自己门店订单返回列表',
      res.statusCode === 200 && res.body?.code === 0 && Array.isArray(res.body?.data?.list),
      `状态码: ${res.statusCode}, 响应: ${JSON.stringify(res.body?.data?.list?.length || 0)}条`
    )
    if (res.body?.data?.list) {
      console.log(`         订单数量: ${res.body.data.list.length} 条`)
    }
  } catch (e: any) {
    assert('商家查自己门店订单', false, `请求失败: ${e.message}`)
  }

  try {
    const res = await request(
      'GET',
      '/api/orders/store/2?page=1&pageSize=10',
      undefined,
      merchantToken
    )
    assert(
      '商家查其他门店订单返回403',
      res.statusCode === 403 || res.body?.code === 403,
      `状态码: ${res.statusCode}, 响应: ${JSON.stringify(res.body)}`
    )
  } catch (e: any) {
    assert('商家查其他门店订单', false, `请求失败: ${e.message}`)
  }

  try {
    const res = await request(
      'GET',
      '/api/orders/store/2?page=1&pageSize=10',
      undefined,
      adminToken
    )
    assert(
      '管理员查任意门店订单成功',
      res.statusCode === 200 && res.body?.code === 0,
      `状态码: ${res.statusCode}, 响应: ${JSON.stringify(res.body?.data?.list?.length || 0)}条`
    )
  } catch (e: any) {
    assert('管理员查门店订单', false, `请求失败: ${e.message}`)
  }

  console.log('\n📋 测试11：商家概览接口')
  console.log('-'.repeat(40))

  try {
    const res = await request(
      'GET',
      '/api/stores/me/overview',
      undefined,
      merchantToken
    )
    const data = res.body?.data || {}
    assert(
      '商家概览接口返回成功',
      res.statusCode === 200 && res.body?.code === 0,
      `状态码: ${res.statusCode}, 响应: ${JSON.stringify(res.body)}`
    )
    assert(
      '概览包含门店数量',
      typeof data.storeCount === 'number' && data.storeCount > 0,
      `storeCount: ${data.storeCount}`
    )
    assert(
      '概览包含今日订单数',
      typeof data.todayOrders === 'number',
      `todayOrders: ${data.todayOrders}`
    )
    assert(
      '概览包含待处理订单数',
      typeof data.pendingOrders === 'number',
      `pendingOrders: ${data.pendingOrders}`
    )
    assert(
      '概览包含今日营业额',
      typeof data.todayRevenue === 'number',
      `todayRevenue: ${data.todayRevenue}`
    )
    assert(
      '概览包含平均评分',
      typeof data.avgRating === 'number',
      `avgRating: ${data.avgRating}`
    )
    assert(
      '概览包含热门菜品排行',
      Array.isArray(data.hotDishes),
      `hotDishes: ${Array.isArray(data.hotDishes)}`
    )
    assert(
      '概览包含门店列表',
      Array.isArray(data.stores) && data.stores.length > 0,
      `stores: ${data.stores?.length} 家`
    )
    console.log(`         门店数: ${data.storeCount}, 今日订单: ${data.todayOrders}, 营业额: ¥${data.todayRevenue}`)
  } catch (e: any) {
    assert('商家概览接口', false, `请求失败: ${e.message}`)
  }

  try {
    const res = await request(
      'GET',
      '/api/stores/admin/overview',
      undefined,
      adminToken
    )
    assert(
      '管理员概览接口返回成功',
      res.statusCode === 200 && res.body?.code === 0,
      `状态码: ${res.statusCode}`
    )
    assert(
      '管理员概览包含全平台门店',
      res.body?.data?.storeCount >= 2,
      `storeCount: ${res.body?.data?.storeCount}`
    )
  } catch (e: any) {
    assert('管理员概览接口', false, `请求失败: ${e.message}`)
  }

  try {
    const res = await request(
      'GET',
      '/api/stores/admin/overview?storeId=1',
      undefined,
      adminToken
    )
    assert(
      '管理员概览支持按门店筛选',
      res.statusCode === 200 && res.body?.code === 0,
      `状态码: ${res.statusCode}`
    )
  } catch (e: any) {
    assert('管理员概览筛选', false, `请求失败: ${e.message}`)
  }

  console.log('\n📋 测试12：促销维护 + 满减计算验证')
  console.log('-'.repeat(40))

  let testPromotionId = 0

  try {
    const res = await request(
      'GET',
      '/api/promotions/store/1',
      undefined,
      undefined
    )
    assert(
      '门店促销列表可公开访问',
      res.statusCode === 200 && res.body?.code === 0,
      `状态码: ${res.statusCode}`
    )
    assert(
      '促销列表有数据',
      Array.isArray(res.body?.data) && res.body.data.length > 0,
      `促销数量: ${res.body?.data?.length}`
    )
    console.log(`         现有促销: ${res.body?.data?.length} 个`)
  } catch (e: any) {
    assert('促销列表公开访问', false, `请求失败: ${e.message}`)
  }

  try {
    const res = await request(
      'POST',
      '/api/promotions',
      {
        storeId: 1,
        type: 'full_reduce',
        minAmount: 200,
        discount: 35,
        isActive: true,
      },
      merchantToken
    )
    testPromotionId = res.body?.data?.id || 0
    assert(
      '商家可以新增自己门店的促销',
      res.statusCode === 200 && res.body?.code === 0 && testPromotionId > 0,
      `状态码: ${res.statusCode}, promotionId: ${testPromotionId}`
    )
  } catch (e: any) {
    assert('商家新增促销', false, `请求失败: ${e.message}`)
  }

  try {
    const res = await request(
      'POST',
      '/api/promotions',
      {
        storeId: 2,
        type: 'full_reduce',
        minAmount: 50,
        discount: 10,
        isActive: true,
      },
      merchantToken
    )
    assert(
      '商家不能新增其他门店的促销',
      res.statusCode === 403 || res.body?.code === 403,
      `状态码: ${res.statusCode}, 响应: ${JSON.stringify(res.body)}`
    )
  } catch (e: any) {
    assert('商家越权新增促销', false, `请求失败: ${e.message}`)
  }

  try {
    const res = await request(
      'PUT',
      `/api/promotions/${testPromotionId}`,
      {
        minAmount: 180,
        discount: 38,
      },
      merchantToken
    )
    assert(
      '商家可以修改自己门店的促销',
      res.statusCode === 200 && res.body?.code === 0,
      `状态码: ${res.statusCode}`
    )
  } catch (e: any) {
    assert('商家修改促销', false, `请求失败: ${e.message}`)
  }

  try {
    await request('POST', '/api/cart', {
      dishId: 1, quantity: 2, specs: { 份量: '半只', 口味: '原味' }
    }, customerToken)
    await request('POST', '/api/cart', {
      dishId: 2, quantity: 1, specs: { 份量: '例牌' }
    }, customerToken)

    const calcRes = await request(
      'POST',
      '/api/cart/calculate',
      { storeId: 1 },
      customerToken
    )

    const bigPromo = await request('POST', '/api/promotions', {
      storeId: 1, type: 'full_reduce', minAmount: 50, discount: 50, isActive: true
    }, merchantToken)

    const calcRes2 = await request(
      'POST',
      '/api/cart/calculate',
      { storeId: 1 },
      customerToken
    )

    const discountBefore = calcRes.body?.data?.discountAmount || 0
    const discountAfter = calcRes2.body?.data?.discountAmount || 0
    const promosBefore = calcRes.body?.data?.availablePromotions?.length || 0
    const promosAfter = calcRes2.body?.data?.availablePromotions?.length || 0

    assert(
      '新增促销后购物车计算能实时吃到最新活动',
      discountAfter > discountBefore || promosAfter > promosBefore,
      `修改前: ¥${discountBefore} (${promosBefore}档), 修改后: ¥${discountAfter} (${promosAfter}档)`
    )
    console.log(`         促销前: ${promosBefore}档优惠, 满减¥${discountBefore}; 促销后: ${promosAfter}档优惠, 满减¥${discountAfter}`)

    await request('DELETE', `/api/promotions/${bigPromo.body?.data?.id}`, undefined, merchantToken)
  } catch (e: any) {
    assert('促销实时生效', false, `请求失败: ${e.message}`)
  }

  try {
    const res = await request(
      'POST',
      `/api/promotions/${testPromotionId}/toggle`,
      { isActive: false },
      merchantToken
    )
    assert(
      '商家可以停用促销',
      res.statusCode === 200 && res.body?.code === 0 && res.body?.data?.isActive === false,
      `状态码: ${res.statusCode}, isActive: ${res.body?.data?.isActive}`
    )
  } catch (e: any) {
    assert('商家停用促销', false, `请求失败: ${e.message}`)
  }

  console.log('\n📋 测试13：配送流程 - 分配骑手')
  console.log('-'.repeat(40))

  let deliveryOrderId = 0
  let testRiderId = 0

  try {
    const orderRes = await request(
      'POST',
      '/api/orders',
      {
        storeId: 1,
        items: [{ dishId: 2, quantity: 1, specs: { 份量: '例牌' } }],
        type: 'delivery',
        address: '配送测试地址',
        contactName: '配送测试',
        contactPhone: '13911112222',
      },
      customerToken
    )
    deliveryOrderId = orderRes.body?.data?.id

    await request('POST', `/api/orders/${deliveryOrderId}/pay`, { paymentMethod: 'wechat' }, customerToken)
    await request('PUT', `/api/orders/${deliveryOrderId}/status`, { status: 'PREPARING' }, adminToken)
    await request('POST', `/api/orders/${deliveryOrderId}/remind`, undefined, merchantToken)

    const ridersRes = await request('GET', '/api/riders?status=IDLE')
    testRiderId = ridersRes.body?.data?.list?.[0]?.id || 1

    const res = await request(
      'POST',
      `/api/orders/${deliveryOrderId}/assign-rider`,
      { riderId: testRiderId },
      merchantToken
    )
    assert(
      '商家可以分配骑手给自己门店的订单',
      res.statusCode === 200 && res.body?.code === 0,
      `状态码: ${res.statusCode}, 响应: ${JSON.stringify(res.body)}`
    )
    assert(
      '分配后订单状态变为配送中',
      res.body?.data?.status === 'DELIVERING',
      `订单状态: ${res.body?.data?.status}`
    )
  } catch (e: any) {
    assert('商家分配骑手', false, `请求失败: ${e.message}`)
  }

  try {
    const res = await request(
      'GET',
      `/api/orders/${deliveryOrderId}`,
      undefined,
      customerToken
    )
    const data = res.body?.data || {}
    assert(
      '订单详情包含骑手信息',
      data.rider !== null && data.rider !== undefined,
      `rider: ${JSON.stringify(data.rider)}`
    )
    assert(
      '骑手信息包含姓名',
      !!data.rider?.name,
      `骑手姓名: ${data.rider?.name}`
    )
    assert(
      '骑手信息包含位置',
      data.rider?.latitude !== undefined && data.rider?.longitude !== undefined,
      `位置: ${data.rider?.latitude}, ${data.rider?.longitude}`
    )
    console.log(`         骑手: ${data.rider?.name}, 状态: ${data.rider?.status}`)
  } catch (e: any) {
    assert('订单详情骑手信息', false, `请求失败: ${e.message}`)
  }

  try {
    const otherStoreOrderRes = await request(
      'POST',
      '/api/orders',
      {
        storeId: 2,
        items: [{ dishId: 5, quantity: 1 }],
        type: 'delivery',
        address: '越权配送测试',
        contactName: '越权测试',
        contactPhone: '13922223333',
      },
      customerToken
    )
    const otherOrderId = otherStoreOrderRes.body?.data?.id

    await request('POST', `/api/orders/${otherOrderId}/pay`, {}, customerToken)
    await request('PUT', `/api/orders/${otherOrderId}/status`, { status: 'PREPARING' }, adminToken)
    await request('PUT', `/api/orders/${otherOrderId}/status`, { status: 'READY' }, adminToken)

    const res = await request(
      'POST',
      `/api/orders/${otherOrderId}/assign-rider`,
      { riderId: testRiderId },
      merchantToken
    )
    assert(
      '商家不能给其他门店订单分配骑手',
      res.statusCode === 403 || res.body?.code === 403,
      `状态码: ${res.statusCode}, 响应: ${JSON.stringify(res.body)}`
    )
  } catch (e: any) {
    assert('商家越权分配骑手', false, `请求失败: ${e.message}`)
  }

  console.log('\n📋 测试14：经营分析接口')
  console.log('-'.repeat(40))

  try {
    const res = await request(
      'GET',
      '/api/analysis/business?timeRange=today',
      undefined,
      merchantToken
    )
    const data = res.body?.data || {}
    assert(
      '商家经营分析接口返回成功',
      res.statusCode === 200 && res.body?.code === 0,
      `状态码: ${res.statusCode}`
    )
    assert(
      '经营分析包含订单数',
      data.totalOrders !== undefined,
      `totalOrders: ${data.totalOrders}`
    )
    assert(
      '经营分析包含实收金额',
      data.totalRevenue !== undefined,
      `totalRevenue: ${data.totalRevenue}`
    )
    assert(
      '经营分析包含退款金额',
      data.totalRefund !== undefined,
      `totalRefund: ${data.totalRefund}`
    )
    assert(
      '经营分析包含客单价',
      data.avgOrderValue !== undefined,
      `avgOrderValue: ${data.avgOrderValue}`
    )
    assert(
      '经营分析包含复购用户数',
      data.repeatUsers !== undefined,
      `repeatUsers: ${data.repeatUsers}`
    )
    assert(
      '经营分析包含门店拆分数据',
      Array.isArray(data.storeBreakdown),
      `storeBreakdown 类型: ${typeof data.storeBreakdown}`
    )
    console.log(`         今日订单: ${data.totalOrders}, 营收: ¥${data.totalRevenue}, 客单价: ¥${data.avgOrderValue.toFixed?.(2) || data.avgOrderValue}`)
  } catch (e: any) {
    assert('商家经营分析', false, `请求失败: ${e.message}`)
  }

  try {
    const res = await request(
      'GET',
      '/api/analysis/business?timeRange=7days&storeId=1',
      undefined,
      merchantToken
    )
    assert(
      '商家经营分析支持按门店筛选',
      res.statusCode === 200 && res.body?.code === 0,
      `状态码: ${res.statusCode}`
    )
  } catch (e: any) {
    assert('商家经营分析门店筛选', false, `请求失败: ${e.message}`)
  }

  try {
    const res = await request(
      'GET',
      '/api/analysis/business?timeRange=30days',
      undefined,
      adminToken
    )
    assert(
      '管理员经营分析返回成功',
      res.statusCode === 200 && res.body?.code === 0,
      `状态码: ${res.statusCode}`
    )
    assert(
      '管理员经营分析包含全平台门店拆分',
      res.body?.data?.storeBreakdown?.length >= 2,
      `门店拆分数量: ${res.body?.data?.storeBreakdown?.length}`
    )
  } catch (e: any) {
    assert('管理员经营分析', false, `请求失败: ${e.message}`)
  }

  console.log('\n📋 测试15：菜品分析 + 热门菜')
  console.log('-'.repeat(40))

  try {
    const res = await request(
      'GET',
      '/api/analysis/dishes?timeRange=today',
      undefined,
      merchantToken
    )
    const data = res.body?.data || {}
    assert(
      '商家菜品分析接口返回成功',
      res.statusCode === 200 && res.body?.code === 0,
      `状态码: ${res.statusCode}`
    )
    assert(
      '菜品分析包含菜品列表',
      Array.isArray(data.dishList),
      `dishList 类型: ${typeof data.dishList}`
    )
    assert(
      '菜品分析包含库存告警',
      Array.isArray(data.lowStockDishes),
      `lowStockDishes 类型: ${typeof data.lowStockDishes}`
    )
    if (data.dishList?.length > 0) {
      const dish = data.dishList[0]
      assert(
        '菜品包含销量数据',
        dish.salesCount !== undefined,
        `salesCount: ${dish.salesCount}`
      )
      assert(
        '菜品包含销售额数据',
        dish.salesAmount !== undefined,
        `salesAmount: ${dish.salesAmount}`
      )
    }
    console.log(`         菜品数: ${data.dishList?.length || 0}, 低库存预警: ${data.lowStockDishes?.length || 0}个`)
  } catch (e: any) {
    assert('商家菜品分析', false, `请求失败: ${e.message}`)
  }

  try {
    const res = await request(
      'GET',
      '/api/analysis/hot-dishes?timeRange=7days&limit=5',
      undefined,
      merchantToken
    )
    const data = res.body?.data || {}
    assert(
      '热门菜分析接口返回成功',
      res.statusCode === 200 && res.body?.code === 0,
      `状态码: ${res.statusCode}`
    )
    assert(
      '热门菜列表存在',
      Array.isArray(data.hotDishes),
      `hotDishes 类型: ${typeof data.hotDishes}`
    )
    assert(
      '热门菜数量不超过限制',
      data.hotDishes?.length <= 5,
      `热门菜数量: ${data.hotDishes?.length}`
    )
    console.log(`         热门菜 TOP${data.hotDishes?.length || 0}: ${data.hotDishes?.map((d: any) => d.dishName)?.join(', ') || '无'}`)
  } catch (e: any) {
    assert('热门菜分析', false, `请求失败: ${e.message}`)
  }

  console.log('\n📋 测试16：促销管理列表 - 含停用筛选')
  console.log('-'.repeat(40))

  try {
    const res = await request(
      'GET',
      '/api/promotions/manage',
      undefined,
      merchantToken
    )
    const data = res.body?.data || {}
    assert(
      '商家促销管理列表返回成功',
      res.statusCode === 200 && res.body?.code === 0,
      `状态码: ${res.statusCode}`
    )
    assert(
      '促销管理列表包含全部活动（含停用）',
      Array.isArray(data.list) && data.list.length > 0,
      `列表长度: ${data.list?.length}`
    )
    console.log(`         全部促销: ${data.list?.length || 0}个`)
  } catch (e: any) {
    assert('商家促销管理列表', false, `请求失败: ${e.message}`)
  }

  try {
    const res = await request(
      'GET',
      '/api/promotions/manage?status=inactive',
      undefined,
      merchantToken
    )
    const data = res.body?.data || {}
    assert(
      '促销管理支持按状态筛选（停用）',
      res.statusCode === 200 && res.body?.code === 0,
      `状态码: ${res.statusCode}`
    )
    const allInactive = data.list?.every((p: any) => p.isActive === false) ?? true
    assert(
      '筛选后只返回停用状态的促销',
      allInactive,
      `返回的促销状态: ${data.list?.map((p: any) => p.isActive)?.join(', ')}`
    )
    console.log(`         停用促销: ${data.list?.length || 0}个`)
  } catch (e: any) {
    assert('促销状态筛选', false, `请求失败: ${e.message}`)
  }

  try {
    const res = await request(
      'GET',
      '/api/promotions/manage?status=active',
      undefined,
      merchantToken
    )
    const data = res.body?.data || {}
    const allActive = data.list?.every((p: any) => p.isActive === true) ?? true
    assert(
      '筛选后只返回启用状态的促销',
      allActive,
      `返回的促销状态: ${data.list?.map((p: any) => p.isActive)?.join(', ')}`
    )
  } catch (e: any) {
    assert('促销启用筛选', false, `请求失败: ${e.message}`)
  }

  try {
    const publicRes = await request('GET', '/api/promotions/store/1')
    const publicList = publicRes.body?.data || []
    const allActive = publicList.every((p: any) => p.isActive === true)
    assert(
      '公开促销列表只返回启用中的活动',
      allActive,
      `公开列表中的促销状态: ${publicList.map((p: any) => p.isActive)?.join(', ')}`
    )
    console.log(`         公开列表（仅启用）: ${publicList.length}个`)
  } catch (e: any) {
    assert('公开促销列表仅启用', false, `请求失败: ${e.message}`)
  }

  console.log('\n📋 测试17：清空门店购物车')
  console.log('-'.repeat(40))

  try {
    await request('POST', '/api/cart', {
      dishId: 1, quantity: 2, specs: { 份量: '半只', 口味: '原味' }
    }, customerToken)
    await request('POST', '/api/cart', {
      dishId: 2, quantity: 1, specs: { 份量: '例牌' }
    }, customerToken)

    const cartRes = await request('GET', '/api/cart', undefined, customerToken)
    const store1Group = cartRes.body?.data?.find((g: any) => g.storeId === 1)
    const itemCountBefore = store1Group?.items?.length || 0
    assert(
      '添加购物车后商品数量正确',
      itemCountBefore >= 2,
      `添加后商品数: ${itemCountBefore}`
    )

    const clearRes = await request(
      'DELETE',
      '/api/cart/store/1',
      undefined,
      customerToken
    )
    assert(
      '清空门店购物车成功',
      clearRes.statusCode === 200 && clearRes.body?.code === 0,
      `状态码: ${clearRes.statusCode}, 响应: ${JSON.stringify(clearRes.body)}`
    )

    const cartAfter = await request('GET', '/api/cart', undefined, customerToken)
    const store1After = cartAfter.body?.data?.find((g: any) => g.storeId === 1)
    const itemCountAfter = store1After?.items?.length || 0
    assert(
      '清空后购物车商品已移除',
      itemCountAfter === 0 || store1After === undefined,
      `清空后商品数: ${itemCountAfter}`
    )
    console.log(`         清空前: ${itemCountBefore}件, 清空后: ${itemCountAfter}件`)
  } catch (e: any) {
    assert('清空门店购物车', false, `请求失败: ${e.message}`)
  }

  try {
    await request('POST', '/api/cart', {
      dishId: 1, quantity: 3, specs: { 份量: '半只', 口味: '原味' }
    }, customerToken)

    const calcBefore = await request(
      'POST',
      '/api/cart/calculate',
      { storeId: 1 },
      customerToken
    )

    await request('DELETE', '/api/cart/store/1', undefined, customerToken)

    const calcAfter = await request(
      'POST',
      '/api/cart/calculate',
      { storeId: 1 },
      customerToken
    )

    assert(
      '清空购物车后重新计算返回购物车为空',
      calcAfter.statusCode === 400 || calcAfter.body?.code === 400,
      `状态码: ${calcAfter.statusCode}, 响应: ${JSON.stringify(calcAfter.body)}`
    )
    console.log(`         清空前计算: ¥${calcBefore.body?.data?.payAmount || '失败'}, 清空后: 购物车为空`)
  } catch (e: any) {
    assert('清空后重新计算', false, `请求失败: ${e.message}`)
  }

  console.log('\n' + '='.repeat(60))
  console.log('📊 测试结果汇总')
  console.log('='.repeat(60))

  const passed = results.filter((r) => r.passed).length
  const total = results.length

  console.log(`总测试数: ${total}`)
  console.log(`通过: ${passed} ✅`)
  console.log(`失败: ${total - passed} ❌`)
  console.log(`通过率: ${((passed / total) * 100).toFixed(1)}%`)

  if (total - passed > 0) {
    console.log('\n❌ 失败的测试：')
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`  - ${r.name}`)
        console.log(`    ${r.message}`)
      })
  }

  console.log('\n🎉 测试完成！')
  process.exit(total - passed > 0 ? 1 : 0)
}

runTests().catch((e) => {
  console.error('测试运行失败:', e)
  process.exit(1)
})
