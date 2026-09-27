import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PUT /api/customers/[id] — تعديل عميل
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const existing = await db.customer.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'العميل غير موجود' }, { status: 404 })
    }

    const customer = await db.customer.update({
      where: { id },
      data: {
        name: body.name?.trim() ?? existing.name,
        phone: body.phone?.trim() ?? existing.phone,
        address: body.address !== undefined ? (body.address?.trim() || null) : existing.address,
      },
    })
    return NextResponse.json(customer)
  } catch (error) {
    console.error('PUT /api/customers/[id] error:', error)
    return NextResponse.json({ error: 'فشل تعديل العميل' }, { status: 500 })
  }
}

// DELETE /api/customers/[id] — حذف عميل
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const orders = await db.order.count({ where: { customerId: id } })
    if (orders > 0) {
      return NextResponse.json({ error: 'لا يمكن حذف عميل لديه طلبات مسجلة' }, { status: 409 })
    }
    await db.message.deleteMany({ where: { customerId: id } })
    await db.customer.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/customers/[id] error:', error)
    return NextResponse.json({ error: 'فشل حذف العميل' }, { status: 500 })
  }
}
