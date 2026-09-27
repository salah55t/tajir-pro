'use client'

import { useCallback, useEffect, useState } from 'react'
import { useFetch, apiCall } from '@/hooks/use-fetch'
import type { Settings } from '@/lib/client-types'
import DashboardTab from '@/components/dashboard-tab'
import InventoryTab from '@/components/inventory-tab'
import OrdersTab from '@/components/orders-tab'
import DeliveryTab from '@/components/delivery-tab'
import MessagesTab from '@/components/messages-tab'
import SettingsTab from '@/components/settings-tab'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import {
  Store, Package, ShoppingBag, Truck, MessageSquare, LayoutDashboard, Settings as SettingsIcon,
  Bot, Sparkles, Loader2,
} from 'lucide-react'

export default function Home() {
  const [version, setVersion] = useState(0)
  const [tab, setTab] = useState('dashboard')
  const { toast } = useToast()

  const settings = useFetch<Settings>(`/api/settings?v=${version}`)
  const stats = useFetch<{ totalProducts: number }>(`/api/stats?v=${version}`)

  const onChanged = useCallback(() => setVersion((v) => v + 1), [])

  const [seeding, setSeeding] = useState(false)
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
    if (settings.data) setAutoReply(settings.data.autoReplyEnabled === 'true')
  }, [settings.data])

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

  const showSeedBanner = stats.data && stats.data.totalProducts === 0

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-emerald-50/60 to-background">
      {/* الرأس */}
      <header className="sticky top-0 z-40 border-b bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70">
        <div className="mx-auto max-w-7xl px-4 h-16 flex items-center gap-3">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
              <Store className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="font-extrabold text-lg">تاجر برو</div>
              <div className="text-xs text-muted-foreground hidden sm:block">
                {settings.data?.businessName || 'منصة إدارة المتاجر المحلية'}
              </div>
            </div>
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-2 rounded-full border px-3 py-1.5 bg-white">
            <Bot className={`h-4 w-4 ${autoReply ? 'text-primary' : 'text-muted-foreground'}`} />
            <span className="text-sm font-medium hidden sm:inline">الردود الآلية</span>
            {settings.loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <Switch checked={autoReply} onCheckedChange={toggleAutoReply} aria-label="تفعيل الردود الآلية" />
            )}
          </div>

          {showSeedBanner && (
            <Button onClick={seedDemo} disabled={seeding} size="sm" className="gap-1.5">
              {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              بيانات تجريبية
            </Button>
          )}
        </div>
      </header>

      {/* شريط التعبئة التجريبية */}
      {showSeedBanner && (
        <div className="mx-auto max-w-7xl w-full px-4 pt-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex flex-wrap items-center gap-2">
            <span className="font-semibold">قاعدة البيانات فارغة.</span>
            <span>اضغط زر «بيانات تجريبية» بالأعلى لتجربة المنصة بمنتجات وعملاء وشركات توصيل جاهزة.</span>
          </div>
        </div>
      )}

      {/* التبويبات */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <div className="overflow-x-auto custom-scrollbar -mx-1 px-1 pb-1">
            <TabsList className="inline-flex h-11 w-max min-w-full bg-white border shadow-sm">
              <TabsTrigger value="dashboard" className="gap-1.5 px-3 sm:px-4 data-[state=active]:text-primary">
                <LayoutDashboard className="h-4 w-4" /> لوحة التحكم
              </TabsTrigger>
              <TabsTrigger value="inventory" className="gap-1.5 px-3 sm:px-4 data-[state=active]:text-primary">
                <Package className="h-4 w-4" /> المخزون
                <Badge variant="secondary" className="ms-1 hidden md:inline-flex">{stats.data?.totalProducts ?? '…'}</Badge>
              </TabsTrigger>
              <TabsTrigger value="orders" className="gap-1.5 px-3 sm:px-4 data-[state=active]:text-primary">
                <ShoppingBag className="h-4 w-4" /> الطلبات
              </TabsTrigger>
              <TabsTrigger value="delivery" className="gap-1.5 px-3 sm:px-4 data-[state=active]:text-primary">
                <Truck className="h-4 w-4" /> التوصيل
              </TabsTrigger>
              <TabsTrigger value="messages" className="gap-1.5 px-3 sm:px-4 data-[state=active]:text-primary relative">
                <MessageSquare className="h-4 w-4" /> الرسائل
              </TabsTrigger>
              <TabsTrigger value="settings" className="gap-1.5 px-3 sm:px-4 data-[state=active]:text-primary">
                <SettingsIcon className="h-4 w-4" /> الإعدادات
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="dashboard" className="mt-4">
            <DashboardTab version={version} onChanged={onChanged} onNavigate={setTab} />
          </TabsContent>
          <TabsContent value="inventory" className="mt-4">
            <InventoryTab version={version} onChanged={onChanged} />
          </TabsContent>
          <TabsContent value="orders" className="mt-4">
            <OrdersTab version={version} onChanged={onChanged} />
          </TabsContent>
          <TabsContent value="delivery" className="mt-4">
            <DeliveryTab version={version} onChanged={onChanged} />
          </TabsContent>
          <TabsContent value="messages" className="mt-4">
            <MessagesTab version={version} onChanged={onChanged} />
          </TabsContent>
          <TabsContent value="settings" className="mt-4">
            <SettingsTab version={version} onChanged={onChanged} />
          </TabsContent>
        </Tabs>
      </main>

      {/* التذييل */}
      <footer className="mt-auto border-t bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 text-center text-sm text-muted-foreground">
          تاجر برو — منصة SaaS لإدارة المخزون والطلبات والتوصيل والردود الآلية على العملاء
        </div>
      </footer>
    </div>
  )
}
