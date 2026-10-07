'use client'

import { useEffect, useRef, useState } from 'react'
import { apiCall, useFetch } from '@/hooks/use-fetch'
import type { Settings } from '@/lib/client-types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { Bot, Database, Download, Loader2, Save, Store, Upload } from 'lucide-react'

interface Props {
  version: number
  onChanged: () => void
}

const PERSONAS = [
  { value: 'ودي ومهني، يرد بسرعة وباختصار، وباللهجة العربية المبسطة', label: 'ودي ومختصر (موصى به)' },
  { value: 'رسمي ومهني جداً، بلغة عربية فصحى واضحة', label: 'رسمي وفصيح' },
  { value: 'حماسي ومتحمس، يشجع العميل على الشراء ويقترح العروض', label: 'تسويقي وحماسي' },
  { value: 'هادئ وصبور، يتعامل مع الشكاوى بلمعان وتفهم كبير', label: 'خدمة عملاء صبور' },
]

export default function SettingsTab({ version, onChanged }: Props) {
  const { data, loading, refresh } = useFetch<Settings>(`/api/settings?v=${version}`)
  const { toast } = useToast()
  const [form, setForm] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const exportBackup = async () => {
    setExporting(true)
    try {
      const res = await fetch('/api/backup')
      if (!res.ok) throw new Error('فشل التصدير')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `tajirpro-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast({ title: 'تم تصدير النسخة الاحتياطية', description: 'حُفظ الملف في مجلد التنزيلات.' })
    } catch (e) {
      toast({ title: 'خطأ', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setExporting(false)
    }
  }

  const importBackup = async (file: File) => {
    setImporting(true)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const res = await apiCall<{ counts: Record<string, number> }>('/api/backup', 'POST', parsed)
      toast({
        title: 'تم استيراد النسخة الاحتياطية',
        description: `${res.counts.products} منتج · ${res.counts.customers} عميل · ${res.counts.orders} طلب.`,
      })
      refresh()
      setForm(null)
      onChanged()
    } catch (e) {
      toast({ title: 'فشل الاستيراد', description: e instanceof Error ? e.message : 'ملف غير صالح', variant: 'destructive' })
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  useEffect(() => {
    if (data && !form) {
      const t = setTimeout(() => setForm(data), 0)
      return () => clearTimeout(t)
    }
  }, [data, form])

  if (loading && !data) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    )
  }
  if (!form) return null

  const set = (key: keyof Settings, value: string) => setForm({ ...form, [key]: value })

  const dirty = !!data && Object.keys(form).some((k) => form[k] !== data[k])

  const save = async () => {
    setSaving(true)
    try {
      await apiCall('/api/settings', 'PUT', {
        businessName: form.businessName,
        businessInfo: form.businessInfo,
        workingHours: form.workingHours,
        aiPersona: form.aiPersona,
        aiInstructions: form.aiInstructions,
      })
      toast({ title: 'تم حفظ الإعدادات', description: 'ستؤثر هذه الإعدادات على ردود المساعد الذكي فوراً.' })
      refresh()
      setForm(null)
      onChanged()
    } catch (e) {
      toast({ title: 'خطأ', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* معلومات المتجر */}
      <Card className="border-0 shadow-soft ring-1 ring-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Store className="h-4 w-4" />
            </span>
            معلومات المتجر
          </CardTitle>
          <CardDescription>تستخدمها المنصة في الرسائل والردود الآلية على العملاء.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="s-name">اسم المتجر</Label>
            <Input id="s-name" value={form.businessName} onChange={(e) => set('businessName', e.target.value)} placeholder="مثال: متجر النجاح" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-info">نبذة عن المتجر</Label>
            <Textarea id="s-info" value={form.businessInfo} onChange={(e) => set('businessInfo', e.target.value)} rows={3} placeholder="ماذا تبيع؟ ما الذي يميز متجرك؟" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-hours">ساعات العمل</Label>
            <Input id="s-hours" value={form.workingHours} onChange={(e) => set('workingHours', e.target.value)} placeholder="من 9 صباحاً إلى 8 مساءً" />
          </div>
        </CardContent>
      </Card>

      {/* إعدادات المساعد الذكي */}
      <Card className="border-0 shadow-soft ring-1 ring-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Bot className="h-4 w-4" />
            </span>
            شخصية المساعد الذكي
          </CardTitle>
          <CardDescription>يتحكم في أسلوب الردود الآلية على رسائل العملاء.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>أسلوب الرد</Label>
            <Select value={form.aiPersona} onValueChange={(v) => set('aiPersona', v)}>
              <SelectTrigger><SelectValue placeholder="اختر شخصية المساعد" /></SelectTrigger>
              <SelectContent>
                {PERSONAS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-inst">تعليمات خاصة للمساعد</Label>
            <Textarea
              id="s-inst"
              value={form.aiInstructions}
              onChange={(e) => set('aiInstructions', e.target.value)}
              rows={4}
              placeholder="مثال: اقترح التوصيل المجاني للطلبات فوق 5000 دج، ولا تناقش الأسعار مع العملاء."
            />
            <p className="text-xs text-muted-foreground">
              يستخدم المساعد سياق المخزون الحالي وطلبات العميل تلقائياً عند الرد — لا حاجة لتكراره هنا.
            </p>
          </div>
          <div className="rounded-xl border bg-primary/5 p-3 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">كيف يعمل الرد الآلي؟</span> عند وصول رسالة جديدة من عميل والرد الآلي
            مفعّل، يقرأ المساعد رسالته ثم يفحص منتجاتك المتوفرة وسجل طلباته قبل صياغة رد مناسب وإرساله فوراً.
          </div>
        </CardContent>
      </Card>

      {/* النسخ الاحتياطي */}
      <Card className="border-0 shadow-soft ring-1 ring-border/60 lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Database className="h-4 w-4" />
            </span>
            النسخ الاحتياطي والاستعادة
          </CardTitle>
          <CardDescription>
            صدّر كل بياناتك في ملف واحد واحتفظ به في مكان آمن، أو استعد نسخة سابقة. البيانات محفوظة على هذا الجهاز فقط.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button onClick={exportBackup} disabled={exporting} variant="outline" className="gap-1.5">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            تصدير نسخة احتياطية
          </Button>
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            variant="outline"
            className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-500/40 dark:text-amber-300 dark:hover:bg-amber-500/10"
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            استيراد نسخة احتياطية
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) importBackup(file)
            }}
          />
          <span className="text-xs text-muted-foreground">
            الاستيراد يستبدل البيانات الحالية بالكامل — صدّر نسخة قبل ذلك.
          </span>
        </CardContent>
      </Card>

      <div className="lg:col-span-2 flex items-center justify-end gap-3">
        {dirty && <span className="text-sm text-amber-600 dark:text-amber-400">لديك تغييرات غير محفوظة</span>}
        <Button onClick={save} disabled={saving || !dirty} className="gap-1.5 shadow-sm">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          حفظ الإعدادات
        </Button>
      </div>
    </div>
  )
}
