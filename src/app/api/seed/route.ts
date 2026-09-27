import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/seed — تعبئة بيانات تجريبية واقعية (تجزئة جزائرية)
export async function POST() {
  try {
    const existing = await db.product.count()
    if (existing > 0) {
      return NextResponse.json({ message: 'قاعدة البيانات تحتوي على بيانات بالفعل', seeded: false })
    }

    // منتجات
    const products = await Promise.all(
      [
        { name: 'زيت مائدة إنيب 5 لتر', sku: 'OIL-5L-001', category: 'مواد غذائية', price: 1250, cost: 1100, quantity: 40, minQuantity: 10 },
        { name: 'سكر قالب 2 كغ', sku: 'SGR-2K-001', category: 'مواد غذائية', price: 240, cost: 200, quantity: 120, minQuantity: 20 },
        { name: 'قهوة بون 250 غ', sku: 'COF-250-001', category: 'مواد غذائية', price: 480, cost: 400, quantity: 35, minQuantity: 10 },
        { name: 'دقيق فاخر 10 كغ', sku: 'FLR-10K-001', category: 'مواد غذائية', price: 850, cost: 750, quantity: 4, minQuantity: 8 },
        { name: 'ماء معدني سوفال 6×1.5ل', sku: 'WTR-6P-001', category: 'مشروبات', price: 180, cost: 140, quantity: 200, minQuantity: 30 },
        { name: 'عصير حماض نسمة 1ل', sku: 'JUI-1L-001', category: 'مشروبات', price: 150, cost: 120, quantity: 60, minQuantity: 15 },
        { name: 'مسحوق تنظيف OMO 3 كغ', sku: 'CLN-3K-001', category: 'منظفات', price: 980, cost: 850, quantity: 22, minQuantity: 5 },
        { name: 'صابون يد افيا 500 مل', sku: 'SOP-500-001', category: 'منظفات', price: 320, cost: 260, quantity: 3, minQuantity: 10 },
        { name: 'أرز بسمتي 5 كغ', sku: 'RIC-5K-001', category: 'مواد غذائية', price: 1450, cost: 1300, quantity: 18, minQuantity: 6 },
        { name: 'معكرونة سباغيتي 500 غ', sku: 'PAS-500-001', category: 'مواد غذائية', price: 95, cost: 80, quantity: 150, minQuantity: 25 },
        { name: 'شاي أخضر علبة 200 غ', sku: 'TEA-200-001', category: 'مشروبات', price: 390, cost: 330, quantity: 45, minQuantity: 12 },
        { name: 'منظف أرضيات 2 لتر', sku: 'CLN-2L-002', category: 'منظفات', price: 410, cost: 340, quantity: 28, minQuantity: 8 },
      ].map((p) => db.product.create({ data: p }))
    )

    // عملاء
    const customers = await Promise.all(
      [
        { name: 'أمين بوعلام', phone: '0555123456', address: 'حي النصر، عمارة 12، الجزائر العاصمة' },
        { name: 'سارة مرزوق', phone: '0661789012', address: 'شارع الأمير عبد القادر، وهران' },
        { name: 'كريم بلحاج', phone: '0770345678', address: 'حي 1000 مسكن، سطيف' },
        { name: 'نور الدين حمداوي', phone: '0540987654', address: 'وسط المدينة، قسنطينة' },
        { name: 'فاطمة الزهراء', phone: '0698112233', address: 'حي المستقبل، عنابة' },
      ].map((c) => db.customer.create({ data: c }))
    )

    // شركات توصيل
    const companies = await Promise.all(
      [
        { name: 'يرسال إكسبرس', phone: '0770000001', coverage: '48 ولاية', flatFee: 500, apiKey: 'YAL-DEMO-KEY-1234' },
        { name: 'زركاشي نت', phone: '0770000002', coverage: 'الشمال والوسط', flatFee: 450, apiKey: 'ZRK-DEMO-KEY-5678' },
        { name: 'توصيل +', phone: '0770000003', coverage: 'الجزائر العاصمة وضواحيها', flatFee: 350, apiKey: 'DLV-DEMO-KEY-9012' },
      ].map((c) => db.deliveryCompany.create({ data: c }))
    )

    // إعدادات افتراضية
    const defaultSettings: Record<string, string> = {
      businessName: 'متجر النجاح',
      businessInfo: 'متجر محلي متخصص في بيع المنتجات الغذائية والمواد المنزلية مع خدمة توصيل سريعة لكل الولايات.',
      workingHours: 'من 9 صباحاً إلى 8 مساءً، طوال أيام الأسبوع ما عدا الجمعة',
      autoReplyEnabled: 'true',
      aiPersona: 'ودي ومهني، يرد بسرعة وباختصار، وباللهجة العربية المبسطة',
      aiInstructions: 'ركز على تسريع إتمام الطلبات واقترح التوصيل للطلبات فوق 3000 دج.',
    }
    await Promise.all(
      Object.entries(defaultSettings).map(([key, value]) => db.setting.create({ data: { key, value } }))
    )

    // رسائل تجريبية مع محادثة واقعية
    const now = Date.now()
    await db.message.createMany({
      data: [
        {
          customerId: customers[0].id,
          direction: 'incoming',
          content: 'السلام عليكم، هل زيت إنيب 5 لتر متوفر؟ وكم سعره؟',
          createdAt: new Date(now - 1000 * 60 * 60 * 5),
        },
        {
          customerId: customers[0].id,
          direction: 'outgoing',
          content: 'وعليكم السلام، نعم متوفر بسعر 1250 دج. هل تريد الطلب؟',
          isAuto: true,
          deliveredBy: 'ai',
          createdAt: new Date(now - 1000 * 60 * 60 * 4.9),
        },
        {
          customerId: customers[1].id,
          direction: 'incoming',
          content: 'أين وصل طلبي؟ مر أكثر من يومين ولم يصلني شيء',
          createdAt: new Date(now - 1000 * 60 * 60 * 3),
        },
        {
          customerId: customers[2].id,
          direction: 'incoming',
          content: 'عندكم توصيل لسطيف؟ وكم رسوم التوصيل؟',
          createdAt: new Date(now - 1000 * 60 * 60 * 2),
        },
      ],
    })

    return NextResponse.json({
      seeded: true,
      products: products.length,
      customers: customers.length,
      companies: companies.length,
    })
  } catch (error) {
    console.error('POST /api/seed error:', error)
    return NextResponse.json({ error: 'فشل تعبئة البيانات التجريبية' }, { status: 500 })
  }
}
