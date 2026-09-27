import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/stats — إحصائيات لوحة التحكم
export async function GET() {
  try {
    const [totalProducts, totalCustomers, totalOrders, lowStockProducts, orders, messages, unreadIncoming] =
      await Promise.all([
        db.product.count(),
        db.customer.count(),
        db.order.count(),
        db.product.findMany({
          where: { quantity: { lte: 5 } },
          select: { id: true, name: true, quantity: true, minQuantity: true },
          orderBy: { quantity: 'asc' },
          take: 8,
        }),
        db.order.findMany({ select: { status: true, total: true, createdAt: true } }),
        db.message.count(),
        db.message.count({ where: { direction: 'incoming' } }),
      ])

    const byStatus: Record<string, number> = {
      pending: 0,
      confirmed: 0,
      preparing: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
    }
    let revenue = 0
    let potentialRevenue = 0
    for (const o of orders) {
      byStatus[o.status] = (byStatus[o.status] || 0) + 1
      if (o.status === 'delivered') revenue += o.total
      if (!['cancelled', 'delivered'].includes(o.status)) potentialRevenue += o.total
    }

    const recentOrders = await db.order.findMany({
      take: 6,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, name: true } },
        deliveryCompany: { select: { id: true, name: true } },
      },
    })

    const recentMessages = await db.message.findMany({
      take: 8,
      orderBy: { createdAt: 'desc' },
      include: { customer: { select: { id: true, name: true } } },
    })

    const autoRepliesCount = await db.message.count({ where: { isAuto: true, deliveredBy: 'ai' } })

    return NextResponse.json({
      totalProducts,
      totalCustomers,
      totalOrders,
      lowStockProducts,
      byStatus,
      revenue,
      potentialRevenue,
      totalMessages: messages,
      unreadIncoming,
      autoRepliesCount,
      recentOrders,
      recentMessages,
    })
  } catch (error) {
    console.error('GET /api/stats error:', error)
    return NextResponse.json({ error: 'فشل جلب الإحصائيات' }, { status: 500 })
  }
}
