'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useFetch, apiCall } from '@/hooks/use-fetch'
import type { Settings } from '@/lib/client-types'
import DashboardTab from '@/components/dashboard-tab'
import InventoryTab from '@/components/inventory-tab'
import OrdersTab from '@/components/orders-tab'
import DeliveryTab from '@/components/delivery-tab'
import MessagesTab from '@/components/messages-tab'
import SettingsTab from '@/components/settings-tab'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import {
  Store, Package, ShoppingBag, Truck, MessageSquare, LayoutDashboard, Settings as SettingsIcon,
  Bot, Sparkles, Loader2, Database, X,
} from 'lucide-react'

const TABS = [
  { value: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard },
  { value: 'inventory', label: 'المخزون', icon: Package },
  { value: 'orders', label: 'الطلبات', icon: ShoppingBag },
  { value: 'delivery', label: 'التوصيل', icon: Truck },
  { value: 'messages', label: 'الرسائل', icon: MessageSquare },
  { value: 'settings', label: 'الإعدادات', icon: SettingsIcon },
] as const

export default function Home() {
  const [version, setVersion] = useState(0)
  const [tab, setTab] = useState<string>('dashboard')
  const { toast } = useToast()

  const settings = useFetch<Settings>(`/api/settings?v=${version}`)
  const stats = useFetch<{ totalProducts: number; totalMessages: number }>(`/api/stats?v=${version}`)

  const onChanged = useCallback(() => setVersion((v) => v + 1), [])

  const [seeding, setSeeding] = useState(false)
  const [dismissedBanner, setDismissedBanner] = useState(false)
  const seedDemo = async () => {
    setSeeding(true)
    try {
      await apiCall('/api/seed', 'POST')
      toast({ title: 'تمت تعبئة البيانات التجريبية بنجاح', description: 'منتجات وعملاء وشركات توصيل جاهزة للتجربة.' })
      onChanged()
    } catch (e) {
      toast({ title: 'خطأ', description: e instanceof Error ? e.message : 'فشل التعبئة', variant: 'destructive' })
    } finally {
      setSeeding(false)
    }
  }

  // تحديث مفتاح الرد الآلي من تبديل الرأس
  const [autoReply, setAutoReply] = useState(true)
  useEffect(() => {
    if (!settings.data) return
    const next = settings.data.autoReplyEnabled === 'true'
    if (next !== autoReply) {
      const t = setTimeout(() => setAutoReply(next), 0)
      return () => clearTimeout(t)
    }
  }, [settings.data, autoReply])

  const toggleAutoReply = async (checked: boolean) => {
    setAutoReply(checked)
    try {
      await apiCall('/api/settings', 'PUT', { autoReplyEnabled: String(checked) })
      toast({
        title: checked ? 'الردود الآلية مفعلة' : 'الردود الآلية متوقفة',
        description: checked ? 'سيجيب المساعد الذكي على رسائل العملاء تلقائياً.' : 'لن يتم إرسال ردود تلقائية للعملاء.',
      })
      onChanged()
    } catch {
      setAutoReply(!checked)
      toast({ title: 'خطأ في تحديث الإعداد', variant: 'destructive' })
    }
  }

  const businessName = settings.data?.businessName || 'متجر النجاح'
  const showSeedBanner = !!stats.data && stats.data.totalProducts === 0 && !dismissedBanner

  const counts = useMemo(
    () => ({ inventory: stats.data?.totalProducts ?? null, messages: stats.data?.totalMessages ?? null }),
    [stats.data]
  )

  return (
    <div className="relative min-h-screen flex flex-col">
      {/* خلفية زخرفية */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -start-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute top-24 -end-24 h-80 w-80 rounded-full bg-teal-300/20 blur-3xl" />
        <div className="absolute bottom-0 start-1/3 h-72 w-72 rounded-full bg-amber-200/20 blur-3xl" />
      </div>

      {/* الرأس */}
      <header className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60 dark:bg-card/70">
        <div className="mx-auto max-w-7xl px-4 h-16 flex items-center gap-3">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-primary to-emerald-700 text-primary-foreground flex items-center justify-center shadow-md shadow-primary/30">
              <Store className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="font-extrabold text-lg tracking-tight">تاجر برو</div>
              <div className="text-xs text-muted-foreground hidden sm:block max-w-44 truncate">
                {businessName}
              </div>
            </div>
          </div>

          <div className="flex-1" />

          <div className="hidden md:flex items-center gap-2 rounded-full border bg-card/70 px-3 py-1.5 shadow-xs">
            <Bot className={`h-4 w-4 ${autoReply ? 'text-primary' : 'text-muted-foreground'}`} />
            <span className="text-sm font-medium">الردود الآلية</span>
            {settings.loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <Switch checked={autoReply} onCheckedChange={toggleAutoReply} aria-label="تفعيل الردود الآلية" />
            )}
          </div>

          {showSeedBanner && (
            <Button onClick={seedDemo} disabled={seeding} size="sm" className="gap-1.5 shadow-sm">
              {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              <span className="hidden sm:inline">بيانات تجريبية</span>
            </Button>
          )}

          <ThemeToggle />
        </div>
      </header>

      {/* شريط التعبئة التجريبية */}
      {showSeedBanner && (
        <div className="mx-auto max-w-7xl w-full px-4 pt-4">
          <div className="animate-fade-up rounded-2xl border border-amber-200/80 bg-gradient-to-l from-amber-50 to-amber-100/50 px-4 py-3 text-sm text-amber-900 flex flex-wrap items-center gap-2 shadow-xs">
            <Database className="h-4 w-4 shrink-0" />
            <span className="font-semibold">قاعدة البيانات فارغة.</span>
            <span className="flex-1 min-w-40">اضغط زر «بيانات تجريبية» بالأعلى لتجربة المنصة بمنتجات وعملاء وشركات توصيل جاهزة.</span>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-900 hover:bg-amber-200/60" onClick={() => setDismissedBanner(true)} aria-label="إخفاء">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* التبويبات */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6">
        <div role="tablist" aria-label="أقسام المنصة" className="custom-scrollbar -mx-1 mb-5 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {TABS.map((t) => {
            const active = tab === t.value
            const count = t.value === 'inventory' ? counts.inventory : t.value === 'messages' ? counts.messages : null
            return (
              <button
                key={t.value}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.value)}
                className={`group inline-flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition-all ${
                  active
                    ? 'border-primary/30 bg-primary text-primary-foreground shadow-md shadow-primary/25'
                    : 'border-transparent bg-card/70 text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                <t.icon className="h-4 w-4" />
                <span>{t.label}</span>
                {count != null && (
                  <Badge
                    variant="secondary"
                    className={`ms-0.5 hidden h-5 min-w-5 justify-center px-1.5 text-[11px] md:inline-flex ${
                      active ? 'bg-white/20 text-primary-foreground' : ''
                    }`}
                  >
                    {count}
                  </Badge>
                )}
              </button>
            )
          })}
        </div>

        <div key={tab} className="animate-fade-up">
          {tab === 'dashboard' && <DashboardTab version={version} onChanged={onChanged} onNavigate={setTab} />}
          {tab === 'inventory' && <InventoryTab version={version} onChanged={onChanged} />}
          {tab === 'orders' && <OrdersTab version={version} onChanged={onChanged} />}
          {tab === 'delivery' && <DeliveryTab version={version} onChanged={onChanged} />}
          {tab === 'messages' && <MessagesTab version={version} onChanged={onChanged} />}
          {tab === 'settings' && <SettingsTab version={version} onChanged={onChanged} />}
        </div>
      </main>

      {/* التذييل */}
      <footer className="mt-auto border-t bg-card/60 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>تاجر برو — منصة SaaS لإدارة المخزون والطلبات والتوصيل والردود الآلية</span>
          <span className="text-xs opacity-70">البيانات محفوظة محلياً · لا تحتاج إنترنت</span>
        </div>
      </footer>
    </div>
  )
}
