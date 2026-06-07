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
