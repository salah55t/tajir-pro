'use client'

import { useMemo, useState } from 'react'
import { apiCall, useFetch } from '@/hooks/use-fetch'
import { formatDA, type DeliveryCompany } from '@/lib/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { KeyRound, Loader2, MapPin, Pencil, Phone, Plus, Search, Trash2, Truck, Zap } from 'lucide-react'

interface Props {
  version: number
  onChanged: () => void
}

const emptyForm = { name: '', phone: '', coverage: '', flatFee: '400', apiKey: '', webhookUrl: '' }

export default function DeliveryTab({ version, onChanged }: Props) {
  const { data: companies, loading, refresh } = useFetch<DeliveryCompany[]>(`/api/delivery-companies?v=${version}`)
  const { toast } = useToast()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<DeliveryCompany | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<DeliveryCompany | null>(null)
  const [query, setQuery] = useState('')

  const list = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const all = companies || []
    if (!needle) return all
    return all.filter(
      (c) => c.name.toLowerCase().includes(needle) || (c.coverage || '').toLowerCase().includes(needle)
    )
  }, [companies, query])

  const openAdd = () => {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEdit = (c: DeliveryCompany) => {
    setEditing(c)
    setForm({
      name: c.name,
      phone: c.phone || '',
      coverage: c.coverage || '',
      flatFee: String(c.flatFee),
      apiKey: c.apiKey || '',
      webhookUrl: c.webhookUrl || '',
    })
    setDialogOpen(true)
  }

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: 'اسم الشركة مطلوب', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        phone: form.phone || null,
        coverage: form.coverage || null,
        flatFee: parseFloat(form.flatFee) || 0,
        apiKey: form.apiKey || null,
        webhookUrl: form.webhookUrl || null,
      }
      if (editing) {
        await apiCall(`/api/delivery-companies/${editing.id}`, 'PUT', payload)
        toast({ title: 'تم تحديث بيانات الشركة' })
      } else {
        await apiCall('/api/delivery-companies', 'POST', payload)
        toast({ title: 'تمت إضافة شركة التوصيل' })
      }
      setDialogOpen(false)
      refresh()
      onChanged()
    } catch (e) {
      toast({ title: 'خطأ', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (c: DeliveryCompany, active: boolean) => {
    try {
      await apiCall(`/api/delivery-companies/${c.id}`, 'PUT', { active })
      toast({ title: active ? `تم تفعيل ${c.name}` : `تم تعطيل ${c.name}` })
      refresh()
      onChanged()
    } catch (e) {
      toast({ title: 'خطأ', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    }
  }

  const confirmDelete = async () => {
    if (!deleting) return
    try {
      await apiCall(`/api/delivery-companies/${deleting.id}`, 'DELETE')
      toast({ title: 'تم حذف الشركة' })
      setDeleting(null)
      refresh()
      onChanged()
    } catch (e) {
      toast({ title: 'لا يمكن الحذف', description: e instanceof Error ? e.message : '', variant: 'destructive' })
      setDeleting(null)
    }
  }

  const activeCount = (companies || []).filter((c) => c.active).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold text-lg">شركات التوصيل المحلية</h2>
          <p className="text-sm text-muted-foreground">
            اربط طلباتك بشركات التوصيل وأرسلها بضغطة واحدة.
            {companies && companies.length > 0 && (
              <span className="ms-1">({activeCount} مفعّلة من {companies.length})</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(companies?.length ?? 0) > 0 && (
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ابحث عن شركة…"
                className="w-48 ps-9"
              />
            </div>
          )}
          <Button onClick={openAdd} className="gap-1.5 shadow-sm">
            <Plus className="h-4 w-4" /> شركة توصيل جديدة
          </Button>
        </div>
      </div>

      {loading && !companies ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-2xl" />)}
        </div>
      ) : list.length === 0 ? (
        <Card className="border-0 shadow-soft ring-1 ring-border/60">
          <CardContent className="py-16 text-center text-muted-foreground">
            <Truck className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">{query ? 'لا توجد شركة مطابقة' : 'لا توجد شركات توصيل مسجلة'}</p>
            <p className="text-sm">{query ? 'جرّب كلمة بحث أخرى.' : 'أضف شركة توصيل لتتمكن من ربط الطلبات بها وإرسالها تلقائياً.'}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => (
            <Card
              key={c.id}
              className={`border-0 shadow-soft ring-1 ring-border/60 transition-all hover:-translate-y-0.5 hover:shadow-lift ${!c.active ? 'opacity-70' : ''}`}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-teal-400 to-teal-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                      <Truck className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold truncate">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c._count?.orders ?? 0} طلب مرتبط</div>
                    </div>
                  </div>
                  <Switch checked={c.active} onCheckedChange={(v) => toggleActive(c, v)} aria-label={`تفعيل ${c.name}`} />
                </div>

                <div className="space-y-1.5 text-sm text-muted-foreground">
                  {c.phone && (
                    <div className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /><span dir="ltr" className="font-mono">{c.phone}</span></div>
                  )}
                  {c.coverage && (
                    <div className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{c.coverage}</div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5" />
                    {c.apiKey ? (
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20">
                        API مربوط
                      </Badge>
                    ) : (
                      <span className="text-xs">بدون مفتاح API</span>
                    )}
                    {c.webhookUrl && (
                      <Badge variant="outline" className="border-teal-200 bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300 dark:border-teal-500/20">
                        <Zap className="h-3 w-3 me-0.5" /> Webhook
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between border-t pt-3">
                  <div>
                    <div className="text-xs text-muted-foreground">رسوم التوصيل</div>
                    <div className="font-bold text-primary tabular">{formatDA(c.flatFee)}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)} aria-label="تعديل">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleting(c)} aria-label="حذف"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* نافذة إضافة/تعديل */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'تعديل شركة التوصيل' : 'شركة توصيل جديدة'}</DialogTitle>
            <DialogDescription>
              سجّل بيانات شركة التوصيل المحلية. مفتاح API يُستخدم لإرسال الطلبات تلقائياً عند التكامل الفعلي.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="d-name">اسم الشركة *</Label>
                <Input id="d-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="يرسال إكسبرس" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="d-phone">الهاتف</Label>
                <Input id="d-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0770000000" dir="ltr" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="d-cov">نطاق التغطية</Label>
                <Input id="d-cov" value={form.coverage} onChange={(e) => setForm({ ...form, coverage: e.target.value })} placeholder="48 ولاية" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="d-fee">رسوم التوصيل (دج)</Label>
                <Input id="d-fee" type="number" min="0" value={form.flatFee} onChange={(e) => setForm({ ...form, flatFee: e.target.value })} dir="ltr" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-key">مفتاح API (اختياري)</Label>
              <Input id="d-key" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder="مفتاح التكامل مع نظام الشركة" dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-webhook">رابط Webhook (اختياري)</Label>
              <Input id="d-webhook" value={form.webhookUrl} onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })} placeholder="https://company.example/webhook" dir="ltr" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={save} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? 'حفظ التعديلات' : 'إضافة الشركة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* تأكيد الحذف */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف شركة التوصيل؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف «{deleting?.name}» نهائياً إذا لم تكن مرتبطة بطلبات. في حال وجود طلبات مرتبطة يمكنك تعطيلها بدلاً من الحذف.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-white hover:bg-destructive/90">حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
