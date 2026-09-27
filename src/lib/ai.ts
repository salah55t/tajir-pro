import ZAI from 'z-ai-web-dev-sdk'
import { db } from '@/lib/db'

// جلب إعدادات المتجر من قاعدة البيانات
export async function getSettingsMap(): Promise<Record<string, string>> {
  const rows = await db.setting.findMany()
  const map: Record<string, string> = {}
  for (const row of rows) map[row.key] = row.value
  return map
}

export interface AIReplyContext {
  customerMessage: string
  customerId: string
  customerName: string
  orderId?: string | null
}

// توليد رد آلي ذكي على رسالة عميل مع سياق المتجر الكامل
export async function generateAutoReply(ctx: AIReplyContext): Promise<string> {
  const settings = await getSettingsMap()
  const businessName = settings.businessName || 'المتجر'
  const businessInfo = settings.businessInfo || ''
  const aiPersona = settings.aiPersona || 'ودي ومهني ويتحدث بالدارجة العربية المبسطة'
  const customInstructions = settings.aiInstructions || ''
  const workingHours = settings.workingHours || 'من 9 صباحاً إلى 8 مساءً'

  // سياق المخزون: المنتجات المتوفرة
  const products = await db.product.findMany({
    where: { quantity: { gt: 0 } },
    take: 25,
    orderBy: { createdAt: 'desc' },
    select: { name: true, price: true, quantity: true, category: true },
  })
  const productsText = products.length
    ? products.map((p) => `- ${p.name} (${p.price} دج، متوفر: ${p.quantity})`).join('\n')
    : 'لا توجد منتجات متوفرة حالياً'

  // سياق طلبات العميل الأخيرة
  const orders = await db.order.findMany({
    where: { customerId: ctx.customerId },
    orderBy: { createdAt: 'desc' },
    take: 3,
    include: {
      items: { include: { product: { select: { name: true } } } },
      deliveryCompany: { select: { name: true } },
    },
  })
  const ordersText = orders.length
    ? orders
        .map((o) => {
          const items = o.items.map((i) => `${i.product.name} ×${i.quantity}`).join(', ')
          const delivery = o.deliveryCompany ? `، شركة التوصيل: ${o.deliveryCompany.name}` : ''
          const tracking = o.trackingNumber ? `، رقم التتبع: ${o.trackingNumber}` : ''
          return `- طلب ${o.orderNumber} (${statusLabel(o.status)}): ${items}، الإجمالي ${o.total} دج${delivery}${tracking}`
        })
        .join('\n')
    : 'لا توجد طلبات سابقة لهذا العميل'

  const systemPrompt = `أنت مساعد خدمة العملاء الآلي لمتجر "${businessName}". شخصيتك: ${aiPersona}.

معلومات المتجر: ${businessInfo || 'متجر محلي يبيع منتجات متنوعة'}
ساعات العمل: ${workingHours}
العملة: الدينار الجزائري (دج)

المنتجات المتوفرة حالياً:
${productsText}

طلبات هذا العميل (${ctx.customerName}) الأخيرة:
${ordersText}

${customInstructions ? `تعليمات إضافية من صاحب المتجر: ${customInstructions}` : ''}

قواعد مهمة:
- ارد بالعربية فقط، برد قصير وواضح (سطرين إلى أربعة أسطر كحد أقصى)
- إذا سُئلت عن حالة طلب، استخدم بيانات الطلبات أعلاه
- إذا طلب منتج غير متوفر، اعتذر واقترح بدائل من القائمة
- إذا كان السؤال معقداً أو يتطلب قرار صاحب المتجر (مثل شكوى كبيرة أو تفاوض على سعر)، اطلب من العميل انتظار رد الفريق مباشرة
- لا تخترع معلومات أو وعوداً غير موجودة في السياق
- لا تستخدم رموز تعبيرية (emoji) كثيرة، واحد على الأكثر`

  const zai = await ZAI.create()
  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'assistant', content: systemPrompt },
      { role: 'user', content: `رسالة العميل ${ctx.customerName}: ${ctx.customerMessage}` },
    ],
    thinking: { type: 'disabled' },
  })

  const reply = completion.choices[0]?.message?.content?.trim()
  if (!reply) throw new Error('رد فارغ من الذكاء الاصطناعي')
  return reply
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: 'قيد الانتظار',
    confirmed: 'مؤكد',
    preparing: 'قيد التجهيز',
    shipped: 'قيد التوصيل',
    delivered: 'تم التوصيل',
    cancelled: 'ملغى',
  }
  return map[status] || status
}
