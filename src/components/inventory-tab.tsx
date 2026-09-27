'use client'

import { useState } from 'react'
import { apiCall, useFetch } from '@/hooks/use-fetch'
import { formatDA, type Product } from '@/lib/shared'
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
import { useToast } from '@/hooks/use-toast'
import { Loader2, Minus, Package, Pencil, Plus, Search, Trash2 } from 'lucide-react'

interface Props {
  version: number
  onChanged: () => void
}

const emptyForm = { name: '', sku: '', category: '', description: '', price: '', cost: '', quantity: '0', minQuantity: '5' }

export default function InventoryTab({ version, onChanged }: Props) {
  const [q, setQ] = useState('')
  const { data: products, loading, refresh } = useFetch<Product[]>(`/api/products?v=${version}&q=${encodeURIComponent(q)}`)
  const { toast } = useToast()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<Product | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const openAdd = () => {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEdit = (p: Product) => {
    setEditing(p)
    setForm({
      name: p.name,
      sku: p.sku,
      category: p.category || '',
      description: p.description || '',
      price: String(p.price),
      cost: p.cost != null ? String(p.cost) : '',
      quantity: String(p.quantity),
      minQuantity: String(p.minQuantity),
    })
    setDialogOpen(true)
  }

  const save = async () => {
    const price = parseFloat(form.price)
    if (!form.name.trim() || !form.sku.trim() || isNaN(price)) {
      toast({ title: 'أكمل الحقول', description: 'الاسم و SKU والسعر مطلوبة (سعر رقمي).', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        sku: form.sku,
        category: form.category || null,
        description: form.description || null,
        price,
        cost: form.cost ? parseFloat(form.cost) : null,
        quantity: parseInt(form.quantity) || 0,
        minQuantity: parseInt(form.minQuantity) || 0,
      }
      if (editing) {
        await apiCall(`/api/products/${editing.id}`, 'PUT', payload)
        toast({ title: 'تم تحديث المنتج' })
      } else {
        await apiCall('/api/products', 'POST', payload)
        toast({ title: 'تمت إضافة المنتج بنجاح' })
      }
      setDialogOpen(false)
      refresh()
      onChanged()
    } catch (e) {
      toast({ title: 'خطأ', description: e instanceof Error ? e.message : 'فشل الحفظ', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const adjustStock = async (p: Product, delta: number) => {
    const next = p.quantity + delta
    if (next < 0) return
    setBusyId(p.id)
    try {
      await apiCall(`/api/products/${p.id}`, 'PUT', { quantity: next })
      refresh()
      onChanged()
    } catch (e) {
      toast({ title: 'خطأ', description: e instanceof Error ? e.message : 'فشل التعديل', variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleting) return
    try {
      await apiCall(`/api/products/${deleting.id}`, 'DELETE')
      toast({ title: 'تم حذف المنتج' })
      setDeleting(null)
      refresh()
      onChanged()
    } catch (e) {
      toast({ title: 'لا يمكن الحذف', description: e instanceof Error ? e.message : '', variant: 'destructive' })
      setDeleting(null)
    }
  }

  return (
    <Card className="border shadow-sm">
      <CardContent className="p-4 space-y-4">
        {/* شريط الأدوات */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-52">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث بالاسم أو SKU أو الفئة…"
              className="ps-9"
            />
          </div>
          <Button onClick={openAdd} className="gap-1.5">
            <Plus className="h-4 w-4" /> منتج جديد
          </Button>
        </div>

        {/* الجدول */}
        {loading && !products ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </div>
        ) : !products || products.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">لا توجد منتجات</p>
            <p className="text-sm">أضف أول منتج أو استخدم زر «بيانات تجريبية» في الأعلى.</p>
          </div>
        ) : (
          <div className="rounded-xl border overflow-hidden">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-sm min-w-[760px]">
                <thead className="bg-muted/60 text-muted-foreground">
                  <tr>
                    <th className="text-start font-medium px-4 py-3">المنتج</th>
                    <th className="text-start font-medium px-4 py-3">الفئة</th>
                    <th className="text-start font-medium px-4 py-3">السعر</th>
                    <th className="text-start font-medium px-4 py-3 w-44">المخزون</th>
                    <th className="text-start font-medium px-4 py-3 w-24">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => {
                    const low = p.quantity <= p.minQuantity
                    return (
                      <tr key={p.id} className="border-t hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-semibold">{p.name}</div>
                          <div className="text-xs text-muted-foreground font-mono" dir="ltr">{p.sku}</div>
                        </td>
                        <td className="px-4 py-3">
                          {p.category ? <Badge variant="secondary">{p.category}</Badge> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 font-semibold whitespace-nowrap">{formatDA(p.price)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="outline" size="icon" className="h-7 w-7"
                              onClick={() => adjustStock(p, -1)} disabled={busyId === p.id || p.quantity === 0}
                              aria-label="إنقاص كمية"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </Button>
                            <Badge
                              variant="outline"
                              className={low ? 'border-red-200 bg-red-50 text-red-700 min-w-10 justify-center' : 'border-emerald-200 bg-emerald-50 text-emerald-700 min-w-10 justify-center'}
                            >
                              {p.quantity}
                            </Badge>
                            <Button
                              variant="outline" size="icon" className="h-7 w-7"
                              onClick={() => adjustStock(p, 1)} disabled={busyId === p.id}
                              aria-label="زيادة كمية"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                            {low && <span className="text-[10px] text-red-600 font-medium ms-1">منخفض</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)} aria-label="تعديل">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setDeleting(p)} aria-label="حذف"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>

      {/* نافذة إضافة/تعديل */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'تعديل المنتج' : 'منتج جديد'}</DialogTitle>
            <DialogDescription>
              {editing ? 'حدّث بيانات المنتج ثم احفظ.' : 'أدخل بيانات المنتج الجديد لإضافته للمخزون.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="p-name">اسم المنتج *</Label>
                <Input id="p-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: زيت مائدة 5 لتر" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-sku">رقم المرجع (SKU) *</Label>
                <Input id="p-sku" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="OIL-5L-001" dir="ltr" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="p-cat">الفئة</Label>
                <Input id="p-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="مواد غذائية" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-price">سعر البيع (دج) *</Label>
                <Input id="p-price" type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="1250" dir="ltr" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="p-cost">سعر التكلفة</Label>
                <Input id="p-cost" type="number" min="0" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="اختياري" dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-qty">الكمية</Label>
                <Input id="p-qty" type="number" min="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-min">حد التنبيه</Label>
                <Input id="p-min" type="number" min="0" value={form.minQuantity} onChange={(e) => setForm({ ...form, minQuantity: e.target.value })} dir="ltr" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-desc">وصف المنتج</Label>
              <Input id="p-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="وصف مختصر يظهر للمساعد الذكي عند الرد على العملاء" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={save} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? 'حفظ التعديلات' : 'إضافة المنتج'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* تأكيد الحذف */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المنتج؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف «{deleting?.name}» نهائياً من المخزون. هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-white hover:bg-destructive/90">حذف نهائي</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
