import mongoose from 'mongoose';

export class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export const bad = (message, field) => {
  const e = new HttpError(422, message);
  if (field) e.fields = { [field]: message };
  return e;
};
export const forbidden = (message = 'You do not have permission to do that.') => new HttpError(403, message);
export const notFound = (what = 'Record') => new HttpError(404, `${what} not found.`);
export const conflict = (what = 'Record') => new HttpError(409, what);

export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const toMoney = (v) => mongoose.Types.Decimal128.fromString(round2(v ?? 0).toFixed(2));
export const num = (d) => (d == null ? 0 : parseFloat(d.toString()));
export const moneyStr = (d) => (d == null ? '0.00' : Number(d.toString()).toFixed(2));
export const pad6 = (n) => String(n).padStart(6, '0');

export async function withTxn(fn) {
  const session = await mongoose.startSession();
  try {
    let out;
    for (let i = 0; ; i++) {
      try {
        out = await session.withTransaction(async () => fn(session));
        break;
      } catch (e) {
        if (i < 3 && e && e.errorLabels && e.errorLabels.includes('TransientTransactionError')) {
          await new Promise((r) => setTimeout(r, 120));
          continue;
        }
        throw e;
      }
    }
    return out;
  } finally {
    session.endSession();
  }
}

export function moneyTransform(fields) {
  return function (doc, ret) {
    if (Array.isArray(ret)) return ret.map((x) => decIn(x, fields));
    if (ret && typeof ret === 'object') decIn(ret, fields);
    return ret;
  };
}
function decIn(obj, fields) {
  if (obj == null || typeof obj !== 'object') return obj;
  for (const [k, v] of Object.entries(obj)) {
    if (v instanceof mongoose.Types.Decimal128) obj[k] = Number(v.toString()).toFixed(2);
    else if (v && typeof v === 'object') decIn(v, fields);
    else if (Array.isArray(v)) v.forEach((x) => decIn(x, fields));
  }
  return obj;
}

export function dateStr(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toISOString().slice(0, 10);
}

export function parseAppDate(s) {
  if (!s) return null;
  const p = String(s).split('/');
  if (p.length === 3) return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
  return s;
}

// '0300-1234567', '+92 300 1234567' and '0092 300 1234567' all become '923001234567'.
// Separators are stripped before the local-prefix rule so formatted numbers are not missed.
export function normalizePhone(phone, countryCode = '92') {
  if (!phone) return null;
  let p = String(phone).trim().replace(/\D/g, '');
  if (p.startsWith('00')) p = p.slice(2);
  else if (p.startsWith('0')) p = countryCode + p.slice(1);
  return p.length >= 10 ? p : null;
}
