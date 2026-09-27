import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/delivery-companies — قائمة شركات التوصيل
export async function GET() {
  try {
    const companies = await db.deliveryCompany.findMany({
      include: { _count: { select: { orders: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(companies)
  } catch (error) {
    console.error('GET /api/delivery-companies error:', error)
    return NextResponse.json({ error: 'فشل جلب شركات التوصيل' }, { status: 500 })
  }
}

// POST /api/delivery-companies — إضافة شركة توصيل
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, phone, coverage, flatFee, apiKey, webhookUrl, active } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'اسم الشركة مطلوب' }, { status: 400 })
    }

    const company = await db.deliveryCompany.create({
      data: {
        name: name.trim(),
        phone: phone?.trim() || null,
        coverage: coverage?.trim() || null,
        flatFee: typeof flatFee === 'number' && flatFee >= 0 ? flatFee : 0,
        apiKey: apiKey?.trim() || null,
        webhookUrl: webhookUrl?.trim() || null,
        active: typeof active === 'boolean' ? active : true,
      },
    })
    return NextResponse.json(company, { status: 201 })
  } catch (error) {
    console.error('POST /api/delivery-companies error:', error)
    return NextResponse.json({ error: 'فشل إضافة شركة التوصيل' }, { status: 500 })
  }
}
