'use strict';
/* ============================================================
   تاجر برو — TajirPro v1.0.0
   تطبيق بسيط للتجار المحليين: مخزون + طلبات وتوصيل + ردود تلقائية
   يعمل بالكامل بدون إنترنت — البيانات محفوظة على الجهاز
   ============================================================ */

/* ---------- Utilities ---------- */
function $(sel){ return document.querySelector(sel); }
function $$(sel){ return Array.prototype.slice.call(document.querySelectorAll(sel)); }
function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
function money(n){
  n = Number(n) || 0;
  var s = n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return s + ' ' + (db && db.settings && db.settings.currency ? db.settings.currency : '');
}
function todayStr(){
  var d = new Date();
  return d.getFullYear() + '-' + ('0'+(d.getMonth()+1)).slice(-2) + '-' + ('0'+d.getDate()).slice(-2);
}
function fmtDate(iso){
  try{
    var d = new Date(iso);
    return d.toLocaleDateString('ar', { day:'numeric', month:'short' }) + ' • ' +
           ('0'+d.getHours()).slice(-2) + ':' + ('0'+d.getMinutes()).slice(-2);
  }catch(e){ return String(iso || ''); }
}
/* توحيد النص العربي للمطابقة: إزالة التشكيل وتوحيد الحروف */
function norm(s){
  return String(s || '')
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ---------- Database (localStorage) ---------- */
var DB_KEY = 'tajirpro_db_v1';
var db = null;

function defaults(){
  return {
    settings: {
      storeName: 'تاجر برو',
      currency: 'د.ج',
      lowStockDefault: 5,
      deliveryFeeDefault: 300,
      deliveryCompanies: ['توصيل الولايات', 'إكسبريس المحلية', 'توصيل يد بيد']
    },
    products: [],
    orders: [],
    replies: [],
    movements: [],
    seq: { product: 0, order: 0, reply: 0, movement: 0 },
    seeded: false
  };
}
function loadDB(){
  try{
    var raw = localStorage.getItem(DB_KEY);
    db = raw ? JSON.parse(raw) : defaults();
  }catch(e){ db = defaults(); }
  if(!db || typeof db !== 'object') db = defaults();
  if(!db.settings) db.settings = defaults().settings;
  if(!db.seq) db.seq = defaults().seq;
  ['products','orders','replies','movements'].forEach(function(k){
    if(!Array.isArray(db[k])) db[k] = [];
  });
}
function saveDB(){
  try{ localStorage.setItem(DB_KEY, JSON.stringify(db)); }
  catch(e){ toast('تعذر حفظ البيانات محلياً', 'err'); }
}
function nextId(kind){ db.seq[kind] = (db.seq[kind] || 0) + 1; return db.seq[kind]; }

function seedIfEmpty(){
  if(db.seeded) return;
  var now = Date.now();
  function isoAgo(mins){ return new Date(now - mins * 60000).toISOString(); }

  var p1 = { id: nextId('product'), name:'سكر أبيض 1كغ',   category:'مواد غذائية', price:120, cost:100, qty:24, minQty:5, createdAt: isoAgo(9000) };
  var p2 = { id: nextId('product'), name:'زيت طهي 1ل',      category:'مواد غذائية', price:280, cost:245, qty:15, minQty:5, createdAt: isoAgo(8000) };
  var p3 = { id: nextId('product'), name:'أرز 1كغ',         category:'مواد غذائية', price:140, cost:120, qty:3,  minQty:5, createdAt: isoAgo(7000) };
  var p4 = { id: nextId('product'), name:'شاي أخضر علبة',   category:'مشروبات',     price:350, cost:300, qty:8,  minQty:4, createdAt: isoAgo(6000) };
  var p5 = { id: nextId('product'), name:'قهوة 200غ',       category:'مشروبات',     price:450, cost:390, qty:2,  minQty:4, createdAt: isoAgo(5000) };
  var p6 = { id: nextId('product'), name:'معجون طماطم',     category:'مواد غذائية', price:90,  cost:75,  qty:40, minQty:6, createdAt: isoAgo(4000) };
  db.products = [p1, p2, p3, p4, p5, p6];

  db.orders = [
    {
      id: nextId('order'), code: 'ORD-' + ('0000' + db.seq.order).slice(-4),
      customer: { name:'أمين بلقاسم', phone:'213555112233', address:'حي النصر، الجزائر الوسطى' },
      items: [ { productId: p1.id, name: p1.name, price: p1.price, qty: 2 },
               { productId: p4.id, name: p4.name, price: p4.price, qty: 1 } ],
      deliveryCompany: 'توصيل الولايات', deliveryFee: 300,
      status: 'delivering', notes: 'الاتصال قبل الوصول',
      createdAt: isoAgo(300), updatedAt: isoAgo(120)
    },
    {
      id: nextId('order'), code: 'ORD-' + ('0000' + db.seq.order).slice(-4),
      customer: { name:'سارة حمداوي', phone:'213661234567', address:'شارع ديدوش مراد' },
      items: [ { productId: p6.id, name: p6.name, price: p6.price, qty: 3 } ],
      deliveryCompany: 'إكسبريس المحلية', deliveryFee: 300,
      status: 'new', notes: '',
      createdAt: isoAgo(60), updatedAt: isoAgo(60)
    }
  ];

  db.replies = [
    { id: nextId('reply'), keywords:'مرحبا, السلام عليكم, اهلا, صباح الخير',
      reply:'وعليكم السلام ورحمة الله 🌟 مرحباً بك في متجرنا! كيف يمكننا خدمتك اليوم؟',
      enabled:true, createdAt: isoAgo(4000) },
    { id: nextId('reply'), keywords:'سعر, بشحال, كم ثمن, الثمن, تمن',
      reply:'أسعارنا محدثة باستمرار 👍 أخبرنا بالمنتج المطلوب ونعطيك السعر فوراً، والأسعار تشمل عرض الجملة للكميات الكبيرة.',
      enabled:true, createdAt: isoAgo(3900) },
    { id: nextId('reply'), keywords:'توصيل, شحن, دليفري, نوصل',
      reply:'نعم نوصل لجميع الولايات 🚚 رسوم التوصيل من 300 د.ج حسب المنطقة، والتوصيل خلال 24-48 ساعة من تأكيد الطلب.',
      enabled:true, createdAt: isoAgo(3800) },
    { id: nextId('reply'), keywords:'تتبع, طلبي, وين طلب, رقم الطلب',
      reply:'نسعد بمتابعة طلبك 📦 أرسل لنا رقم الطلب (يبدأ بـ ORD) وسنخبرك بحالته مباشرة.',
      enabled:true, createdAt: isoAgo(3700) },
    { id: nextId('reply'), keywords:'شكرا, بارك الله, الله يعطي',
      reply:'العفو وشكراً لثقتك 🌹 نحن في خدمتك دائماً!',
      enabled:true, createdAt: isoAgo(3600) }
  ];

  db.movements = [
    { id: nextId('movement'), productId: p1.id, type:'in',  qty:30, note:'رصيد افتتاحي', at: isoAgo(9000) },
    { id: nextId('movement'), productId: p3.id, type:'out', qty:2,  note:'بيع مباشر',    at: isoAgo(2000) }
  ];

  db.seeded = true;
  saveDB();
}

/* ---------- Toast / Modal / Confirm ---------- */
function toast(msg, type){
  var root = $('#toastRoot');
  if(!root) return;
  var el = document.createElement('div');
  el.className = 'toast ' + (type || 'ok');
  el.textContent = msg;
  root.innerHTML = '';
  root.appendChild(el);
  setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); }, 2300);
}

function openModal(html){
  var root = $('#modalRoot');
  root.innerHTML =
    '<div class="overlay" onclick="closeModal()"></div>' +
    '<div class="sheet" id="theSheet">' + html + '</div>';
}
function openDialog(html){
  var root = $('#modalRoot');
  root.innerHTML =
    '<div class="overlay" onclick="closeModal()"></div>' +
    '<div class="dialog-box">' + html + '</div>';
}
function closeModal(){ $('#modalRoot').innerHTML = ''; }

var _confirmCb = null;
function confirmDlg(title, msg, onYes, opts){
  opts = opts || {};
  _confirmCb = onYes;
  var icon = opts.danger
    ? '<div class="d-icon" style="background:var(--red-bg);color:var(--red)">' +
      '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/></svg></div>'
    : '<div class="d-icon" style="background:var(--primary-light);color:var(--primary-dark)">' +
      '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.5V12a10 10 0 11-5.9-9.1"/><path d="M22 4L12 14l-3-3"/></svg></div>';
  openDialog(
    icon +
    '<h3>' + esc(title) + '</h3>' +
    '<p>' + esc(msg) + '</p>' +
    '<div class="dialog-actions">' +
      '<button class="btn ghost" onclick="closeModal()">إلغاء</button>' +
      '<button class="btn ' + (opts.danger ? 'danger' : '') + '" style="' + (opts.danger ? 'border-color:var(--red);color:var(--red)' : '') + '" onclick="confirmYes()">' + esc(opts.yesLabel || 'تأكيد') + '</button>' +
    '</div>'
  );
}
function confirmYes(){
  var cb = _confirmCb;
  _confirmCb = null;
  closeModal();
  if(typeof cb === 'function') cb();
}

function sheetHead(title){
  return '<div class="sheet-handle"></div>' +
    '<div class="sheet-title"><span>' + esc(title) + '</span>' +
    '<button class="sheet-close" onclick="closeModal()">✕</button></div>';
}

/* نسخ نص إلى الحافظة (مع بديل قديم لبيئة WebView) */
function copyText(txt){
  try{
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt).then(function(){ toast('تم النسخ ✓'); },
        function(){ legacyCopy(txt); });
      return;
    }
  }catch(e){}
  legacyCopy(txt);
}
function legacyCopy(txt){
  try{
    var ta = document.createElement('textarea');
    ta.value = txt;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    var ok = document.execCommand('copy');
    document.body.removeChild(ta);
    toast(ok ? 'تم النسخ ✓' : 'تعذر النسخ — انسخ يدوياً', ok ? 'ok' : 'err');
  }catch(e){ toast('تعذر النسخ — انسخ يدوياً', 'err'); }
}

/* ---------- Shared data helpers ---------- */
function findProduct(id){
  id = Number(id);
  for(var i = 0; i < db.products.length; i++){
    if(db.products[i].id === id) return db.products[i];
  }
  return null;
}
function minQtyOf(p){ return (p.minQty != null && p.minQty !== '') ? Number(p.minQty) : (db.settings.lowStockDefault || 5); }
function qtyClass(p){
  var mq = minQtyOf(p);
  if(p.qty <= mq) return 'qty-low';
  if(p.qty <= mq * 2) return 'qty-mid';
  return 'qty-ok';
}
function orderSubtotal(o){
  return o.items.reduce(function(s, it){ return s + (Number(it.price) || 0) * (Number(it.qty) || 0); }, 0);
}
function orderTotal(o){ return orderSubtotal(o) + (Number(o.deliveryFee) || 0); }
function orderItemsText(o){
  return o.items.map(function(it){ return it.name + ' × ' + it.qty; }).join(' + ');
}

var STATUS = {
  new:        { t:'جديد',        c:'blue'  },
  delivering: { t:'قيد التوصيل', c:'amber' },
  delivered:  { t:'تم التسليم',  c:'green' },
  cancelled:  { t:'ملغي',        c:'red'   }
};
var STATUS_KEYS = ['new', 'delivering', 'delivered', 'cancelled'];

function addMovement(productId, type, qty, note){
  db.movements.unshift({
    id: nextId('movement'),
    productId: productId,
    type: type,            /* in | out | adjust */
    qty: Number(qty) || 0,
    note: note || '',
    at: new Date().toISOString()
  });
  if(db.movements.length > 400) db.movements.length = 400;
}

/* ---------- Matching engine للردود التلقائية ---------- */
function findReply(msg){
  var n = norm(msg);
  if(!n) return null;
  for(var i = 0; i < db.replies.length; i++){
    var r = db.replies[i];
    if(!r.enabled) continue;
    var kws = String(r.keywords || '').split(/[,،]/).map(norm).filter(Boolean);
    for(var j = 0; j < kws.length; j++){
      if(n.indexOf(kws[j]) !== -1) return r;
    }
  }
  return null;
}

var TEMPLATES = [
  { keywords:'مرحبا, السلام عليكم, اهلا',
    reply:'وعليكم السلام ورحمة الله 🌟 مرحباً بك في متجرنا! كيف يمكننا خدمتك اليوم؟' },
  { keywords:'سعر, بشحال, كم ثمن, الثمن',
    reply:'أسعارنا محدثة باستمرار 👍 أخبرنا بالمنتج المطلوب ونعطيك السعر فوراً.' },
  { keywords:'توصيل, شحن, دليفري',
    reply:'نعم نوصل لجميع الولايات 🚚 التوصيل خلال 24-48 ساعة من تأكيد الطلب.' },
  { keywords:'تتبع, طلبي, رقم الطلب',
    reply:'نسعد بمتابعة طلبك 📦 أرسل لنا رقم الطلب (يبدأ بـ ORD) وسنخبرك بحالته.' },
  { keywords:'شكرا, بارك الله',
    reply:'العفو وشكراً لثقتك 🌹 نحن في خدمتك دائماً!' },
  { keywords:'مواعيد, تفتح, وقت العمل, ساعات العمل',
    reply:'ساعات عمل المتجر: من السبت إلى الخميس، من 9 صباحاً حتى 7 مساءً 🕗' },
  { keywords:'جملة, بالجملة, كمية كبيرة',
    reply:'لدينا أسعار خاصة للجملة 💼 أخبرنا بالكميات المطلوبة وسنرسل لك عرض السعر.' }
];

function addTemplates(){
  var added = 0;
  TEMPLATES.forEach(function(t){
    var exists = db.replies.some(function(r){
      return norm(r.keywords) === norm(t.keywords);
    });
    if(!exists){
      db.replies.push({
        id: nextId('reply'),
        keywords: t.keywords,
        reply: t.reply,
        enabled: true,
        createdAt: new Date().toISOString()
      });
      added++;
    }
  });
  saveDB();
  render();
  toast(added ? ('تمت إضافة ' + added + ' قالب جاهز ✓') : 'القوالب الجاهزة مضافة مسبقاً');
}

/* ============================================================
   التنقل والعرض
   ============================================================ */
var state = {
  tab: 'dash',
  invSearch: '',
  invCat: 'all',
  invOnlyLow: false,
  orderFilter: 'all'
};

var TABS = {
  dash: 'الرئيسية',
  inventory: 'المخزون',
  orders: 'الطلبات والتوصيل',
  replies: 'الردود التلقائية',
  settings: 'الإعدادات'
};

var FAB_LABELS = {
  dash: 'طلب جديد',
  inventory: 'منتج جديد',
  orders: 'طلب جديد',
  replies: 'قاعدة رد جديدة',
  settings: null
};

function showTab(t){
  state.tab = t;
  $$('#bottomnav .nav-item').forEach(function(b){
    b.classList.toggle('active', b.getAttribute('data-tab') === t);
  });
  $('#pageTitle').textContent = TABS[t] || '';
  render();
  window.scrollTo(0, 0);
}

function fabAction(){
  if(state.tab === 'inventory') openProductModal();
  else if(state.tab === 'replies') openRuleModal();
  else openOrderModal();
}

function updateFab(){
  var fab = $('#fab');
  var label = FAB_LABELS[state.tab];
  if(!label){ fab.classList.add('hidden'); return; }
  fab.classList.remove('hidden');
  $('#fabLabel').textContent = label;
}

function render(){
  var v = $('#view');
  var views = { dash: viewDash, inventory: viewInventory, orders: viewOrders, replies: viewReplies, settings: viewSettings };
  v.innerHTML = views[state.tab]();
  updateFab();
}

/* ============================================================
   1) لوحة التحكم — الرئيسية
   ============================================================ */
function computeStats(){
  var P = db.products, O = db.orders;
  var today = todayStr();
  var s = {
    products: P.length,
    stockUnits: P.reduce(function(a, p){ return a + (Number(p.qty) || 0); }, 0),
    invValue: P.reduce(function(a, p){ return a + (Number(p.qty) || 0) * (Number(p.price) || 0); }, 0),
    low: P.filter(function(p){ return (Number(p.qty) || 0) <= minQtyOf(p); }),
    todayOrders: O.filter(function(o){ return String(o.createdAt || '').slice(0, 10) === today; }),
    active: O.filter(function(o){ return o.status === 'new' || o.status === 'delivering'; }),
    revenue: O.filter(function(o){ return o.status === 'delivered'; })
      .reduce(function(a, o){ return a + orderTotal(o); }, 0),
    deliveredCount: O.filter(function(o){ return o.status === 'delivered'; }).length
  };
  return s;
}

function statCard(iconSvg, iconBg, iconColor, val, label, wide){
  return '<div class="stat' + (wide ? ' wide' : '') + '">' +
    '<div class="s-icon" style="background:' + iconBg + ';color:' + iconColor + '">' + iconSvg + '</div>' +
    '<div class="s-val">' + esc(val) + '</div>' +
    '<div class="s-label">' + esc(label) + '</div>' +
  '</div>';
}

function viewDash(){
  var s = computeStats();
  var days = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
  var d = new Date();
  var dateStr = days[d.getDay()] + '، ' + d.getDate() + ' ' +
    ['يناير','فبراير','مارس','أبريل','ماي','يونيو','يوليوز','غشت','شتنبر','أكتوبر','نوفمبر','ديسمبر'][d.getMonth()];

  var icons = {
    box: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/></svg>',
    coins: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M15.5 9.5c-.8-.8-2-1.2-3.5-1.2-1.7 0-3 .8-3 2s1.2 1.8 3 2 3 .8 3 2-1.3 2-3 2c-1.5 0-2.7-.4-3.5-1.2"/></svg>',
    alert: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/></svg>',
    truck: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4h13v11H1z"/><path d="M14 8h4l4 4v3h-8z"/><circle cx="5.5" cy="18" r="2"/><circle cx="17.5" cy="18" r="2"/></svg>',
    cart: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1.5"/><circle cx="18" cy="21" r="1.5"/><path d="M2 3h3l2.6 12.4a2 2 0 002 1.6h8.7a2 2 0 002-1.6L22 7H6"/></svg>',
    cash: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/></svg>'
  };

  var recent = db.orders.slice().sort(function(a, b){
    return String(b.createdAt).localeCompare(String(a.createdAt));
  }).slice(0, 5);

  var recentHtml = recent.length
    ? recent.map(orderCard).join('')
    : '<div class="card"><div class="empty">' +
      '<div class="e-icon">' + icons.truck + '</div>' +
      '<h4>لا توجد طلبات بعد</h4><p>أنشئ أول طلب لعميل من الزر أدناه</p>' +
      '<button class="btn" onclick="openOrderModal()">طلب جديد</button></div></div>';

  return '' +
  '<div class="hero">' +
    '<div class="h-hi">مرحباً 👋 ' + esc(db.settings.storeName) + '</div>' +
    '<div class="h-date">' + dateStr + '</div>' +
    '<div class="h-actions">' +
      '<button class="h-btn" onclick="openOrderModal()">' + icons.cart + ' طلب جديد</button>' +
      '<button class="h-btn" onclick="openProductModal()">' + icons.box + ' منتج جديد</button>' +
    '</div>' +
  '</div>' +

  '<div class="stat-grid">' +
    statCard(icons.box,   'var(--primary-light)', 'var(--primary-dark)', s.products, 'منتج في المخزون') +
    statCard(icons.coins, 'var(--blue-bg)', 'var(--blue)', money(s.invValue), 'قيمة المخزون') +
    statCard(icons.alert, 'var(--red-bg)', 'var(--red)', s.low.length, 'منتج على وشك النفاذ') +
    statCard(icons.truck, 'var(--amber-bg)', 'var(--amber)', s.active.length, 'قيد التجهيز والتوصيل') +
    statCard(icons.cart,  'var(--primary-light)', 'var(--primary-dark)', s.todayOrders.length, 'طلبات اليوم') +
    statCard(icons.cash,  'var(--green-bg)', 'var(--green)', money(s.revenue), 'مبيعات مسلَّمة') +
  '</div>' +

  (s.low.length
    ? '<div class="section-title"><span>تنبيه: مخزون منخفض</span><span class="hint">' + s.low.length + ' منتج</span></div>' +
      '<div class="card" style="border:1px dashed var(--red);background:#FFFBFB">' +
      s.low.slice(0, 4).map(function(p){
        return '<div class="total-line"><span>' + esc(p.name) + '</span>' +
          '<span class="qty-badge qty-low">بقي ' + esc(p.qty) + '</span></div>';
      }).join('') +
      '<button class="btn sm outline block" style="margin-top:10px" onclick="showTab(\'inventory\')">عرض المخزون</button>' +
      '</div>'
    : '') +

  '<div class="section-title"><span>أحدث الطلبات</span>' +
    '<span class="hint" style="cursor:pointer" onclick="showTab(\'orders\')">عرض الكل</span></div>' +
  recentHtml;
}

/* ============================================================
   2) المخزون
   ============================================================ */
function filteredProducts(){
  var q = norm(state.invSearch);
  return db.products.filter(function(p){
    if(state.invOnlyLow && (Number(p.qty) || 0) > minQtyOf(p)) return false;
    if(state.invCat !== 'all' && p.category !== state.invCat) return false;
    if(q && norm(p.name).indexOf(q) === -1 && norm(p.category || '').indexOf(q) === -1) return false;
    return true;
  });
}

function productCards(list){
  if(!list.length){
    return '<div class="card"><div class="empty">' +
      '<div class="e-icon"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/></svg></div>' +
      '<h4>لا توجد منتجات</h4><p>أضف أول منتج إلى مخزونك</p>' +
      '<button class="btn" onclick="openProductModal()">إضافة منتج</button></div></div>';
  }
  return list.map(function(p){
    var stockVal = (Number(p.qty) || 0) * (Number(p.price) || 0);
    return '<div class="row-card">' +
      '<div class="row-top">' +
        '<div>' +
          '<div class="row-title">' + esc(p.name) + '</div>' +
          '<div class="row-sub">' +
            (p.category ? '<span>' + esc(p.category) + '</span>' : '') +
            '<span>بيع: <b class="ltr">' + money(p.price) + '</b></span>' +
            (p.cost != null && p.cost !== '' ? '<span>تكلفة: <b class="ltr">' + money(p.cost) + '</b></span>' : '') +
          '</div>' +
        '</div>' +
        '<span class="qty-badge ' + qtyClass(p) + '">' + esc(p.qty) + ' وحدة</span>' +
      '</div>' +
      '<div class="row-actions">' +
        '<button class="btn sm ghost" onclick="openStockModal(' + p.id + ',\'in\')">＋ إدخال</button>' +
        '<button class="btn sm ghost" onclick="openStockModal(' + p.id + ',\'out\')">－ إخراج</button>' +
        '<button class="btn sm outline" onclick="editProduct(' + p.id + ')">تعديل</button>' +
        '<button class="btn sm danger" onclick="delProduct(' + p.id + ')">حذف</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function viewInventory(){
  var cats = [];
  db.products.forEach(function(p){
    if(p.category && cats.indexOf(p.category) === -1) cats.push(p.category);
  });
  var lowCount = db.products.filter(function(p){ return (Number(p.qty) || 0) <= minQtyOf(p); }).length;

  var chips = '<button class="chip ' + (state.invCat === 'all' && !state.invOnlyLow ? 'active' : '') + '" onclick="setInvCat(\'all\')">الكل</button>';
  if(lowCount){
    chips += '<button class="chip ' + (state.invOnlyLow ? 'active' : '') + '" style="' + (state.invOnlyLow ? '' : 'color:var(--red);border-color:#FCA5A5') + '" onclick="toggleLow()">⚠ على وشك النفاذ <span class="cnt">' + lowCount + '</span></button>';
  }
  cats.forEach(function(c, i){
    chips += '<button class="chip ' + (state.invCat === c && !state.invOnlyLow ? 'active' : '') + '" onclick="setInvCat(' + i + ')">' + esc(c) + '</button>';
  });

  return '' +
  '<div class="card" style="padding:10px 12px">' +
    '<div class="field" style="margin:0">' +
      '<input id="invSearch" type="search" placeholder="🔍 ابحث بالاسم أو التصنيف..." value="' + esc(state.invSearch) + '" oninput="setInvSearch(this.value)">' +
    '</div>' +
  '</div>' +
  '<div class="chips" id="invChips">' + chips + '</div>' +
  '<div class="section-title"><span>المنتجات</span><span class="hint" id="invCount"></span></div>' +
  '<div id="invList">' + productCards(filteredProducts()) + '</div>';
}

function setInvSearch(v){
  state.invSearch = v;
  var list = filteredProducts();
  var box = $('#invList');
  if(box){
    box.innerHTML = productCards(list);
    updateInvCount(list);
  }
}
function setInvCat(i){
  if(i === 'all'){ state.invCat = 'all'; }
  else{
    var cats = [];
    db.products.forEach(function(p){ if(p.category && cats.indexOf(p.category) === -1) cats.push(p.category); });
    state.invCat = cats[i] || 'all';
  }
  state.invOnlyLow = false;
  refreshInvChipsAndList();
}
function toggleLow(){ state.invOnlyLow = !state.invOnlyLow; refreshInvChipsAndList(); }
function refreshInvChipsAndList(){
  var v = $('#view');
  if(v){ v.innerHTML = viewInventory(); }
}
function updateInvCount(list){
  var el = $('#invCount');
  if(el) el.textContent = list.length + ' منتج';
}

/* ---------- نموذج منتج جديد / تعديل ---------- */
function catOptions(selected){
  var cats = [];
  db.products.forEach(function(p){ if(p.category && cats.indexOf(p.category) === -1) cats.push(p.category); });
  var opts = '<option value="">— بدون تصنيف —</option>';
  cats.forEach(function(c){
    opts += '<option value="' + esc(c) + '"' + (c === selected ? ' selected' : '') + '>' + esc(c) + '</option>';
  });
  opts += '<option value="__other">+ تصنيف جديد...</option>';
  return opts;
}

function openProductModal(id){
  var p = id ? findProduct(id) : null;
  var isEdit = !!p;
  p = p || { name:'', category:'', price:'', cost:'', qty:'', minQty:'' };
  openModal(
    sheetHead(isEdit ? 'تعديل منتج' : 'منتج جديد') +
    '<div class="form-error" id="prodErr"></div>' +
    '<div class="field"><label>اسم المنتج *</label>' +
      '<input id="fName" type="text" value="' + esc(p.name) + '" placeholder="مثال: سكر أبيض 1كغ"></div>' +
    '<div class="field"><label>التصنيف</label>' +
      '<select id="fCat" onchange="fCatChanged(this)">' + catOptions(p.category) + '</select>' +
      '<input id="fCatNew" type="text" placeholder="اسم التصنيف الجديد" style="display:none;margin-top:8px">' +
    '</div>' +
    '<div class="form-grid">' +
      '<div class="field"><label>سعر البيع *</label><input id="fPrice" type="number" inputmode="decimal" min="0" step="any" value="' + esc(p.price) + '"></div>' +
      '<div class="field"><label>تكلفة الشراء</label><input id="fCost" type="number" inputmode="decimal" min="0" step="any" value="' + esc(p.cost) + '"></div>' +
      (isEdit
        ? '<div class="field"><label>الكمية الحالية</label><input id="fQty" type="number" inputmode="numeric" min="0" value="' + esc(p.qty) + '"></div>'
        : '<div class="field"><label>الكمية الافتتاحية</label><input id="fQty" type="number" inputmode="numeric" min="0" value="' + esc(p.qty) + '"></div>') +
      '<div class="field"><label>حد التنبيه (نفاذ)</label><input id="fMin" type="number" inputmode="numeric" min="0" value="' + esc(p.minQty) + '" placeholder="' + esc(db.settings.lowStockDefault) + '"></div>' +
    '</div>' +
    '<button class="btn block" onclick="saveProduct(' + (isEdit ? p.id : 'null') + ')">' + (isEdit ? 'حفظ التعديلات' : 'إضافة المنتج') + '</button>' +
    (isEdit ? buildMovementsHtml(p.id) : '')
  );
}

function fCatChanged(sel){
  var other = $('#fCatNew');
  if(other) other.style.display = sel.value === '__other' ? 'block' : 'none';
}
function resolveCategory(){
  var sel = $('#fCat');
  if(sel && sel.value === '__other'){
    var nv = $('#fCatNew') ? $('#fCatNew').value.trim() : '';
    return nv;
  }
  return sel ? sel.value : '';
}

function saveProduct(id){
  var name = $('#fName').value.trim();
  var price = Number($('#fPrice').value);
  var costV = $('#fCost').value.trim();
  var qtyV = $('#fQty').value.trim();
  var minV = $('#fMin').value.trim();
  var err = $('#prodErr');

  function fail(m){ err.textContent = m; err.style.display = 'block'; }

  if(!name) return fail('أدخل اسم المنتج');
  if(isNaN(price) || price < 0) return fail('أدخل سعر بيع صحيح');
  if(qtyV !== '' && (isNaN(Number(qtyV)) || Number(qtyV) < 0)) return fail('أدخل كمية صحيحة');
  err.style.display = 'none';

  var cat = resolveCategory();
  var qty = qtyV === '' ? 0 : Number(qtyV);

  if(id){
    var p = findProduct(id);
    if(!p) return;
    var oldQty = Number(p.qty) || 0;
    p.name = name;
    p.category = cat;
    p.price = price;
    p.cost = costV === '' ? null : Number(costV);
    p.minQty = minV === '' ? null : Number(minV);
    if(qty !== oldQty){
      p.qty = qty;
      addMovement(p.id, 'adjust', qty - oldQty, 'تعديل يدوي للكمية');
    }
    saveDB();
    closeModal();
    refreshInvChipsAndList();
    toast('تم حفظ التعديلات ✓');
  }else{
    var np = {
      id: nextId('product'),
      name: name, category: cat,
      price: price,
      cost: costV === '' ? null : Number(costV),
      qty: qty,
      minQty: minV === '' ? null : Number(minV),
      createdAt: new Date().toISOString()
    };
    db.products.unshift(np);
    if(qty > 0) addMovement(np.id, 'in', qty, 'رصيد افتتاحي');
    saveDB();
    closeModal();
    refreshInvChipsAndList();
    toast('تمت إضافة المنتج ✓');
  }
}

function editProduct(id){ openProductModal(id); }

function delProduct(id){
  var p = findProduct(id);
  if(!p) return;
  confirmDlg('حذف المنتج', 'سيتم حذف "' + p.name + '" نهائياً. الطلبات القديمة لن تتأثر.', function(){
    db.products = db.products.filter(function(x){ return x.id !== p.id; });
    db.movements = db.movements.filter(function(m){ return m.productId !== p.id; });
    saveDB();
    refreshInvChipsAndList();
    toast('تم حذف المنتج');
  }, { danger: true, yesLabel: 'حذف' });
}

/* ---------- إدخال / إخراج مخزون ---------- */
function openStockModal(id, type){
  var p = findProduct(id);
  if(!p) return;
  var isIn = type === 'in';
  openModal(
    sheetHead(isIn ? 'إدخال مخزون' : 'إخراج مخزون') +
    '<div class="card" style="box-shadow:none;border:1px dashed var(--line);margin-bottom:14px">' +
      '<div class="total-line"><span>المنتج</span><b>' + esc(p.name) + '</b></div>' +
      '<div class="total-line"><span>الكمية الحالية</span><b>' + esc(p.qty) + ' وحدة</b></div>' +
    '</div>' +
    '<div class="form-error" id="stockErr"></div>' +
    '<div class="field"><label>' + (isIn ? 'الكمية المُدخَلة *' : 'الكمية المُخرَجة *') + '</label>' +
      '<input id="sQty" type="number" inputmode="numeric" min="1" placeholder="0"></div>' +
    '<div class="field"><label>ملاحظة</label>' +
      '<input id="sNote" type="text" placeholder="' + (isIn ? 'مثال: فاتورة شراء رقم 12' : 'مثال: بيع مباشر') + '"></div>' +
    '<button class="btn block" onclick="saveStock(' + p.id + ',' + (isIn ? "'in'" : "'out'") + ')">' + (isIn ? 'تسجيل الإدخال' : 'تسجيل الإخراج') + '</button>'
  );
}

function saveStock(id, type){
  var p = findProduct(id);
  if(!p) return;
  var q = Number($('#sQty').value);
  var note = $('#sNote').value.trim();
  var err = $('#stockErr');
  if(isNaN(q) || q <= 0){ err.textContent = 'أدخل كمية أكبر من صفر'; err.style.display = 'block'; return; }
  if(type === 'out' && q > (Number(p.qty) || 0)){
    err.textContent = 'الكمية المطلوبة أكبر من المتوفر (' + p.qty + ')';
    err.style.display = 'block';
    return;
  }
  p.qty = Number(p.qty) || 0;
  p.qty = type === 'in' ? p.qty + q : p.qty - q;
  addMovement(p.id, type, q, note || (type === 'in' ? 'إدخال مخزون' : 'إخراج مخزون'));
  saveDB();
  closeModal();
  refreshInvChipsAndList();
  toast('تم تسجيل الحركة ✓ الكمية الآن: ' + p.qty);
}

function buildMovementsHtml(productId){
  var list = db.movements.filter(function(m){ return m.productId === productId; }).slice(0, 10);
  if(!list.length) return '';
  var rows = list.map(function(m){
    var t = m.type === 'in' ? 'إدخال' : (m.type === 'out' ? 'إخراج' : 'تعديل');
    var sign = m.type === 'out' ? '−' : (m.type === 'in' ? '+' : '');
    return '<div class="mini-row"><span>' + t + ' <b class="ltr">' + sign + m.qty + '</b></span>' +
           '<span>' + esc(m.note || '') + ' • ' + fmtDate(m.at) + '</span></div>';
  }).join('');
  return '<div class="section-title"><span>آخر الحركات</span></div>' +
    '<div class="mini-list">' + rows + '</div>';
}

/* ============================================================
   3) الطلبات والتوصيل
   ============================================================ */
function setOrderFilter(k){ state.orderFilter = k; render(); }

function filteredOrders(){
  var list = db.orders.slice().sort(function(a, b){
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
  if(state.orderFilter !== 'all'){
    list = list.filter(function(o){ return o.status === state.orderFilter; });
  }
  return list;
}

function orderCard(o){
  var st = STATUS[o.status] || { t: o.status, c: 'gray' };
  return '<div class="row-card">' +
    '<div class="row-top">' +
      '<div>' +
        '<div class="row-title">' + esc(o.customer && o.customer.name ? o.customer.name : 'عميل') +
          ' <span class="ltr" style="font-size:11.5px;color:var(--muted);font-weight:700">' + esc(o.code) + '</span></div>' +
        '<div class="row-sub">' +
          (o.customer && o.customer.phone ? '<span class="ltr">' + esc(o.customer.phone) + '</span>' : '') +
          (o.deliveryCompany ? '<span>🚚 ' + esc(o.deliveryCompany) + '</span>' : '') +
          '<span>' + fmtDate(o.createdAt) + '</span>' +
        '</div>' +
      '</div>' +
      '<span class="badge ' + st.c + '">' + st.t + '</span>' +
    '</div>' +
    '<div class="mini-list">' +
      '<div class="mini-row"><span>' + esc(orderItemsText(o)) + '</span></div>' +
      (o.customer && o.customer.address ? '<div class="mini-row"><span>📍 ' + esc(o.customer.address) + '</span></div>' : '') +
      (o.notes ? '<div class="mini-row"><span>📝 ' + esc(o.notes) + '</span></div>' : '') +
      '<div class="total-line"><span>المجموع + التوصيل (' + money(o.deliveryFee) + ')</span><b class="ltr">' + money(orderTotal(o)) + '</b></div>' +
    '</div>' +
    '<div class="row-actions">' +
      '<select class="chip" style="min-height:36px;padding:4px 10px" onchange="setOrderStatus(' + o.id + ', this.value)">' +
        STATUS_KEYS.map(function(k){
          return '<option value="' + k + '"' + (o.status === k ? ' selected' : '') + '>' + STATUS[k].t + '</option>';
        }).join('') +
      '</select>' +
      '<button class="btn sm outline" onclick="waOrder(' + o.id + ')">واتساب العميل</button>' +
      '<button class="btn sm ghost" onclick="showOrderDetails(' + o.id + ')">تفاصيل</button>' +
      '<button class="btn sm danger" onclick="delOrder(' + o.id + ')">حذف</button>' +
    '</div>' +
  '</div>';
}

function viewOrders(){
  var counts = { all: db.orders.length };
  STATUS_KEYS.forEach(function(k){
    counts[k] = db.orders.filter(function(o){ return o.status === k; }).length;
  });
  var chips = '<button class="chip ' + (state.orderFilter === 'all' ? 'active' : '') + '" onclick="setOrderFilter(\'all\')">الكل <span class="cnt">' + counts.all + '</span></button>';
  STATUS_KEYS.forEach(function(k){
    chips += '<button class="chip ' + (state.orderFilter === k ? 'active' : '') + '" onclick="setOrderFilter(\'' + k + '\')">' + STATUS[k].t + ' <span class="cnt">' + counts[k] + '</span></button>';
  });
  var list = filteredOrders();
  return '' +
  '<div class="chips">' + chips + '</div>' +
  (list.length
    ? list.map(orderCard).join('')
    : '<div class="card"><div class="empty">' +
      '<div class="e-icon"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4h13v11H1z"/><path d="M14 8h4l4 4v3h-8z"/><circle cx="5.5" cy="18" r="2"/><circle cx="17.5" cy="18" r="2"/></svg></div>' +
      '<h4>لا توجد طلبات هنا</h4><p>أنشئ طلباً جديداً وسيتم خصم الكميات من المخزون تلقائياً</p>' +
      '<button class="btn" onclick="openOrderModal()">طلب جديد</button></div></div>');
}

/* ---------- تفاصيل الطلب ---------- */
function showOrderDetails(id){
  var o = null;
  db.orders.forEach(function(x){ if(x.id === id) o = x; });
  if(!o) return;
  var st = STATUS[o.status] || { t: o.status, c: 'gray' };
  openModal(
    sheetHead('تفاصيل الطلب ' + o.code) +
    '<div class="card" style="box-shadow:none;border:1px dashed var(--line)">' +
      '<div class="total-line"><span>الحالة</span><span class="badge ' + st.c + '">' + st.t + '</span></div>' +
      '<div class="total-line"><span>العميل</span><b>' + esc(o.customer && o.customer.name) + '</b></div>' +
      '<div class="total-line"><span>الهاتف</span><b class="ltr">' + esc(o.customer && o.customer.phone) + '</b></div>' +
      '<div class="total-line"><span>العنوان</span><b>' + esc(o.customer && o.customer.address) + '</b></div>' +
      '<div class="total-line"><span>شركة التوصيل</span><b>' + esc(o.deliveryCompany || '—') + '</b></div>' +
      '<div class="total-line"><span>تاريخ الطلب</span><b>' + fmtDate(o.createdAt) + '</b></div>' +
    '</div>' +
    '<div class="section-title"><span>المنتجات</span></div>' +
    '<div class="mini-list">' +
      o.items.map(function(it){
        return '<div class="mini-row"><span>' + esc(it.name) + ' × ' + esc(it.qty) + '</span><b class="ltr">' + money(it.price * it.qty) + '</b></div>';
      }).join('') +
      '<div class="total-line"><span>المجموع الفرعي</span><b class="ltr">' + money(orderSubtotal(o)) + '</b></div>' +
      '<div class="total-line"><span>رسوم التوصيل</span><b class="ltr">' + money(o.deliveryFee) + '</b></div>' +
      '<div class="total-line grand"><span>الإجمالي</span><b class="ltr">' + money(orderTotal(o)) + '</b></div>' +
    '</div>'
  );
}

/* ---------- طلب جديد (مسودة) ---------- */
var draft = null;

function openOrderModal(){
  if(!db.products.length){
    confirmDlg('لا توجد منتجات', 'أضف منتجات إلى المخزون أولاً لتتمكن من إنشاء طلب.', function(){
      showTab('inventory');
      openProductModal();
    }, { yesLabel: 'إضافة منتج', danger: false });
    return;
  }
  draft = { items: [ { productId: '', name: '', price: '', qty: 1 } ] };
  openModal(
    sheetHead('طلب جديد') +
    '<div class="form-error" id="ordErr"></div>' +
    '<div class="form-grid">' +
      '<div class="field"><label>اسم العميل *</label><input id="oName" type="text" placeholder="مثال: محمد أمين"></div>' +
      '<div class="field"><label>الهاتف (واتساب)</label><input id="oPhone" type="tel" class="ltr" placeholder="2135XXXXXXXX" style="direction:ltr;text-align:left"></div>' +
    '</div>' +
    '<div class="field"><label>عنوان التوصيل</label><input id="oAddr" type="text" placeholder="الولاية، البلدية، الحي..."></div>' +
    '<div class="section-title" style="margin-top:6px"><span>المنتجات المطلوبة</span>' +
      '<button class="btn sm ghost" onclick="draftAdd()">+ إضافة منتج</button></div>' +
    '<div id="draftItems"></div>' +
    '<div class="form-grid">' +
      '<div class="field"><label>شركة التوصيل</label>' +
        '<select id="oCompany">' +
          db.settings.deliveryCompanies.map(function(c){
            return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
          }).join('') +
        '</select></div>' +
      '<div class="field"><label>رسوم التوصيل</label>' +
        '<input id="oFee" type="number" inputmode="decimal" min="0" step="any" value="' + esc(db.settings.deliveryFeeDefault || 0) + '" oninput="updateTotals()"></div>' +
    '</div>' +
    '<div class="field"><label>ملاحظات</label><textarea id="oNotes" style="min-height:60px" placeholder="مثال: الاتصال قبل الوصول"></textarea></div>' +
    '<div class="card" style="box-shadow:none;border:1px dashed var(--line)">' +
      '<div class="total-line"><span>المجموع الفرعي</span><b class="ltr" id="tSub">0</b></div>' +
      '<div class="total-line"><span>رسوم التوصيل</span><b class="ltr" id="tFee">0</b></div>' +
      '<div class="total-line grand"><span>الإجمالي</span><b class="ltr" id="tGrand">0</b></div>' +
    '</div>' +
    '<button class="btn block" onclick="saveOrder()">تسجيل الطلب وخصم المخزون</button>'
  );
  renderDraftItems();
}

function draftAdd(){
  draft.items.push({ productId: '', name: '', price: '', qty: 1 });
  renderDraftItems();
}
function draftRemove(i){
  draft.items.splice(i, 1);
  if(!draft.items.length) draft.items.push({ productId: '', name: '', price: '', qty: 1 });
  renderDraftItems();
}
function productOptions(idx){
  var it = draft.items[idx];
  var opts = '<option value="">— اختر منتجاً —</option>';
  db.products.forEach(function(p){
    opts += '<option value="' + p.id + '"' + (String(it.productId) === String(p.id) ? ' selected' : '') + '>' +
      esc(p.name) + ' (متوفر: ' + esc(p.qty) + ')</option>';
  });
  return opts;
}
function renderDraftItems(){
  var box = $('#draftItems');
  if(!box) return;
  box.innerHTML = draft.items.map(function(it, i){
    return '<div class="card" style="padding:10px;margin-bottom:8px">' +
      '<div class="field" style="margin-bottom:8px">' +
        '<select onchange="draftSetProduct(' + i + ', this.value)">' + productOptions(i) + '</select>' +
      '</div>' +
      '<div style="display:flex;gap:8px;align-items:flex-end">' +
        '<div class="field" style="flex:1;margin-bottom:0"><label>الكمية</label>' +
          '<input type="number" inputmode="numeric" min="1" value="' + esc(it.qty) + '" oninput="draftSetQty(' + i + ', this.value)"></div>' +
        '<div class="field" style="flex:1.4;margin-bottom:0"><label>سعر الوحدة</label>' +
          '<input type="number" inputmode="decimal" min="0" step="any" value="' + esc(it.price) + '" oninput="draftSetPrice(' + i + ', this.value)"></div>' +
        '<button class="btn sm danger" style="flex:none;margin-bottom:2px" onclick="draftRemove(' + i + ')">✕</button>' +
      '</div>' +
      (it.name && it.maxQty != null ? '<div class="small-note" style="font-size:11px;color:var(--muted);margin-top:6px">متوفر: ' + esc(it.maxQty) + ' وحدة</div>' : '') +
    '</div>';
  }).join('');
  updateTotals();
}
function draftSetProduct(i, val){
  var it = draft.items[i];
  var p = findProduct(val);
  it.productId = p ? p.id : '';
  it.name = p ? p.name : '';
  it.price = p ? p.price : '';
  it.maxQty = p ? p.qty : null;
  renderDraftItems();
}
function draftSetQty(i, v){
  var it = draft.items[i];
  var q = Number(v);
  if(isNaN(q) || q < 1) q = 1;
  if(it.productId && it.maxQty != null && q > it.maxQty){
    q = it.maxQty;
    toast('الكمية المطلوبة أكبر من المتوفر (' + it.maxQty + ')', 'err');
  }
  it.qty = q;
  updateTotals();
}
function draftSetPrice(i, v){
  draft.items[i].price = v === '' ? '' : Number(v);
  updateTotals();
}
function updateTotals(){
  var feeEl = $('#oFee');
  var fee = feeEl ? (Number(feeEl.value) || 0) : 0;
  var sub = draft.items.reduce(function(s, it){
    var pr = Number(it.price);
    if(isNaN(pr)) pr = 0;
    var q = Number(it.qty);
    if(isNaN(q)) q = 0;
    return s + pr * q;
  }, 0);
  var eSub = $('#tSub'), eFee = $('#tFee'), eGrand = $('#tGrand');
  if(eSub){ eSub.textContent = money(sub); }
  if(eFee){ eFee.textContent = money(fee); }
  if(eGrand){ eGrand.textContent = money(sub + fee); }
}

function saveOrder(){
  var name = $('#oName').value.trim();
  var phone = $('#oPhone').value.trim();
  var addr = $('#oAddr').value.trim();
  var company = $('#oCompany').value;
  var fee = Number($('#oFee').value) || 0;
  var notes = $('#oNotes').value.trim();
  var err = $('#ordErr');
  function fail(m){ err.textContent = m; err.style.display = 'block'; }

  if(!name) return fail('أدخل اسم العميل');
  var items = draft.items.filter(function(it){ return it.productId && Number(it.qty) > 0; });
  if(!items.length) return fail('أضف منتجاً واحداً على الأقل إلى الطلب');

  /* التحقق من توفر المخزون */
  for(var i = 0; i < items.length; i++){
    var p = findProduct(items[i].productId);
    if(!p) return fail('منتج غير موجود في المخزون، أعد اختياره');
    if(Number(items[i].qty) > (Number(p.qty) || 0)){
      return fail('الكمية المطلوبة من "' + p.name + '" أكبر من المتوفر (' + p.qty + ')');
    }
  }

  /* خصم المخزون وتسجيل الحركات */
  items.forEach(function(it){
    var p = findProduct(it.productId);
    p.qty = (Number(p.qty) || 0) - Number(it.qty);
    addMovement(p.id, 'out', it.qty, 'طلب ' + (db.seq.order + 1));
  });

  var oid = nextId('order');
  var o = {
    id: oid,
    code: 'ORD-' + ('0000' + oid).slice(-4),
    customer: { name: name, phone: phone, address: addr },
    items: items.map(function(it){
      var p = findProduct(it.productId);
      return { productId: p.id, name: p.name, price: Number(it.price) || p.price, qty: Number(it.qty) };
    }),
    deliveryCompany: company,
    deliveryFee: fee,
    status: 'new',
    notes: notes,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  db.orders.unshift(o);
  saveDB();
  closeModal();
  if(state.tab === 'dash' || state.tab === 'orders') render();
  toast('تم تسجيل الطلب ' + o.code + ' ✓');
}

/* ---------- تغيير حالة الطلب ---------- */
function setOrderStatus(id, newStatus){
  var o = null;
  db.orders.forEach(function(x){ if(x.id === id) o = x; });
  if(!o || o.status === newStatus){ render(); return; }
  var old = o.status;

  if(newStatus === 'cancelled' && old !== 'cancelled'){
    /* إرجاع الكميات للمخزون */
    o.items.forEach(function(it){
      var p = findProduct(it.productId);
      if(p){
        p.qty = (Number(p.qty) || 0) + Number(it.qty);
        addMovement(p.id, 'in', it.qty, 'إلغاء الطلب ' + o.code);
      }
    });
    toast('تم إلغاء الطلب وإرجاع الكميات للمخزون');
  }
  if(old === 'cancelled' && newStatus !== 'cancelled'){
    /* إعادة خصم الكميات عند إعادة تنشيط الطلب */
    var lack = null;
    o.items.forEach(function(it){
      var p = findProduct(it.productId);
      if(p){
        if((Number(p.qty) || 0) >= Number(it.qty)){
          p.qty = (Number(p.qty) || 0) - Number(it.qty);
          addMovement(p.id, 'out', it.qty, 'إعادة تنشيط الطلب ' + o.code);
        }else{
          lack = lack || [];
          lack.push(p.name);
        }
      }
    });
    if(lack){
      toast('مخزون غير كافٍ لـ: ' + lack.join('، '), 'err');
      render();
      return;
    }
  }

  o.status = newStatus;
  o.updatedAt = new Date().toISOString();
  saveDB();
  render();
}

function delOrder(id){
  var o = null;
  db.orders.forEach(function(x){ if(x.id === id) o = x; });
  if(!o) return;
  confirmDlg('حذف الطلب', 'سيتم حذف الطلب ' + o.code + ' وإرجاع كمياته إلى المخزون إذا لم يكن ملغياً.', function(){
    if(o.status !== 'cancelled'){
      o.items.forEach(function(it){
        var p = findProduct(it.productId);
        if(p){
          p.qty = (Number(p.qty) || 0) + Number(it.qty);
          addMovement(p.id, 'in', it.qty, 'حذف الطلب ' + o.code);
        }
      });
    }
    db.orders = db.orders.filter(function(x){ return x.id !== o.id; });
    saveDB();
    render();
    toast('تم حذف الطلب');
  }, { danger: true, yesLabel: 'حذف' });
}

/* ---------- واتساب العميل ---------- */
function waLink(phone, text){
  var p = String(phone || '').replace(/\D/g, '');
  if(!p) return null;
  return 'https://wa.me/' + p + '?text=' + encodeURIComponent(text);
}
function waOrder(id){
  var o = null;
  db.orders.forEach(function(x){ if(x.id === id) o = x; });
  if(!o) return;
  if(!o.customer || !o.customer.phone){
    toast('لا يوجد رقم هاتف لهذا العميل', 'err');
    return;
  }
  var st = STATUS[o.status] ? STATUS[o.status].t : '';
  var msg = 'مرحباً ' + (o.customer.name || '') + ' 👋\n' +
    'بخصوص طلبك رقم ' + o.code + ' من ' + db.settings.storeName + ':\n' +
    orderItemsText(o) + '\nالإجمالي: ' + money(orderTotal(o)) + '\n' +
    'حالة الطلب: ' + st + '\nشكراً لثقتك 🌹';
  var link = waLink(o.customer.phone, msg);
  if(link){ window.location.href = link; }
}

/* ============================================================
   4) الردود التلقائية
   ============================================================ */
function viewReplies(){
  var enabledCount = db.replies.filter(function(r){ return r.enabled; }).length;
  var rules = db.replies.length
    ? db.replies.map(ruleCard).join('')
    : '<div class="card"><div class="empty">' +
      '<div class="e-icon"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 01-8.5 8.5c-1.6 0-3.1-.4-4.4-1.2L3 20l1.2-5.1A8.5 8.5 0 1121 11.5z"/></svg></div>' +
      '<h4>لا توجد قواعد رد</h4><p>أضف قاعدة: كلمات مفتاحية + الرد التلقائي</p>' +
      '<button class="btn" onclick="openRuleModal()">قاعدة جديدة</button></div></div>';

  return '' +
  '<div class="card" style="background:linear-gradient(135deg,var(--primary-dark),var(--primary));color:#fff;border:none">' +
    '<div style="font-weight:800;font-size:14px;margin-bottom:4px">🤖 محرك الردود التلقائية</div>' +
    '<div style="font-size:12.5px;opacity:.92">عندما تحتوي رسالة العميل على إحدى الكلمات المفتاحية، سيُقترح الرد المرتبط بها فوراً — انسخه وأرسله بنقرة واحدة. ' + enabledCount + ' قاعدة مفعّلة من ' + db.replies.length + '.</div>' +
  '</div>' +

  '<div class="card">' +
    '<div class="card-title">🧪 جرّب المحرك</div>' +
    '<div class="field" style="margin-bottom:8px">' +
      '<textarea id="simMsg" style="min-height:64px" placeholder="اكتب رسالة تجريبية كما يكتبها العميل... مثال: السلام عليكم، بشحال التوصيل؟"></textarea>' +
    '</div>' +
    '<button class="btn block" onclick="testReply()">اختبار الرد التلقائي</button>' +
    '<div id="simResult"></div>' +
  '</div>' +

  '<div class="section-title"><span>القوالب الجاهزة</span></div>' +
  '<div class="card"><div class="btn-row">' +
    '<button class="btn sm outline" onclick="addTemplates()">+ إضافة القوالب الجاهزة (7)</button>' +
  '</div></div>' +

  '<div class="section-title"><span>قواعد الرد</span><span class="hint">' + db.replies.length + ' قاعدة</span></div>' +
  rules;
}

function ruleCard(r){
  var kws = String(r.keywords || '').split(/[,،]/).filter(Boolean);
  return '<div class="row-card" style="' + (r.enabled ? '' : 'opacity:.65') + '">' +
    '<div class="row-top">' +
      '<div style="flex:1">' +
        '<div style="margin-bottom:6px">' + kws.map(function(k){ return '<span class="kw-chip">' + esc(k.trim()) + '</span>'; }).join('') + '</div>' +
        '<div style="font-size:13px;color:#334155;word-break:break-word">' + esc(r.reply) + '</div>' +
      '</div>' +
      '<label class="switch">' +
        '<input type="checkbox"' + (r.enabled ? ' checked' : '') + ' onchange="toggleRule(' + r.id + ', this.checked)">' +
        '<span class="slider"></span>' +
      '</label>' +
    '</div>' +
    '<div class="row-actions">' +
      '<button class="btn sm outline" onclick="editRule(' + r.id + ')">تعديل</button>' +
      '<button class="btn sm ghost" onclick="copyRule(' + r.id + ')">نسخ الرد</button>' +
      '<button class="btn sm danger" onclick="delRule(' + r.id + ')">حذف</button>' +
    '</div>' +
  '</div>';
}

function findRule(id){
  id = Number(id);
  for(var i = 0; i < db.replies.length; i++){
    if(db.replies[i].id === id) return db.replies[i];
  }
  return null;
}
function toggleRule(id, on){
  var r = findRule(id);
  if(r){ r.enabled = !!on; saveDB(); render(); toast(on ? 'تم تفعيل القاعدة' : 'تم إيقاف القاعدة'); }
}
function copyRule(id){
  var r = findRule(id);
  if(r) copyText(r.reply);
}
function openRuleModal(id){
  var r = id ? findRule(id) : null;
  var isEdit = !!r;
  r = r || { keywords: '', reply: '', enabled: true };
  openModal(
    sheetHead(isEdit ? 'تعديل قاعدة رد' : 'قاعدة رد جديدة') +
    '<div class="form-error" id="ruleErr"></div>' +
    '<div class="field"><label>الكلمات المفتاحية * <span style="font-weight:400;color:var(--muted)">(افصل بينها بفاصلة)</span></label>' +
      '<input id="rKw" type="text" value="' + esc(r.keywords) + '" placeholder="مثال: سعر, بشحال, كم ثمن"></div>' +
    '<div class="field"><label>الرد التلقائي *</label>' +
      '<textarea id="rReply" placeholder="اكتب الرد الذي سيُقترح على العميل...">' + esc(r.reply) + '</textarea></div>' +
    '<div class="field" style="display:flex;align-items:center;gap:10px">' +
      '<label class="switch" style="margin:0">' +
        '<input type="checkbox" id="rEnabled"' + (r.enabled ? ' checked' : '') + '>' +
        '<span class="slider"></span></label>' +
      '<span style="font-size:13px;font-weight:700">مفعّلة</span></div>' +
    '<button class="btn block" onclick="saveRule(' + (isEdit ? r.id : 'null') + ')">' + (isEdit ? 'حفظ التعديلات' : 'إضافة القاعدة') + '</button>'
  );
}
function saveRule(id){
  var kw = $('#rKw').value.trim();
  var reply = $('#rReply').value.trim();
  var enabled = $('#rEnabled').checked;
  var err = $('#ruleErr');
  function fail(m){ err.textContent = m; err.style.display = 'block'; }
  if(!kw) return fail('أدخل كلمة مفتاحية واحدة على الأقل');
  if(!reply) return fail('أدخل نص الرد التلقائي');
  err.style.display = 'none';

  if(id){
    var r = findRule(id);
    if(r){ r.keywords = kw; r.reply = reply; r.enabled = enabled; }
    toast('تم حفظ القاعدة ✓');
  }else{
    db.replies.push({
      id: nextId('reply'),
      keywords: kw, reply: reply, enabled: enabled,
      createdAt: new Date().toISOString()
    });
    toast('تمت إضافة القاعدة ✓');
  }
  saveDB();
  closeModal();
  if(state.tab === 'replies') render();
}
function delRule(id){
  var r = findRule(id);
  if(!r) return;
  confirmDlg('حذف القاعدة', 'سيتم حذف قاعدة الرد المرتبطة بالكلمات: ' + String(r.keywords).split(/[,،]/)[0] + '...', function(){
    db.replies = db.replies.filter(function(x){ return x.id !== r.id; });
    saveDB();
    render();
    toast('تم حذف القاعدة');
  }, { danger: true, yesLabel: 'حذف' });
}

function testReply(){
  var msg = $('#simMsg').value;
  var box = $('#simResult');
  if(!String(msg).trim()){
    box.innerHTML = '<div class="sim-result none">اكتب رسالة تجريبية أولاً</div>';
    return;
  }
  var r = findReply(msg);
  if(r){
    box.innerHTML = '<div class="sim-result">✅ <b>رد مطابق:</b><br>' + esc(r.reply) +
      '<div style="margin-top:8px"><button class="btn sm" onclick="copyText(document.getElementById(\'simLast\').textContent)">نسخ الرد</button></div>' +
      '<span id="simLast" style="position:absolute;left:-9999px">' + esc(r.reply) + '</span></div>';
  }else{
    box.innerHTML = '<div class="sim-result none">⚠ لا توجد قاعدة مطابقة لهذه الرسالة — فكّر بإضافة كلمة مفتاحية جديدة</div>';
  }
}

/* ============================================================
   5) الإعدادات + النسخ الاحتياطي
   ============================================================ */
function viewSettings(){
  return '' +
  '<div class="card">' +
    '<div class="card-title">🏪 معلومات المتجر</div>' +
    '<div class="field"><label>اسم المتجر</label><input id="setStore" type="text" value="' + esc(db.settings.storeName) + '"></div>' +
    '<div class="form-grid">' +
      '<div class="field"><label>العملة</label><input id="setCurr" type="text" value="' + esc(db.settings.currency) + '" placeholder="د.ج / ر.س / درهم"></div>' +
      '<div class="field"><label>حد التنبيه الافتراضي</label><input id="setLow" type="number" inputmode="numeric" min="0" value="' + esc(db.settings.lowStockDefault) + '"></div>' +
    '</div>' +
    '<div class="field"><label>رسوم التوصيل الافتراضية</label><input id="setFee" type="number" inputmode="decimal" min="0" step="any" value="' + esc(db.settings.deliveryFeeDefault || 0) + '"></div>' +
    '<button class="btn block" onclick="saveStoreInfo()">حفظ معلومات المتجر</button>' +
  '</div>' +

  '<div class="card">' +
    '<div class="card-title">🚚 شركات التوصيل المحلية</div>' +
    '<div id="companyList">' + companyChips() + '</div>' +
    '<div style="display:flex;gap:8px;margin-top:8px">' +
      '<input id="newCompany" type="text" placeholder="اسم شركة توصيل جديدة..." style="flex:1;border:1.5px solid var(--line);border-radius:12px;padding:10px 13px;font-size:14px">' +
      '<button class="btn" style="flex:none" onclick="addCompany()">إضافة</button>' +
    '</div>' +
  '</div>' +

  '<div class="card">' +
    '<div class="card-title">💾 البيانات والنسخ الاحتياطي</div>' +
    '<div class="btn-row">' +
      '<button class="btn sm outline" onclick="openExportJSON()">تصدير نسخة كاملة</button>' +
      '<button class="btn sm outline" onclick="openImportJSON()">استيراد نسخة</button>' +
    '</div>' +
    '<div class="btn-row" style="margin-top:8px">' +
      '<button class="btn sm outline" onclick="openExportCSV()">تصدير المخزون (CSV)</button>' +
      '<button class="btn sm danger" onclick="clearAllData()">مسح جميع البيانات</button>' +
    '</div>' +
    '<div class="small-note" style="font-size:11.5px;color:var(--muted);margin-top:10px">💡 جميع البيانات محفوظة على هذا الجهاز فقط. احتفظ بنسخة احتياطية بشكل دوري عبر «تصدير نسخة كاملة».</div>' +
  '</div>' +

  '<div class="card">' +
    '<div class="card-title">ℹ️ حول التطبيق</div>' +
    '<div class="about-line"><span>التطبيق</span><b>تاجر برو — TajirPro</b></div>' +
    '<div class="about-line"><span>الإصدار</span><b class="ltr">1.0.0</b></div>' +
    '<div class="about-line"><span>العمل</span><b>بدون إنترنت 100%</b></div>' +
    '<div class="about-line"><span>المطابقة</span><b>تلقائية عربية ذكية (تشكيل وحروف موحدة)</b></div>' +
  '</div>';
}

function companyChips(){
  return db.settings.deliveryCompanies.map(function(c, i){
    return '<span class="company-chip">' + esc(c) +
      '<button onclick="delCompany(' + i + ')">✕</button></span>';
  }).join('') || '<div class="small-note" style="color:var(--muted)">لا توجد شركات توصيل — أضف واحدة</div>';
}
function addCompany(){
  var v = $('#newCompany').value.trim();
  if(!v) return;
  if(db.settings.deliveryCompanies.indexOf(v) !== -1){ toast('الشركة مضافة مسبقاً', 'err'); return; }
  db.settings.deliveryCompanies.push(v);
  saveDB();
  $('#newCompany').value = '';
  $('#companyList').innerHTML = companyChips();
  toast('تمت الإضافة ✓');
}
function delCompany(i){
  db.settings.deliveryCompanies.splice(i, 1);
  saveDB();
  $('#companyList').innerHTML = companyChips();
}

function saveStoreInfo(){
  var name = $('#setStore').value.trim();
  var curr = $('#setCurr').value.trim();
  var low = Number($('#setLow').value);
  var fee = Number($('#setFee').value);
  if(!name){ toast('أدخل اسم المتجر', 'err'); return; }
  db.settings.storeName = name;
  db.settings.currency = curr || 'د.ج';
  db.settings.lowStockDefault = isNaN(low) ? 5 : Math.max(0, low);
  db.settings.deliveryFeeDefault = isNaN(fee) ? 0 : Math.max(0, fee);
  saveDB();
  $('#storeNameTop').textContent = name;
  render();
  toast('تم حفظ المعلومات ✓');
}

/* ---------- النسخ الاحتياطي ---------- */
function openTextModal(title, content, hint, importMode){
  openModal(
    sheetHead(title) +
    (hint ? '<div class="small-note" style="margin-bottom:10px;color:var(--muted)">' + esc(hint) + '</div>' : '') +
    (importMode
      ? '<textarea id="importArea" class="export-area" style="direction:ltr" placeholder="الصق محتوى النسخة الاحتياطية هنا..."></textarea>' +
        '<button class="btn block" style="margin-top:12px" onclick="doImport()">استيراد واستبدال البيانات</button>'
      : '<textarea id="exportArea" class="export-area" readonly>' + esc(content) + '</textarea>' +
        '<button class="btn block" style="margin-top:12px" onclick="copyText(document.getElementById(\'exportArea\').value)">نسخ إلى الحافظة</button>')
  );
}

function openExportJSON(){
  openTextModal('تصدير نسخة كاملة (JSON)', JSON.stringify(db, null, 2),
    'انسخ هذا المحتوى واحفظه في مكان آمن (ملاحظات الهاتف أو ملف نصي). يمكن استعادته لاحقاً عبر «استيراد نسخة».', false);
}
function openImportJSON(){
  openTextModal('استيراد نسخة احتياطية', '', 'الصق محتوى النسخة الاحتياطية (JSON) ثم اضغط استيراد. سيتم استبدال البيانات الحالية بالكامل.', true);
}
function doImport(){
  var raw = $('#importArea').value.trim();
  if(!raw){ toast('الصق محتوى النسخة أولاً', 'err'); return; }
  try{
    var data = JSON.parse(raw);
    if(!data || !Array.isArray(data.products) || !Array.isArray(data.orders)){
      throw new Error('bad');
    }
    confirmDlg('تأكيد الاستيراد', 'سيتم استبدال جميع البيانات الحالية بمحتوى النسخة المستوردة.', function(){
      var d = defaults();
      db.settings = Object.assign(d.settings, data.settings || {});
      db.products = data.products || [];
      db.orders = data.orders || [];
      db.replies = Array.isArray(data.replies) ? data.replies : [];
      db.movements = Array.isArray(data.movements) ? data.movements : [];
      db.seq = Object.assign(d.seq, data.seq || {});
      db.seeded = true;
      saveDB();
      closeModal();
      $('#storeNameTop').textContent = db.settings.storeName;
      render();
      toast('تم استيراد البيانات بنجاح ✓');
    });
  }catch(e){
    toast('محتوى غير صالح — تأكد من نسخ النسخة كاملة', 'err');
  }
}
function openExportCSV(){
  var head = ['الاسم', 'التصنيف', 'سعر البيع', 'التكلفة', 'الكمية', 'حد التنبيه', 'قيمة المخزون'];
  function q(v){ v = String(v == null ? '' : v); return '"' + v.replace(/"/g, '""') + '"'; }
  var lines = [head.map(q).join(',')];
  db.products.forEach(function(p){
    lines.push([
      q(p.name), q(p.category || ''), q(p.price), q(p.cost == null ? '' : p.cost),
      q(p.qty), q(p.minQty == null ? '' : p.minQty), q((Number(p.qty) || 0) * (Number(p.price) || 0))
    ].join(','));
  });
  var csv = '\uFEFF' + lines.join('\r\n');
  openTextModal('تصدير المخزون (CSV)', csv, 'انسخ المحتوى واحفظه بملف بامتداد .csv لفتحه في Excel — يدعم العربية.', false);
}
function clearAllData(){
  confirmDlg('مسح جميع البيانات', 'سيتم حذف المنتجات والطلبات والردود نهائياً من هذا الجهاز. لا يمكن التراجع!', function(){
    localStorage.removeItem(DB_KEY);
    loadDB();
    db.seeded = true;   /* بدون بيانات تجريبية هذه المرة */
    saveDB();
    $('#storeNameTop').textContent = db.settings.storeName;
    render();
    toast('تم مسح جميع البيانات');
  }, { danger: true, yesLabel: 'مسح الكل' });
}

/* ============================================================
   التهيئة
   ============================================================ */
function init(){
  loadDB();
  seedIfEmpty();
  $('#storeNameTop').textContent = db.settings.storeName;
  showTab('dash');
}
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', init);
}else{
  init();
}


