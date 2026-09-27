import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/customers — قائمة العملاء
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')?.trim()

    const where: Record<string, unknown> = {}
    if (q) {
      where.OR = [{ name: { contains: q } }, { phone: { contains: q } }]
    }

    const customers = await db.customer.findMany({
      where,
      include: { _count: { select: { orders: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(customers)
  } catch (error) {
    console.error('GET /api/customers error:', error)
    return NextResponse.json({ error: 'فشل جلب العملاء' }, { status: 500 })
  }
}

// POST /api/customers — إضافة عميل
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, phone, address } = body

    if (!name?.trim() || !phone?.trim()) {
      return NextResponse.json({ error: 'الاسم ورقم الهاتف مطلوبان' }, { status: 400 })
    }

    const customer = await db.customer.create({
      data: {
        name: name.trim(),
        phone: phone.trim(),
        address: address?.trim() || null,
      },
    })
    return NextResponse.json(customer, { status: 201 })
  } catch (error) {
    console.error('POST /api/customers error:', error)
    return NextResponse.json({ error: 'فشل إضافة العميل' }, { status: 500 })
  }
}
