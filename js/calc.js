// 單位換算與比價計算（純函式，不碰 DOM 與資料庫）

export const UNIT_TYPES = {
  weight: { label: '重量', hint: 'g / kg', units: [{ v: 'g', f: 1 }, { v: 'kg', f: 1000 }], bases: [100, 1000] },
  volume: { label: '容量', hint: 'ml / L', units: [{ v: 'ml', f: 1 }, { v: 'L', f: 1000 }], bases: [100, 1000] },
  count: { label: '計數', hint: '個、抽、片', units: null, bases: [1, 10, 100] },
};

export const countLabel = product => (product.countLabel || '個').trim() || '個';

export function unitsFor(product) {
  return UNIT_TYPES[product.unitType].units ?? [{ v: countLabel(product), f: 1 }];
}

export function factor(product, unit) {
  if (product.unitType === 'count') return 1;
  return unitsFor(product).find(u => u.v === unit)?.f ?? 1;
}

export function totalQty(product, rec) {
  return rec.specQty * factor(product, rec.specUnit) * rec.pieces;
}

// 單價 =（價格 + 運費）÷ 總量 × 基準量
export function unitPrice(product, rec) {
  const total = totalQty(product, rec);
  if (!(total > 0)) return NaN;
  return (rec.price + (rec.shipping || 0)) / total * product.baseQty;
}

const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

function bigSmall(qty, small, big) {
  return qty >= 1000 ? `${round(qty / 1000).toLocaleString('zh-TW')} ${big}` : `${round(qty).toLocaleString('zh-TW')} ${small}`;
}

export function baseLabel(product, base = product.baseQty) {
  if (product.unitType === 'weight') return base % 1000 === 0 ? (base === 1000 ? 'kg' : `${base / 1000}kg`) : `${base}g`;
  if (product.unitType === 'volume') return base % 1000 === 0 ? (base === 1000 ? 'L' : `${base / 1000}L`) : `${base}ml`;
  return base === 1 ? countLabel(product) : `${base}${countLabel(product)}`;
}

export function fmtQty(product, qty) {
  if (product.unitType === 'weight') return bigSmall(qty, 'g', 'kg');
  if (product.unitType === 'volume') return bigSmall(qty, 'ml', 'L');
  return `${round(qty).toLocaleString('zh-TW')} ${countLabel(product)}`;
}

export function specText(product, rec) {
  const unit = product.unitType === 'count' ? countLabel(product) : rec.specUnit;
  return `${round(rec.specQty)}${unit}` + (rec.pieces > 1 ? ` × ${rec.pieces}` : '');
}

export const fmtUnit = n => '$' + n.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtMoney = n => '$' + n.toLocaleString('zh-TW', { maximumFractionDigits: 2 });

const EPS = 1e-9;

// 回傳歷史最低（同價取較新的那筆）與最近一次購買
export function summarize(product, recs) {
  let lowest = null;
  let latest = null;
  for (const r of recs) {
    const u = unitPrice(product, r);
    if (!Number.isFinite(u)) continue;
    const e = { ...r, u };
    if (!lowest || u < lowest.u - EPS || (Math.abs(u - lowest.u) < EPS && r.date > lowest.date)) lowest = e;
    if (!latest || r.date > latest.date || (r.date === latest.date && (r.createdAt || 0) > (latest.createdAt || 0))) latest = e;
  }
  return { lowest, latest, count: recs.length };
}

// 差距小於半分錢視為同價
export function compare(u, ref) {
  const diff = u - ref;
  return { diff, pct: diff / ref * 100, same: Math.abs(diff) < 0.005 };
}
