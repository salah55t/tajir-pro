'use strict';
/* ============================================================
   تاجر برو — TajirPro v1.8.0
   تطبيق إدارة المتاجر: نقطة بيع بقارئ باركود + مخزون + تنبيهات
   + طباعة الفواتير حرارياً عبر البلوتوث + رمز تحقق لكل فاتورة
   + وضع ليلي + لوحة تحكم برسوم بيانية
   + نظام اشتراك صالح لجهاز واحد + قفل الميزات للنسخة المجانية
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

/* ---------- الوضع الليلي / النهاري ---------- */
var THEME_KEY = 'tajirpro_theme';
function currentTheme(){ return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
function applyTheme(t){
  document.documentElement.setAttribute('data-theme', t);
  try{ localStorage.setItem(THEME_KEY, t); }catch(e){}
  var meta = document.querySelector('meta[name=theme-color]');
  if(meta) meta.setAttribute('content', t === 'dark' ? '#0B1220' : '#047857');
  var b = $('#themeBtn');
  if(b){ b.classList.add('spin'); setTimeout(function(){ b.classList.remove('spin'); }, 360); }
  if(typeof render === 'function' && db) render();
}
function toggleTheme(){
  var next = currentTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  toast(next === 'dark' ? 'تم تفعيل الوضع الليلي 🌙' : 'تم تفعيل الوضع النهاري ☀️');
}

/* ---------- Database (localStorage) ---------- */
var DB_KEY = 'tajirpro_db_v1';
var db = null;

function defaults(){
  return {
    settings: {
      storeName: 'تاجر برو',
      currency: 'د.ج',
      storePhone: '',
      lowStockDefault: 5,
      expiryWarnDays: 30,
      scanSound: true,
      scanVibrate: true,
      printerWidthMm: 58,
      printerName: '',
      printerAddr: ''
    },
    products: [],
    movements: [],
    sales: [],
    cart: [],
    seq: { product: 0, movement: 0, sale: 0 },
    seeded: false
  };
}
function loadDB(){
  try{
    var raw = localStorage.getItem(DB_KEY);
    db = raw ? JSON.parse(raw) : defaults();
  }catch(e){ db = defaults(); }
  if(!db || typeof db !== 'object') db = defaults();
  var d = defaults();
  if(!db.settings) db.settings = d.settings;
  /* ترحيل الإعدادات الجديدة دون فقدان الإعدادات القديمة */
  ['expiryWarnDays','scanSound','scanVibrate','storePhone','printerWidthMm','printerName','printerAddr'].forEach(function(k){
    if(db.settings[k] === undefined) db.settings[k] = d.settings[k];
  });
  if(!db.seq) db.seq = d.seq;
  if(db.seq.sale === undefined) db.seq.sale = 0;
  ['products','movements','sales'].forEach(function(k){
    if(!Array.isArray(db[k])) db[k] = [];
  });
  /* تنظيف بيانات النسخ القديمة: الطلبات والردود لم تعد جزءاً من التطبيق */
  var legacyCleaned = false;
  if('orders' in db){ delete db.orders; legacyCleaned = true; }
  if('replies' in db){ delete db.replies; legacyCleaned = true; }
  if(db.settings){
    if('deliveryFeeDefault' in db.settings){ delete db.settings.deliveryFeeDefault; legacyCleaned = true; }
    if('deliveryCompanies' in db.settings){ delete db.settings.deliveryCompanies; legacyCleaned = true; }
  }
  if(legacyCleaned) saveDB();
  if(!Array.isArray(db.cart)) db.cart = [];
  /* ترحيل حقول المنتجات: الباركود وتاريخ الصلاحية (توافق مع النسخ القديمة) */
  db.products.forEach(function(p){
    if(p.barcode === undefined) p.barcode = '';
    if(p.expiry === undefined) p.expiry = '';
  });
  /* ترحيل الفواتير القديمة: توليد كود تحقق لكل فاتورة (للطباعة ومنع الاحتيال) */
  var verMigrated = false;
  db.sales.forEach(function(s){
    if(!s.verCode){ s.verCode = makeVerCode(s); verMigrated = true; }
  });
  if(verMigrated) saveDB();
}
function saveDB(){
  try{ localStorage.setItem(DB_KEY, JSON.stringify(db)); }
  catch(e){ toast('تعذر حفظ البيانات محلياً', 'err'); }
}
function nextId(kind){ db.seq[kind] = (db.seq[kind] || 0) + 1; return db.seq[kind]; }

/* ---------- كود التحقق لكل فاتورة (ضد الاحتيال) ---------- */
function padNum(n, w){
  var s = String(n);
  while(s.length < w) s = '0' + s;
  return s;
}
function verChecksum(sale){
  var s = (db.settings.storeName || '') + '|' + sale.id + '|' + sale.total + '|' + sale.createdAt;
  var h = 7;
  for(var i = 0; i < s.length; i++){ h = ((h * 131) + s.charCodeAt(i)) & 0xFFFFFF; }
  return ('0' + (h % 97)).slice(-2) + String.fromCharCode(65 + (h % 26));
}
function makeVerCode(sale){
  return 'TJ-' + padNum(sale.id, 4) + '-' + verChecksum(sale);
}
function normCode(c){
  return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
function findSaleByVerCode(code){
  var n = normCode(code);
  if(!n) return null;
  for(var i = 0; i < db.sales.length; i++){
    if(normCode(db.sales[i].verCode) === n) return db.sales[i];
  }
  return null;
}

function seedIfEmpty(){
  if(db.seeded) return;
  var now = Date.now();
  function isoAgo(mins){ return new Date(now - mins * 60000).toISOString(); }
  function isoInDays(days){ return new Date(now + days * 86400000).toISOString().slice(0, 10); }

  var p1 = { id: nextId('product'), name:'سكر أبيض 1كغ',   category:'مواد غذائية', price:120, cost:100, qty:24, minQty:5, barcode:'6130001000015', expiry:'',                        createdAt: isoAgo(9000) };
  var p2 = { id: nextId('product'), name:'زيت طهي 1ل',      category:'مواد غذائية', price:280, cost:245, qty:15, minQty:5, barcode:'6130001000022', expiry:'',                        createdAt: isoAgo(8000) };
  var p3 = { id: nextId('product'), name:'أرز 1كغ',         category:'مواد غذائية', price:140, cost:120, qty:3,  minQty:5, barcode:'6130001000039', expiry:isoInDays(12),             createdAt: isoAgo(7000) };

  /* النسخة المفعّلة تحصل على بيانات تجريبية كاملة، النسخة المجانية على 3 منتجات فقط */
  var locked = (typeof isLocked === 'function') ? isLocked() : false;
  if(locked){
    db.products = [p1, p2, p3];
  }else{
    var p4 = { id: nextId('product'), name:'شاي أخضر علبة',   category:'مشروبات',     price:350, cost:300, qty:8,  minQty:4, barcode:'6130002000011', expiry:'',                        createdAt: isoAgo(6000) };
    var p5 = { id: nextId('product'), name:'قهوة 200غ',       category:'مشروبات',     price:450, cost:390, qty:2,  minQty:4, barcode:'6130002000028', expiry:isoInDays(80),             createdAt: isoAgo(5000) };
    var p6 = { id: nextId('product'), name:'معجون طماطم',     category:'مواد غذائية', price:90,  cost:75,  qty:40, minQty:6, barcode:'6130003000018', expiry:isoInDays(200),            createdAt: isoAgo(4000) };
    db.products = [p1, p2, p3, p4, p5, p6];
  }

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

/* ---------- الباركود والصلاحية والتنبيهات ---------- */
function findByBarcode(code){
  var c = String(code || '').trim();
  if(!c) return null;
  for(var i = 0; i < db.products.length; i++){
    var p = db.products[i];
    if(p.barcode && String(p.barcode).trim() === c) return p;
  }
  return null;
}
function barcodeOwnerOtherThan(code, productId){
  var c = String(code || '').trim();
  if(!c) return null;
  for(var i = 0; i < db.products.length; i++){
    var p = db.products[i];
    if(p.id !== productId && p.barcode && String(p.barcode).trim() === c) return p;
  }
  return null;
}
function daysUntil(iso){
  if(!iso) return null;
  var t = new Date(String(iso) + 'T00:00:00');
  if(isNaN(t.getTime())) return null;
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((t.getTime() - today.getTime()) / 86400000);
}
function expiryState(p){
  var dLeft = daysUntil(p.expiry);
  if(dLeft == null) return null;
  if(dLeft < 0)  return { key:'expired', label:'منتهي منذ ' + Math.abs(dLeft) + ' يوم', cls:'expired' };
  if(dLeft === 0) return { key:'expired', label:'ينتهي اليوم!', cls:'expired' };
  var warn = Number(db.settings.expiryWarnDays) || 30;
  if(dLeft <= warn) return { key:'soon', label:'ينتهي بعد ' + dLeft + ' يوم', cls:'soon' };
  return { key:'ok', label:'الصلاحية بعد ' + dLeft + ' يوم', cls:'ok' };
}
function computeAlerts(){
  var out = [], low = [], expired = [], expiring = [];
  db.products.forEach(function(p){
    var q = Number(p.qty) || 0;
    var mq = minQtyOf(p);
    if(q <= 0) out.push(p);
    else if(q <= mq) low.push(p);
    var es = expiryState(p);
    if(es){
      if(es.key === 'expired') expired.push(p);
      else if(es.key === 'soon') expiring.push(p);
    }
  });
  return {
    out: out, low: low, expired: expired, expiring: expiring,
    stockTotal: out.length + low.length,
    expiryTotal: expired.length + expiring.length,
    total: out.length + low.length + expired.length + expiring.length
  };
}

/* ---------- مؤثرات المسح: صوت + اهتزاز ---------- */
var _audioCtx = null;
function ensureAudio(){
  if(!_audioCtx){
    try{ _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){}
  }
  return _audioCtx;
}
function beepOk(){
  if(db.settings.scanSound === false) return;
  var ctx = ensureAudio(); if(!ctx) return;
  try{
    var t = ctx.currentTime;
    [920, 1380].forEach(function(f, i){
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.22, t + i * 0.09 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.085);
      o.connect(g); g.connect(ctx.destination);
      o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.1);
    });
  }catch(e){}
}
function beepErr(){
  if(db.settings.scanSound === false) return;
  var ctx = ensureAudio(); if(!ctx) return;
  try{
    var t = ctx.currentTime;
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = 'square'; o.frequency.value = 220;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + 0.26);
  }catch(e){}
}
function buzz(pattern){
  if(db.settings.scanVibrate === false) return;
  try{ if(navigator.vibrate) navigator.vibrate(pattern || 60); }catch(e){}
}

/* ============================================================
   التنقل والعرض
   ============================================================ */
var state = {
  tab: 'dash',
  invSearch: '',
  invCat: 'all',
  invOnlyLow: false,
  posView: 'cart',
  posDiscount: 0
};

var TABS = {
  dash: 'الرئيسية',
  pos: 'نقطة البيع',
  inventory: 'المخزون',
  settings: 'الإعدادات'
};

var FAB_LABELS = {
  dash: 'بيع جديد',
  pos: 'مسح منتج',
  inventory: 'منتج جديد',
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
  else if(state.tab === 'pos') openScannerForCart();
  else showTab('pos');
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
  var views = { dash: viewDash, pos: viewPos, inventory: viewInventory, settings: viewSettings };
  v.innerHTML = views[state.tab]();
  updateFab();
  document.body.classList.toggle('has-checkoutbar', state.tab === 'pos' && state.posView === 'cart');
}

/* ============================================================
   1) لوحة التحكم — الرئيسية
   ============================================================ */
function computeStats(){
  var P = db.products;
  var today = todayStr();
  var yKey = (function(){ var y = new Date(Date.now() - 86400000);
    return y.getFullYear() + '-' + ('0'+(y.getMonth()+1)).slice(-2) + '-' + ('0'+y.getDate()).slice(-2); })();
  var weekAgo = Date.now() - 7 * 86400000;
  var twoWeeksAgo = Date.now() - 14 * 86400000;
  var okSales = db.sales.filter(function(s){ return !s.voided; });
  var todaySales = okSales.filter(function(s){ return String(s.createdAt || '').slice(0, 10) === today; });
  var ySales = okSales.filter(function(s){ return String(s.createdAt || '').slice(0, 10) === yKey; });
  var A = computeAlerts();
  var s = {
    products: P.length,
    stockUnits: P.reduce(function(a, p){ return a + (Number(p.qty) || 0); }, 0),
    invValue: P.reduce(function(a, p){ return a + (Number(p.qty) || 0) * (Number(p.price) || 0); }, 0),
    low: P.filter(function(p){ return (Number(p.qty) || 0) <= minQtyOf(p); }),
    todaySalesCount: todaySales.length,
    todaySalesTotal: todaySales.reduce(function(a, s){ return a + (Number(s.total) || 0); }, 0),
    yesterdayTotal: ySales.reduce(function(a, s){ return a + (Number(s.total) || 0); }, 0),
    weekSalesTotal: okSales.filter(function(s){ return new Date(s.createdAt).getTime() >= weekAgo; })
      .reduce(function(a, s){ return a + (Number(s.total) || 0); }, 0),
    prevWeekTotal: okSales.filter(function(s){
      var t = new Date(s.createdAt).getTime();
      return t >= twoWeeksAgo && t < weekAgo;
    }).reduce(function(a, s){ return a + (Number(s.total) || 0); }, 0),
    allSalesTotal: okSales.reduce(function(a, s){ return a + (Number(s.total) || 0); }, 0),
    salesCount: okSales.length,
    alerts: A
  };
  return s;
}

/* شارة اتجاه النمو: تقارن الفترة الحالية بالسابقة */
function deltaBadge(cur, prev){
  if(prev <= 0){
    if(cur > 0) return '<span class="s-delta up">▲ جديد</span>';
    return '<span class="s-delta flat">— لا مبيعات</span>';
  }
  var pct = Math.round(((cur - prev) / prev) * 100);
  if(pct > 0) return '<span class="s-delta up">▲ ' + pct + '%</span>';
  if(pct < 0) return '<span class="s-delta down">▼ ' + Math.abs(pct) + '%</span>';
  return '<span class="s-delta flat">= بدون تغيير</span>';
}

function statCard(iconSvg, iconBg, iconColor, val, label, opts){
  opts = opts || {};
  return '<div class="stat' + (opts.wide ? ' wide' : '') + '"' +
    (opts.onclick ? ' onclick="' + opts.onclick + '" style="cursor:pointer"' : '') + '>' +
    '<div class="s-icon" style="background:' + iconBg + ';color:' + iconColor + '">' + iconSvg + '</div>' +
    '<div class="s-val">' + esc(val) + '</div>' +
    '<div class="s-label">' + esc(label) + '</div>' +
    (opts.delta ? opts.delta : '') +
  '</div>';
}

function alertBannerHtml(cls, iconSvg, title, sub, count, onclickFn){
  return '<div class="alert-banner ' + cls + '" onclick="' + onclickFn + '">' +
    '<div class="ab-icon">' + iconSvg + '</div>' +
    '<div><div class="ab-title">' + esc(title) + '</div>' +
      '<div class="ab-sub">' + esc(sub) + '</div></div>' +
    '<div class="ab-count">' + count + '</div>' +
  '</div>';
}

/* ============================================================
   رسوم بيانية خفيفة (SVG بدون مكتبات) — تعمل بدون إنترنت
   ============================================================ */

/* سلسلة مبيعات آخر 7 أيام (تُحسب من الفواتير غير المرتجعة) */
function salesSeries(days){
  days = days || 7;
  var out = [];
  var labels = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
  var ok = db.sales.filter(function(s){ return !s.voided; });
  for(var i = days - 1; i >= 0; i--){
    var d = new Date(Date.now() - i * 86400000);
    var key = d.getFullYear() + '-' + ('0'+(d.getMonth()+1)).slice(-2) + '-' + ('0'+d.getDate()).slice(-2);
    var daySales = ok.filter(function(s){ return String(s.createdAt || '').slice(0,10) === key; });
    out.push({
      key: key,
      label: i === 0 ? 'اليوم' : labels[d.getDay()],
      total: daySales.reduce(function(a, s){ return a + (Number(s.total) || 0); }, 0),
      count: daySales.length
    });
  }
  return out;
}

/* مخطط مساحة/خط لمبيعات آخر 7 أيام */
function lineChartHtml(series){
  var W = 300, H = 132, padX = 6, padTop = 14, padBot = 10;
  var max = Math.max.apply(null, series.map(function(p){ return p.total; }).concat([0]));
  if(max <= 0) max = 1;
  var innerW = W - padX * 2;
  var innerH = H - padTop - padBot;
  var step = series.length > 1 ? innerW / (series.length - 1) : innerW;
  var pts = series.map(function(p, i){
    var x = padX + step * i;
    var y = padTop + innerH - (p.total / max) * innerH;
    return { x: x, y: y, p: p };
  });
  var line = pts.map(function(o, i){ return (i ? 'L' : 'M') + o.x.toFixed(1) + ' ' + o.y.toFixed(1); }).join(' ');
  var area = line + ' L' + pts[pts.length-1].x.toFixed(1) + ' ' + (padTop + innerH) +
             ' L' + pts[0].x.toFixed(1) + ' ' + (padTop + innerH) + ' Z';
  var grid = '';
  for(var g = 0; g <= 2; g++){
    var gy = padTop + (innerH / 2) * g;
    grid += '<line class="lc-grid" x1="' + padX + '" y1="' + gy.toFixed(1) + '" x2="' + (W-padX) + '" y2="' + gy.toFixed(1) + '"/>';
  }
  var dots = pts.map(function(o){
    return '<circle class="lc-dot" cx="' + o.x.toFixed(1) + '" cy="' + o.y.toFixed(1) + '" r="3.4" style="stroke:var(--primary)"/>';
  }).join('');
  var labels = '<div class="chart-labels">' + series.map(function(p, i){
    return '<span class="' + (i === series.length - 1 ? 'today' : '') + '">' + esc(p.label) + '</span>';
  }).join('') + '</div>';

  return '<svg class="line-chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' +
    '<defs><linearGradient id="lcg" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="var(--primary)" stop-opacity=".38"/>' +
      '<stop offset="100%" stop-color="var(--primary)" stop-opacity="0"/>' +
    '</linearGradient></defs>' +
    grid +
    '<path class="lc-area" d="' + area + '" fill="url(#lcg)"/>' +
    '<path class="lc-line" d="' + line + '" stroke="var(--primary)"/>' +
    dots +
  '</svg>' + labels;
}

/* أفضل المنتجات مبيعاً (بالكمية) من الفواتير غير المرتجعة */
function topProducts(limit){
  limit = limit || 4;
  var map = {};
  db.sales.forEach(function(s){
    if(s.voided) return;
    (s.items || []).forEach(function(it){
      var k = it.name;
      if(!map[k]) map[k] = { name: k, qty: 0, revenue: 0 };
      map[k].qty += Number(it.qty) || 0;
      map[k].revenue += (Number(it.price) || 0) * (Number(it.qty) || 0);
    });
  });
  var arr = Object.keys(map).map(function(k){ return map[k]; });
  arr.sort(function(a, b){ return b.qty - a.qty; });
  return arr.slice(0, limit);
}

function barListHtml(items){
  if(!items.length) return '<div class="chart-empty">لا توجد مبيعات بعد لعرض الأكثر مبيعاً</div>';
  var max = Math.max.apply(null, items.map(function(i){ return i.qty; })) || 1;
  return '<div class="bar-list">' + items.map(function(it, i){
    var pct = Math.max(4, Math.round((it.qty / max) * 100));
    return '<div class="bar-item">' +
      '<div class="bi-top"><span class="bi-name">' + esc(it.name) + '</span>' +
        '<span class="bi-val ltr">' + it.qty + ' وحدة • ' + money(it.revenue) + '</span></div>' +
      '<div class="bar-track"><div class="bar-fill' + (i % 2 ? ' alt' : '') + '" style="width:' + pct + '%;animation-delay:' + (i * .06) + 's"></div></div>' +
    '</div>';
  }).join('') + '</div>';
}

function viewDash(){
  var s = computeStats();
  var days = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
  var d = new Date();
  var dateStr = days[d.getDay()] + '، ' + d.getDate() + ' ' +
    ['يناير','فبراير','مارس','أبريل','ماي','يونيو','يوليوز','غشت','شتنبر','أكتوبر','نوفمبر','ديسمبر'][d.getMonth()];

  /* لافتة القفل للنسخة المجانية */
  var lockBannerHtml = '';
  if(typeof isLocked === 'function' && isLocked()){
    var usedPct = Math.min(100, Math.round((db.products.length / FREE_PRODUCT_LIMIT) * 100));
    lockBannerHtml =
      '<div class="lock-banner" onclick="openSubscriptionModal()">' +
        '<div class="lb-icon">🔒</div>' +
        '<div class="lb-body">' +
          '<div class="lb-title">النسخة المجانية — مفعّلة بمميزات محدودة</div>' +
          '<div class="lb-sub">المنتجات: ' + db.products.length + ' / ' + FREE_PRODUCT_LIMIT + ' • ' +
            'الطباعة والنسخ الاحتياطي مُقفلة</div>' +
          '<div class="lb-progress">' +
            '<div class="lb-progress-bar" style="width:' + usedPct + '%"></div>' +
          '</div>' +
        '</div>' +
        '<button class="btn sm primary">🔑 تفعيل</button>' +
      '</div>';
  }

  var icons = {
    box: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/></svg>',
    coins: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M15.5 9.5c-.8-.8-2-1.2-3.5-1.2-1.7 0-3 .8-3 2s1.2 1.8 3 2 3 .8 3 2-1.3 2-3 2c-1.5 0-2.7-.4-3.5-1.2"/></svg>',
    alert: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/></svg>',
    cash: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/></svg>',
    scan: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 012-2h2"/><path d="M17 3h2a2 2 0 012 2v2"/><path d="M21 17v2a2 2 0 01-2 2h-2"/><path d="M7 21H5a2 2 0 01-2-2v-2"/><line x1="3" y1="12" x2="21" y2="12"/></svg>',
    clock: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
  };

  var recent = db.sales.slice(0, 4);

  var recentHtml = recent.length
    ? recent.map(saleCardHtml).join('')
    : '<div class="card"><div class="empty">' +
      '<div class="e-icon">' + icons.cash + '</div>' +
      '<h4>لا توجد مبيعات بعد</h4><p>ابدأ أول عملية بيع من نقطة البيع بالمسح بالكاميرا</p>' +
      '<button class="btn" onclick="showTab(\'pos\')">ابدأ البيع</button></div></div>';

  var series = salesSeries(7);
  var weekSum = series.reduce(function(a, p){ return a + p.total; }, 0);
  var best = series.reduce(function(a, p){ return p.total > a.total ? p : a; }, series[0]);

  var chartHtml =
    '<div class="chart-card">' +
      '<div class="chart-head">' +
        '<span class="ch-title">' + icons.coins + ' مبيعات آخر 7 أيام</span>' +
        '<span class="ch-total ltr">' + money(weekSum) + '</span>' +
      '</div>' +
      (weekSum > 0
        ? lineChartHtml(series)
        : '<div class="chart-empty">لا توجد مبيعات في آخر 7 أيام — ابدأ البيع لتظهر الأرقام هنا</div>') +
      (weekSum > 0 ? '<div class="chart-head" style="margin:8px 0 0"><span class="ch-sub">أعلى يوم: ' + esc(best.label) + ' • ' + money(best.total) + '</span></div>' : '') +
    '</div>';

  var top = topProducts(4);
  var topHtml =
    '<div class="chart-card">' +
      '<div class="chart-head">' +
        '<span class="ch-title">' + icons.box + ' الأكثر مبيعاً</span>' +
        '<span class="ch-sub">حسب الكمية المباعة</span>' +
      '</div>' +
      barListHtml(top) +
    '</div>';

  return '' +
  '<div class="hero">' +
    '<div class="h-hi">مرحباً 👋 ' + esc(db.settings.storeName) + '</div>' +
    '<div class="h-desc">نقطة بيع بمسح الباركود، فواتير حرارية عبر البلوتوث، تحقق من فواتيرك بمسح رمزها لمنع الاحتيال، وإدارة كاملة للمخزون مع تنبيهات ذكية — وكل ذلك يعمل بدون إنترنت.</div>' +
    '<div class="h-date">' + dateStr + '</div>' +
    '<div class="h-actions">' +
      '<button class="h-btn" style="background:#fff;color:var(--primary-dark);border-color:#fff" onclick="showTab(\'pos\')">' + icons.scan + ' بيع جديد</button>' +
      '<button class="h-btn" onclick="openProductModal()">' + icons.box + ' منتج جديد</button>' +
    '</div>' +
  '</div>' +

  lockBannerHtml +

  '<div class="stat-grid">' +
    statCard(icons.cash,  'var(--green-bg)', 'var(--green)', money(s.todaySalesTotal), 'مبيعات اليوم (' + s.todaySalesCount + ')',
      { delta: deltaBadge(s.todaySalesTotal, s.yesterdayTotal) }) +
    statCard(icons.coins, 'var(--blue-bg)', 'var(--blue)', money(s.weekSalesTotal), 'مبيعات آخر 7 أيام',
      { delta: deltaBadge(s.weekSalesTotal, s.prevWeekTotal) }) +
    statCard(icons.box,   'var(--primary-light)', 'var(--primary-dark)', s.products, 'منتج في المخزون') +
    statCard(icons.coins, 'var(--primary-light)', 'var(--primary-dark)', money(s.invValue), 'قيمة المخزون') +
    statCard(icons.alert, 'var(--red-bg)', 'var(--red)', s.alerts.stockTotal, 'تنبيهات المخزون', { onclick: 'openAlerts(\'stock\')' }) +
    statCard(icons.clock, 'var(--amber-bg)', 'var(--amber)', s.alerts.expiryTotal, 'تنبيهات الصلاحية', { onclick: 'openAlerts(\'expiry\')' }) +
  '</div>' +

  (s.alerts.stockTotal
    ? '<div style="margin-top:14px">' +
      alertBannerHtml('danger', icons.alert, 'تنبيه المخزون',
        (s.alerts.out.length ? s.alerts.out.length + ' نفدت كلياً • ' : '') + s.alerts.low.length + ' منخفضة',
        s.alerts.stockTotal, 'openAlerts(\'stock\')') + '</div>'
    : '') +
  (s.alerts.expiryTotal
    ? alertBannerHtml('warn', icons.clock, 'تنبيه الصلاحية',
        (s.alerts.expired.length ? s.alerts.expired.length + ' منتهية • ' : '') + s.alerts.expiring.length + ' تنتهي قريباً',
        s.alerts.expiryTotal, 'openAlerts(\'expiry\')')
    : '') +

  '<div style="margin-top:14px"></div>' +
  chartHtml +
  topHtml +

  '<div class="section-title"><span>أحدث المبيعات</span>' +
    '<span class="hint" style="cursor:pointer" onclick="state.posView=\'history\';showTab(\'pos\')">عرض الكل</span></div>' +
  recentHtml;
}

/* ============================================================
   1.5) نقطة البيع (POS) — مسح بالكاميرا + سلة + دفع + سجل
   ============================================================ */

var SCAN_ICON_POS = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 012-2h2"/><path d="M17 3h2a2 2 0 012 2v2"/><path d="M21 17v2a2 2 0 01-2 2h-2"/><path d="M7 21H5a2 2 0 01-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>';
var TAG_ICON_POS = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4L13.4 20.6a2 2 0 01-2.8 0L3 13V3h10l7.6 7.6a2 2 0 010 2.8z"/><circle cx="7.5" cy="7.5" r="1"/></svg>';

function showPosView(v){
  state.posView = v;
  render();
}

function viewPos(){
  return '<div class="pos-tabs">' +
    '<button class="btn ' + (state.posView === 'cart' ? 'on' : 'ghost') + '" onclick="showPosView(\'cart\')">🛒 بيع</button>' +
    '<button class="btn ' + (state.posView === 'history' ? 'on' : 'ghost') + '" onclick="showPosView(\'history\')">📋 السجل</button>' +
    '<button class="btn ' + (state.posView === 'verify' ? 'on' : 'ghost') + '" onclick="showPosView(\'verify\')">✅ تحقق من فاتورة</button>' +
  '</div>' +
  (state.posView === 'history' ? viewSalesHistory() : (state.posView === 'verify' ? viewVerify() : viewPosCart()));
}

/* ---------- السلة ---------- */
function cartFind(productId){
  for(var i = 0; i < db.cart.length; i++){
    if(Number(db.cart[i].productId) === Number(productId)) return db.cart[i];
  }
  return null;
}
function cartTotals(){
  var sub = 0, units = 0, count = 0;
  db.cart.forEach(function(l){
    var q = Number(l.qty) || 0;
    var pr = Number(l.price) || 0;
    sub += pr * q;
    units += q;
    count++;
  });
  var disc = Math.max(0, Number(state.posDiscount) || 0);
  if(disc > sub) disc = sub;
  return { sub: sub, units: units, count: count, disc: disc, total: Math.max(0, sub - disc) };
}

function viewPosCart(){
  var t = cartTotals();
  var hero =
    '<div class="scan-hero">' +
      '<div class="sh-title">🛒 نقطة البيع السريعة</div>' +
      '<div class="sh-sub">امسح باركود المنتج بالكاميرا، أو أدخل السعر مباشرة للسلع بدون باركود — يُضاف للسلة ويُحتسب تلقائياً</div>' +
      '<div class="scan-actions">' +
        '<button class="scan-btn" onclick="openScannerForCart()">' + SCAN_ICON_POS + ' مسح باركود</button>' +
        '<button class="scan-btn alt" onclick="openQuickPrice()">' + TAG_ICON_POS + ' سعر مباشر</button>' +
      '</div>' +
      '<div class="manual-row">' +
        '<input id="posManual" type="text" inputmode="numeric" placeholder="أو أدخل رقم الباركود يدوياً..." >' +
        '<button onclick="posManualAdd()">إضافة</button>' +
      '</div>' +
    '</div>';

  var cartHtml;
  if(db.cart.length){
    cartHtml = db.cart.map(cartRowHtml).join('');
  }else{
    cartHtml = '<div class="card"><div class="cart-empty">' +
      '<div class="ce-icon">' + SCAN_ICON_POS + '</div>' +
      '<h4>السلة فارغة</h4><p>امسح منتجاً بالكاميرا، أو أدخل سعراً مباشرة للسلع بدون باركود</p>' +
      '<div class="ce-actions">' +
        '<button class="btn" onclick="openScannerForCart()">فتح القارئ</button>' +
        '<button class="btn ghost" onclick="openQuickPrice()">إضافة سعر مباشر</button>' +
      '</div></div></div>';
  }

  var totals =
    '<div class="card">' +
      '<div class="disc-row">' +
        '<div class="field" style="flex:1"><label>خصم (مبلغ)</label>' +
          '<input id="posDisc" type="number" inputmode="decimal" min="0" step="any" value="' + (state.posDiscount ? state.posDiscount : '') + '" placeholder="0" oninput="setPosDiscount(this.value)"></div>' +
        '<div class="field" style="flex:1;margin-bottom:0"><label>عدد الوحدات</label>' +
          '<div style="font-weight:800;font-size:16px;padding:10px 2px" id="posUnits">' + t.units + '</div></div>' +
      '</div>' +
      '<div class="total-line"><span>المجموع الفرعي</span><b class="ltr" id="posSub">' + money(t.sub) + '</b></div>' +
      (t.disc > 0 ? '<div class="total-line"><span>الخصم</span><b class="ltr" style="color:var(--red)">− ' + money(t.disc) + '</b></div>' : '') +
      '<div class="total-line grand"><span>الإجمالي المطلوب</span><b class="ltr" id="posTotal">' + money(t.total) + '</b></div>' +
    '</div>';

  var checkoutBar =
    '<div class="checkout-bar"><div class="cb-in">' +
      '<div class="cb-total"><span class="cb-label">الإجمالي</span><span class="cb-val ltr" id="cbVal">' + money(t.total) + '</span></div>' +
      '<button class="btn" onclick="openCheckout()">إتمام البيع ✓</button>' +
    '</div></div>';

  return hero +
    '<div class="section-title"><span>سلة البيع</span><span class="hint" id="cartCount">' + t.count + ' صنف</span></div>' +
    '<div id="cartList">' + cartHtml + '</div>' +
    '<div id="posTotals">' + totals + '</div>' +
    checkoutBar;
}

function cartRowHtml(line){
  var p = findProduct(line.productId);
  var isOpen = line.open === true;
  var stockLeft = p ? (Number(p.qty) || 0) : 0;
  return '<div class="cart-row" id="crow-' + line.productId + '">' +
    '<div class="cart-row top">' +
      '<div>' +
        '<div class="cart-name">' + esc(line.name) + '</div>' +
        (isOpen
          ? '<div class="cart-meta"><span>سعر مباشر • بدون خصم من المخزون</span></div>'
          : '<div class="cart-meta"><span class="ltr">' + money(line.price) + '</span> / وحدة • متوفر بالمخزون: ' + stockLeft + '</div>') +
      '</div>' +
      '<div class="cart-line ltr">' + money(line.price * line.qty) + '</div>' +
    '</div>' +
    '<div class="cart-ctrl">' +
      '<div class="stepper">' +
        '<button class="minus" onclick="posStep(' + line.productId + ',-1)">−</button>' +
        '<span class="st-qty">' + line.qty + '</span>' +
        '<button onclick="posStep(' + line.productId + ',1)">+</button>' +
      '</div>' +
      '<button class="cart-x" onclick="posRemove(' + line.productId + ')">✕</button>' +
    '</div>' +
  '</div>';
}

function renderCartOnly(flashProductId){
  var box = $('#cartList');
  if(!box) return;
  var t = cartTotals();
  /* إزالة أسطر منتجات محذوفة من المخزون (مع الإبقاء على أسطر السعر المباشر) */
  var before = db.cart.length;
  db.cart = db.cart.filter(function(l){ return l.open === true || !!findProduct(l.productId); });
  if(db.cart.length !== before) saveDB();

  box.innerHTML = db.cart.length ? db.cart.map(cartRowHtml).join('') :
    '<div class="card"><div class="cart-empty">' +
      '<div class="ce-icon">' + SCAN_ICON_POS + '</div>' +
      '<h4>السلة فارغة</h4><p>امسح أول منتج بالكاميرا لبدء عملية البيع</p>' +
      '<div class="ce-actions">' +
        '<button class="btn" onclick="openScannerForCart()">فتح القارئ</button>' +
        '<button class="btn ghost" onclick="openQuickPrice()">إضافة سعر مباشر</button>' +
      '</div></div></div>';

  var cc = $('#cartCount');
  if(cc) cc.textContent = t.count + ' صنف • ' + t.units + ' وحدة';
  var pu = $('#posUnits');
  if(pu) pu.textContent = t.units;
  var ps = $('#posSub');
  if(ps) ps.textContent = money(t.sub);
  var pt = $('#posTotal');
  if(pt) pt.textContent = money(t.total);
  var cv = $('#cbVal');
  if(cv) cv.textContent = money(t.total);

  if(flashProductId){
    var el = $('#crow-' + flashProductId);
    if(el){
      var nm = el.querySelector('.cart-name');
      if(nm){ nm.classList.remove('flash'); void nm.offsetWidth; nm.classList.add('flash'); }
    }
  }
}

function setPosDiscount(v){
  state.posDiscount = Math.max(0, Number(v) || 0);
  var t = cartTotals();
  var pt = $('#posTotal');
  if(pt) pt.textContent = money(t.total);
  var cv = $('#cbVal');
  if(cv) cv.textContent = money(t.total);
}

function addToCart(id, opts){
  opts = opts || {};
  var p = findProduct(id);
  if(!p) return;
  var stock = Number(p.qty) || 0;
  var line = cartFind(id);
  var cur = line ? line.qty : 0;
  if(cur + 1 > stock){
    beepErr(); buzz([70, 50, 70]);
    toast('المتوفر في المخزون: ' + stock + ' فقط من "' + p.name + '"', 'err');
    updateScanFeedback('✗ المتوفر من ' + p.name + ': ' + stock + ' فقط', true);
    return;
  }
  if(line){ line.qty++; }
  else{ db.cart.push({ productId: p.id, name: p.name, price: Number(p.price) || 0, qty: 1 }); }
  saveDB();
  beepOk(); buzz(60);
  renderCartOnly(id);
  if(!opts.quiet) updateScanFeedback('✓ أُضيف: ' + p.name + (line ? ' (الكمية: ' + (cur + 1) + ')' : ''));
}

function posStep(id, delta){
  var line = cartFind(id);
  var p = findProduct(id);
  if(!line) return;
  var nq = line.qty + delta;
  if(delta > 0 && p && nq > (Number(p.qty) || 0)){
    beepErr();
    toast('المتوفر في المخزون: ' + p.qty + ' فقط', 'err');
    return;
  }
  if(nq <= 0){ posRemove(id); return; }
  line.qty = nq;
  saveDB();
  buzz(25);
  renderCartOnly();
}

function posRemove(id){
  var line = cartFind(id);
  if(!line) return;
  db.cart = db.cart.filter(function(l){ return Number(l.productId) !== Number(id); });
  saveDB();
  toast('أُزيل "' + line.name + '" من السلة');
  renderCartOnly();
}

/* ---------- المسح إلى السلة ---------- */
function posScanCode(code){
  code = String(code).trim();
  if(!code) return;
  /* كود فاتورة؟ ← عرض نتيجة التحقق (ضد الاحتيال) */
  var sale = findSaleByVerCode(code);
  if(sale){
    beepOk(); buzz([60, 60, 60]);
    closeScanner();
    openVerifyModal(sale);
    return;
  }
  var p = findByBarcode(code);
  if(!p){
    beepErr(); buzz([70, 50, 70]);
    updateScanFeedback('✗ باركود غير معروف: ' + code, true);
    closeScanner();
    posUnknownDialog(code);
    return;
  }
  addToCart(p.id);
}

function posUnknownDialog(code){
  openDialog(
    '<div class="d-icon" style="background:var(--amber-bg);color:var(--amber)">' +
      '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg></div>' +
    '<h3>باركود غير معروف</h3>' +
    '<p>الكود <b class="ltr">' + esc(code) + '</b> غير مسجل في مخزونك.<br>هل تريد إضافة منتج جديد بهذا الباركود؟</p>' +
    '<div class="dialog-actions">' +
      '<button class="btn ghost" onclick="closeModal()">لاحقاً</button>' +
      '<button class="btn" onclick="closeModal();openProductModal(null,\'' + esc(code) + '\')">إضافة منتج جديد</button>' +
    '</div>'
  );
}

function posManualAdd(){
  var el = $('#posManual');
  if(!el) return;
  var v = el.value.trim();
  if(!v){ toast('أدخل رقم الباركود أولاً', 'err'); return; }
  el.value = '';
  posScanCode(v);
}

/* ---------- سعر مباشر (إضافة سعر فوري بدون باركود ولا منتج مسجل) ---------- */
var QP_QTY = 1;

function openQuickPrice(){
  QP_QTY = 1;
  openModal(
    sheetHead('إضافة سعر مباشر — بدون باركود') +
    '<div class="field"><label>اسم الصنف <span style="font-weight:400;color:var(--muted)">(اختياري)</span></label>' +
      '<input id="qpName" type="text" placeholder="مثال: خضار مشكلة / سلع سائبة"></div>' +
    '<div class="field"><label>السعر *</label>' +
      '<input id="qpPrice" type="number" inputmode="decimal" min="0" step="any" placeholder="0" style="font-size:22px;font-weight:800;text-align:center;color:var(--primary-dark)" oninput="qpUpdateTotal()"></div>' +
    '<div class="field"><label>الكمية</label>' +
      '<div class="stepper qp-stepper">' +
        '<button class="minus" type="button" onclick="qpStep(-1)">−</button>' +
        '<span class="st-qty" id="qpQty">1</span>' +
        '<button type="button" onclick="qpStep(1)">+</button>' +
      '</div></div>' +
    '<div class="card" style="box-shadow:none;border:1px dashed var(--line);margin-bottom:12px">' +
      '<div class="total-line grand"><span>المجموع</span><b class="ltr" id="qpTotal">' + money(0) + '</b></div>' +
    '</div>' +
    '<button class="btn block" onclick="quickPriceAdd()">إضافة للسلة ✓</button>' +
    '<button class="btn block ghost" style="margin-top:8px" onclick="closeModal();openProductPicker()">أو اختر منتجاً من قائمة المخزون</button>'
  );
  setTimeout(function(){ var el = $('#qpPrice'); if(el) el.focus(); }, 250);
}

function qpStep(d){
  QP_QTY = Math.max(1, QP_QTY + d);
  var el = $('#qpQty');
  if(el) el.textContent = QP_QTY;
  qpUpdateTotal();
}

function qpUpdateTotal(){
  var el = $('#qpTotal');
  if(!el) return;
  var price = Number($('#qpPrice') ? $('#qpPrice').value : 0) || 0;
  el.textContent = money(price * QP_QTY);
}

function quickPriceAdd(){
  var nameEl = $('#qpName'), priceEl = $('#qpPrice');
  if(!priceEl) return;
  var name = nameEl ? nameEl.value.trim() : '';
  var price = Number(priceEl.value);
  if(isNaN(price) || price <= 0){
    beepErr(); toast('أدخل سعراً صحيحاً أولاً', 'err');
    priceEl.focus();
    return;
  }
  if(!state.openSeq) state.openSeq = 0;
  state.openSeq++;
  var pid = -state.openSeq; /* معرّف سالب فريد — لا يتعارض مع منتجات المخزون */
  db.cart.push({ productId: pid, name: name || 'صنف بدون باركود', price: price, qty: QP_QTY, open: true });
  saveDB();
  beepOk(); buzz(60);
  renderCartOnly();
  toast('أُضيف للسلة ✓ — يمكنك إضافة صنف آخر');
  if(nameEl) nameEl.value = '';
  priceEl.value = '';
  QP_QTY = 1;
  var qe = $('#qpQty'); if(qe) qe.textContent = '1';
  qpUpdateTotal();
  priceEl.focus();
}

/* ---------- بيع منتجات بدون باركود (اختيار من القائمة) ---------- */
var PICK_Q = '';

function openProductPicker(){
  PICK_Q = '';
  openModal(
    sheetHead('بيع منتج بدون باركود') +
    '<div class="pick-search">' +
      '<input id="pickQ" type="text" placeholder="🔍 ابحث بالاسم أو التصنيف..." oninput="PICK_Q=this.value;renderPickerList()" onfocus="this.select()">' +
    '</div>' +
    '<div class="pick-count" id="pickCount"></div>' +
    '<div class="pick-list" id="pickList"></div>' +
    '<button class="btn block ghost" style="margin-top:12px" onclick="closeModal();showTab(\'pos\')">الرجوع إلى السلة 🛒</button>'
  );
  renderPickerList();
}

function pickerMatches(p){
  if(!PICK_Q) return true;
  var q = PICK_Q.toLowerCase();
  return (p.name || '').toLowerCase().indexOf(q) !== -1 ||
         (p.category || '').toLowerCase().indexOf(q) !== -1 ||
         (p.barcode ? String(p.barcode).indexOf(q) !== -1 : false);
}

function renderPickerList(){
  var box = $('#pickList');
  if(!box) return;
  var list = db.products.filter(pickerMatches);
  var cc = $('#pickCount');
  if(cc) cc.textContent = list.length + ' منتج — اضغط على المنتج لإضافته للسلة';
  if(!list.length){
    box.innerHTML = '<div class="empty" style="padding:24px 10px">' +
      '<h4>لا نتائج</h4><p>لم يتم العثور على منتجات مطابقة</p>' +
      '<button class="btn" onclick="closeModal();openProductModal()">إضافة منتج جديد</button></div>';
    return;
  }
  box.innerHTML = list.map(function(p){
    var stock = Number(p.qty) || 0;
    var badge = stock <= 0
      ? '<span class="pick-badge out">نفدت</span>'
      : '<span class="pick-badge ok">متوفر: ' + stock + '</span>';
    return '<div class="pick-row' + (stock <= 0 ? ' dim' : '') + '" onclick="pickAdd(' + p.id + ')">' +
      '<div class="pr-main">' +
        '<div class="pr-name">' + esc(p.name) + '</div>' +
        '<div class="pr-meta">' + esc(p.category || 'بدون تصنيف') + '</div>' +
      '</div>' +
      '<div class="pr-side">' +
        '<div class="pr-price ltr">' + money(p.price) + '</div>' +
        badge +
      '</div>' +
    '</div>';
  }).join('');
}

function pickAdd(id){
  addToCart(id, { quiet:true });
  renderPickerList();
}

function openScannerForCart(){
  state.posView = 'cart';
  openScanner(function(code){ posScanCode(code); }, {
    title: 'مسح منتج للسلة',
    hint: 'امسح المنتجات واحداً تلو الآخر — تُضاف تلقائياً للسلة'
  });
}

/* ---------- التحقق من الفواتير (ضد الاحتيال) ---------- */
var SHIELD_SVG = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3.5v5.2c0 4.6-3.2 8-8 9.3-4.8-1.3-8-4.7-8-9.3V6.5z"/><path d="M9 12l2.2 2.2L15.5 10"/></svg>';

function viewVerify(){
  return '<div class="scan-hero verify-hero">' +
    '<div class="sh-title">🛡️ التحقق من الفواتير</div>' +
    '<div class="sh-sub">امسح رمز QR أو الكود المطبوع أسفل الفاتورة الحرارية — يعرض التطبيق الفاتورة المخزنة للتأكد من صحتها ومنع الاحتيال</div>' +
    '<button class="scan-btn" onclick="openScannerForVerify()">' + SHIELD_SVG + ' مسح كود الفاتورة بالكاميرا</button>' +
    '<div class="manual-row">' +
      '<input id="verManual" type="text" placeholder="أو أدخل كود الفاتورة يدوياً… مثال: TJ-0001-58K">' +
      '<button onclick="verifyManual()">تحقق</button>' +
    '</div>' +
    '<div class="ver-stats">عدد الفواتير المحفوظة: <b>' + db.sales.length + '</b></div>' +
  '</div>' +
  '<div class="card">' +
    '<div class="card-title">🔐 كيف يمنع التحقق الاحتيال؟</div>' +
    '<div class="about-line"><span>كل فاتورة</span><b>لها كود تحقق فريد لا يتكرر</b></div>' +
    '<div class="about-line"><span>عند المسح</span><b>تُعرض الفاتورة المخزنة فعلياً</b></div>' +
    '<div class="about-line"><span>فاتورة مزيفة</span><b>لن تطابق أي كود محفوظ</b></div>' +
    '<div class="about-line"><span>فاتورة مرتجعة</span><b>يظهر عليها تحذير أحمر واضح</b></div>' +
  '</div>';
}
function verifyManual(){
  var el = $('#verManual');
  if(!el) return;
  var v = el.value.trim();
  if(!v){ toast('أدخل كود الفاتورة أولاً', 'err'); return; }
  el.value = '';
  verifyCode(v);
}
function openScannerForVerify(){
  state.posView = 'verify';
  openScanner(function(code){ verifyCode(code); }, {
    title: 'التحقق من فاتورة',
    hint: 'امسح رمز QR أو الكود المطبوع أسفل الفاتورة'
  });
}
function verifyCode(code){
  var sale = findSaleByVerCode(code);
  closeScanner();
  if(sale){
    beepOk(); buzz([60, 60, 60]);
    openVerifyModal(sale);
  }else{
    beepErr(); buzz([70, 50, 70]);
    openUnknownCodeDialog(code);
  }
}
function openVerifyModal(sale){
  var valid = !sale.voided;
  openModal(
    sheetHead('نتيجة التحقق من الفاتورة') +
    '<div class="verdict ' + (valid ? 'ok' : 'bad') + ' verdict-pop">' +
      '<div class="v-icon">' +
        (valid
          ? '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>'
          : '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/></svg>') +
      '</div>' +
      '<div class="v-title">' + (valid ? 'فاتورة أصلية ✓' : 'تحذير: فاتورة مرتجعة') + '</div>' +
      '<div class="v-sub">' + (valid ? 'هذه الفاتورة مسجلة فعلياً في هذا المتجر' : 'تم إرجاع هذه الفاتورة — الكميات أُعيدت للمخزون وليست عملية بيع سارية') + '</div>' +
    '</div>' +
    '<div class="receipt">' + receiptHtml(sale) + '</div>' +
    '<div class="btn-row" style="margin-top:12px">' +
      '<button class="btn" onclick="printSale(' + sale.id + ')">🖨️ طباعة</button>' +
      '<button class="btn ghost" onclick="closeModal()">إغلاق</button>' +
    '</div>'
  );
}
function openUnknownCodeDialog(code){
  openDialog(
    '<div class="d-icon" style="background:var(--red-bg);color:var(--red)">' +
      '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg></div>' +
    '<h3>رمز غير معروف ⚠</h3>' +
    '<p>الكود <b class="ltr">' + esc(code) + '</b> لا يطابق أي فاتورة محفوظة في هذا المتجر.<br>قد يكون رمزاً مزيفاً أو من متجر آخر — لا تعتبره فاتورة صحيحة.</p>' +
    '<div class="dialog-actions">' +
      '<button class="btn ghost" onclick="closeModal()">حسناً</button>' +
    '</div>'
  );
}

/* ---------- الدفع والإيصال ---------- */
function openCheckout(){
  var t = cartTotals();
  if(!db.cart.length){ toast('السلة فارغة — امسح منتجاً أولاً', 'err'); return; }
  var rows = db.cart.map(function(l){
    return '<div class="receipt-item"><span class="ri-name">' + esc(l.name) + '</span>' +
      '<span class="ri-qty ltr">× ' + l.qty + '</span>' +
      '<span class="ri-total ltr">' + money(l.price * l.qty) + '</span></div>';
  }).join('');
  openModal(
    sheetHead('إتمام البيع') +
    '<div class="receipt" style="margin-bottom:12px">' +
      rows +
      '<div class="total-line" style="margin-top:6px"><span>المجموع الفرعي</span><b class="ltr">' + money(t.sub) + '</b></div>' +
      (t.disc > 0 ? '<div class="total-line"><span>الخصم</span><b class="ltr" style="color:var(--red)">− ' + money(t.disc) + '</b></div>' : '') +
      '<div class="total-line grand"><span>المطلوب</span><b class="ltr">' + money(t.total) + '</b></div>' +
    '</div>' +
    '<div class="field"><label>المبلغ المدفوع <span style="font-weight:400;color:var(--muted)">(اتركه فارغاً إذا دفع المطلوب بالضبط)</span></label>' +
      '<input id="cPaid" type="number" inputmode="decimal" min="0" step="any" placeholder="' + t.total + '" oninput="updateChange()"></div>' +
    '<div class="btn-row" style="margin-bottom:10px">' +
      '<button class="btn sm outline" onclick="quickPaid(0)">بالضبط</button>' +
      '<button class="btn sm outline" onclick="quickPaid(100)">+100</button>' +
      '<button class="btn sm outline" onclick="quickPaid(500)">+500</button>' +
      '<button class="btn sm outline" onclick="quickPaid(1000)">+1000</button>' +
    '</div>' +
    '<div class="card" style="box-shadow:none;border:1px dashed var(--line)">' +
      '<div class="total-line"><span>الباقي للعميل</span><b class="ltr" id="cChange">' + money(0) + '</b></div>' +
      '<div class="small-note" id="cWarn" style="color:var(--red);font-weight:700;display:none">⚠ المبلغ المدفوع أقل من المطلوب</div>' +
    '</div>' +
    '<button class="btn block" onclick="confirmSale()">تأكيد البيع وخصم المخزون</button>'
  );
}

function quickPaid(step){
  var t = cartTotals();
  var paid = step > 0 ? Math.ceil(t.total / step) * step : t.total;
  var el = $('#cPaid');
  if(el) el.value = paid;
  updateChange();
}

function updateChange(){
  var el = $('#cPaid');
  var out = $('#cChange');
  var warn = $('#cWarn');
  if(!el || !out) return;
  var t = cartTotals();
  var v = el.value.trim();
  if(v === ''){ out.textContent = money(0); if(warn) warn.style.display = 'none'; return; }
  var paid = Number(v) || 0;
  if(paid < t.total){
    out.textContent = money(0);
    if(warn) warn.style.display = 'block';
  }else{
    out.textContent = money(paid - t.total);
    if(warn) warn.style.display = 'none';
  }
}

function confirmSale(){
  var t = cartTotals();
  if(!db.cart.length){ toast('السلة فارغة', 'err'); return; }

  /* التحقق النهائي من المخزون (أسطر السعر المباشر معفاة) */
  for(var i = 0; i < db.cart.length; i++){
    var line = db.cart[i];
    if(line.open === true) continue;
    var p = findProduct(line.productId);
    if(!p){ toast('منتج في السلة لم يعد موجوداً: ' + line.name, 'err'); return; }
    if(Number(line.qty) > (Number(p.qty) || 0)){
      toast('الكمية المطلوبة من "' + p.name + '" أكبر من المتوفر (' + p.qty + ')', 'err');
      return;
    }
  }

  var paidV = $('#cPaid') ? $('#cPaid').value.trim() : '';
  var paid = paidV === '' ? t.total : (Number(paidV) || 0);
  if(paid < t.total){ toast('المبلغ المدفوع أقل من المطلوب', 'err'); return; }

  /* خصم المخزون + حركات (أسطر السعر المباشر لا تخصم مخزوناً) */
  db.cart.forEach(function(line){
    if(line.open === true) return;
    var p = findProduct(line.productId);
    p.qty = (Number(p.qty) || 0) - Number(line.qty);
    addMovement(p.id, 'out', line.qty, 'بيع ' + 'S-' + ('0000' + (db.seq.sale + 1)).slice(-4));
  });

  var sid = nextId('sale');
  var sale = {
    id: sid,
    code: 'S-' + ('0000' + sid).slice(-4),
    items: db.cart.map(function(l){ return { productId: l.productId, name: l.name, price: Number(l.price) || 0, qty: Number(l.qty), open: l.open === true }; }),
    subtotal: t.sub,
    discount: t.disc,
    total: t.total,
    paid: paid,
    change: paid - t.total,
    createdAt: new Date().toISOString(),
    voided: false
  };
  sale.verCode = makeVerCode(sale);
  db.sales.unshift(sale);
  if(db.sales.length > 2000) db.sales.length = 2000;
  db.cart = [];
  state.posDiscount = 0;
  saveDB();
  closeModal();
  beepOk(); buzz([60, 60, 60]);
  render();
  showReceiptModal(sale, true);
}

function receiptHtml(sale){
  var rows = sale.items.map(function(it){
    return '<div class="receipt-item"><span class="ri-name">' + esc(it.name) + '</span>' +
      '<span class="ri-qty ltr">× ' + it.qty + '</span>' +
      '<span class="ri-total ltr">' + money(it.price * it.qty) + '</span></div>';
  }).join('');
  return '<div class="receipt-head">' +
      '<div class="r-store">' + esc(db.settings.storeName) + '</div>' +
      '<div class="r-code ltr">' + esc(sale.code) + ' • ' + fmtDate(sale.createdAt) + '</div>' +
      (sale.verCode ? '<div class="vcode-chip ltr" onclick="copyText(\'' + sale.verCode + '\')"><span class="vc-stripes"></span>' + esc(sale.verCode) + '<span class="vc-hint">كود التحقق</span></div>' : '') +
    '</div>' +
    rows +
    '<div class="total-line" style="margin-top:6px"><span>المجموع الفرعي</span><b class="ltr">' + money(sale.subtotal) + '</b></div>' +
    (sale.discount > 0 ? '<div class="total-line"><span>الخصم</span><b class="ltr" style="color:var(--red)">− ' + money(sale.discount) + '</b></div>' : '') +
    '<div class="total-line grand"><span>الإجمالي</span><b class="ltr">' + money(sale.total) + '</b></div>' +
    (sale.paid != null && sale.paid > 0
      ? '<div class="total-line"><span>المدفوع</span><b class="ltr">' + money(sale.paid) + '</b></div>' +
        '<div class="total-line"><span>الباقي</span><b class="ltr">' + money(sale.change) + '</b></div>'
      : '') +
    (sale.voided ? '<div class="total-line" style="color:var(--red);font-weight:800"><span>⚠ بيع مرتجع — الكميات أُعيدت للمخزون</span></div>' : '') +
    '<div class="receipt-foot">شكراً لتعاملكم معنا 🌹</div>';
}

function showReceiptModal(sale, isNew){
  openModal(
    (isNew ? '<div class="sale-success-icon"><svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div>' : '') +
    sheetHead(isNew ? 'تم البيع بنجاح ✓' : 'البيع ' + sale.code) +
    '<div class="receipt">' + receiptHtml(sale) + '</div>' +
    '<div class="btn-row" style="margin-top:12px">' +
      '<button class="btn" onclick="printSale(' + sale.id + ')">🖨️ طباعة</button>' +
      '<button class="btn outline" onclick="shareReceipt(' + sale.id + ')">📤 مشاركة</button>' +
      '<button class="btn ghost" onclick="closeModal()">بيع جديد</button>' +
    '</div>'
  );
}

function saleText(sale){
  var lines = sale.items.map(function(it){
    return '• ' + it.name + ' × ' + it.qty + ' = ' + money(it.price * it.qty);
  }).join('\n');
  return '*' + db.settings.storeName + '* — إيصال ' + sale.code + '\n' +
    lines + '\n' +
    (sale.discount > 0 ? 'الخصم: ' + money(sale.discount) + '\n' : '') +
    '*الإجمالي: ' + money(sale.total) + '*\n' +
    'شكراً لتعاملكم معنا 🌹';
}

function shareReceipt(id){
  var sale = null;
  db.sales.forEach(function(s){ if(s.id === id) sale = s; });
  if(!sale) return;
  var link = 'https://wa.me/?text=' + encodeURIComponent(saleText(sale));
  window.location.href = link;
}

/* ---------- سجل المبيعات ---------- */
function salesStats(){
  var today = todayStr();
  var weekAgo = Date.now() - 7 * 86400000;
  var ok = db.sales.filter(function(s){ return !s.voided; });
  var todayS = ok.filter(function(s){ return String(s.createdAt || '').slice(0, 10) === today; });
  return {
    todayCount: todayS.length,
    todayTotal: todayS.reduce(function(a, s){ return a + (Number(s.total) || 0); }, 0),
    weekTotal: ok.filter(function(s){ return new Date(s.createdAt).getTime() >= weekAgo; })
      .reduce(function(a, s){ return a + (Number(s.total) || 0); }, 0),
    allTotal: ok.reduce(function(a, s){ return a + (Number(s.total) || 0); }, 0)
  };
}

function dayLabel(k){
  var today = todayStr();
  var yest = new Date(Date.now() - 86400000);
  var ys = yest.getFullYear() + '-' + ('0' + (yest.getMonth() + 1)).slice(-2) + '-' + ('0' + yest.getDate()).slice(-2);
  if(k === today) return 'اليوم';
  if(k === ys) return 'أمس';
  try{
    var d = new Date(k + 'T00:00:00');
    return d.toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long' });
  }catch(e){ return k; }
}

function viewSalesHistory(){
  var st = salesStats();
  var statsRow = '<div class="pos-stats">' +
    '<div class="ps"><div class="ps-val">' + money(st.todayTotal) + '</div><div class="ps-label">اليوم (' + st.todayCount + ' عملية)</div></div>' +
    '<div class="ps"><div class="ps-val">' + money(st.weekTotal) + '</div><div class="ps-label">آخر 7 أيام</div></div>' +
    '<div class="ps"><div class="ps-val">' + money(st.allTotal) + '</div><div class="ps-label">الإجمالي الكلي</div></div>' +
  '</div>';

  if(!db.sales.length){
    return statsRow + '<div class="card"><div class="empty">' +
      '<div class="e-icon"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div>' +
      '<h4>لا توجد مبيعات بعد</h4><p>كل عملية بيع من نقطة البيع ستظهر هنا مع إمكانية الإرجاع</p>' +
      '<button class="btn" onclick="showPosView(\'cart\')">ابدأ البيع</button></div></div>';
  }

  var groups = [];
  var map = {};
  db.sales.forEach(function(s){
    var k = String(s.createdAt || '').slice(0, 10);
    if(!map[k]){ map[k] = { date: k, sales: [], total: 0 }; groups.push(map[k]); }
    map[k].sales.push(s);
    if(!s.voided) map[k].total += Number(s.total) || 0;
  });

  var html = statsRow;
  groups.forEach(function(g){
    html += '<div class="day-head"><span>' + esc(dayLabel(g.date)) + '</span>' +
      '<span class="dh-sum ltr">' + money(g.total) + '</span></div>';
    html += g.sales.map(saleCardHtml).join('');
  });
  return html;
}

function saleCardHtml(s){
  return '<div class="row-card sale-card' + (s.voided ? ' voided' : '') + '" onclick="showSaleDetails(' + s.id + ')">' +
    (s.voided ? '<span class="badge red void-badge">مرتجع</span>' : '') +
    '<div class="row-top">' +
      '<div>' +
        '<div class="row-title ltr">' + esc(s.code) + '</div>' +
        '<div class="row-sub"><span>' + fmtDate(s.createdAt) + '</span><span>' + s.items.length + ' صنف</span></div>' +
      '</div>' +
      '<span class="badge ' + (s.voided ? 'gray' : 'green') + ' ltr">' + money(s.total) + '</span>' +
    '</div>' +
    '<div class="mini-list"><div class="mini-row"><span>' +
      esc(s.items.map(function(it){ return it.name + ' × ' + it.qty; }).join(' + ')) +
    '</span></div></div>' +
  '</div>';
}

function findSale(id){
  id = Number(id);
  for(var i = 0; i < db.sales.length; i++){
    if(db.sales[i].id === id) return db.sales[i];
  }
  return null;
}

function showSaleDetails(id){
  var s = findSale(id);
  if(!s) return;
  openModal(
    sheetHead('البيع ' + s.code) +
    '<div class="receipt">' + receiptHtml(s) + '</div>' +
    '<div class="btn-row" style="margin-top:12px">' +
      '<button class="btn" onclick="printSale(' + s.id + ')">🖨️ طباعة</button>' +
      '<button class="btn outline" onclick="shareReceipt(' + s.id + ')">📤 مشاركة</button>' +
      (s.voided
        ? '<button class="btn ghost" onclick="closeModal()">إغلاق</button>'
        : '<button class="btn danger" onclick="voidSale(' + s.id + ')">↩ إرجاع البيع</button>') +
    '</div>'
  );
}

function voidSale(id){
  var s = findSale(id);
  if(!s || s.voided) return;
  confirmDlg('إرجاع البيع ' + s.code,
    'سيتم إرجاع جميع كميات هذا البيع إلى المخزون وحفظ العملية كمرتجعة. هل أنت متأكد؟',
    function(){
      var lack = [];
      s.items.forEach(function(it){
        if(it.open === true) return; /* سعر مباشر — لا مخزون يُستعاد */
        var p = findProduct(it.productId);
        if(p){
          p.qty = (Number(p.qty) || 0) + Number(it.qty);
          addMovement(p.id, 'in', it.qty, 'إرجاع بيع ' + s.code);
        }else{
          lack.push(it.name);
        }
      });
      s.voided = true;
      saveDB();
      closeModal();
      render();
      toast(lack.length
        ? 'تم الإرجاع (منتجات محذوفة لم تُستعاد: ' + lack.join('، ') + ')'
        : 'تم إرجاع البيع وإعادة الكميات للمخزون ✓');
    }, { danger: true, yesLabel: 'تأكيد الإرجاع' });
}

/* ---------- مركز التنبيهات ---------- */
function alertRowHtml(p, info, badgeCls, badgeText, action){
  return '<div class="alert-row">' +
    '<div style="flex:1;min-width:0">' +
      '<div class="ar-name">' + esc(p.name) + '</div>' +
      '<div class="ar-info">' + info + '</div>' +
    '</div>' +
    '<span class="badge ' + badgeCls + '">' + badgeText + '</span>' +
    (action || '') +
  '</div>';
}

function openAlerts(type){
  var A = computeAlerts();
  var html = sheetHead('مركز التنبيهات');

  if(type === 'stock'){
    html += '<div class="small-note" style="margin-bottom:10px;color:var(--muted)">منتجات نفدت أو اقتربت من النفاذ — أعد إدخال الكميات قبل نفاذها.</div>';
    if(!A.stockTotal){
      html += '<div class="sim-result">✅ لا توجد تنبيهات مخزون — كل المنتجات متوفرة بكميات جيدة</div>';
    }else{
      if(A.out.length){
        html += '<div class="section-title" style="margin-top:8px"><span style="color:var(--red)">نفدت الكمية</span><span class="hint">' + A.out.length + '</span></div>';
        html += A.out.map(function(p){
          return alertRowHtml(p, 'الكمية: 0 • حد التنبيه: ' + minQtyOf(p), 'red', 'نفد',
            '<button class="btn sm outline" onclick="openStockModal(' + p.id + ',\'in\')">＋ إدخال</button>');
        }).join('');
      }
      if(A.low.length){
        html += '<div class="section-title" style="margin-top:12px"><span style="color:var(--amber)">مخزون منخفض</span><span class="hint">' + A.low.length + '</span></div>';
        html += A.low.map(function(p){
          return alertRowHtml(p, 'الكمية: ' + p.qty + ' • حد التنبيه: ' + minQtyOf(p), 'amber', 'بقي ' + p.qty,
            '<button class="btn sm outline" onclick="openStockModal(' + p.id + ',\'in\')">＋ إدخال</button>');
        }).join('');
      }
    }
  }else{
    html += '<div class="small-note" style="margin-bottom:10px;color:var(--muted)">حد تحذير الصلاحية الحالي: ' + esc(db.settings.expiryWarnDays) + ' يوم — يمكن تغييره من الإعدادات.</div>';
    if(!A.expiryTotal){
      html += '<div class="sim-result">✅ لا توجد تنبيهات صلاحية — كل المنتجات سارية</div>';
    }else{
      if(A.expired.length){
        html += '<div class="section-title" style="margin-top:8px"><span style="color:var(--red)">منتهية الصلاحية</span><span class="hint">' + A.expired.length + '</span></div>';
        html += A.expired.map(function(p){
          var es = expiryState(p);
          return alertRowHtml(p, 'الصلاحية: ' + esc(p.expiry) + ' • الكمية: ' + p.qty, 'red', 'منتهي',
            '<button class="btn sm ghost" onclick="editProduct(' + p.id + ')">تعديل</button>');
        }).join('');
      }
      if(A.expiring.length){
        html += '<div class="section-title" style="margin-top:12px"><span style="color:var(--amber)">تنتهي قريباً</span><span class="hint">' + A.expiring.length + '</span></div>';
        html += A.expiring.map(function(p){
          var es = expiryState(p);
          return alertRowHtml(p, 'الصلاحية: ' + esc(p.expiry) + ' • الكمية: ' + p.qty, 'amber', esc(es.label),
            '<button class="btn sm ghost" onclick="editProduct(' + p.id + ')">تعديل</button>');
        }).join('');
      }
    }
  }
  openModal(html);
}

/* ============================================================
   1.6) قارئ الباركود بالكاميرا
   ============================================================ */
var scanner = {
  open: false,
  engine: null,
  onScan: null,
  lastCode: '',
  lastAt: 0,
  torchOn: false
};

function scannerWrapHtml(opts){
  return '<div class="scan-wrap">' +
    '<div class="scan-top">' +
      '<div><div class="st-title">' + esc(opts.title || 'مسح الباركود') + '</div>' +
        '<div class="st-sub">' + esc(opts.hint || 'وجّه الكاميرا نحو باركود المنتج') + '</div></div>' +
      '<button class="scan-close" onclick="closeScanner()">✕</button>' +
    '</div>' +
    '<div class="scan-region" id="scanRegion">' +
      '<div class="scan-stage" style="position:relative;width:100%;max-width:520px;border-radius:18px;overflow:hidden">' +
        '<div id="scannerViewport"></div>' +
        '<div class="scan-laser"></div>' +
      '</div>' +
      '<div id="scanErrBox"></div>' +
    '</div>' +
    '<div class="scan-last" id="scanLast"></div>' +
    '<div class="scan-actions">' +
      '<input id="scanManual" type="text" inputmode="numeric" placeholder="أدخل الباركود يدوياً..." style="flex:1;border:1.5px solid rgba(255,255,255,.35);background:rgba(255,255,255,.1);border-radius:12px;padding:11px 13px;color:#fff;font-size:14px;min-height:46px;outline:none">' +
      '<button class="btn primary" style="flex:none;min-height:46px" onclick="manualScanSubmit()">إضافة</button>' +
      '<button class="btn" style="flex:none;min-height:46px" id="torchBtn" onclick="toggleTorch()">🔦</button>' +
    '</div>' +
  '</div>';
}

function openScanner(onScan, opts){
  opts = opts || {};
  if(scanner.open){ scanner.onScan = onScan || scanner.onScan; return; }
  scanner.open = true;
  scanner.onScan = onScan || null;
  scanner.lastCode = '';
  scanner.lastAt = 0;
  scanner.torchOn = false;
  var root = $('#scannerRoot');
  if(!root) return;
  root.innerHTML = scannerWrapHtml(opts);
  try{
    if(typeof TajirScannerBridge !== 'undefined' && TajirScannerBridge.onScannerOpen){
      TajirScannerBridge.onScannerOpen();
    }
  }catch(e){}
  startScannerEngine();
}

function startScannerEngine(){
  if(typeof Html5Qrcode === 'undefined'){
    showScannerError('مكتبة القارئ غير متوفرة', 'يمكنك استخدام الإدخال اليدوي بالأسفل.');
    return;
  }
  var cfg = { verbose: false, experimentalFeatures: { useBarCodeDetectorIfSupported: true } };
  try{
    scanner.engine = new Html5Qrcode('scannerViewport', cfg);
  }catch(e){
    showScannerError('تعذر تهيئة القارئ', 'أعد فتح القارئ أو استخدم الإدخال اليدوي.');
    return;
  }
  var camCfg = {
    fps: 10,
    qrbox: function(w, h){
      var bw = Math.floor(Math.min(w * 0.88, w - 24));
      var bh = Math.floor(Math.min(h * 0.42, 260));
      if(bh < 120) bh = Math.max(100, Math.floor(h * 0.5));
      return { width: bw, height: bh };
    }
  };
  scanner.engine.start(
    { facingMode: 'environment' },
    camCfg,
    function(decodedText){ onScanDecoded(decodedText); },
    function(){ /* لا كود في هذا الإطار — تجاهل */ }
  ).then(function(){
    /* القارئ يعمل */
  }).catch(function(){
    scanner.engine = null;
    showScannerError('تعذر تشغيل الكاميرا',
      'تأكد من منح صلاحية الكاميرا للتطبيق (إعدادات الهاتف ← التطبيقات ← تاجر برو ← الأذونات)، أو استخدم الإدخال اليدوي بالأسفل.');
  });
}

function showScannerError(title, msg){
  var box = $('#scanErrBox');
  if(!box) return;
  scanner.errorState = true;
  box.innerHTML = '<div class="scan-err-box">' +
    '<h4>' + esc(title) + '</h4><p>' + esc(msg) + '</p>' +
    '<button class="btn primary" onclick="retryScanner()">إعادة المحاولة</button>' +
  '</div>';
}

function retryScanner(){
  var box = $('#scanErrBox');
  if(box) box.innerHTML = '';
  scanner.errorState = false;
  startScannerEngine();
}

function onScanDecoded(code){
  code = String(code || '').trim();
  if(!code) return;
  var now = Date.now();
  if(code === scanner.lastCode && now - scanner.lastAt < 1400) return;
  scanner.lastCode = code;
  scanner.lastAt = now;
  updateScanFeedback('✓ ' + code, false);
  beepOk();
  buzz(60);
  if(typeof scanner.onScan === 'function'){
    try{ scanner.onScan(code); }catch(e){}
  }
}

function updateScanFeedback(text, isErr){
  var el = $('#scanLast');
  if(!el) return;
  el.textContent = text;
  el.classList.toggle('err', !!isErr);
}

function manualScanSubmit(){
  var el = $('#scanManual');
  if(!el) return;
  var v = el.value.trim();
  if(!v){ toast('أدخل رقم الباركود أولاً', 'err'); return; }
  el.value = '';
  onScanDecoded(v);
}

function toggleTorch(){
  if(!scanner.engine){ toast('الفلاش غير متاح الآن', 'err'); return; }
  try{
    var caps = scanner.engine.getRunningTrackCapabilities ? scanner.engine.getRunningTrackCapabilities() : null;
    if(caps && 'torch' in caps){
      scanner.torchOn = !scanner.torchOn;
      scanner.engine.applyVideoConstraints({ advanced: [{ torch: scanner.torchOn }] });
      var b = $('#torchBtn');
      if(b) b.style.background = scanner.torchOn ? 'rgba(52,211,153,.55)' : '';
    }else{
      toast('الفلاش غير مدعوم على هذا الجهاز', 'err');
    }
  }catch(e){ toast('الفلاش غير مدعوم على هذا الجهاز', 'err'); }
}

function closeScanner(){
  if(!scanner.open) return;
  scanner.open = false;
  var eng = scanner.engine;
  scanner.engine = null;
  scanner.onScan = null;
  function teardown(){
    var root = $('#scannerRoot');
    if(root) root.innerHTML = '';
  }
  if(eng){
    try{
      eng.stop().then(function(){
        try{ eng.clear(); }catch(e){}
        teardown();
      }).catch(function(){ teardown(); });
    }catch(e){ teardown(); }
  }else{
    teardown();
  }
  try{
    if(typeof TajirScannerBridge !== 'undefined' && TajirScannerBridge.onScannerClosed){
      TajirScannerBridge.onScannerClosed();
    }
  }catch(e){}
}
window.__closeScanner = closeScanner;

/* جسر اختبار: محاكاة مسح باركود (يُستخدم أيضاً عند تعطل الكاميرا) */
window.__mockScan = function(code){ onScanDecoded(code); };

/* ============================================================
   2) المخزون
   ============================================================ */
function filteredProducts(){
  var q = norm(state.invSearch);
  var qRaw = String(state.invSearch || '').trim();
  return db.products.filter(function(p){
    if(state.invOnlyLow && (Number(p.qty) || 0) > minQtyOf(p)) return false;
    if(state.invCat !== 'all' && p.category !== state.invCat) return false;
    if(q && norm(p.name).indexOf(q) === -1 && norm(p.category || '').indexOf(q) === -1 &&
       String(p.barcode || '').indexOf(qRaw) === -1) return false;
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
    var es = expiryState(p);
    return '<div class="row-card">' +
      '<div class="row-top">' +
        '<div>' +
          '<div class="row-title">' + esc(p.name) + '</div>' +
          '<div class="row-sub">' +
            (p.category ? '<span>' + esc(p.category) + '</span>' : '') +
            '<span>بيع: <b class="ltr">' + money(p.price) + '</b></span>' +
            (p.cost != null && p.cost !== '' ? '<span>تكلفة: <b class="ltr">' + money(p.cost) + '</b></span>' : '') +
          '</div>' +
          '<div class="row-sub" style="margin-top:5px">' +
            (p.barcode ? '<span class="bc-chip ltr">▦ ' + esc(p.barcode) + '</span>' : '<span class="bc-chip nobc">بدون باركود</span>') +
            (es ? '<span class="expiry-badge ' + es.cls + '">' + esc(es.label) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<span class="qty-badge ' + qtyClass(p) + '">' + esc(p.qty) + ' وحدة</span>' +
      '</div>' +
      '<div class="row-actions">' +
        '<button class="btn sm" onclick="addToCart(' + p.id + ');showTab(\'pos\')">🛒 أضف للسلة</button>' +
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
  (typeof isLocked === 'function' && isLocked()
    ? '<div class="inv-limit-banner">' +
        '<div class="ilb-text"><b>' + db.products.length + '</b> / ' + FREE_PRODUCT_LIMIT + ' منتج (النسخة المجانية)</div>' +
        '<div class="ilb-progress"><div class="ilb-progress-bar" style="width:' + Math.min(100, (db.products.length / FREE_PRODUCT_LIMIT) * 100) + '%"></div></div>' +
        '<button class="btn sm primary" onclick="openSubscriptionModal()">🔑 ترقية لمنتجات غير محدودة</button>' +
      '</div>'
    : '') +
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
  if(state.tab === 'inventory'){
    var v = $('#view');
    if(v){ v.innerHTML = viewInventory(); }
  }else{
    render();
  }
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

function openProductModal(id, presetBarcode){
  var p = id ? findProduct(id) : null;
  var isEdit = !!p;
  /* فحص حد المنتجات للنسخة المجانية (عند الإضافة فقط) */
  if(!isEdit && !requireProductSlot()){
    return; /* تم عرض شاشة القفل بالفعل */
  }
  p = p || { name:'', category:'', price:'', cost:'', qty:'', minQty:'', barcode: presetBarcode || '', expiry: '' };
  openModal(
    sheetHead(isEdit ? 'تعديل منتج' : 'منتج جديد') +
    '<div class="form-error" id="prodErr"></div>' +
    '<div class="field"><label>اسم المنتج *</label>' +
      '<input id="fName" type="text" value="' + esc(p.name) + '" placeholder="مثال: سكر أبيض 1كغ"></div>' +
    '<div class="field"><label>الباركود <span style="font-weight:400;color:var(--muted)">(اختياري — اتركه فارغاً للمنتجات بدون باركود)</span></label>' +
      '<div class="scan-field">' +
        '<input id="fBc" type="text" inputmode="numeric" value="' + esc(p.barcode || '') + '" placeholder="مثال: 6130001000015" style="direction:ltr;text-align:right">' +
        '<button class="cam-btn" type="button" onclick="scanToField(\'fBc\')" title="مسح بالكاميرا">' +
          '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 012-2h2"/><path d="M17 3h2a2 2 0 012 2v2"/><path d="M21 17v2a2 2 0 01-2 2h-2"/><path d="M7 21H5a2 2 0 01-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>' +
        '</button>' +
      '</div></div>' +
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
    '<div class="field"><label>تاريخ انتهاء الصلاحية <span style="font-weight:400;color:var(--muted)">(اختياري — للتنبيهات)</span></label>' +
      '<input id="fExp" type="date" value="' + esc(p.expiry || '') + '"></div>' +
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
  var bcV = $('#fBc') ? $('#fBc').value.trim() : '';
  var expV = $('#fExp') ? $('#fExp').value.trim() : '';
  var err = $('#prodErr');

  function fail(m){ err.textContent = m; err.style.display = 'block'; }

  if(!name) return fail('أدخل اسم المنتج');
  if(isNaN(price) || price < 0) return fail('أدخل سعر بيع صحيح');
  if(qtyV !== '' && (isNaN(Number(qtyV)) || Number(qtyV) < 0)) return fail('أدخل كمية صحيحة');
  var dup = barcodeOwnerOtherThan(bcV, id || null);
  if(dup) return fail('هذا الباركود مسجل مسبقاً للمنتج: ' + dup.name);
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
    p.barcode = bcV;
    p.expiry = expV;
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
      barcode: bcV,
      expiry: expV,
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

/* مسح باركود من الكاميرا إلى حقل داخل النموذج */
function scanToField(fieldId){
  openScanner(function(code){
    var el = document.getElementById(fieldId);
    if(el){
      el.value = code;
      el.style.borderColor = 'var(--primary)';
    }
    closeScanner();
    toast('تم قراءة الباركود: ' + code);
  }, { title: 'مسح باركود المنتج', hint: 'وجّه الكاميرا نحو باركود المنتج' });
}

function editProduct(id){ openProductModal(id); }

function delProduct(id){
  var p = findProduct(id);
  if(!p) return;
  confirmDlg('حذف المنتج', 'سيتم حذف "' + p.name + '" نهائياً. المبيعات السابقة لن تتأثر.', function(){
    db.products = db.products.filter(function(x){ return x.id !== p.id; });
    db.movements = db.movements.filter(function(m){ return m.productId !== p.id; });
    db.cart = db.cart.filter(function(l){ return Number(l.productId) !== Number(p.id); });
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
   3) الإعدادات + النسخ الاحتياطي
   ============================================================ */
function viewSettings(){
  var sub = subStatus();
  var subLabel = { none:'🚫 غير مفعّل', ok:'✅ ساري', warn:'🔔 ينتهي قريباً', soon:'⚠️ ينتهي قريباً جداً', expired:'⏰ منتهي' }[sub.state] || sub.label;
  var subCls = 'sub-state-' + (sub.state === 'none' ? 'none' : sub.state);

  return '' +
  '<div class="card sub-card ' + subCls + '">' +
    '<div class="sub-card-head">' +
      '<div class="sub-card-icon">🔑</div>' +
      '<div style="flex:1">' +
        '<div class="card-title" style="margin:0">الاشتراك</div>' +
        '<div class="sub-status-text">' + esc(subLabel) + '</div>' +
        (sub.expiryDate ? '<div class="sub-expiry-text">ينتهي: ' + esc(sub.expiryDate) + (sub.daysLeft > 0 ? ' • متبقي ' + sub.daysLeft + ' يوم' : '') + '</div>' : '') +
      '</div>' +
    '</div>' +
    '<div class="btn-row" style="margin-top:10px">' +
      '<button class="btn sm" onclick="openSubscriptionModal()">' + (sub.state === 'none' ? '🔑 تفعيل الاشتراك' : '🔄 تجديد') + '</button>' +
      '<button class="btn sm outline" onclick="openNotifications()">🔔 التنبيهات</button>' +
    '</div>' +
  '</div>' +

  '<div class="card">' +
    '<div class="card-title">🎨 المظهر</div>' +
    '<div class="field" style="display:flex;align-items:center;gap:10px;margin-bottom:0">' +
      '<label class="switch" style="margin:0"><input type="checkbox" id="setDark"' + (currentTheme() === 'dark' ? ' checked' : '') + ' onchange="toggleTheme()"><span class="slider"></span></label>' +
      '<span style="font-size:13px;font-weight:700">الوضع الليلي 🌙 <span style="font-weight:400;color:var(--muted)">(مريح للعين ويوفّر البطارية)</span></span></div>' +
  '</div>' +

  '<div class="card">' +
    '<div class="card-title">🏪 معلومات المتجر</div>' +
    '<div class="field"><label>اسم المتجر <span style="font-weight:400;color:var(--muted)">(يظهر أعلى وصل الفاتورة المطبوعة)</span></label><input id="setStore" type="text" value="' + esc(db.settings.storeName) + '" oninput="updStorePreview()"></div>' +
    '<div class="field"><label>هاتف المتجر <span style="font-weight:400;color:var(--muted)">(يظهر تحت الاسم على الوصل)</span></label>' +
      '<input id="setPhone" type="tel" inputmode="tel" value="' + esc(db.settings.storePhone || '') + '" placeholder="مثال: 0555 12 34 56" style="direction:ltr;text-align:right" oninput="updStorePreview()"></div>' +
    '<div class="form-grid">' +
      '<div class="field"><label>العملة</label><input id="setCurr" type="text" value="' + esc(db.settings.currency) + '" placeholder="د.ج / ر.س / درهم"></div>' +
      '<div class="field"><label>حد التنبيه الافتراضي</label><input id="setLow" type="number" inputmode="numeric" min="0" value="' + esc(db.settings.lowStockDefault) + '"></div>' +
      '<div class="field"><label>تحذير قبل انتهاء الصلاحية (يوم)</label><input id="setExp" type="number" inputmode="numeric" min="1" value="' + esc(db.settings.expiryWarnDays || 30) + '"></div>' +
    '</div>' +
    '<div class="rcpt-preview">' +
      '<div class="rp-cap">معاينة رأس الوصل المطبوع</div>' +
      '<div class="rp-name" id="rpName">' + esc(db.settings.storeName) + '</div>' +
      '<div class="rp-phone" id="rpPhone"' + (db.settings.storePhone ? '' : ' style="display:none"') + '>' + esc(db.settings.storePhone || '') + '</div>' +
      '<div class="rp-dash"></div>' +
      '<div class="rp-line"><span>سكر أبيض 1كغ × 2</span><span class="ltr">240</span></div>' +
      '<div class="rp-line"><span>زيت طهي 1ل × 1</span><span class="ltr">280</span></div>' +
      '<div class="rp-dash"></div>' +
      '<div class="rp-total"><span>الإجمالي</span><span class="ltr">520 ' + esc(db.settings.currency || 'د.ج') + '</span></div>' +
      '<div class="rp-qr">رمز QR</div>' +
    '</div>' +
    '<button class="btn block" onclick="saveStoreInfo()">حفظ معلومات المتجر</button>' +
  '</div>' +

  '<div class="card">' +
    '<div class="card-title">📷 قارئ الباركود</div>' +
    '<div class="field" style="display:flex;align-items:center;gap:10px">' +
      '<label class="switch" style="margin:0"><input type="checkbox" id="setScanSound"' + (db.settings.scanSound !== false ? ' checked' : '') + ' onchange="saveScannerSettings()"><span class="slider"></span></label>' +
      '<span style="font-size:13px;font-weight:700">صوت التنبيه عند المسح الناجح</span></div>' +
    '<div class="field" style="display:flex;align-items:center;gap:10px;margin-bottom:0">' +
      '<label class="switch" style="margin:0"><input type="checkbox" id="setScanVibrate"' + (db.settings.scanVibrate !== false ? ' checked' : '') + ' onchange="saveScannerSettings()"><span class="slider"></span></label>' +
      '<span style="font-size:13px;font-weight:700">اهتزاز الجهاز عند المسح</span></div>' +
  '</div>' +

  '<div class="card' + (isLockedFeature('print') ? ' locked-card' : '') + '">' +
    '<div class="card-title">🖨️ الطابعة الحرارية (بلوتوث)' + (isLockedFeature('print') ? ' <span class="lock-chip">🔒 مقفلة</span>' : '') + '</div>' +
    (isLockedFeature('print')
      ? '<div class="locked-overlay" onclick="requireFeature(\'print\')">' +
          '<div class="lo-icon">🔒</div>' +
          '<div class="lo-text">الطباعة ميزة مدفوعة — فعّل اشتراكك لفتحها</div>' +
          '<button class="btn sm primary">🔑 تفعيل</button>' +
        '</div>'
      : '') +
    '<div class="printer-status"><span class="p-led ' + (pbConnected() ? 'on' : '') + '"></span>' +
      '<span>' + (pbConnected() ? 'متصل: ' + esc(db.settings.printerName || 'الطابعة') : 'غير متصل — اختر طابعتك لبدء طباعة الفواتير') + '</span></div>' +
    '<div class="field" style="margin-bottom:8px"><label>مقاس ورق الطابعة</label><div class="chips">' +
      '<button class="chip ' + ((Number(db.settings.printerWidthMm) || 58) === 58 ? 'active' : '') + '" onclick="savePrinterWidth(58)">58 مم</button>' +
      '<button class="chip ' + ((Number(db.settings.printerWidthMm) || 58) === 80 ? 'active' : '') + '" onclick="savePrinterWidth(80)">80 مم</button>' +
    '</div></div>' +
    '<div class="btn-row">' +
      '<button class="btn sm" onclick="openPrinterPicker()">📱 اختيار الطابعة</button>' +
      '<button class="btn sm outline" onclick="printTestPage()">🖨️ طباعة تجريبية</button>' +
      (pbConnected() ? '<button class="btn sm danger" onclick="pbDisconnect()">فصل</button>' : '') +
    '</div>' +
    '<div class="small-note" style="font-size:11.5px;color:var(--muted);margin-top:10px">💡 اربط الطابعة الحرارية ببلوتوث الهاتف من إعدادات النظام أولاً. بعد كل بيع يظهر زر «طباعة» في الفاتورة مباشرة، وتُطبع باسم المتجر مع رمز QR خاص بالفاتورة للتحقق ومنع الاحتيال.</div>' +
  '</div>' +

  '<div class="card' + ((isLockedFeature('backup') || isLockedFeature('csv') || isLockedFeature('wipe')) ? ' locked-card' : '') + '">' +
    '<div class="card-title">💾 البيانات والنسخ الاحتياطي' + ((isLockedFeature('backup') || isLockedFeature('csv')) ? ' <span class="lock-chip">🔒 مقفلة</span>' : '') + '</div>' +
    (isLockedFeature('backup')
      ? '<div class="locked-overlay" onclick="requireFeature(\'backup\')">' +
          '<div class="lo-icon">🔒</div>' +
          '<div class="lo-text">النسخ الاحتياطي ميزة مدفوعة</div>' +
          '<button class="btn sm primary">🔑 تفعيل</button>' +
        '</div>'
      : '') +
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
    '<p class="about-desc">تاجر برو — تطبيق لإدارة المتاجر يعمل بدون إنترنت: نقطة بيع بمسح الباركود بالكاميرا، طباعة فواتير حرارية عبر البلوتوث مع رمز تحقق لكل فاتورة لمنع الاحتيال، إدارة مخزون وتنبيهات نفاد وصلاحية، نظام اشتراك صالح لجهاز واحد، ونسخ احتياطي محلي.</p>' +
    '<div class="about-line"><span>التطبيق</span><b>تاجر برو — TajirPro</b></div>' +
    '<div class="about-line"><span>الإصدار</span><b class="ltr">' + getAppVersion() + '</b></div>' +
    '<div class="about-line"><span>العمل</span><b>بدون إنترنت 100%</b></div>' +
    '<div class="about-line"><span>الواجهة</span><b>وضع ليلي + لوحة تحكم برسوم بيانية</b></div>' +
    '<div class="about-line"><span>القارئ</span><b>باركود بالكاميرا (EAN / UPC / QR...)</b></div>' +
    '<div class="about-line"><span>الطباعة</span><b>فاتورة حرارية عبر البلوتوث (ESC/POS)</b></div>' +
    '<div class="about-line"><span>التحقق</span><b>رمز QR وكود فريد لكل فاتورة</b></div>' +
    '<div class="about-line"><span>التنبيهات</span><b>نفاذ المخزون، انتهاء الصلاحية، والاشتراك</b></div>' +
    '<div class="about-line"><span>الاشتراك</span><b>كود صالح لجهاز واحد مع التجديد</b></div>' +
    '<div class="btn-row" style="margin-top:12px">' +
      '<button class="btn sm outline" onclick="checkForUpdates()">🔄 فحص التحديثات</button>' +
      '<button class="btn sm ghost" onclick="openAdminGen()">🔑 مولّد الأكواد</button>' +
    '</div>' +
  '</div>';
}

function saveStoreInfo(){
  var name = $('#setStore').value.trim();
  var curr = $('#setCurr').value.trim();
  var low = Number($('#setLow').value);
  var exp = Number($('#setExp').value);
  if(!name){ toast('أدخل اسم المتجر', 'err'); return; }
  db.settings.storeName = name;
  db.settings.storePhone = $('#setPhone') ? $('#setPhone').value.trim() : '';
  db.settings.currency = curr || 'د.ج';
  db.settings.lowStockDefault = isNaN(low) ? 5 : Math.max(0, low);
  db.settings.expiryWarnDays = (isNaN(exp) || exp < 1) ? 30 : Math.round(exp);
  saveDB();
  $('#storeNameTop').textContent = name;
  render();
  toast('تم الحفظ — سيظهر "' + name + '" أعلى وصل الفاتورة ✓');
}

/* معاينة حية لرأس الوصل أثناء كتابة الاسم/الهاتف */
function updStorePreview(){
  var n = $('#setStore'), p = $('#setPhone');
  var rn = $('#rpName'), rp = $('#rpPhone');
  if(rn && n) rn.textContent = n.value.trim() || 'اسم المتجر';
  if(rp && p){
    var v = p.value.trim();
    rp.textContent = v;
    rp.style.display = v ? 'block' : 'none';
  }
}

function saveScannerSettings(){
  var s1 = $('#setScanSound');
  var s2 = $('#setScanVibrate');
  if(s1) db.settings.scanSound = s1.checked;
  if(s2) db.settings.scanVibrate = s2.checked;
  saveDB();
  toast('تم حفظ إعدادات القارئ ✓');
}

/* ---------- الطباعة الحرارية عبر البلوتوث (ESC/POS) ---------- */
var _pbPending = null;

function pbAvailable(){
  return typeof TajirPrintBridge !== 'undefined';
}
function pbConnected(){
  try{ return pbAvailable() && TajirPrintBridge.isConnected && TajirPrintBridge.isConnected(); }
  catch(e){ return false; }
}

/* أحداث الجسر الأصلي: اتصال / فصل / طباعة / أخطاء / صلاحيات */
window.__printEvent = function(type, data){
  try{
    if(type === 'connected'){
      db.settings.printerName = (data && data.name) || '';
      db.settings.printerAddr = (data && data.address) || '';
      saveDB();
      toast('تم الاتصال بالطابعة ✓');
      if(_pbPending){ var p = _pbPending; _pbPending = null; pbSend(p); }
      else if(state.tab === 'settings') render();
    }else if(type === 'disconnected'){
      db.settings.printerName = '';
      db.settings.printerAddr = '';
      saveDB();
      toast('تم فصل الطابعة');
      if(state.tab === 'settings') render();
    }else if(type === 'printed'){
      toast('تمت الطباعة ✓');
      buzz([40, 40, 40]);
    }else if(type === 'error'){
      toast((data && data.msg) || 'تعذر إكمال العملية', 'err');
    }else if(type === 'permission'){
      if(data && data.granted){
        if(_pbPending){ var pp = _pbPending; _pbPending = null; pbPrintPayload(pp); }
      }else{
        _pbPending = null;
        toast('لم تُمنح صلاحية البلوتوث', 'err');
      }
    }
  }catch(e){}
};

function salePrintPayload(sale){
  var d = new Date(sale.createdAt);
  var dateText = padNum(d.getDate(), 2) + '-' + padNum(d.getMonth() + 1, 2) + '-' + d.getFullYear() +
    ' ' + padNum(d.getHours(), 2) + ':' + padNum(d.getMinutes(), 2);
  return {
    storeName: db.settings.storeName || 'تاجر برو',
    storePhone: db.settings.storePhone || '',
    currency: db.settings.currency || '',
    widthMm: Number(db.settings.printerWidthMm) || 58,
    code: sale.verCode || sale.code || '',
    dateText: dateText,
    voided: !!sale.voided,
    items: sale.items.map(function(it){
      return { name: it.name, qty: Number(it.qty) || 0, price: Number(it.price) || 0, total: (Number(it.qty) || 0) * (Number(it.price) || 0) };
    }),
    subtotal: Number(sale.subtotal) || 0,
    discount: Number(sale.discount) || 0,
    total: Number(sale.total) || 0,
    paid: Number(sale.paid) || 0,
    change: Number(sale.change) || 0
  };
}

function printSale(id){
  if(!requireFeature('print')) return;
  var s = findSale(id);
  if(!s) return;
  pbPrintPayload(salePrintPayload(s));
}

function printTestPage(){
  if(!requireFeature('print')) return;
  var d = new Date();
  pbPrintPayload({
    storeName: db.settings.storeName || 'تاجر برو',
    storePhone: db.settings.storePhone || '',
    currency: db.settings.currency || '',
    widthMm: Number(db.settings.printerWidthMm) || 58,
    code: 'TJ-TEST-00X',
    dateText: padNum(d.getDate(), 2) + '-' + padNum(d.getMonth() + 1, 2) + '-' + d.getFullYear(),
    voided: false,
    items: [
      { name: 'طباعة تجريبية — سطر أول', qty: 2, price: 125, total: 250 },
      { name: 'منتج تجريبي للتأكد من جودة الطباعة العربية والرمز', qty: 1, price: 999.5, total: 999.5 }
    ],
    subtotal: 1249.5,
    discount: 50,
    total: 1199.5,
    paid: 1200,
    change: 0.5
  });
}

function pbPrintPayload(payload){
  if(!pbAvailable()){
    toast('الطباعة تعمل داخل تطبيق أندرويد فقط', 'err');
    return;
  }
  try{
    if(!TajirPrintBridge.hasPermission()){
      _pbPending = payload;
      TajirPrintBridge.requestPermission();
      toast('امنح صلاحية البلوتوث لإكمال الطباعة');
      return;
    }
    if(!pbConnected()){
      _pbPending = payload;
      openPrinterPicker();
      return;
    }
    pbSend(payload);
  }catch(e){ toast('تعذر بدء الطباعة', 'err'); }
}

function pbSend(payload){
  try{
    TajirPrintBridge.print(JSON.stringify(payload));
    toast('جارٍ إرسال الفاتورة للطابعة…');
  }catch(e){ toast('فشل الإرسال إلى الطابعة', 'err'); }
}

function openPrinterPicker(){
  if(!pbAvailable()){ toast('الطباعة متاحة داخل تطبيق أندرويد فقط', 'err'); return; }
  var res;
  try{ res = JSON.parse(TajirPrintBridge.getPairedDevices()); }catch(e){ res = null; }
  if(!res || res.ok === false){
    if(res && res.err === 'nobluetooth'){ toast('البلوتوث غير مدعوم على هذا الجهاز', 'err'); return; }
    try{ TajirPrintBridge.requestPermission(); }catch(e){}
    toast('امنح صلاحية البلوتوث ثم اختر الطابعة من جديد');
    return;
  }
  var list = res.list || [];
  var rows;
  if(list.length){
    rows = list.map(function(d){
      return '<button class="printer-row" onclick="pbConnect(\'' + esc(d.address) + '\')">' +
        '<span class="pr-name">' + esc(d.name) + '</span>' +
        '<span class="pr-addr ltr">' + esc(d.address) + '</span>' +
      '</button>';
    }).join('');
  }else{
    rows = '<div class="sim-result">ℹ️ لا توجد أجهزة بلوتوث مقترنة.<br>اربط الطابعة الحرارية من إعدادات بلوتوث الهاتف أولاً، ثم أعد المحاولة.</div>';
  }
  var connectedHtml = pbConnected()
    ? '<div class="printer-row connected"><span class="pr-name">✓ متصل الآن: ' + esc(db.settings.printerName || 'الطابعة') + '</span><button class="btn sm danger" onclick="pbDisconnect()">فصل</button></div>'
    : '';
  openModal(
    sheetHead('اختيار الطابعة الحرارية') +
    connectedHtml +
    rows +
    '<div class="small-note" style="margin-top:10px;color:var(--muted)">💡 يدعم التطبيق الطابعات الحرارية بلوتوث (ESC/POS) بمقاس 58mm و 80mm — تُطبع الفاتورة بالعربية مع رمز QR للتحقق.</div>'
  );
}

function pbConnect(addr){
  try{
    toast('جارٍ الاتصال بالطابعة…');
    TajirPrintBridge.connect(addr);
  }catch(e){ toast('تعذر بدء الاتصال', 'err'); }
}
function pbDisconnect(){
  try{ TajirPrintBridge.disconnect(); }catch(e){}
}
function savePrinterWidth(mm){
  db.settings.printerWidthMm = mm;
  saveDB();
  render();
  toast('مقاس الطباعة: ' + mm + 'mm ✓');
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
  if(!requireFeature('backup')) return;
  openTextModal('تصدير نسخة كاملة (JSON)', JSON.stringify(db, null, 2),
    'انسخ هذا المحتوى واحفظه في مكان آمن (ملاحظات الهاتف أو ملف نصي). يمكن استعادته لاحقاً عبر «استيراد نسخة».', false);
}
function openImportJSON(){
  if(!requireFeature('backup')) return;
  openTextModal('استيراد نسخة احتياطية', '', 'الصق محتوى النسخة الاحتياطية (JSON) ثم اضغط استيراد. سيتم استبدال البيانات الحالية بالكامل.', true);
}
function doImport(){
  var raw = $('#importArea').value.trim();
  if(!raw){ toast('الصق محتوى النسخة أولاً', 'err'); return; }
  try{
    var data = JSON.parse(raw);
    if(!data || !Array.isArray(data.products)){
      throw new Error('bad');
    }
    confirmDlg('تأكيد الاستيراد', 'سيتم استبدال جميع البيانات الحالية بمحتوى النسخة المستوردة.', function(){
      var d = defaults();
      db.settings = Object.assign(d.settings, data.settings || {});
      db.products = data.products || [];
      db.movements = Array.isArray(data.movements) ? data.movements : [];
      db.sales = Array.isArray(data.sales) ? data.sales : [];
      db.cart = [];
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
  if(!requireFeature('csv')) return;
  var head = ['الاسم', 'الباركود', 'التصنيف', 'سعر البيع', 'التكلفة', 'الكمية', 'حد التنبيه', 'الصلاحية', 'قيمة المخزون'];
  function q(v){ v = String(v == null ? '' : v); return '"' + v.replace(/"/g, '""') + '"'; }
  var lines = [head.map(q).join(',')];
  db.products.forEach(function(p){
    lines.push([
      q(p.name), q(p.barcode || ''), q(p.category || ''), q(p.price), q(p.cost == null ? '' : p.cost),
      q(p.qty), q(p.minQty == null ? '' : p.minQty), q(p.expiry || ''), q((Number(p.qty) || 0) * (Number(p.price) || 0))
    ].join(','));
  });
  var csv = '\uFEFF' + lines.join('\r\n');
  openTextModal('تصدير المخزون (CSV)', csv, 'انسخ المحتوى واحفظه بملف بامتداد .csv لفتحه في Excel — يدعم العربية.', false);
}
function clearAllData(){
  if(!requireFeature('wipe')) return;
  confirmDlg('مسح جميع البيانات', 'سيتم حذف المنتجات والمبيعات نهائياً من هذا الجهاز. لا يمكن التراجع!', function(){
    localStorage.removeItem(DB_KEY);
    loadDB();
    db.seeded = true;   /* بدون بيانات تجريبية هذه المرة */
    saveDB();
    $('#storeNameTop').textContent = db.settings.storeName;
    render();
    toast('تم مسح جميع البيانات');
  }, { danger: true, yesLabel: 'مسح الكل' });
}

/* ---------- ترحيل السلة المحفوظة: مزامنة الأسعار والمخزون ---------- */
function sanitizeCart(){
  if(!db.cart.length) return;
  var changed = false;
  var cleaned = [];
  db.cart.forEach(function(line){
    var p = findProduct(line.productId);
    if(!p){ changed = true; return; }
    var stock = Number(p.qty) || 0;
    if(line.price !== (Number(p.price) || 0)){ line.price = Number(p.price) || 0; changed = true; }
    if(line.qty > stock){ line.qty = stock; changed = true; }
    if(line.qty > 0) cleaned.push(line);
    else changed = true;
  });
  db.cart = cleaned;
  if(changed) saveDB();
}

/* ============================================================
   نظام الاشتراك — مفتاح صالح لجهاز واحد مع التجديد
   ============================================================
   صيغة الكود:  TJP-{D}-{HASH8}-{EXP}-{CHK2}
     D     : مدة الاشتراك بالأيام (مثال: 30, 365)
     HASH8 : بصمة الجهاز (أول 8 محارف من SHA-256(deviceId)) — من جسر TajirDeviceBridge
     EXP   : يوم انتهاء الاشتراك (يوم منذ 1970-01-01) بترميز base36 بأحرف كبيرة
     CHK2  : حرفان تحقق (مجموع تحقق متعدد الحدود من D+HASH8+EXP)

   الكود يُولّد مرة واحدة لكل جهاز (بواسطة المسؤول الذي يعرف بصمة الجهاز)،
   ولا يعمل على جهاز آخر. يمكن تجديد الاشتراك بإدخال كود جديد بتاريخ انتهاء أحدث.
   ============================================================ */

var SUB_KEY = 'tajirpro_sub_v1';

/* جسر معرف الجهاز — متاح فقط داخل تطبيق أندرويد */
function deviceBridgeAvailable(){
  return typeof TajirDeviceBridge !== 'undefined';
}
function getDeviceFingerprint(){
  try{
    if(deviceBridgeAvailable() && TajirDeviceBridge.getDeviceFingerprint){
      return String(TajirDeviceBridge.getDeviceFingerprint()).toUpperCase();
    }
  }catch(e){}
  /* وضع المتصفح (تطوير): بصمة ثابتة افتراضية (8 محارف سداسية عشر) */
  return 'BADCAFE0';
}
function getDeviceIdFull(){
  try{
    if(deviceBridgeAvailable() && TajirDeviceBridge.getDeviceId){
      return String(TajirDeviceBridge.getDeviceId());
    }
  }catch(e){}
  return 'browser-dev';
}
function getAppVersion(){
  try{
    if(deviceBridgeAvailable() && TajirDeviceBridge.getAppVersion){
      return String(TajirDeviceBridge.getAppVersion());
    }
  }catch(e){}
  return '1.8.0';
}

/* مجموع تحقق متعدد الحدود (نفس الخوارزمية في مولّد الأكواد) */
function polyChecksum(s){
  var h = 7;
  s = String(s || '');
  for(var i = 0; i < s.length; i++){
    h = ((h * 131) + s.charCodeAt(i)) & 0xFFFF;
  }
  var v = h % 256;
  return ('0' + v.toString(16)).slice(-2).toUpperCase();
}

/* تحويل يوم إلى تاريخ مقروء (يوم منذ 1970-01-01) */
function epochDayToDate(day){
  try{
    var t = Number(day) * 86400000;
    var d = new Date(t);
    return d.toLocaleDateString('ar-EG', { year:'numeric', month:'long', day:'numeric' });
  }catch(e){ return String(day); }
}
function todayEpochDay(){
  return Math.floor(Date.now() / 86400000);
}
/* تحويل عدد إلى base36 أحرف كبيرة */
function toBase36(n){
  n = Number(n) || 0;
  if(n < 0) n = 0;
  return n.toString(36).toUpperCase();
}
function fromBase36(s){
  try{ return parseInt(String(s || ''), 36); }
  catch(e){ return NaN; }
}

/* حالة الاشتراك */
function loadSub(){
  try{
    var raw = localStorage.getItem(SUB_KEY);
    if(!raw) return null;
    var s = JSON.parse(raw);
    if(!s || typeof s !== 'object') return null;
    return s;
  }catch(e){ return null; }
}
function saveSub(s){
  try{ localStorage.setItem(SUB_KEY, JSON.stringify(s)); }catch(e){}
}
function clearSub(){ try{ localStorage.removeItem(SUB_KEY); }catch(e){} }

/* التحقق من كود الاشتراك وإرجاع نتيجة مفصّلة */
function validateSubCode(code){
  var result = { ok:false, error:'', duration:0, expiryDay:0, expiryDate:'', daysLeft:0, code:'' };
  var c = String(code || '').trim().toUpperCase().replace(/\s+/g, '');
  if(!c){ result.error = 'أدخل كود الاشتراك'; return result; }
  if(!/^TJP-\d+-[0-9A-F]{8}-[0-9A-Z]+-[0-9A-F]{2}$/.test(c)){
    result.error = 'صيغة الكود غير صحيحة — يجب أن يكون بصيغة TJP-...-...-...-..';
    return result;
  }
  var parts = c.split('-');
  /* parts = ['TJP', D, HASH8, EXP, CHK2] */
  var D = parseInt(parts[1], 10);
  var HASH8 = parts[2];
  var EXP = parts[3];
  var CHK2 = parts[4];
  if(isNaN(D) || D <= 0){ result.error = 'مدة الاشتراك غير صالحة'; return result; }

  /* 1) التحقق من بصمة الجهاز */
  var devFp = getDeviceFingerprint();
  if(HASH8 !== devFp){
    result.error = 'هذا الكود مخصص لجهاز آخر — لا يعمل على هذا الجهاز';
    return result;
  }

  /* 2) التحقق من مجموع التحقيق */
  var expectChk = polyChecksum(String(D) + HASH8 + EXP);
  if(CHK2 !== expectChk){
    result.error = 'كود تالف أو غير صالح — تحقق من إدخاله بشكل صحيح';
    return result;
  }

  /* 3) فك ترميز تاريخ الانتهاء */
  var expDay = fromBase36(EXP);
  if(isNaN(expDay) || expDay < 1){ result.error = 'تاريخ الانتهاء غير صالح'; return result; }
  var today = todayEpochDay();

  result.ok = true;
  result.duration = D;
  result.expiryDay = expDay;
  result.expiryDate = epochDayToDate(expDay);
  result.daysLeft = expDay - today;
  result.code = c;
  return result;
}

/* تفعيل الكود وحفظ الحالة */
function activateSubCode(code){
  var v = validateSubCode(code);
  if(!v.ok){ toast(v.error, 'err'); return false; }
  var prev = loadSub();
  var sub = {
    code: v.code,
    activatedAt: new Date().toISOString(),
    expiryDay: v.expiryDay,
    expiryDate: v.expiryDate,
    durationDays: v.duration,
    daysLeftAtActivation: v.daysLeft
  };
  saveSub(sub);
  /* تنبيه نظام عند التفعيل */
  notifySystem('تم تفعيل الاشتراك', 'تاجر برو — اشتراك ساري حتى ' + v.expiryDate);
  toast('تم تفعيل الاشتراك ✓ — ساري حتى ' + v.expiryDate);
  updateNotifBadge();
  return true;
}

/* حالة الاشتراك الحالية */
function subStatus(){
  var s = loadSub();
  if(!s) return { active:false, state:'none', daysLeft:0, label:'لا اشتراك مفعّل', expiryDate:'' };
  var today = todayEpochDay();
  var left = s.expiryDay - today;
  if(left <= 0){
    return { active:false, state:'expired', daysLeft:left, label:'انتهى الاشتراك', expiryDate:s.expiryDate||'' };
  }
  if(left <= 7){
    return { active:true, state:'soon', daysLeft:left, label:'ينتهي خلال ' + left + ' يوم', expiryDate:s.expiryDate||'' };
  }
  if(left <= 30){
    return { active:true, state:'warn', daysLeft:left, label:'ينتهي خلال ' + left + ' يوم', expiryDate:s.expiryDate||'' };
  }
  return { active:true, state:'ok', daysLeft:left, label:'ساري — متبقي ' + left + ' يوم', expiryDate:s.expiryDate||'' };
}

/* عدد الأيام المنقضية منذ آخر تذكير بهذا النوع */
var _lastNotifKey = 'tajirpro_lastNotif';
function shouldNotify(kind, intervalDays){
  try{
    var raw = localStorage.getItem(_lastNotifKey);
    var m = raw ? JSON.parse(raw) : {};
    var last = m[kind] ? Number(m[kind]) : 0;
    var now = Date.now();
    if(now - last >= intervalDays * 86400000){
      m[kind] = now;
      localStorage.setItem(_lastNotifKey, JSON.stringify(m));
      return true;
    }
  }catch(e){}
  return false;
}

/* إرسال إشعار نظام محلي (إذا كانت الصلاحية متاحة) */
function notifySystem(title, body){
  try{
    if(deviceBridgeAvailable() && TajirDeviceBridge.showNotification){
      TajirDeviceBridge.showNotification(title, body);
    }
  }catch(e){}
}

/* فحص دوري لتنبيهات الاشتراك عند فتح التطبيق */
function checkSubscriptionAlerts(){
  var st = subStatus();
  if(st.state === 'expired'){
    if(shouldNotify('sub_expired', 1)){
      notifySystem('انتهى اشتراك تاجر برو', 'الرجاء تجديد الاشتراك لمواصلة استخدام التطبيق. اضغط للاطلاع على التفاصيل.');
    }
  }else if(st.state === 'soon'){
    if(shouldNotify('sub_soon', 1)){
      notifySystem('اشتراكك ينتهي قريباً', 'متبقي ' + st.daysLeft + ' يوم على انتهاء اشتراك تاجر برو. جدّد الآن لتجنب الانقطاع.');
    }
  }
}

/* ============================================================
   مركز التنبيهات — الجرس + لوحة التنبيهات
   ============================================================ */

function computeNotifList(){
  var list = [];
  var st = subStatus();

  /* 1) تنبيه الاشتراك */
  if(st.state === 'none'){
    list.push({
      kind:'sub', level:'danger', icon:'🔒',
      title:'لا يوجد اشتراك مفعّل',
      body:'فعّل اشتراكك بكود صالح لهذا الجهاز لفتح جميع الميزات.',
      actionLabel:'تفعيل الآن', actionFn:'openSubscriptionModal()'
    });
  }else if(st.state === 'expired'){
    list.push({
      kind:'sub', level:'danger', icon:'⏰',
      title:'انتهى اشتراك تاجر برو',
      body:'انتهى الاشتراك — جدّده بكود جديد لمواصلة استخدام التطبيق.',
      actionLabel:'تجديد', actionFn:'openSubscriptionModal()'
    });
  }else if(st.state === 'soon'){
    list.push({
      kind:'sub', level:'warn', icon:'⚠️',
      title:'اشتراكك ينتهي قريباً',
      body:'متبقي ' + st.daysLeft + ' يوم (ينتهي ' + st.expiryDate + '). جدّد قبل الانتهاء.',
      actionLabel:'تجديد', actionFn:'openSubscriptionModal()'
    });
  }else if(st.state === 'warn'){
    list.push({
      kind:'sub', level:'info', icon:'🔔',
      title:'تذكير: اشتراكك ينتهي خلال شهر',
      body:'متبقي ' + st.daysLeft + ' يوم (ينتهي ' + st.expiryDate + '). جدّد في وقت مناسب.',
      actionLabel:'عرض الاشتراك', actionFn:'openSubscriptionModal()'
    });
  }else{
    list.push({
      kind:'sub', level:'ok', icon:'✓',
      title:'الاشتراك ساري',
      body:'متبقي ' + st.daysLeft + ' يوم — ينتهي ' + st.expiryDate + '.',
      actionLabel:'تفاصيل', actionFn:'openSubscriptionModal()'
    });
  }

  /* 2) تنبيهات المخزون */
  var A = computeAlerts();
  if(A.out.length){
    list.push({
      kind:'stock', level:'danger', icon:'📦',
      title:A.out.length + ' منتج نفد',
      body: A.out.slice(0,3).map(function(p){ return p.name; }).join('، ') + (A.out.length > 3 ? '…' : ''),
      actionLabel:'معالجة', actionFn:'openAlerts(\'stock\')'
    });
  }
  if(A.low.length){
    list.push({
      kind:'stock', level:'warn', icon:'📉',
      title:A.low.length + ' منتج منخفض',
      body: A.low.slice(0,3).map(function(p){ return p.name + ' (' + p.qty + ')'; }).join('، ') + (A.low.length > 3 ? '…' : ''),
      actionLabel:'معالجة', actionFn:'openAlerts(\'stock\')'
    });
  }
  if(A.expired.length){
    list.push({
      kind:'expiry', level:'danger', icon:'⏳',
      title:A.expired.length + ' منتج منتهي الصلاحية',
      body: A.expired.slice(0,3).map(function(p){ return p.name; }).join('، ') + (A.expired.length > 3 ? '…' : ''),
      actionLabel:'معالجة', actionFn:'openAlerts(\'expiry\')'
    });
  }
  if(A.expiring.length){
    list.push({
      kind:'expiry', level:'warn', icon:'📅',
      title:A.expiring.length + ' منتج تنتهي صلاحيته قريباً',
      body: A.expiring.slice(0,3).map(function(p){ return p.name; }).join('، ') + (A.expiring.length > 3 ? '…' : ''),
      actionLabel:'معالجة', actionFn:'openAlerts(\'expiry\')'
    });
  }

  /* 3) تنبيه التحديثات — فحص الإصدار */
  list.push({
    kind:'update', level:'info', icon:'🔄',
    title:'إصدارك الحالي: ' + getAppVersion(),
    body:'للتحقق من وجود تحديثات، افتح صفحة الإصدارات على GitHub.',
    actionLabel:'فحص التحديثات', actionFn:'checkForUpdates()'
  });

  return list;
}

function updateNotifBadge(){
  var list = computeNotifList();
  var count = list.filter(function(n){ return n.level !== 'ok' && n.level !== 'info'; }).length;
  var badge = $('#notifBadge');
  if(!badge) return;
  if(count > 0){
    badge.textContent = count > 9 ? '9+' : count;
    badge.style.display = 'flex';
  }else{
    badge.style.display = 'none';
  }
}

function openNotifications(){
  var list = computeNotifList();
  var html = sheetHead('مركز التنبيهات');
  html += '<div class="notif-list">';
  list.forEach(function(n){
    var cls = 'notif-item lvl-' + n.level;
    html += '<div class="' + cls + '">' +
      '<div class="ni-icon">' + n.icon + '</div>' +
      '<div class="ni-body">' +
        '<div class="ni-title">' + esc(n.title) + '</div>' +
        '<div class="ni-sub">' + esc(n.body) + '</div>' +
        (n.actionFn ? '<button class="btn sm" style="margin-top:8px" onclick="closeModal();' + n.actionFn + '">' + esc(n.actionLabel) + '</button>' : '') +
      '</div>' +
    '</div>';
  });
  html += '</div>';
  html += '<div class="notif-foot">' +
    '<button class="btn sm outline block" onclick="openSubscriptionModal()">إدارة الاشتراك</button>' +
  '</div>';
  openModal(html);
}

/* ============================================================
   مولّد الأكواد (وضع المسؤول) — مدمج للتطوير والإدارة
   ============================================================ */

/* وضع المسؤول: يُفتح بالنقر 5 مرات على نص «حول التطبيق» أو عبر openAdminGen() */
function openAdminGen(){
  var fp = getDeviceFingerprint();
  var html = sheetHead('مولّد أكواد الاشتراك (إدارة)');
  html += '<div class="small-note" style="margin-bottom:12px;color:var(--muted)">' +
    'هذه الأداة للمسؤول فقط. أدخل بصمة الجهاز (8 محارف) ومدة الاشتراك بالأيام، ثم اضغط «توليد» للحصول على كود صالح لهذا الجهاز فقط.' +
    '</div>';
  html += '<div class="field"><label>بصمة الجهاز (HASH8)</label>' +
    '<input id="agenFp" type="text" value="' + esc(fp) + '" maxlength="8" placeholder="مثال: A1B2C3D4" style="font-family:monospace;direction:ltr;text-align:center;text-transform:uppercase">' +
    '<div class="small-note" style="margin-top:6px">بصمة هذا الجهاز الحالي: <b class="ltr">' + esc(fp) + '</b> — اضغط لنسخها: <button class="btn xs ghost" onclick="copyText(\'' + fp + '\')">نسخ</button></div>' +
    '</div>';
  html += '<div class="field"><label>مدة الاشتراك (أيام)</label>' +
    '<div class="chips">' +
      '<button class="chip" onclick="$(\'#agenDur\').value=30">30 يوم</button>' +
      '<button class="chip" onclick="$(\'#agenDur\').value=90">90 يوم</button>' +
      '<button class="chip" onclick="$(\'#agenDur\').value=180">180 يوم</button>' +
      '<button class="chip" onclick="$(\'#agenDur\').value=365">سنة كاملة</button>' +
    '</div>' +
    '<input id="agenDur" type="number" inputmode="numeric" min="1" value="30" style="margin-top:8px">' +
    '</div>';
  html += '<div class="field"><label>تاريخ بداية الاشتراك (اختياري)</label>' +
    '<input id="agenStart" type="date" style="direction:ltr">' +
    '<div class="small-note" style="margin-top:6px">اتركه فارغاً ليعتبر التاريخ الحالي هو البداية.</div>' +
    '</div>';
  html += '<button class="btn block" onclick="adminGenCode()">🔑 توليد الكود</button>';
  html += '<div id="agenResult" style="margin-top:14px"></div>';
  openModal(html);
}

function adminGenCode(){
  var fp = String($('#agenFp').value || '').trim().toUpperCase();
  var dur = parseInt($('#agenDur').value, 10);
  var startStr = $('#agenStart').value;
  if(!/^[0-9A-F]{8}$/.test(fp)){ toast('بصمة الجهاز يجب أن تكون 8 محارف سداسية عشر', 'err'); return; }
  if(isNaN(dur) || dur <= 0){ toast('أدخل مدة اشتراك صحيحة بالأيام', 'err'); return; }
  var startDay = todayEpochDay();
  if(startStr){
    var t = new Date(startStr + 'T00:00:00');
    if(!isNaN(t.getTime())) startDay = Math.floor(t.getTime() / 86400000);
  }
  var expDay = startDay + dur;
  var exp = toBase36(expDay);
  var chk = polyChecksum(String(dur) + fp + exp);
  var code = 'TJP-' + dur + '-' + fp + '-' + exp + '-' + chk;
  var expDate = epochDayToDate(expDay);
  var out = $('#agenResult');
  out.innerHTML =
    '<div class="sim-result">' +
      '<div class="sr-label">تم توليد الكود:</div>' +
      '<div class="sr-code ltr">' + esc(code) + '</div>' +
      '<div class="sr-meta">ينتهي في: <b>' + esc(expDate) + '</b></div>' +
      '<div class="btn-row" style="margin-top:10px">' +
        '<button class="btn sm" onclick="copyText(\'' + code.replace(/'/g, "\\'") + '\')">📋 نسخ الكود</button>' +
        '<button class="btn sm outline" onclick="activateSubCode(\'' + code.replace(/'/g, "\\'") + '\');closeModal()">تفعيل على هذا الجهاز</button>' +
      '</div>' +
    '</div>';
  toast('تم توليد الكود ✓');
}

/* ============================================================
   مودال تفعيل الاشتراك + شاشة القفل
   ============================================================ */

function openSubscriptionModal(){
  var st = subStatus();
  var fp = getDeviceFingerprint();
  var devId = getDeviceIdFull();
  var html = sheetHead('إدارة الاشتراك');

  /* بطاقة حالة الاشتراك */
  var stateLabel = { none:'🚫 غير مفعّل', ok:'✅ ساري', warn:'🔔 ينتهي قريباً', soon:'⚠️ ينتهي قريباً جداً', expired:'⏰ منتهي' }[st.state] || st.label;
  var stateCls = 'sub-state-' + (st.state === 'none' ? 'none' : st.state);
  html += '<div class="sub-status-card ' + stateCls + '">' +
    '<div class="ss-label">حالة الاشتراك</div>' +
    '<div class="ss-state">' + esc(stateLabel) + '</div>' +
    (st.expiryDate ? '<div class="ss-expiry">ينتهي في: <b>' + esc(st.expiryDate) + '</b>' +
      (st.daysLeft > 0 ? ' — متبقي ' + st.daysLeft + ' يوم' : '') + '</div>' : '') +
  '</div>';

  /* معلومات الجهاز */
  html += '<div class="card">' +
    '<div class="card-title">📱 معلومات الجهاز</div>' +
    '<div class="sub-device-row"><span>بصمة الجهاز</span><b class="ltr fp-chip">' + esc(fp) + '</b></div>' +
    '<div class="sub-device-row"><span>معرّف الجهاز الكامل</span><b class="ltr" style="font-size:11px;word-break:break-all">' + esc(devId) + '</b></div>' +
    '<div class="small-note" style="margin-top:10px">💡 البصمة (8 محارف) هي ما يحتاجه المسؤول لتوليد كود خاص بهذا الجهاز. أرسلها له بأمان.</div>' +
    '<div class="btn-row" style="margin-top:8px">' +
      '<button class="btn sm outline" onclick="copyText(\'' + fp + '\')">📋 نسخ البصمة</button>' +
      '<button class="btn sm outline" onclick="openAdminGen()">🔑 مولّد الأكواد (مسؤول)</button>' +
    '</div>' +
  '</div>';

  /* تفعيل / تجديد */
  html += '<div class="card">' +
    '<div class="card-title">🔑 ' + (st.state === 'none' ? 'تفعيل الاشتراك' : 'تجديد الاشتراك') + '</div>' +
    '<div class="field"><label>كود الاشتراك</label>' +
    '<input id="subCodeInput" type="text" placeholder="TJP-...-...-...-.." style="font-family:monospace;direction:ltr;text-align:center;text-transform:uppercase" autocomplete="off">' +
    '</div>' +
    '<button class="btn block" onclick="doActivateSub()">تفعيل / تجديد</button>';
  if(st.state !== 'none'){
    html += '<button class="btn sm danger block" style="margin-top:8px" onclick="cancelSub()">إلغاء الاشتراك الحالي</button>';
  }
  html += '</div>';

  openModal(html);
}

function doActivateSub(){
  var code = $('#subCodeInput').value;
  if(!code || !code.trim()){ toast('أدخل كود الاشتراك', 'err'); return; }
  if(activateSubCode(code)){
    closeModal();
  }
}
function cancelSub(){
  confirmDlg('إلغاء الاشتراك', 'سيتم إزالة الاشتراك الحالي من هذا الجهاز. ستحتاج كوداً جديداً لإعادة التفعيل.', function(){
    clearSub();
    toast('تم إلغاء الاشتراك');
    closeModal();
    updateNotifBadge();
  }, { danger: true, yesLabel: 'إلغاء الاشتراك' });
}

/* فحص التحديثات — يفتح صفحة إصدارات GitHub */
function checkForUpdates(){
  var url = 'https://github.com/salah55t/tajir-pro/releases';
  try{
    if(deviceBridgeAvailable() && TajirDeviceBridge.openUrl){
      TajirDeviceBridge.openUrl(url);
      toast('جاري فتح صفحة الإصدارات…');
    }else{
      openDialog(
        '<h3>تحقق من التحديثات</h3>' +
        '<p>افتح الرابط التالي في متصفح الهاتف للتحقق من أحدث إصدار:</p>' +
        '<div class="sr-code ltr" style="font-size:11px">' + esc(url) + '</div>' +
        '<div class="btn-row" style="margin-top:12px">' +
          '<button class="btn sm" onclick="copyText(\'' + url + '\')">📋 نسخ الرابط</button>' +
          '<button class="btn sm ghost" onclick="closeModal()">إغلاق</button>' +
        '</div>'
      );
    }
  }catch(e){ toast('تعذر فتح الرابط', 'err'); }
}

/* ============================================================
   نظام القفل للنسخة غير المفعّلة (Trial Mode)
   ============================================================
   - النسخة غير المفعّلة:
     • حد أقصى 3 منتجات في المخزون
     • لا طباعة فواتير حرارية
     • لا تصدير/استيراد نسخ احتياطية
     • لا تصدير CSV
     • لا مسح شامل للبيانات
     • تنبيهات تذكيرية دورية
   - النسخة المفعّلة (اشتراك ساري):
     • كل الميزات مفتوحة بلا حدود
   ============================================================ */

var FREE_PRODUCT_LIMIT = 3;

/* الميزات المقفلة في النسخة المجانية */
var LOCKED_FEATURES = {
  print:    { label:'الطباعة الحرارية', icon:'🖨️', desc:'طباعة الفواتير على الطابعة الحرارية عبر البلوتوث' },
  backup:   { label:'النسخ الاحتياطي', icon:'💾', desc:'تصدير واستيراد نسخة كاملة من بياناتك (JSON)' },
  csv:      { label:'تصدير CSV', icon:'📊', desc:'تصدير المخزون إلى ملف CSV يدعم العربية' },
  wipe:     { label:'مسح البيانات', icon:'🗑️', desc:'مسح جميع البيانات نهائياً' }
};

/* التحقق من حالة القفل */
function isLocked(){
  var st = subStatus();
  return !st.active; /* active=false تعني none أو expired */
}
function isLockedFeature(feature){
  if(!isLocked()) return false;
  return !!LOCKED_FEATURES[feature];
}

/* عدد المنتجات المسموح به */
function productLimit(){
  return isLocked() ? FREE_PRODUCT_LIMIT : 999999;
}
function canAddProduct(){
  return db.products.length < productLimit();
}
function productLimitDisplay(){
  return isLocked() ? FREE_PRODUCT_LIMIT : '∞';
}

/* عرض شاشة القفل (تطلب التفعيل) */
function showLockScreen(feature, onActivate){
  var info = LOCKED_FEATURES[feature] || { label:'هذه الميزة', icon:'🔒', desc:'' };
  var html =
    '<div class="lock-screen">' +
      '<div class="ls-icon">' + info.icon + '</div>' +
      '<h3 class="ls-title">' + esc(info.label) + ' — ميزة مدفوعة</h3>' +
      '<p class="ls-desc">' + esc(info.desc || 'هذه الميزة متاحة فقط للاشتراكات السارية.') + '</p>' +
      '<div class="ls-features">' +
        '<div class="ls-feat-row"><span class="ls-check">✓</span> منتجات غير محدودة (الحد الحالي: ' + FREE_PRODUCT_LIMIT + ')</div>' +
        '<div class="ls-feat-row"><span class="ls-check">✓</span> طباعة الفواتير حرارياً عبر البلوتوث</div>' +
        '<div class="ls-feat-row"><span class="ls-check">✓</span> نسخ احتياطي كامل (JSON) وتصدير CSV</div>' +
        '<div class="ls-feat-row"><span class="ls-check">✓</span> جميع الميزات المتقدمة بلا قيود</div>' +
      '</div>' +
      '<button class="btn block primary" onclick="closeModal();openSubscriptionModal();' +
        (typeof onActivate === 'function' ? '' : '') + '">🔑 تفعيل الاشتراك الآن</button>' +
      '<button class="btn sm ghost block" style="margin-top:8px" onclick="closeModal()">لاحقاً</button>' +
      '<div class="small-note" style="margin-top:14px;color:var(--muted);text-align:center">' +
        '💡 فاتورة البيع وسلة التسوق وقراءة الباركود متاحة في النسخة المجانية بلا قيود.</div>' +
    '</div>';
  openDialog(html);
}

/* عرض شاشة قفل حد المنتجات */
function showProductLimitLock(){
  var html =
    '<div class="lock-screen">' +
      '<div class="ls-icon">📦</div>' +
      '<h3 class="ls-title">وصلت إلى الحد المجاني</h3>' +
      '<p class="ls-desc">النسخة المجانية تتيح حتى ' + FREE_PRODUCT_LIMIT + ' منتجات فقط. ' +
        'لديك حالياً ' + db.products.length + ' منتج. فعّل اشتراكك لإضافة منتجات غير محدودة.</p>' +
      '<div class="ls-progress">' +
        '<div class="ls-progress-bar" style="width:' + Math.min(100, (db.products.length / FREE_PRODUCT_LIMIT) * 100) + '%"></div>' +
      '</div>' +
      '<div class="ls-progress-label">' + db.products.length + ' / ' + FREE_PRODUCT_LIMIT + ' منتج</div>' +
      '<button class="btn block primary" style="margin-top:16px" onclick="closeModal();openSubscriptionModal()">🔑 تفعيل الاشتراك — منتجات غير محدودة</button>' +
      '<button class="btn sm ghost block" style="margin-top:8px" onclick="closeModal()">لاحقاً</button>' +
    '</div>';
  openDialog(html);
}

/* فحص قبل تنفيذ ميزة مقفلة — يُستدعى في كل ميزة حساسة */
function requireFeature(feature){
  if(!isLockedFeature(feature)){
    return true; /* الميزة متاحة */
  }
  showLockScreen(feature);
  return false;
}
function requireProductSlot(){
  if(canAddProduct()) return true;
  showProductLimitLock();
  return false;
}

/* ============================================================
   التهيئة
   ============================================================ */
function init(){
  loadDB();
  seedIfEmpty();
  sanitizeCart();
  /* ضبط الوضع الليلي المحفوظ (تم تطبيقه مبكراً في index.html لمنع الوميض) */
  try{
    var savedTheme = localStorage.getItem(THEME_KEY) || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    var meta = document.querySelector('meta[name=theme-color]');
    if(meta) meta.setAttribute('content', savedTheme === 'dark' ? '#0B1220' : '#047857');
  }catch(e){}
  $('#storeNameTop').textContent = db.settings.storeName;
  /* نظام الاشتراك: فحص التنبيهات + تحديث الشارة */
  try{
    checkSubscriptionAlerts();
    updateNotifBadge();
    /* الاستماع لحدث صلاحية الإشعارات من الجسر */
    window.__notifPermissionEvent = function(granted){
      if(granted) toast('تم تفعيل تنبيهات النظام ✓');
      else toast('لم تُمنح صلاحية الإشعارات — ستبقى التنبيهات داخل التطبيق', 'err');
    };
  }catch(e){}
  showTab('dash');
  /* تكرار تحديث الشارة كل دقيقة (يلتقط تغيّر حالة الاشتراك) */
  setInterval(function(){ try{ updateNotifBadge(); }catch(e){} }, 60000);
}
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', init);
}else{
  init();
}


