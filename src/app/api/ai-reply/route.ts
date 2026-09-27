import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateAutoReply } from '@/lib/ai'

// POST /api/ai-reply — توليد رد مقترح بالذكاء الاصطناعي (بدون إرسال تلقائي)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { messageId } = body

    if (!messageId) {
      return NextResponse.json({ error: 'معرف الرسالة مطلوب' }, { status: 400 })
    }

    const message = await db.message.findUnique({
      where: { id: messageId },
      include: { customer: { select: { id: true, name: true } } },
    })
    if (!message) {
      return NextResponse.json({ error: 'الرسالة غير موجودة' }, { status: 404 })
    }

    const reply = await generateAutoReply({
      customerMessage: message.content,
      customerId: message.customerId,
      customerName: message.customer.name,
      orderId: message.orderId,
    })

    return NextResponse.json({ suggestion: reply })
  } catch (error) {
    console.error('POST /api/ai-reply error:', error)
    return NextResponse.json({ error: 'تعذر توليد الرد المقترح' }, { status: 500 })
  }
}
