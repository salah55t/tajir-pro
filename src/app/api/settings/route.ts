import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const DEFAULT_SETTINGS: Record<string, string> = {
  businessName: 'متجر النجاح',
  businessInfo: 'متجر محلي متخصص في بيع المنتجات الغذائية والمواد المنزلية مع خدمة توصيل سريعة.',
  workingHours: 'من 9 صباحاً إلى 8 مساءً، طوال أيام الأسبوع ما عدا الجمعة',
  autoReplyEnabled: 'true',
  aiPersona: 'ودي ومهني، يرد بسرعة وباختصار، وباللهجة العربية المبسطة',
  aiInstructions: 'ركز على تسريع إتمام الطلبات واقترح التوصيل للطلبات فوق 3000 دج.',
}

// GET /api/settings — جلب الإعدادات
export async function GET() {
  try {
    const rows = await db.setting.findMany()
    const map: Record<string, string> = { ...DEFAULT_SETTINGS }
    for (const row of rows) map[row.key] = row.value
    return NextResponse.json(map)
  } catch (error) {
    console.error('GET /api/settings error:', error)
    return NextResponse.json({ error: 'فشل جلب الإعدادات' }, { status: 500 })
  }
}

// PUT /api/settings — تحديث الإعدادات
export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>

    for (const [key, value] of Object.entries(body)) {
      if (typeof value !== 'string') continue
      await db.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    }

    const rows = await db.setting.findMany()
    const map: Record<string, string> = { ...DEFAULT_SETTINGS }
    for (const row of rows) map[row.key] = row.value
    return NextResponse.json(map)
  } catch (error) {
    console.error('PUT /api/settings error:', error)
    return NextResponse.json({ error: 'فشل حفظ الإعدادات' }, { status: 500 })
  }
}
