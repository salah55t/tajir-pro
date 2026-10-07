import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/backup — تصدير نسخة كاملة من البيانات (JSON)
export async function GET() {
  try {
    const [products, customers, deliveryCompanies, orders, orderItems, messages, settings] = await Promise.all([
      db.product.findMany(),
      db.customer.findMany(),
      db.deliveryCompany.findMany(),
      db.order.findMany(),
      db.orderItem.findMany(),
      db.message.findMany(),
      db.setting.findMany(),
    ])

    const backup = {
      app: 'tajir-pro',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: { products, customers, deliveryCompanies, orders, orderItems, messages, settings },
    }

    const date = new Date().toISOString().slice(0, 10)
    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="tajirpro-backup-${date}.json"`,
      },
    })
  } catch (error) {
    console.error('GET /api/backup error:', error)
    return NextResponse.json({ error: 'فشل تصدير النسخة الاحتياطية' }, { status: 500 })
  }
}

// POST /api/backup — استيراد نسخة احتياطية (يستبدل البيانات الحالية)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = body?.data
    if (!data || !Array.isArray(data.products)) {
      return NextResponse.json({ error: 'ملف النسخة الاحتياطية غير صالح' }, { status: 400 })
    }

    await db.$transaction([
      db.message.deleteMany(),
      db.orderItem.deleteMany(),
      db.order.deleteMany(),
      db.product.deleteMany(),
      db.customer.deleteMany(),
      db.deliveryCompany.deleteMany(),
      db.setting.deleteMany(),

      db.setting.createMany({ data: data.settings || [] }),
      db.deliveryCompany.createMany({ data: data.deliveryCompanies || [] }),
      db.product.createMany({ data: data.products || [] }),
      db.customer.createMany({ data: data.customers || [] }),
      db.order.createMany({ data: data.orders || [] }),
      db.orderItem.createMany({ data: data.orderItems || [] }),
      db.message.createMany({ data: data.messages || [] }),
    ])

    return NextResponse.json({
      success: true,
      counts: {
        products: data.products?.length || 0,
        customers: data.customers?.length || 0,
        orders: data.orders?.length || 0,
        messages: data.messages?.length || 0,
      },
    })
  } catch (error) {
    console.error('POST /api/backup error:', error)
    return NextResponse.json({ error: 'فشل استيراد النسخة الاحتياطية — تأكد من صحة الملف' }, { status: 500 })
  }
}
