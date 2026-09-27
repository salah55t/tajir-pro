import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const VALID_STATUSES = ['pending', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled']

// PUT /api/orders/[id] — تحديث الطلب (الحالة، شركة التوصيل، الإرسال للتوصيل)
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const existing = await db.order.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}

    // تحديث الحالة
    if (body.status) {
      if (!VALID_STATUSES.includes(body.status)) {
        return NextResponse.json({ error: 'حالة غير صالحة' }, { status: 400 })
      }
      // إذا أُلغي الطلب، نعيد الكميات للمخزون (فقط إذا لم يكن ملغى مسبقاً)
      if (body.status === 'cancelled' && existing.status !== 'cancelled') {
        const items = await db.orderItem.findMany({ where: { orderId: id } })
        await db.$transaction(
          items.map((item) =>
            db.product.update({
              where: { id: item.productId },
              data: { quantity: { increment: item.quantity } },
            })
          )
        )
      }
      data.status = body.status
    }

    if (body.deliveryCompanyId !== undefined) {
      data.deliveryCompanyId = body.deliveryCompanyId || null
    }
    if (body.trackingNumber !== undefined) {
      data.trackingNumber = body.trackingNumber?.trim() || null
    }
    if (body.deliveryFee !== undefined && typeof body.deliveryFee === 'number' && body.deliveryFee >= 0) {
      const diff = body.deliveryFee - existing.deliveryFee
      data.deliveryFee = body.deliveryFee
      data.total = existing.total + diff
    }
    if (body.notes !== undefined) {
      data.notes = body.notes?.trim() || null
    }
    if (body.address !== undefined) {
      data.address = body.address?.trim() || null
    }

    const order = await db.order.update({
      where: { id },
      data,
      include: {
        customer: true,
        deliveryCompany: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
      },
    })
    return NextResponse.json(order)
  } catch (error) {
    console.error('PUT /api/orders/[id] error:', error)
    return NextResponse.json({ error: 'فشل تحديث الطلب' }, { status: 500 })
  }
}

// POST /api/orders/[id] — إرسال الطلب لشركة التوصيل (محاكاة تكامل API)
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const order = await db.order.findUnique({
      where: { id },
      include: { deliveryCompany: true, customer: true },
    })
    if (!order) {
      return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })
    }
    if (!order.deliveryCompany) {
      return NextResponse.json({ error: 'عيّن شركة توصيل أولاً قبل الإرسال' }, { status: 400 })
    }
    if (!order.deliveryCompany.active) {
      return NextResponse.json({ error: 'شركة التوصيل هذه غير مفعلة حالياً' }, { status: 400 })
    }
    if (order.status === 'cancelled') {
      return NextResponse.json({ error: 'لا يمكن إرسال طلب ملغى للتوصيل' }, { status: 400 })
    }
    if (order.trackingNumber) {
      return NextResponse.json({ error: 'الطلب مُرسل مسبقاً لشركة التوصيل' }, { status: 409 })
    }

    // محاكاة استدعاء API شركة التوصيل — توليد رقم تتبع
    await new Promise((r) => setTimeout(r, 400))
    const trackingNumber = `${order.deliveryCompany.name.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-8)}`

    const updated = await db.order.update({
      where: { id },
      data: {
        trackingNumber,
        status: order.status === 'pending' ? 'confirmed' : order.status,
      },
      include: {
        customer: true,
        deliveryCompany: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
      },
    })

    // تسجيل إشعار تلقائي للعميل في المحادثة
    await db.message.create({
      data: {
        customerId: order.customerId,
        orderId: order.id,
        direction: 'outgoing',
        content: `تم تسليم طلبك رقم ${order.orderNumber} إلى شركة التوصيل "${order.deliveryCompany.name}". رقم التتبع: ${trackingNumber}. يمكنك متابعة حالة الطلب عبر رقم التتبع.`,
        isAuto: true,
        deliveredBy: 'system',
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('POST /api/orders/[id] error:', error)
    return NextResponse.json({ error: 'فشل إرسال الطلب لشركة التوصيل' }, { status: 500 })
  }
}

// DELETE /api/orders/[id] — حذف طلب
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const existing = await db.order.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })
    }
    // إعادة الكميات للمخزون إذا لم يكن الطلب ملغى
    if (existing.status !== 'cancelled') {
      const items = await db.orderItem.findMany({ where: { orderId: id } })
      await db.$transaction(
        items.map((item) =>
          db.product.update({
            where: { id: item.productId },
            data: { quantity: { increment: item.quantity } },
          })
        )
      )
    }
    await db.message.deleteMany({ where: { orderId: id } })
    await db.order.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/orders/[id] error:', error)
    return NextResponse.json({ error: 'فشل حذف الطلب' }, { status: 500 })
  }
}
