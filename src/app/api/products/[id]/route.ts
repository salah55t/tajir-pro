import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PUT /api/products/[id] — تعديل منتج
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const { name, sku, description, category, price, cost, quantity, minQuantity } = body

    const existing = await db.product.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 })
    }

    if (sku && sku.trim() !== existing.sku) {
      const skuTaken = await db.product.findUnique({ where: { sku: sku.trim() } })
      if (skuTaken) {
        return NextResponse.json({ error: 'رقم المرجع (SKU) مستخدم مسبقاً' }, { status: 409 })
      }
    }

    const product = await db.product.update({
      where: { id },
      data: {
        name: name?.trim() ?? existing.name,
        sku: sku?.trim() ?? existing.sku,
        description: description !== undefined ? (description?.trim() || null) : existing.description,
        category: category !== undefined ? (category?.trim() || null) : existing.category,
        price: typeof price === 'number' ? price : existing.price,
        cost: typeof cost === 'number' ? cost : existing.cost,
        quantity: typeof quantity === 'number' && quantity >= 0 ? Math.floor(quantity) : existing.quantity,
        minQuantity: typeof minQuantity === 'number' && minQuantity >= 0 ? Math.floor(minQuantity) : existing.minQuantity,
      },
    })
    return NextResponse.json(product)
  } catch (error) {
    console.error('PUT /api/products/[id] error:', error)
    return NextResponse.json({ error: 'فشل تعديل المنتج' }, { status: 500 })
  }
}

// DELETE /api/products/[id] — حذف منتج
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const items = await db.orderItem.count({ where: { productId: id } })
    if (items > 0) {
      return NextResponse.json(
        { error: 'لا يمكن حذف منتج مرتبط بطلبات. يمكنك ضبط الكمية إلى 0 بدلاً من ذلك.' },
        { status: 409 }
      )
    }
    await db.product.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/products/[id] error:', error)
    return NextResponse.json({ error: 'فشل حذف المنتج' }, { status: 500 })
  }
}
