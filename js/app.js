import * as db from './db.js';
import * as C from './calc.js';

const DEFAULT_CATEGORIES = ['食', '衣', '住', '行', '育', '樂'];
const BACKUP_REMIND_DAYS = 30;

const state = { categories: [], products: [], purchases: [], meta: {} };
const homeUI = { q: '', cat: 'all' };
const view = document.getElementById('view');

// ---------- 小工具 ----------

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const uid = () => crypto.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);
const num = v => { const n = parseFloat(String(v).replace(/,/g, '')); return Number.isFinite(n) ? n : NaN; };
const go = hash => { location.hash = hash; };

function today() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

const ICONS = {
  back: '<path d="M15 6l-6 6 6 6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h2M14 12h2M8 16h2M14 16h2"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 1800);
}

function topbar(title, { back, action = '' } = {}) {
  const backBtn = back ? `<a class="icon-btn" href="${back}" aria-label="返回">${icon('back')}</a>` : '';
  return `<header class="topbar">${backBtn}<h1>${esc(title)}</h1>${action}</header>`;
}

// ---------- 資料 ----------

async function load() {
  const [categories, products, purchases, meta] = await Promise.all(
    ['categories', 'products', 'purchases', 'meta'].map(db.getAll));
  state.categories = categories.sort((a, b) => a.order - b.order);
  state.products = products;
  state.purchases = purchases;
  state.meta = Object.fromEntries(meta.map(m => [m.key, m.value]));
}

const catName = id => state.categories.find(c => c.id === id)?.name ?? '未分類';
const productById = id => state.products.find(p => p.id === id);
const purchasesOf = pid => state.purchases.filter(r => r.productId === pid);
const summaryOf = (product, excludeId) => C.summarize(product, purchasesOf(product.id).filter(r => r.id !== excludeId));
const stores = () => [...new Set(state.purchases.map(r => r.store).filter(Boolean))].sort();

function byRecent(a, b) {
  return (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0);
}

// ---------- 路由 ----------

const routes = [
  [/^\/$/, viewHome],
  [/^\/calc$/, viewCalc],
  [/^\/backup$/, viewBackup],
  [/^\/settings$/, viewSettings],
  [/^\/product\/new$/, viewProductForm],
  [/^\/product\/([^/]+)\/edit$/, viewProductForm],
  [/^\/product\/([^/]+)$/, viewProduct],
  [/^\/purchase\/([^/]+)$/, viewPurchaseEdit],
];

function route() {
  const [path, qs] = (location.hash.slice(1) || '/').split('?');
  const params = new URLSearchParams(qs || '');
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (!m) continue;
    const tab = path.startsWith('/calc') ? 'calc' : path.startsWith('/backup') ? 'backup' : 'home';
    $$('.tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
    fn(params, ...m.slice(1).map(decodeURIComponent));
    window.scrollTo(0, 0);
    return;
  }
  go('#/');
}

// ---------- 首頁 ----------

function backupReminder() {
  if (!state.purchases.length) return '';
  const { lastBackup = 0, lastReminder = 0, firstUse = 0 } = state.meta;
  // 從沒備份過的話，從開始使用那天算起
  const since = Math.max(lastBackup || firstUse, lastReminder);
  if (Date.now() - since < BACKUP_REMIND_DAYS * 864e5) return '';
  const msg = lastBackup
    ? `已經 ${Math.floor((Date.now() - lastBackup) / 864e5)} 天沒有備份了`
    : '你還沒有備份過資料';
  return `<div class="banner"><span>${msg}，清除瀏覽器資料時紀錄會消失。</span>
    <div class="banner-actions"><button class="btn small" id="remind-later">稍後</button><a class="btn small primary" href="#/backup">去備份</a></div></div>`;
}

function viewHome() {
  const chip = (id, name) => `<button class="chip${homeUI.cat === id ? ' active' : ''}" data-cat="${esc(id)}">${esc(name)}</button>`;
  view.innerHTML = `
    ${topbar('比價本', { action: `<a class="icon-btn" href="#/settings" aria-label="設定">${icon('settings')}</a>` })}
    ${backupReminder()}
    <a class="hero" href="#/calc">${icon('calc')}<span><strong>團購試算</strong><small>這團划算嗎？</small></span></a>
    <label class="search">${icon('search')}<input id="q" type="search" placeholder="搜尋商品或品牌" value="${esc(homeUI.q)}" autocomplete="off"></label>
    <div class="chips">${chip('all', '全部')}${state.categories.map(c => chip(c.id, c.name)).join('')}</div>
    <ul class="plist" id="plist"></ul>
    <a class="btn block ghost" href="#/product/new">${icon('plus')} 新增商品</a>`;

  renderProductList();
  $('#q').addEventListener('input', e => { homeUI.q = e.target.value; renderProductList(); });
  $$('.chip').forEach(b => b.addEventListener('click', () => {
    homeUI.cat = b.dataset.cat;
    $$('.chip').forEach(x => x.classList.toggle('active', x === b));
    renderProductList();
  }));
  $('#remind-later')?.addEventListener('click', async () => {
    await db.setMeta('lastReminder', Date.now());
    await load();
    $('.banner').remove();
  });
}

function matches(product, q) {
  q = q.trim().toLowerCase();
  return !q || product.name.toLowerCase().includes(q) || (product.brand || '').toLowerCase().includes(q);
}

function productsByRecent() {
  const latestDate = p => summaryOf(p).latest?.date || '';
  return [...state.products].sort((a, b) => latestDate(b).localeCompare(latestDate(a)) || b.createdAt - a.createdAt);
}

function productRow(p) {
  const { lowest } = summaryOf(p);
  const sub = [catName(p.categoryId), lowest?.store || p.brand].filter(Boolean).map(esc).join(' · ');
  const price = lowest
    ? `<strong>${C.fmtUnit(lowest.u)}</strong><small>/${esc(C.baseLabel(p))}</small>`
    : '<span class="muted">尚無紀錄</span>';
  return `<li><a class="row" href="#/product/${p.id}"><div class="row-main"><div class="row-title">${esc(p.name)}</div><div class="row-sub">${sub}</div></div><div class="price">${price}</div></a></li>`;
}

function renderProductList() {
  const list = productsByRecent().filter(p => (homeUI.cat === 'all' || p.categoryId === homeUI.cat) && matches(p, homeUI.q));
  const el = $('#plist');
  if (list.length) { el.innerHTML = list.map(productRow).join(''); return; }
  el.innerHTML = state.products.length
    ? '<li class="empty">找不到符合的商品</li>'
    : '<li class="empty"><strong>記錄你的第一個商品</strong><br>按上面的「團購試算」，輸入名稱就能建立商品並存下價格。</li>';
}

// ---------- 購買欄位（試算與編輯共用） ----------

function purchaseFieldsHTML(product, rec) {
  const units = C.unitsFor(product);
  const unit = rec?.specUnit ?? units[0].v;
  const unitCtl = units.length > 1
    ? `<select id="f-unit" aria-label="單位">${units.map(u => `<option${u.v === unit ? ' selected' : ''}>${u.v}</option>`).join('')}</select>`
    : `<span class="suffix">${esc(units[0].v)}</span><input type="hidden" id="f-unit" value="${esc(units[0].v)}">`;
  return `
    <section class="card form">
      <div class="field"><span>每件規格</span>
        <div class="inline">
          <input id="f-qty" inputmode="decimal" placeholder="200" value="${rec ? rec.specQty : ''}" aria-label="每件規格">
          ${unitCtl}
          <span class="suffix">×</span>
          <input id="f-pieces" class="narrow" inputmode="numeric" value="${rec ? rec.pieces : 1}" aria-label="件數">
          <span class="suffix">件</span>
        </div>
      </div>
      <div class="grid2">
        <label class="field"><span>價格</span><div class="money"><i>$</i><input id="f-price" inputmode="decimal" placeholder="299" value="${rec ? rec.price : ''}"></div></label>
        <label class="field"><span>運費</span><div class="money"><i>$</i><input id="f-ship" inputmode="decimal" value="${rec ? rec.shipping || 0 : 0}"></div></label>
      </div>
    </section>
    <section class="result" id="result" aria-live="polite"></section>`;
}

function saveFieldsHTML(rec) {
  return `
    <section class="card form">
      <div class="grid2">
        <label class="field"><span>購買日期</span><input id="f-date" type="date" value="${rec?.date ?? today()}"></label>
        <label class="field"><span>通路／團主</span><input id="f-store" list="store-list" placeholder="全聯、小美團購" value="${esc(rec?.store)}"></label>
      </div>
      <datalist id="store-list">${stores().map(s => `<option value="${esc(s)}">`).join('')}</datalist>
      <label class="field"><span>備註</span><input id="f-note" placeholder="買二送一、效期到 12 月" value="${esc(rec?.note)}"></label>
      <p class="error" id="f-err"></p>
    </section>`;
}

function readFields() {
  return {
    specQty: num($('#f-qty').value),
    specUnit: $('#f-unit').value,
    pieces: num($('#f-pieces').value),
    price: num($('#f-price').value),
    shipping: $('#f-ship').value.trim() === '' ? 0 : num($('#f-ship').value),
  };
}

function fieldError(f) {
  if (!(f.specQty > 0)) return '請填每件規格（大於 0 的數字）';
  if (!(Number.isInteger(f.pieces) && f.pieces >= 1)) return '件數要是 1 以上的整數';
  if (!(f.price >= 0)) return '請填價格';
  if (!(f.shipping >= 0)) return '運費要是 0 以上的數字';
  return '';
}

function updateResult(product, excludeId) {
  const el = $('#result');
  const f = readFields();
  if (fieldError(f)) {
    el.className = 'result empty';
    el.innerHTML = '輸入規格和價格後，這裡會顯示單價和比價結果';
    return;
  }
  const base = C.baseLabel(product);
  const u = C.unitPrice(product, f);
  const { lowest, latest } = summaryOf(product, excludeId);
  let verdict = '<div class="verdict">這是這個商品的第一筆紀錄</div>';
  let tone = '';
  if (lowest) {
    const c = C.compare(u, lowest.u);
    if (c.same) {
      verdict = '<div class="verdict">跟歷史最低一樣</div>';
    } else if (c.diff < 0) {
      tone = 'good';
      verdict = `<div class="verdict">比歷史最低便宜 ${Math.abs(c.pct).toFixed(1)}%<small>每 ${esc(base)} 省 ${C.fmtUnit(-c.diff)}</small></div>`;
    } else {
      tone = 'bad';
      verdict = `<div class="verdict">比歷史最低貴 ${c.pct.toFixed(1)}%<small>每 ${esc(base)} 多 ${C.fmtUnit(c.diff)}</small></div>`;
    }
  }
  const ref = lowest ? `<div class="ref">
      歷史最低 ${C.fmtUnit(lowest.u)}（${esc([lowest.date, lowest.store].filter(Boolean).join(' · '))}）<br>
      最近一次 ${C.fmtUnit(latest.u)}（${esc(latest.date)}）</div>` : '';
  el.className = `result ${tone}`;
  el.innerHTML = `
    <div class="result-main"><span>單價</span><strong>${C.fmtUnit(u)}</strong><small>/${esc(base)}</small></div>
    <div class="result-sub">總量 ${esc(C.fmtQty(product, C.totalQty(product, f)))} · 實付 ${C.fmtMoney(f.price + f.shipping)}</div>
    ${verdict}${ref}`;
}

function bindPurchaseFields(product, excludeId) {
  $$('#f-qty, #f-unit, #f-pieces, #f-price, #f-ship').forEach(el => el.addEventListener('input', () => updateResult(product, excludeId)));
  updateResult(product, excludeId);
}

function collectPurchase() {
  const f = readFields();
  const date = $('#f-date').value;
  const err = fieldError(f) || (date ? '' : '請選擇購買日期');
  $('#f-err').textContent = err;
  if (err) return null;
  return { ...f, date, store: $('#f-store').value.trim(), note: $('#f-note').value.trim() };
}

// ---------- 試算 ----------

function viewCalc(params) {
  const product = productById(params.get('pid'));
  if (!product) return viewCalcPicker();
  view.innerHTML = `
    ${topbar('團購試算', { back: `#/product/${product.id}` })}
    <section class="card selected">
      <div><div class="row-title">${esc(product.name)}</div>
      <div class="row-sub">${esc([catName(product.categoryId), product.brand].filter(Boolean).join(' · '))} · 以 /${esc(C.baseLabel(product))} 比價</div></div>
      <a class="btn small" href="#/calc">更換</a>
    </section>
    ${purchaseFieldsHTML(product, null)}
    ${saveFieldsHTML(null)}
    <button class="btn primary block" id="save">存成購買紀錄</button>`;
  bindPurchaseFields(product, null);
  $('#f-qty').focus();
  $('#save').addEventListener('click', async () => {
    const rec = collectPurchase();
    if (!rec) return;
    await db.put('purchases', { id: uid(), productId: product.id, createdAt: Date.now(), ...rec });
    await load();
    toast('已儲存');
    go(`#/product/${product.id}`);
  });
}

function viewCalcPicker() {
  view.innerHTML = `
    ${topbar('團購試算')}
    <section class="card">
      <label class="field"><span>要比價的商品</span><input id="pq" type="search" placeholder="輸入商品名稱或品牌" autocomplete="off"></label>
      <ul class="suggest" id="suggest"></ul>
      <div id="quickadd"></div>
    </section>`;
  const input = $('#pq');
  const render = () => {
    const q = input.value.trim();
    const found = productsByRecent().filter(p => matches(p, q)).slice(0, 8);
    const exact = state.products.some(p => p.name === q);
    $('#suggest').innerHTML = found.map(p => {
      const { lowest } = summaryOf(p);
      const price = lowest ? `${C.fmtUnit(lowest.u)}/${esc(C.baseLabel(p))}` : '尚無紀錄';
      return `<li><a class="row" href="#/calc?pid=${p.id}"><div class="row-main"><div class="row-title">${esc(p.name)}</div><div class="row-sub">${esc(catName(p.categoryId))}</div></div><div class="price"><small>${price}</small></div></a></li>`;
    }).join('') + (q && !exact ? `<li><button class="row add-new" id="add-new">${icon('plus')} 新增「${esc(q)}」為新商品</button></li>` : '');
    $('#add-new')?.addEventListener('click', () => showQuickAdd(q));
  };
  input.addEventListener('input', () => { $('#quickadd').innerHTML = ''; render(); });
  render();
  input.focus();
}

function unitTypeRadios(name, selected, disabled = false) {
  return `<div class="seg">${Object.entries(C.UNIT_TYPES).map(([k, t]) =>
    `<label><input type="radio" name="${name}" value="${k}"${k === selected ? ' checked' : ''}${disabled ? ' disabled' : ''}><span>${t.label}<small>${t.hint}</small></span></label>`).join('')}</div>`;
}

const categoryOptions = selected => state.categories.map(c => `<option value="${c.id}"${c.id === selected ? ' selected' : ''}>${esc(c.name)}</option>`).join('');

function showQuickAdd(name) {
  $('#suggest').innerHTML = '';
  $('#quickadd').innerHTML = `
    <div class="form quickadd">
      <label class="field"><span>商品名稱</span><input id="qa-name" value="${esc(name)}"></label>
      <label class="field"><span>分類</span><select id="qa-cat">${categoryOptions(homeUI.cat !== 'all' ? homeUI.cat : state.categories[0]?.id)}</select></label>
      <div class="field"><span>單位類型（之後用這個單位比價）</span>${unitTypeRadios('qa-type', 'weight')}</div>
      <label class="field" id="qa-count-wrap" hidden><span>計數單位</span><input id="qa-count" value="個" placeholder="個、抽、片、顆"></label>
      <p class="error" id="qa-err"></p>
      <button class="btn primary block" id="qa-create">建立並開始試算</button>
    </div>`;
  $$('input[name="qa-type"]').forEach(r => r.addEventListener('change', () => { $('#qa-count-wrap').hidden = r.value !== 'count'; }));
  $('#qa-create').addEventListener('click', async () => {
    const nm = $('#qa-name').value.trim();
    if (!nm) { $('#qa-err').textContent = '請填商品名稱'; return; }
    const unitType = $('input[name="qa-type"]:checked').value;
    const product = {
      id: uid(), name: nm, categoryId: $('#qa-cat').value, brand: '', unitType,
      baseQty: C.UNIT_TYPES[unitType].bases[0], countLabel: unitType === 'count' ? $('#qa-count').value.trim() || '個' : '',
      createdAt: Date.now(),
    };
    await db.put('products', product);
    await load();
    go(`#/calc?pid=${product.id}`);
  });
}

// ---------- 商品頁 ----------

function statCard(title, e, product, best) {
  if (!e) return `<div class="stat"><span>${title}</span><strong class="muted">—</strong></div>`;
  return `<div class="stat${best ? ' best' : ''}"><span>${title}</span><strong>${C.fmtUnit(e.u)}<small>/${esc(C.baseLabel(product))}</small></strong><em>${esc([e.date, e.store].filter(Boolean).join(' · '))}</em></div>`;
}

function viewProduct(_, id) {
  const p = productById(id);
  if (!p) return go('#/');
  const recs = purchasesOf(id).sort(byRecent);
  const { lowest, latest } = summaryOf(p);
  const rows = recs.map(r => {
    const u = C.unitPrice(p, r);
    const paid = C.fmtMoney(r.price) + (r.shipping ? ` + 運 ${C.fmtMoney(r.shipping)}` : '');
    return `<li><a class="row" href="#/purchase/${r.id}"><div class="row-main">
        <div class="row-title">${esc(r.date)}${r.store ? ' · ' + esc(r.store) : ''}${lowest?.id === r.id ? ' <span class="badge">最低</span>' : ''}</div>
        <div class="row-sub">${esc(C.specText(p, r))} · ${paid}</div>
        ${r.note ? `<div class="row-note">${esc(r.note)}</div>` : ''}
      </div><div class="price"><strong>${C.fmtUnit(u)}</strong><small>/${esc(C.baseLabel(p))}</small></div></a></li>`;
  }).join('');
  view.innerHTML = `
    ${topbar(p.name, { back: '#/', action: `<a class="icon-btn" href="#/product/${p.id}/edit" aria-label="編輯商品">${icon('edit')}</a>` })}
    <p class="meta">${esc([catName(p.categoryId), p.brand].filter(Boolean).join(' · '))} · 以 /${esc(C.baseLabel(p))} 比價</p>
    <div class="stats">${statCard('歷史最低', lowest, p, true)}${statCard('最近一次', latest, p, false)}</div>
    <a class="btn primary block" href="#/calc?pid=${p.id}">${icon('calc')} 試算／新增紀錄</a>
    <h2 class="section-title">購買紀錄 <small>${recs.length} 筆</small></h2>
    <ul class="plist">${rows || '<li class="empty">還沒有購買紀錄</li>'}</ul>`;
}

// ---------- 商品表單 ----------

function baseOptions(type, product, selected) {
  return C.UNIT_TYPES[type].bases.map(b => {
    const label = C.baseLabel({ ...product, unitType: type }, b);
    return `<option value="${b}"${b === selected ? ' selected' : ''}>每 ${esc(/^\d/.test(label) ? label : '1' + label)}</option>`;
  }).join('');
}

function viewProductForm(_, id) {
  const editing = id ? productById(id) : null;
  if (id && !editing) return go('#/');
  const p = editing ?? { name: '', brand: '', categoryId: homeUI.cat !== 'all' ? homeUI.cat : state.categories[0]?.id, unitType: 'weight', baseQty: 100, countLabel: '個' };
  const locked = editing && purchasesOf(id).length > 0;
  view.innerHTML = `
    ${topbar(editing ? '編輯商品' : '新增商品', { back: editing ? `#/product/${id}` : '#/' })}
    <section class="card form">
      <label class="field"><span>商品名稱</span><input id="p-name" value="${esc(p.name)}" placeholder="舒潔抽取式衛生紙"></label>
      <div class="grid2">
        <label class="field"><span>分類</span><select id="p-cat">${categoryOptions(p.categoryId)}</select></label>
        <label class="field"><span>品牌</span><input id="p-brand" value="${esc(p.brand)}" placeholder="選填"></label>
      </div>
      <div class="field"><span>單位類型</span>${unitTypeRadios('p-type', p.unitType, locked)}
        ${locked ? '<small class="hint">已經有購買紀錄，不能更改單位類型</small>' : ''}</div>
      <label class="field" id="p-count-wrap"${p.unitType === 'count' ? '' : ' hidden'}><span>計數單位</span><input id="p-count" value="${esc(p.countLabel || '個')}" placeholder="個、抽、片、顆"></label>
      <label class="field"><span>單價基準</span><select id="p-base">${baseOptions(p.unitType, p, p.baseQty)}</select></label>
      <p class="error" id="p-err"></p>
    </section>
    <button class="btn primary block" id="p-save">儲存</button>
    ${editing ? '<button class="btn block danger" id="p-del">刪除商品</button>' : ''}`;

  const draft = () => ({ ...p, unitType: $('input[name="p-type"]:checked').value, countLabel: $('#p-count').value.trim() || '個' });
  const refreshBase = () => {
    const d = draft();
    const cur = num($('#p-base').value);
    const bases = C.UNIT_TYPES[d.unitType].bases;
    $('#p-base').innerHTML = baseOptions(d.unitType, d, bases.includes(cur) ? cur : bases[0]);
    $('#p-count-wrap').hidden = d.unitType !== 'count';
  };
  $$('input[name="p-type"]').forEach(r => r.addEventListener('change', refreshBase));
  $('#p-count').addEventListener('input', refreshBase);

  $('#p-save').addEventListener('click', async () => {
    const name = $('#p-name').value.trim();
    if (!name) { $('#p-err').textContent = '請填商品名稱'; return; }
    const d = draft();
    const saved = {
      ...p, id: p.id ?? uid(), createdAt: p.createdAt ?? Date.now(), name,
      categoryId: $('#p-cat').value, brand: $('#p-brand').value.trim(),
      unitType: d.unitType, countLabel: d.unitType === 'count' ? d.countLabel : '', baseQty: num($('#p-base').value),
    };
    await db.put('products', saved);
    await load();
    toast('已儲存');
    go(`#/product/${saved.id}`);
  });
  $('#p-del')?.addEventListener('click', async () => {
    const n = purchasesOf(id).length;
    if (!confirm(`確定刪除「${editing.name}」${n ? `以及 ${n} 筆購買紀錄` : ''}？刪除後無法復原。`)) return;
    await db.deleteProduct(id);
    await load();
    toast('已刪除');
    go('#/');
  });
}

// ---------- 編輯購買紀錄 ----------

function viewPurchaseEdit(_, id) {
  const rec = state.purchases.find(r => r.id === id);
  const product = rec && productById(rec.productId);
  if (!product) return go('#/');
  view.innerHTML = `
    ${topbar('編輯紀錄', { back: `#/product/${product.id}` })}
    <p class="meta">${esc(product.name)} · 以 /${esc(C.baseLabel(product))} 比價</p>
    ${purchaseFieldsHTML(product, rec)}
    ${saveFieldsHTML(rec)}
    <button class="btn primary block" id="save">儲存</button>
    <button class="btn block danger" id="del">刪除這筆紀錄</button>`;
  bindPurchaseFields(product, rec.id);
  $('#save').addEventListener('click', async () => {
    const data = collectPurchase();
    if (!data) return;
    await db.put('purchases', { ...rec, ...data });
    await load();
    toast('已儲存');
    go(`#/product/${product.id}`);
  });
  $('#del').addEventListener('click', async () => {
    if (!confirm('確定刪除這筆紀錄？刪除後無法復原。')) return;
    await db.del('purchases', id);
    await load();
    toast('已刪除');
    go(`#/product/${product.id}`);
  });
}

// ---------- 設定（分類管理） ----------

function viewSettings() {
  const rows = state.categories.map((c, i) => {
    const n = state.products.filter(p => p.categoryId === c.id).length;
    return `<li class="row cat-row" data-id="${c.id}">
      <div class="row-main"><div class="row-title">${esc(c.name)}</div><div class="row-sub">${n} 個商品</div></div>
      <div class="cat-actions">
        <button class="icon-btn" data-act="up" aria-label="上移"${i === 0 ? ' disabled' : ''}>${icon('up')}</button>
        <button class="icon-btn" data-act="down" aria-label="下移"${i === state.categories.length - 1 ? ' disabled' : ''}>${icon('down')}</button>
        <button class="btn small" data-act="rename">改名</button>
        <button class="btn small danger" data-act="delete">刪除</button>
      </div></li>`;
  }).join('');
  view.innerHTML = `
    ${topbar('分類管理', { back: '#/' })}
    <ul class="plist">${rows}</ul>
    <section class="card form">
      <label class="field"><span>新增分類</span><div class="inline"><input id="c-name" placeholder="保養品、寵物"><button class="btn primary" id="c-add">新增</button></div></label>
      <p class="error" id="c-err"></p>
    </section>`;

  const save = async (...cats) => { await db.put('categories', ...cats); await load(); viewSettings(); };
  $('#c-add').addEventListener('click', () => {
    const name = $('#c-name').value.trim();
    if (!name) { $('#c-err').textContent = '請填分類名稱'; return; }
    if (state.categories.some(c => c.name === name)) { $('#c-err').textContent = '已經有這個分類了'; return; }
    const order = Math.max(0, ...state.categories.map(c => c.order)) + 1;
    save({ id: uid(), name, order });
  });
  $$('.cat-row').forEach(row => row.addEventListener('click', async e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    const i = state.categories.findIndex(c => c.id === row.dataset.id);
    const cat = state.categories[i];
    if (act === 'rename') {
      const name = prompt('新的分類名稱', cat.name)?.trim();
      if (name && name !== cat.name) save({ ...cat, name });
    } else if (act === 'delete') {
      if (state.products.some(p => p.categoryId === cat.id)) { alert('這個分類還有商品，請先把商品移到其他分類'); return; }
      if (!confirm(`確定刪除分類「${cat.name}」？`)) return;
      await db.del('categories', cat.id);
      await load();
      viewSettings();
    } else {
      const other = state.categories[act === 'up' ? i - 1 : i + 1];
      if (other) save({ ...cat, order: other.order }, { ...other, order: cat.order });
    }
  }));
}

// ---------- 備份 ----------

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toCSV() {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['分類', '商品', '品牌', '購買日期', '通路', '每件規格', '單位', '件數', '價格', '運費', '總量', '單價', '單價基準', '備註'];
  const lines = state.purchases
    .map(r => [r, productById(r.productId)])
    .filter(([, p]) => p)
    .sort(([a, pa], [b, pb]) => catName(pa.categoryId).localeCompare(catName(pb.categoryId)) || pa.name.localeCompare(pb.name) || byRecent(a, b))
    .map(([r, p]) => [catName(p.categoryId), p.name, p.brand, r.date, r.store, r.specQty,
      p.unitType === 'count' ? C.countLabel(p) : r.specUnit, r.pieces, r.price, r.shipping || 0,
      C.fmtQty(p, C.totalQty(p, r)), C.unitPrice(p, r).toFixed(2), C.baseLabel(p), r.note].map(q).join(','));
  return '﻿' + [head.map(q).join(','), ...lines].join('\r\n');
}

function viewBackup() {
  const last = state.meta.lastBackup ? new Date(state.meta.lastBackup).toLocaleDateString('zh-TW') : '還沒有備份過';
  view.innerHTML = `
    ${topbar('備份')}
    <div class="stats">
      <div class="stat"><span>商品</span><strong>${state.products.length}</strong></div>
      <div class="stat"><span>購買紀錄</span><strong>${state.purchases.length}</strong></div>
    </div>
    <p class="meta">上次備份：${last}<br>資料只存在這台裝置的瀏覽器裡。清除瀏覽器資料或換手機前，記得先匯出備份。</p>
    <button class="btn primary block" id="ex-json">匯出完整備份（JSON）</button>
    <button class="btn block" id="ex-csv">匯出 Excel 用的 CSV</button>
    <label class="btn block">從備份還原（JSON）<input type="file" id="im-json" accept=".json,application/json" hidden></label>
    <p class="hint">還原會用備份檔取代目前的全部資料。</p>`;

  $('#ex-json').addEventListener('click', async () => {
    const { categories, products, purchases } = state;
    download(`比價本-備份-${today()}.json`, JSON.stringify({ app: '比價本', version: 1, exportedAt: new Date().toISOString(), categories, products, purchases }, null, 2), 'application/json');
    await db.setMeta('lastBackup', Date.now());
    await load();
    viewBackup();
    toast('已匯出備份');
  });
  $('#ex-csv').addEventListener('click', () => download(`比價本-${today()}.csv`, toCSV(), 'text/csv;charset=utf-8'));
  $('#im-json').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); } catch { alert('這個檔案不是有效的 JSON 備份'); return; }
    if (!['categories', 'products', 'purchases'].every(k => Array.isArray(data?.[k]))) { alert('這個檔案不是比價本的備份'); return; }
    if (!confirm(`備份裡有 ${data.products.length} 個商品、${data.purchases.length} 筆紀錄。\n還原會取代目前的全部資料，確定嗎？`)) return;
    await db.replaceAll(data);
    await load();
    homeUI.cat = 'all';
    viewBackup();
    toast('已還原');
  });
}

// ---------- 啟動 ----------

async function init() {
  await load();
  if (!state.categories.length) {
    await db.put('categories', ...DEFAULT_CATEGORIES.map((name, i) => ({ id: uid(), name, order: i })));
  }
  if (!state.meta.firstUse) await db.setMeta('firstUse', Date.now());
  await load();
  window.addEventListener('hashchange', route);
  route();
  navigator.storage?.persist?.();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
}

init();
