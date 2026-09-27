'use client'

import { useMemo, useState } from 'react'
import { apiCall, useFetch } from '@/hooks/use-fetch'
import { formatDA, formatDate, ORDER_STATUSES, statusColor, statusLabel, type Customer, type DeliveryCompany, type Order, type Product } from '@/lib/shared'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import {
  Eye, Loader2, Package, PackagePlus, Phone, Plus, Send, ShoppingCart, Trash2, Truck, UserPlus, X,
} from 'lucide-react'

interface Props {
  version: number
  onChanged: () => void
}

interface NewOrderItem {
  productId: string
  quantity: number
}

export default function OrdersTab({ version, onChanged }: Props) {
  const [statusFilter, setStatusFilter] = useState('all')
  const { data: orders, loading, refresh } = useFetch<Order[]>(`/api/orders?v=${version}`)
  const { data: customers } = useFetch<Customer[]>(`/api/customers?v=${version}`)
  const { data: companies } = useFetch<DeliveryCompany[]>(`/api/delivery-companies?v=${version}`)
  const { data: products } = useFetch<Product[]>(`/api/products?v=${version}`)
  const { toast } = useToast()

  const [createOpen, setCreateOpen] = useState(false)
  const [detail, setDetail] = useState<Order | null>(null)
  const [deleting, setDeleting] = useState<Order | null>(null)
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null)

  // نموذج طلب جديد
  const [formCustomerId, setFormCustomerId] = useState('')
  const [formCompanyId, setFormCompanyId] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formItems, setFormItems] = useState<NewOrderItem[]>([])
  const [quickCustomer, setQuickCustomer] = useState(false)
  const [qc, setQc] = useState({ name: '', phone: '', address: '' })
  const [saving, setSaving] = useState(false)

  const activeCompanies = useMemo(() => (companies || []).filter((c) => c.active), [companies])

  const resetForm = () => {
    setFormCustomerId('')
    setFormCompanyId('')
    setFormNotes('')
    setFormItems([])
    setQuickCustomer(false)
    setQc({ name: '', phone: '', address: '' })
  }

  const addProductToOrder = (productId: string) => {
    if (!productId) return
    setFormItems((prev) => {
      const found = prev.find((i) => i.productId === productId)
      if (found) return prev.map((i) => (i.productId === productId ? { ...i, quantity: i.quantity + 1 } : i))
      return [...prev, { productId, quantity: 1 }]
    })
  }

  const orderTotal = useMemo(() => {
    const company = activeCompanies.find((c) => c.id === formCompanyId)
    const subtotal = formItems.reduce((sum, i) => {
      const p = products?.find((pp) => pp.id === i.productId)
      return sum + (p ? p.price * i.quantity : 0)
    }, 0)
    return { subtotal, deliveryFee: company?.flatFee || 0, total: subtotal + (company?.flatFee || 0) }
  }, [formItems, products, formCompanyId, activeCompanies])

  const createOrder = async () => {
    if (quickCustomer) {
      if (!qc.name.trim() || !qc.phone.trim()) {
        toast({ title: 'أكمل بيانات العميل الجديد', description: 'الاسم والهاتف مطلوبان.', variant: 'destructive' })
        return
      }
    } else if (!formCustomerId) {
      toast({ title: 'اختر العميل', variant: 'destructive' })
      return
    }
    if (formItems.length === 0) {
      toast({ title: 'أضف منتجاً واحداً على الأقل', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      let customerId = formCustomerId
      if (quickCustomer) {
        const created = await apiCall<Customer>('/api/customers', 'POST', qc)
        customerId = created.id
      }
      const company = activeCompanies.find((c) => c.id === formCompanyId)
      await apiCall('/api/orders', 'POST', {
        customerId,
        deliveryCompanyId: formCompanyId || null,
        deliveryFee: company?.flatFee || 0,
        notes: formNotes,
        items: formItems,
      })
      toast({ title: 'تم إنشاء الطلب بنجاح', description: 'خُصمت الكميات من المخزون تلقائياً.' })
      setCreateOpen(false)
      resetForm()
      refresh()
      onChanged()
    } catch (e) {
      toast({ title: 'خطأ', description: e instanceof Error ? e.message : 'فشل إنشاء الطلب', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const changeStatus = async (order: Order, status: string) => {
    setBusyOrderId(order.id)
    try {
      await apiCall(`/api/orders/${order.id}`, 'PUT', { status })
      toast({ title: `تم تحديث حالة الطلب إلى: ${statusLabel(status)}` })
      refresh()
      onChanged()
    } catch (e) {
      toast({ title: 'خطأ', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setBusyOrderId(null)
    }
  }

  const assignCompany = async (order: Order, companyId: string) => {
    setBusyOrderId(order.id)
    try {
      const company = (companies || []).find((c) => c.id === companyId)
      await apiCall(`/api/orders/${order.id}`, 'PUT', {
        deliveryCompanyId: companyId || null,
        deliveryFee: company ? company.flatFee : order.deliveryFee,
      })
      toast({ title: companyId ? `تم تعيين شركة التوصيل: ${company?.name}` : 'تمت إزالة شركة التوصيل' })
      refresh()
      onChanged()
    } catch (e) {
      toast({ title: 'خطأ', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setBusyOrderId(null)
    }
  }

  const sendToDelivery = async (order: Order) => {
    setBusyOrderId(order.id)
    try {
      const updated = await apiCall<Order>(`/api/orders/${order.id}`, 'POST')
      toast({
        title: 'أُرسل الطلب لشركة التوصيل',
        description: `رقم التتبع: ${updated.trackingNumber} — أُبلغ العميل تلقائياً في الرسائل.`,
      })
      refresh()
      onChanged()
    } catch (e) {
      toast({ title: 'خطأ', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setBusyOrderId(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleting) return
    try {
      await apiCall(`/api/orders/${deleting.id}`, 'DELETE')
      toast({ title: 'تم حذف الطلب وإعادة الكميات للمخزون' })
      setDeleting(null)
      refresh()
      onChanged()
    } catch (e) {
      toast({ title: 'خطأ', description: e instanceof Error ? e.message : '', variant: 'destructive' })
      setDeleting(null)
    }
  }

  const filtered = (orders || []).filter((o) => statusFilter === 'all' || o.status === statusFilter)

  return (
    <Card className="border shadow-sm">
      <CardContent className="p-4 space-y-4">
        {/* شريط الأدوات */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="كل الحالات" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              {ORDER_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex-1" />
          <Button onClick={() => { resetForm(); setCreateOpen(true) }} className="gap-1.5">
            <Plus className="h-4 w-4" /> طلب جديد
          </Button>
        </div>

        {/* قائمة الطلبات */}
        {loading && !orders ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">لا توجد طلبات{statusFilter !== 'all' ? ' بهذه الحالة' : ''}</p>
            <p className="text-sm">أنشئ طلباً جديداً بالزر أعلاه.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((o) => (
              <div key={o.id} className="rounded-xl border p-4 hover:bg-muted/30 transition-colors space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold font-mono text-sm" dir="ltr">{o.orderNumber}</span>
                      <Badge variant="outline" className={statusColor(o.status)}>{statusLabel(o.status)}</Badge>
                      {o.trackingNumber && (
                        <Badge variant="outline" className="border-teal-200 bg-teal-50 text-teal-700" dir="ltr">
                          <Truck className="h-3 w-3 me-1" /> {o.trackingNumber}
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {o.customer?.name} · <span dir="ltr" className="font-mono">{o.customer?.phone}</span> · {formatDate(o.createdAt)} · {o.items.length} منتج · <span className="font-bold text-foreground">{formatDA(o.total)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="sm" className="gap-1" onClick={() => setDetail(o)}>
                      <Eye className="h-3.5 w-3.5" /> تفاصيل
                    </Button>
                    <Button
                      variant="outline" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleting(o)} aria-label="حذف الطلب"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* الحالة */}
                  <Select value={o.status} onValueChange={(v) => changeStatus(o, v)} disabled={busyOrderId === o.id}>
                    <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ORDER_STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* شركة التوصيل */}
                  <Select
                    value={o.deliveryCompanyId || 'none'}
                    onValueChange={(v) => assignCompany(o, v === 'none' ? '' : v)}
                    disabled={busyOrderId === o.id}
                  >
                    <SelectTrigger className="w-52 h-9">
                      <SelectValue placeholder="عيّن شركة توصيل" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون شركة توصيل</SelectItem>
                      {(companies || []).map((c) => (
                        <SelectItem key={c.id} value={c.id} disabled={!c.active}>{c.name}{!c.active ? ' (موقوفة)' : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* إرسال للتوصيل */}
                  <Button
                    size="sm"
                    className="gap-1.5"
                    disabled={busyOrderId === o.id || !o.deliveryCompanyId || !!o.trackingNumber || o.status === 'cancelled'}
                    onClick={() => sendToDelivery(o)}
                  >
                    {busyOrderId === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {o.trackingNumber ? 'مُرسل للتوصيل' : 'إرسال للتوصيل'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* نافذة إنشاء طلب */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><PackagePlus className="h-5 w-5 text-primary" /> طلب جديد</DialogTitle>
            <DialogDescription>اختر العميل وأضف المنتجات — تُخصم الكميات من المخزون تلقائياً عند الحفظ.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* العميل */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>العميل *</Label>
                <Button variant="ghost" size="sm" className="gap-1 h-7 text-primary" onClick={() => setQuickCustomer(!quickCustomer)}>
                  {quickCustomer ? <><X className="h-3.5 w-3.5" /> اختيار من القائمة</> : <><UserPlus className="h-3.5 w-3.5" /> عميل جديد</>}
                </Button>
              </div>
              {quickCustomer ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Input value={qc.name} onChange={(e) => setQc({ ...qc, name: e.target.value })} placeholder="اسم العميل" />
                  <Input value={qc.phone} onChange={(e) => setQc({ ...qc, phone: e.target.value })} placeholder="رقم الهاتف" dir="ltr" />
                  <Input value={qc.address} onChange={(e) => setQc({ ...qc, address: e.target.value })} placeholder="العنوان (اختياري)" />
                </div>
              ) : (
                <Select value={formCustomerId} onValueChange={setFormCustomerId}>
                  <SelectTrigger><SelectValue placeholder="اختر العميل…" /></SelectTrigger>
                  <SelectContent>
                    {(customers || []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name} — <span dir="ltr" className="font-mono text-xs">{c.phone}</span></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* المنتجات */}
            <div className="space-y-2">
              <Label>المنتجات *</Label>
              <Select value="" onValueChange={addProductToOrder}>
                <SelectTrigger><SelectValue placeholder="＋ أضف منتجاً للطلب…" /></SelectTrigger>
                <SelectContent>
                  {(products || []).map((p) => (
                    <SelectItem key={p.id} value={p.id} disabled={p.quantity === 0}>
                      {p.name} — {formatDA(p.price)} (متوفر: {p.quantity})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {formItems.length > 0 && (
                <div className="rounded-lg border divide-y">
                  {formItems.map((item) => {
                    const p = products?.find((pp) => pp.id === item.productId)
                    if (!p) return null
                    const overStock = item.quantity > p.quantity
                    return (
                      <div key={item.productId} className="flex items-center gap-2 px-3 py-2 text-sm">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{p.name}</div>
                          <div className="text-xs text-muted-foreground">{formatDA(p.price)} × {item.quantity} = {formatDA(p.price * item.quantity)}</div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setFormItems((prev) => prev.map((i) => i.productId === item.productId ? { ...i, quantity: Math.max(1, i.quantity - 1) } : i))} aria-label="إنقاص">
                            <span className="text-base leading-none">−</span>
                          </Button>
                          <span className={`w-10 text-center font-bold ${overStock ? 'text-red-600' : ''}`}>{item.quantity}</span>
                          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setFormItems((prev) => prev.map((i) => i.productId === item.productId ? { ...i, quantity: i.quantity + 1 } : i))} aria-label="زيادة">
                            <Plus className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setFormItems((prev) => prev.filter((i) => i.productId !== item.productId))} aria-label="إزالة">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              {formItems.some((i) => {
                const p = products?.find((pp) => pp.id === i.productId)
                return p && i.quantity > p.quantity
              }) && (
                <p className="text-xs text-red-600 font-medium">تحذير: الكمية المطلوبة تتجاوز المخزون المتوفر لمنتج أو أكثر.</p>
              )}
            </div>

            {/* التوصيل */}
            <div className="space-y-2">
              <Label>شركة التوصيل</Label>
              <Select value={formCompanyId || 'none'} onValueChange={(v) => setFormCompanyId(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="اختر شركة توصيل (اختياري)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون شركة توصيل</SelectItem>
                  {activeCompanies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name} — {formatDA(c.flatFee)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ملاحظات */}
            <div className="space-y-2">
              <Label htmlFor="o-notes">ملاحظات الطلب</Label>
              <Textarea id="o-notes" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="مثال: التوصيل بعد الخامسة مساءً" rows={2} />
            </div>

            {/* الملخص */}
            <div className="rounded-xl bg-muted/60 border p-3 space-y-1 text-sm">
              <div className="flex justify-between"><span>مجموع المنتجات</span><span className="font-semibold">{formatDA(orderTotal.subtotal)}</span></div>
              <div className="flex justify-between"><span>رسوم التوصيل</span><span className="font-semibold">{formatDA(orderTotal.deliveryFee)}</span></div>
              <div className="flex justify-between border-t pt-1 text-base"><span className="font-bold">الإجمالي</span><span className="font-extrabold text-primary">{formatDA(orderTotal.total)}</span></div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>إلغاء</Button>
            <Button onClick={createOrder} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
              حفظ الطلب
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* نافذة التفاصيل */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle dir="ltr" className="text-start">{detail?.orderNumber}</DialogTitle>
            <DialogDescription>{detail && formatDate(detail.createdAt)}</DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={statusColor(detail.status)}>{statusLabel(detail.status)}</Badge>
                {detail.trackingNumber && (
                  <Badge variant="outline" className="border-teal-200 bg-teal-50 text-teal-700" dir="ltr">
                    <Truck className="h-3 w-3 me-1" /> {detail.trackingNumber}
                  </Badge>
                )}
              </div>

              <div className="rounded-lg border p-3 space-y-1.5 text-sm">
                <div className="font-bold">{detail.customer?.name}</div>
                <div className="flex items-center gap-1.5 text-muted-foreground"><Phone className="h-3.5 w-3.5" /><span dir="ltr" className="font-mono">{detail.customer?.phone}</span></div>
                {detail.address && <div className="text-muted-foreground">العنوان: {detail.address}</div>}
                {detail.deliveryCompany && <div className="text-muted-foreground">شركة التوصيل: <span className="font-medium text-foreground">{detail.deliveryCompany.name}</span></div>}
                {detail.notes && <div className="text-muted-foreground">ملاحظات: {detail.notes}</div>}
              </div>

              <div className="rounded-lg border divide-y text-sm">
                {detail.items.map((i) => (
                  <div key={i.id} className="flex justify-between px-3 py-2">
                    <span>{i.product?.name} <span className="text-muted-foreground">× {i.quantity}</span></span>
                    <span className="font-medium">{formatDA(i.price * i.quantity)}</span>
                  </div>
                ))}
              </div>

              <div className="rounded-lg bg-muted/60 border p-3 text-sm space-y-1">
                <div className="flex justify-between"><span>المنتجات</span><span>{formatDA(detail.total - detail.deliveryFee)}</span></div>
                <div className="flex justify-between"><span>التوصيل</span><span>{formatDA(detail.deliveryFee)}</span></div>
                <div className="flex justify-between border-t pt-1 font-bold"><span>الإجمالي</span><span className="text-primary">{formatDA(detail.total)}</span></div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* تأكيد حذف الطلب */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الطلب؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف الطلب «{deleting?.orderNumber}» وإعادة كمياته إلى المخزون إن لم يكن ملغى.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-white hover:bg-destructive/90">حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
