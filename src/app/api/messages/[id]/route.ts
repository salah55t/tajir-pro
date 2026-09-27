import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// DELETE /api/messages/[id] — حذف رسالة
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await db.message.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/messages/[id] error:', error)
    return NextResponse.json({ error: 'فشل حذف الرسالة' }, { status: 500 })
  }
}
