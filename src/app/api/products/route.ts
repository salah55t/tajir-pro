import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/products — قائمة المنتجات مع دعم البحث
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')?.trim()

    const where: Record<string, unknown> = {}
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { sku: { contains: q } },
        { category: { contains: q } },
      ]
    }

    const products = await db.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(products)
  } catch (error) {
    console.error('GET /api/products error:', error)
    return NextResponse.json({ error: 'فشل جلب المنتجات' }, { status: 500 })
  }
}

// POST /api/products — إضافة منتج جديد
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, sku, description, category, price, cost, quantity, minQuantity } = body

    if (!name?.trim() || !sku?.trim()) {
      return NextResponse.json({ error: 'الاسم ورقم المرجع (SKU) مطلوبان' }, { status: 400 })
    }
    if (typeof price !== 'number' || price < 0) {
      return NextResponse.json({ error: 'السعر غير صالح' }, { status: 400 })
    }

    const existing = await db.product.findUnique({ where: { sku: sku.trim() } })
    if (existing) {
      return NextResponse.json({ error: 'رقم المرجع (SKU) مستخدم مسبقاً' }, { status: 409 })
    }

    const product = await db.product.create({
      data: {
        name: name.trim(),
        sku: sku.trim(),
        description: description?.trim() || null,
        category: category?.trim() || null,
        price,
        cost: typeof cost === 'number' ? cost : null,
        quantity: typeof quantity === 'number' && quantity >= 0 ? Math.floor(quantity) : 0,
        minQuantity: typeof minQuantity === 'number' && minQuantity >= 0 ? Math.floor(minQuantity) : 5,
      },
    })
    return NextResponse.json(product, { status: 201 })
  } catch (error) {
    console.error('POST /api/products error:', error)
    return NextResponse.json({ error: 'فشل إضافة المنتج' }, { status: 500 })
  }
}
