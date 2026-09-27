// أنواع البيانات المشتركة وأدوات مساعدة

export interface Product {
  id: string
  name: string
  sku: string
  description?: string | null
  category?: string | null
  price: number
  cost?: number | null
  quantity: number
  minQuantity: number
  createdAt: string
  updatedAt: string
}

export interface Customer {
  id: string
  name: string
  phone: string
  address?: string | null
  createdAt: string
  _count?: { orders: number }
}

export interface DeliveryCompany {
  id: string
  name: string
  phone?: string | null
  coverage?: string | null
  flatFee: number
  apiKey?: string | null
  webhookUrl?: string | null
  active: boolean
  createdAt: string
  _count?: { orders: number }
}

export interface OrderItem {
  id: string
  orderId: string
  productId: string
  quantity: number
  price: number
  product?: { id: string; name: string; sku: string }
}

export interface Order {
  id: string
  orderNumber: string
  customerId: string
  customer: Customer
  deliveryCompanyId?: string | null
  deliveryCompany?: { id: string; name: string } | null
  status: string
  total: number
  deliveryFee: number
  address?: string | null
  notes?: string | null
  trackingNumber?: string | null
  createdAt: string
  updatedAt: string
  items: OrderItem[]
}

export interface Message {
  id: string
  customerId: string
  customer?: { id: string; name: string; phone: string }
  orderId?: string | null
  order?: { id: string; orderNumber: string } | null
  direction: 'incoming' | 'outgoing'
  content: string
  channel: string
  isAuto: boolean
  deliveredBy?: string | null
  createdAt: string
}

export interface Stats {
  totalProducts: number
  totalCustomers: number
  totalOrders: number
  lowStockProducts: { id: string; name: string; quantity: number; minQuantity: number }[]
  byStatus: Record<string, number>
  revenue: number
  potentialRevenue: number
  totalMessages: number
  unreadIncoming: number
  autoRepliesCount: number
  recentOrders: Order[]
  recentMessages: Message[]
}

export const ORDER_STATUSES = [
  { value: 'pending', label: 'قيد الانتظار', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  { value: 'confirmed', label: 'مؤكد', color: 'bg-sky-100 text-sky-800 border-sky-200' },
  { value: 'preparing', label: 'قيد التجهيز', color: 'bg-violet-100 text-violet-800 border-violet-200' },
  { value: 'shipped', label: 'قيد التوصيل', color: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
  { value: 'delivered', label: 'تم التوصيل', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { value: 'cancelled', label: 'ملغى', color: 'bg-red-100 text-red-800 border-red-200' },
] as const

export function statusLabel(status: string): string {
  return ORDER_STATUSES.find((s) => s.value === status)?.label || status
}

export function statusColor(status: string): string {
  return ORDER_STATUSES.find((s) => s.value === status)?.color || 'bg-gray-100 text-gray-800 border-gray-200'
}

export function formatDA(n: number): string {
  return new Intl.NumberFormat('ar-DZ', { maximumFractionDigits: 2 }).format(n) + ' دج'
}

export function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ar-DZ', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}
