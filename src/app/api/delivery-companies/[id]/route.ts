import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PUT /api/delivery-companies/[id] — تعديل شركة توصيل
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const existing = await db.deliveryCompany.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'شركة التوصيل غير موجودة' }, { status: 404 })
    }

    const company = await db.deliveryCompany.update({
      where: { id },
      data: {
        name: body.name?.trim() ?? existing.name,
        phone: body.phone !== undefined ? (body.phone?.trim() || null) : existing.phone,
        coverage: body.coverage !== undefined ? (body.coverage?.trim() || null) : existing.coverage,
        flatFee: typeof body.flatFee === 'number' && body.flatFee >= 0 ? body.flatFee : existing.flatFee,
        apiKey: body.apiKey !== undefined ? (body.apiKey?.trim() || null) : existing.apiKey,
        webhookUrl: body.webhookUrl !== undefined ? (body.webhookUrl?.trim() || null) : existing.webhookUrl,
        active: typeof body.active === 'boolean' ? body.active : existing.active,
      },
    })
    return NextResponse.json(company)
  } catch (error) {
    console.error('PUT /api/delivery-companies/[id] error:', error)
    return NextResponse.json({ error: 'فشل تعديل شركة التوصيل' }, { status: 500 })
  }
}

// DELETE /api/delivery-companies/[id] — حذف شركة توصيل
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const orders = await db.order.count({ where: { deliveryCompanyId: id } })
    if (orders > 0) {
      return NextResponse.json(
        { error: 'لا يمكن حذف شركة مرتبطة بطلبات. يمكنك تعطيلها بدلاً من ذلك.' },
        { status: 409 }
      )
    }
    await db.deliveryCompany.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/delivery-companies/[id] error:', error)
    return NextResponse.json({ error: 'فشل حذف شركة التوصيل' }, { status: 500 })
  }
}
