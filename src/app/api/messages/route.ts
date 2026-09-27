import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSettingsMap, generateAutoReply } from '@/lib/ai'

// GET /api/messages?customerId=xxx — محادثات العملاء
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const customerId = searchParams.get('customerId')

    const where: Record<string, unknown> = {}
    if (customerId) where.customerId = customerId

    const messages = await db.message.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        order: { select: { id: true, orderNumber: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json(messages)
  } catch (error) {
    console.error('GET /api/messages error:', error)
    return NextResponse.json({ error: 'فشل جلب الرسائل' }, { status: 500 })
  }
}

// POST /api/messages — إرسال/استلام رسالة مع رد آلي ذكي
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { customerId, content, direction, orderId } = body

    if (!customerId || !content?.trim()) {
      return NextResponse.json({ error: 'العميل والمحتوى مطلوبان' }, { status: 400 })
    }

    const customer = await db.customer.findUnique({ where: { id: customerId } })
    if (!customer) {
      return NextResponse.json({ error: 'العميل غير موجود' }, { status: 404 })
    }

    const dir = direction === 'outgoing' ? 'outgoing' : 'incoming'
    const message = await db.message.create({
      data: {
        customerId,
        orderId: orderId || null,
        direction: dir,
        content: content.trim(),
        isAuto: false,
        deliveredBy: dir === 'outgoing' ? 'merchant' : null,
      },
    })

    // إذا كانت رسالة واردة من العميل والرد الآلي مفعّل → ولّد رداً ذكياً وأرسله تلقائياً
    if (dir === 'incoming') {
      const settings = await getSettingsMap()
      if (settings.autoReplyEnabled === 'true') {
        try {
          const reply = await generateAutoReply({
            customerMessage: content.trim(),
            customerId,
            customerName: customer.name,
            orderId: orderId || null,
          })
          const autoMessage = await db.message.create({
            data: {
              customerId,
              orderId: orderId || null,
              direction: 'outgoing',
              content: reply,
              isAuto: true,
              deliveredBy: 'ai',
            },
          })
          return NextResponse.json({ message, autoReply: autoMessage }, { status: 201 })
        } catch (aiError) {
          console.error('Auto-reply generation failed:', aiError)
          // نعيد الرسالة الأصلية حتى لو فشل الذكاء الاصطناعي
          return NextResponse.json(
            { message, autoReplyError: 'تعذر توليد رد آلي. سيرد الفريق يدوياً.' },
            { status: 201 }
          )
        }
      }
    }

    return NextResponse.json({ message }, { status: 201 })
  } catch (error) {
    console.error('POST /api/messages error:', error)
    return NextResponse.json({ error: 'فشل إرسال الرسالة' }, { status: 500 })
  }
}
