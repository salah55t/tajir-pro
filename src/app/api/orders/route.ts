import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

function generateOrderNumber(): string {
  const now = new Date()
  const y = now.getFullYear().toString().slice(-2)
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `ORD-${y}${m}${d}-${rand}`
}

// GET /api/orders — قائمة الطلبات
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    const where: Record<string, unknown> = {}
    if (status) where.status = status

    const orders = await db.order.findMany({
      where,
      include: {
        customer: true,
        deliveryCompany: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(orders)
  } catch (error) {
    console.error('GET /api/orders error:', error)
    return NextResponse.json({ error: 'فشل جلب الطلبات' }, { status: 500 })
  }
}

// POST /api/orders — إنشاء طلب جديد
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { customerId, deliveryCompanyId, address, notes, items } = body

    if (!customerId) {
      return NextResponse.json({ error: 'العميل مطلوب' }, { status: 400 })
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'يجب إضافة منتج واحد على الأقل للطلب' }, { status: 400 })
    }

    const customer = await db.customer.findUnique({ where: { id: customerId } })
    if (!customer) {
      return NextResponse.json({ error: 'العميل غير موجود' }, { status: 404 })
    }

    // التحقق من المنتجات والمخزون
    const validated: { productId: string; quantity: number; price: number }[] = []
    for (const item of items) {
      const product = await db.product.findUnique({ where: { id: item.productId } })
      if (!product) {
        return NextResponse.json({ error: 'أحد المنتجات غير موجود' }, { status: 404 })
      }
      const qty = Math.floor(Number(item.quantity))
      if (!qty || qty <= 0) {
        return NextResponse.json({ error: `كمية غير صالحة للمنتج: ${product.name}` }, { status: 400 })
      }
      if (product.quantity < qty) {
        return NextResponse.json(
          { error: `المخزون غير كافٍ للمنتج "${product.name}" (المتوفر: ${product.quantity})` },
          { status: 409 }
        )
      }
      validated.push({ productId: product.id, quantity: qty, price: product.price })
    }

    const deliveryFee = typeof body.deliveryFee === 'number' && body.deliveryFee >= 0 ? body.deliveryFee : 0
    const subtotal = validated.reduce((sum, i) => sum + i.price * i.quantity, 0)
    const total = subtotal + deliveryFee

    const order = await db.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          customerId,
          deliveryCompanyId: deliveryCompanyId || null,
          status: 'pending',
          total,
          deliveryFee,
          address: address?.trim() || customer.address,
          notes: notes?.trim() || null,
          items: {
            create: validated.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
              price: i.price,
            })),
          },
        },
        include: {
          customer: true,
          deliveryCompany: { select: { id: true, name: true } },
          items: { include: { product: { select: { id: true, name: true, sku: true } } } },
        },
      })

      // خصم الكميات من المخزون
      for (const item of validated) {
        await tx.product.update({
          where: { id: item.productId },
          data: { quantity: { decrement: item.quantity } },
        })
      }

      return created
    })

    return NextResponse.json(order, { status: 201 })
  } catch (error) {
    console.error('POST /api/orders error:', error)
    return NextResponse.json({ error: 'فشل إنشاء الطلب' }, { status: 500 })
  }
}
