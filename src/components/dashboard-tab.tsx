'use client'

import { useFetch } from '@/hooks/use-fetch'
import { formatDA, formatDate, statusColor, statusLabel, type Stats } from '@/lib/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertTriangle, ArrowLeft, Bot, Boxes, MessageSquare, PackageCheck, ShoppingBag, TrendingUp, Users, Wallet,
} from 'lucide-react'

interface Props {
  version: number
  onChanged: () => void
  onNavigate: (tab: string) => void
}

export default function DashboardTab({ version, onChanged, onNavigate }: Props) {
  const { data, loading } = useFetch<Stats>(`/api/stats?v=${version}`)
  void onChanged

  if (loading && !data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    )
  }
  if (!data) return null

  const activeOrders = data.totalOrders - (data.byStatus.delivered || 0) - (data.byStatus.cancelled || 0)

  const cards = [
    { title: 'المنتجات', value: String(data.totalProducts), icon: Boxes, note: 'في المخزون', color: 'bg-emerald-100 text-emerald-700' },
    { title: 'الطلبات النشطة', value: String(activeOrders), icon: ShoppingBag, note: `${data.totalOrders} إجمالي الطلبات`, color: 'bg-amber-100 text-amber-700' },
    { title: 'الإيرادات المحققة', value: formatDA(data.revenue), icon: Wallet, note: 'طلبات تم توصيلها', color: 'bg-teal-100 text-teal-700' },
    { title: 'قيد المعالجة', value: formatDA(data.potentialRevenue), icon: TrendingUp, note: 'طلبات لم تُسلّم بعد', color: 'bg-violet-100 text-violet-700' },
    { title: 'العملاء', value: String(data.totalCustomers), icon: Users, note: 'عملاء مسجلون', color: 'bg-cyan-100 text-cyan-700' },
    { title: 'رسائل العملاء', value: String(data.totalMessages), icon: MessageSquare, note: `${data.unreadIncoming} رسالة واردة`, color: 'bg-orange-100 text-orange-700' },
    { title: 'ردود آلية بالذكاء', value: String(data.autoRepliesCount), icon: Bot, note: 'رد أرسله المساعد الذكي', color: 'bg-emerald-100 text-emerald-700' },
    { title: 'تنبيهات المخزون', value: String(data.lowStockProducts.length), icon: AlertTriangle, note: 'منتجات على وشك النفاد', color: 'bg-red-100 text-red-700' },
  ]

  const maxStatus = Math.max(1, ...Object.values(data.byStatus))

  return (
    <div className="space-y-6">
      {/* بطاقات الإحصائيات */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.title} className="border shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-start gap-3">
              <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${c.color}`}>
                <c.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm text-muted-foreground">{c.title}</div>
                <div className="text-xl font-bold truncate">{c.value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{c.note}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* حالة الطلبات */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <PackageCheck className="h-4 w-4 text-primary" /> توزيع حالات الطلبات
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(data.byStatus).map(([status, count]) => (
              <div key={status}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <Badge variant="outline" className={statusColor(status)}>{statusLabel(status)}</Badge>
                  <span className="font-semibold">{count}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${(count / maxStatus) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            {data.totalOrders === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">لا توجد طلبات بعد — أنشئ أول طلب من تبويب «الطلبات».</p>
            )}
          </CardContent>
        </Card>

        {/* تنبيهات المخزون */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> تنبيهات المخزون المنخفض
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.lowStockProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">كل المنتجات بمخزون جيد ✓</p>
            ) : (
              <ul className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar pe-1">
                {data.lowStockProducts.map((p) => (
                  <li key={p.id} className="flex items-center justify-between rounded-lg border px-3 py-2 bg-amber-50/50">
                    <span className="text-sm font-medium truncate">{p.name}</span>
                    <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700 shrink-0 ms-2">
                      {p.quantity} متبقي (الحد {p.minQuantity})
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* أحدث الطلبات */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              أحدث الطلبات
              <Button variant="ghost" size="sm" onClick={() => onNavigate('orders')} className="gap-1 text-primary">
                الكل <ArrowLeft className="h-3.5 w-3.5" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
            {data.recentOrders.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">لا توجد طلبات بعد.</p>
            )}
            {data.recentOrders.map((o) => (
              <div key={o.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5 hover:bg-muted/40 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{o.orderNumber} — {o.customer?.name}</div>
                  <div className="text-xs text-muted-foreground">{formatDate(o.createdAt)} · {formatDA(o.total)}</div>
                </div>
                <Badge variant="outline" className={statusColor(o.status)}>{statusLabel(o.status)}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* أحدث الرسائل */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              أحدث رسائل العملاء
              <Button variant="ghost" size="sm" onClick={() => onNavigate('messages')} className="gap-1 text-primary">
                الكل <ArrowLeft className="h-3.5 w-3.5" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
            {data.recentMessages.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">لا توجد رسائل بعد.</p>
            )}
            {data.recentMessages.map((m) => (
              <div key={m.id} className="rounded-lg border px-3 py-2.5 hover:bg-muted/40 transition-colors">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${m.direction === 'incoming' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                  <span className="text-sm font-semibold">{m.customer?.name}</span>
                  {m.isAuto && (
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] px-1.5 py-0">
                      <Bot className="h-3 w-3 me-1" /> رد آلي
                    </Badge>
                  )}
                  <span className="text-[11px] text-muted-foreground ms-auto">{formatDate(m.createdAt)}</span>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">{m.content}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
