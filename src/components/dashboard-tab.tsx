'use client'

import { useFetch } from '@/hooks/use-fetch'
import {
  formatDA, formatRelative,
  ORDER_STATUSES, statusColor, statusLabel, type Stats,
} from '@/lib/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from '@/components/ui/chart'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis,
} from 'recharts'
import {
  AlertTriangle, ArrowLeft, Bot, Boxes, MessageSquare, PackageCheck, ShoppingBag,
  TrendingUp, Users, Wallet, type LucideIcon,
} from 'lucide-react'

interface Props {
  version: number
  onChanged: () => void
  onNavigate: (tab: string) => void
}

interface StatCard {
  title: string
  value: string
  icon: LucideIcon
  note: string
  tone: string
}

export default function DashboardTab({ version, onChanged, onNavigate }: Props) {
  const { data, loading } = useFetch<Stats>(`/api/stats?v=${version}`)
  void onChanged

  const recentOrders = data?.recentOrders ?? []
  const salesSeries = data?.salesSeries ?? []

  const statusData = (data ? ORDER_STATUSES : []).map((s, i) => ({
    key: s.value,
    label: s.label,
    count: data?.byStatus[s.value] || 0,
    fill: `var(--color-${s.value})`,
    palette: `var(--chart-${(i % 5) + 1})`,
  }))

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }
  if (!data) return null

  const activeOrders = data.totalOrders - (data.byStatus.delivered || 0) - (data.byStatus.cancelled || 0)
  const deliveredCount = data.byStatus.delivered || 0
  const fulfillmentRate = data.totalOrders > 0 ? Math.round((deliveredCount / data.totalOrders) * 100) : 0

  const cards: StatCard[] = [
    { title: 'المنتجات', value: String(data.totalProducts), icon: Boxes, note: 'في المخزون', tone: 'from-emerald-500/15 to-emerald-500/5 text-emerald-700 dark:text-emerald-300' },
    { title: 'الطلبات النشطة', value: String(activeOrders), icon: ShoppingBag, note: `${data.totalOrders} إجمالي الطلبات`, tone: 'from-amber-500/15 to-amber-500/5 text-amber-700 dark:text-amber-300' },
    { title: 'الإيرادات المحققة', value: formatDA(data.revenue), icon: Wallet, note: 'طلبات تم توصيلها', tone: 'from-teal-500/15 to-teal-500/5 text-teal-700 dark:text-teal-300' },
    { title: 'قيد المعالجة', value: formatDA(data.potentialRevenue), icon: TrendingUp, note: 'طلبات لم تُسلّم بعد', tone: 'from-violet-500/15 to-violet-500/5 text-violet-700 dark:text-violet-300' },
    { title: 'العملاء', value: String(data.totalCustomers), icon: Users, note: 'عملاء مسجلون', tone: 'from-cyan-500/15 to-cyan-500/5 text-cyan-700 dark:text-cyan-300' },
    { title: 'رسائل العملاء', value: String(data.totalMessages), icon: MessageSquare, note: `${data.unreadIncoming} رسالة واردة`, tone: 'from-orange-500/15 to-orange-500/5 text-orange-700 dark:text-orange-300' },
    { title: 'ردود آلية بالذكاء', value: String(data.autoRepliesCount), icon: Bot, note: 'رد أرسله المساعد الذكي', tone: 'from-primary/20 to-primary/5 text-primary' },
    { title: 'تنبيهات المخزون', value: String(data.lowStockProducts.length), icon: AlertTriangle, note: 'منتجات على وشك النفاد', tone: 'from-red-500/15 to-red-500/5 text-red-700 dark:text-red-300' },
  ]

  const salesConfig = {
    orders: { label: 'الطلبات', color: 'var(--chart-2)' },
    revenue: { label: 'الإيرادات', color: 'var(--chart-1)' },
  } satisfies ChartConfig

  const statusConfig = Object.fromEntries(
    statusData.map((s) => [s.key, { label: s.label, color: s.palette }])
  ) satisfies ChartConfig

  return (
    <div className="space-y-6">
      {/* بطاقات الإحصائيات */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.title} className="group overflow-hidden border-0 shadow-soft ring-1 ring-border/60 transition-all hover:-translate-y-0.5 hover:shadow-lift">
            <CardContent className="p-4 flex items-start gap-3">
              <div className={`h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 bg-gradient-to-br ring-1 ring-inset ring-black/5 ${c.tone}`}>
                <c.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm text-muted-foreground">{c.title}</div>
                <div className="tabular text-xl font-extrabold truncate">{c.value}</div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">{c.note}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* الرسوم البيانية */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-0 shadow-soft ring-1 ring-border/60 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> مبيعات آخر 7 أيام
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.totalOrders === 0 ? (
              <EmptyHint text="لا توجد طلبات بعد — أنشئ أول طلب من تبويب «الطلبات» لعرض الرسم البياني." />
            ) : (
              <ChartContainer config={salesConfig} className="h-64 w-full aspect-auto">
                <AreaChart data={salesSeries} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v) => formatShort(v)} />
                  <ChartTooltip
                    content={<ChartTooltipContent formatter={(value, name) => (
                      <span className="tabular font-semibold">
                        {name === 'revenue' ? formatDA(Number(value)) : `${value} طلب`}
                      </span>
                    )} />}
                  />
                  <Area
                    dataKey="revenue" type="monotone" stroke="var(--color-revenue)"
                    strokeWidth={2.5} fill="url(#fillRevenue)"
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-soft ring-1 ring-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <PackageCheck className="h-4 w-4 text-primary" /> توزيع حالات الطلبات
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.totalOrders === 0 ? (
              <EmptyHint text="لا توجد طلبات بعد." />
            ) : (
              <>
                <ChartContainer config={statusConfig} className="mx-auto h-44 w-full aspect-auto">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent nameKey="key" hideLabel />} />
                    <Pie data={statusData} dataKey="count" nameKey="key" innerRadius={46} outerRadius={70} paddingAngle={3} strokeWidth={0}>
                      {statusData.map((s) => (
                        <Cell key={s.key} fill={s.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <span className="tabular font-bold text-foreground text-sm">{fulfillmentRate}%</span>
                  نسبة الطلبات الموصّلة
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {statusData.map((s) => (
                    <div key={s.key} className="flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs">
                      <span className="flex items-center gap-1.5 truncate">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.fill }} />
                        {s.label}
                      </span>
                      <span className="tabular font-semibold">{s.count}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* تنبيهات المخزون */}
        <Card className="border-0 shadow-soft ring-1 ring-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> تنبيهات المخزون المنخفض
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.lowStockProducts.length === 0 ? (
              <EmptyHint text="كل المنتجات بمخزون جيد ✓" />
            ) : (
              <ul className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pe-1">
                {data.lowStockProducts.map((p) => (
                  <li key={p.id} className="flex items-center justify-between rounded-xl border border-amber-200/70 bg-amber-50/60 px-3 py-2 dark:bg-amber-500/10 dark:border-amber-500/20">
                    <span className="text-sm font-medium truncate">{p.name}</span>
                    <Badge variant="outline" className="tabular border-red-200 bg-red-50 text-red-700 shrink-0 ms-2 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/20">
                      {p.quantity} متبقي (الحد {p.minQuantity})
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* أحدث الطلبات */}
        <Card className="border-0 shadow-soft ring-1 ring-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              أحدث الطلبات
              <Button variant="ghost" size="sm" onClick={() => onNavigate('orders')} className="gap-1 text-primary">
                الكل <ArrowLeft className="h-3.5 w-3.5" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
            {data.recentOrders.length === 0 && <EmptyHint text="لا توجد طلبات بعد." />}
            {data.recentOrders.map((o) => (
              <div key={o.id} className="flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors hover:bg-accent/50">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">
                    <span className="tabular font-mono" dir="ltr">{o.orderNumber}</span> — {o.customer?.name}
                  </div>
                  <div className="text-xs text-muted-foreground">{formatRelative(o.createdAt)} · {formatDA(o.total)}</div>
                </div>
                <Badge variant="outline" className={statusColor(o.status)}>{statusLabel(o.status)}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* أحدث الرسائل */}
        <Card className="border-0 shadow-soft ring-1 ring-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              أحدث رسائل العملاء
              <Button variant="ghost" size="sm" onClick={() => onNavigate('messages')} className="gap-1 text-primary">
                الكل <ArrowLeft className="h-3.5 w-3.5" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
            {data.recentMessages.length === 0 && <EmptyHint text="لا توجد رسائل بعد." />}
            {data.recentMessages.map((m) => (
              <div key={m.id} className="rounded-xl border px-3 py-2.5 transition-colors hover:bg-accent/50">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${m.direction === 'incoming' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                  <span className="text-sm font-semibold">{m.customer?.name}</span>
                  {m.isAuto && (
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] px-1.5 py-0 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20">
                      <Bot className="h-3 w-3 me-1" /> رد آلي
                    </Badge>
                  )}
                  <span className="text-[11px] text-muted-foreground ms-auto">{formatRelative(m.createdAt)}</span>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">{m.content}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* مقارنة الطلبات اليومية */}
      {recentOrders.length > 0 && (
        <Card className="border-0 shadow-soft ring-1 ring-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-primary" /> عدد الطلبات اليومية
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={salesConfig} className="h-48 w-full aspect-auto">
              <BarChart data={salesSeries} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
                <ChartTooltip
                  content={<ChartTooltipContent formatter={(value) => <span className="tabular font-semibold">{value} طلب</span>} />}
                />
                <Bar dataKey="orders" fill="var(--color-orders)" radius={[6, 6, 0, 0]} maxBarSize={44} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function EmptyHint({ text }: { text: string }) {
  return <p className="py-10 text-center text-sm text-muted-foreground">{text}</p>
}

function formatShort(v: number): string {
  if (Math.abs(v) >= 1000) return `${Math.round(v / 1000)}k`
  return String(v)
}
