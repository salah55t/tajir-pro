'use client'

import { useMemo, useState } from 'react'
import { apiCall, useFetch } from '@/hooks/use-fetch'
import { formatRelative, type Customer } from '@/lib/shared'
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
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { Loader2, MapPin, MessageSquare, Pencil, Phone, Plus, Search, Trash2, UserPlus, Users } from 'lucide-react'

interface Props {
  version: number
  onChanged: () => void
  onNavigate?: (tab: string) => void
}

const emptyForm = { name: '', phone: '', address: '' }

export default function CustomersTab({ version, onChanged, onNavigate }: Props) {
  const [q, setQ] = useState('')
  const { data: customers, loading, refresh } = useFetch<Customer[]>(
    `/api/customers?v=${version}&q=${encodeURIComponent(q)}`
  )
  const { toast } = useToast()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<Customer | null>(null)

  const summary = useMemo(() => {
    const list = customers || []
    return {
      count: list.length,
      withOrders: list.filter((c) => (c._count?.orders ?? 0) > 0).length,
      totalOrders: list.reduce((sum, c) => sum + (c._count?.orders ?? 0), 0),
    }
  }, [customers])

  const openAdd = () => {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEdit = (c: Customer) => {
    setEditing(c)
    setForm({ name: c.name, phone: c.phone, address: c.address || '' })
    setDialogOpen(true)
  }

  const save = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      toast({ title: 'أكمل الحقول', description: 'الاسم ورقم الهاتف مطلوبان.', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const payload = { name: form.name, phone: form.phone, address: form.address || null }
      if (editing) {
        await apiCall(`/api/customers/${editing.id}`, 'PUT', payload)
        toast({ title: 'تم تحديث بيانات العميل' })
      } else {
        await apiCall('/api/customers', 'POST', payload)
        toast({ title: 'تمت إضافة العميل' })
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

  const confirmDelete = async () => {
    if (!deleting) return
    try {
      await apiCall(`/api/customers/${deleting.id}`, 'DELETE')
      toast({ title: 'تم حذف العميل' })
      setDeleting(null)
      refresh()
      onChanged()
    } catch (e) {
      toast({ title: 'لا يمكن الحذف', description: e instanceof Error ? e.message : '', variant: 'destructive' })
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold text-lg">العملاء</h2>
          <p className="text-sm text-muted-foreground">
            سجل عملائك لتربط بهم الطلبات والمحادثات.
            {customers && customers.length > 0 && (
              <span className="ms-1">({summary.withOrders} لديهم طلبات · {summary.totalOrders} طلب إجمالاً)</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(customers?.length ?? 0) > 0 && (
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ابحث بالاسم أو الهاتف…"
                className="w-56 ps-9"
              />
            </div>
          )}
          <Button onClick={openAdd} className="gap-1.5 shadow-sm">
            <Plus className="h-4 w-4" /> عميل جديد
          </Button>
        </div>
      </div>

      <Card className="border-0 shadow-soft ring-1 ring-border/60">
        <CardContent className="p-4">
          {loading && !customers ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}
            </div>
          ) : (customers?.length ?? 0) === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">{q ? 'لا يوجد عميل مطابق' : 'لا يوجد عملاء بعد'}</p>
              <p className="text-sm">{q ? 'جرّب كلمة بحث أخرى.' : 'أضف أول عميل أو استخدم زر «بيانات تجريبية» في الأعلى.'}</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {customers!.map((c) => (
                <div key={c.id} className="rounded-2xl border p-4 transition-all hover:border-primary/30 hover:bg-accent/30 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white flex items-center justify-center font-bold shrink-0 shadow-sm">
                      {c.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold truncate">{c.name}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3" /><span dir="ltr" className="font-mono">{c.phone}</span>
                      </div>
                    </div>
                    <Badge variant="secondary" className="tabular shrink-0">{c._count?.orders ?? 0} طلب</Badge>
                  </div>

                  {c.address && (
                    <div className="flex items-start gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span className="line-clamp-2">{c.address}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between border-t pt-3">
                    <span className="text-xs text-muted-foreground">مسجّل {formatRelative(c.createdAt)}</span>
                    <div className="flex items-center gap-1">
                      {onNavigate && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onNavigate('messages')} aria-label="المحادثة">
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                      )}
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
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-primary" />
              {editing ? 'تعديل بيانات العميل' : 'عميل جديد'}
            </DialogTitle>
            <DialogDescription>
              {editing ? 'حدّث بيانات العميل ثم احفظ.' : 'أضف عميلاً لربطه بالطلبات والمحادثات.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="c-name">الاسم *</Label>
              <Input id="c-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: أمين بوعلام" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-phone">رقم الهاتف *</Label>
              <Input id="c-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0555123456" dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-address">العنوان</Label>
              <Textarea id="c-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} placeholder="الحي، الشارع، المدينة" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={save} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? 'حفظ التعديلات' : 'إضافة العميل'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف العميل؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف «{deleting?.name}» وكل محادثاته نهائياً. لا يمكن حذف عميل لديه طلبات مسجلة — احذف طلباته أولاً.
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
