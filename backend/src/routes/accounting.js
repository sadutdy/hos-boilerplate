import { Router } from 'express';
import { AccountSector, LedgerEntry, AccountingSetting } from '../models/org.js';
import { Invoice, InvoicePayment } from '../models/billing.js';
import { ah, bad, notFound, withTxn, round2, toMoney, num, parseAppDate, dateStr } from '../util.js';
import { auth, activity, requirePermission } from '../middleware/auth.js';

const r = Router();
r.use(auth, activity);
const perm = requirePermission('accounting');

r.get('/accounting/sectors', perm, ah(async (req, res) => {
  const { type } = req.query;
  res.json({ items: await AccountSector.find(type ? { type } : {}).sort({ name: 1 }) });
}));

r.post('/accounting/sectors', perm, ah(async (req, res) => {
  const b = req.body || {};
  if (!b.name) throw bad('Name is required.', 'name');
  if (!['income', 'expense'].includes(b.type)) throw bad('Type must be income or expense.', 'type');
  res.json(await AccountSector.create(b));
}));

r.put('/accounting/sectors/:id', perm, ah(async (req, res) => {
  const doc = await AccountSector.findById(req.params.id);
  if (!doc) throw notFound('Sector');
  const b = req.body || {};
  if (!b.name) throw bad('Name is required.', 'name');
  Object.assign(doc, { name: b.name, type: ['income', 'expense'].includes(b.type) ? b.type : doc.type });
  await doc.save();
  res.json(doc);
}));

r.delete('/accounting/sectors/:id', perm, ah(async (req, res) => {
  const doc = await AccountSector.findById(req.params.id);
  if (!doc) throw notFound('Sector');
  if (await LedgerEntry.exists({ sectorId: doc._id })) {
    throw new (await import('../util.js')).HttpError(409, 'That sector has entries against it.');
  }
  await AccountSector.deleteOne({ _id: doc._id });
  res.json({ ok: true });
}));

r.post('/accounting/batch', perm, ah(async (req, res) => {
  const b = req.body || {};
  if (!['income', 'expense'].includes(b.type)) throw bad('Type must be income or expense.', 'type');
  if (!Array.isArray(b.entries) || !b.entries.length) throw bad('At least one entry is required.', 'entries');
  const saved = [];
  let skipped = 0;
  await withTxn(async (session) => {
    for (const e of b.entries) {
      if ((!e.amount && e.amount !== 0) || !e.date) { skipped++; continue; }
      const sector = await AccountSector.findById(e.sectorId).session(session);
      if (!sector) throw bad('One of the sector names does not exist.', 'entries');
      if (!(round2(Number(e.amount)) >= 0)) { skipped++; continue; }
      const doc = new LedgerEntry({
        sectorId: sector._id,
        sectorName: sector.name,
        type: b.type,
        amount: toMoney(e.amount),
        date: new Date(String(e.date).length === 10 && e.date.includes('-') ? e.date : parseAppDate(e.date)),
        description: e.description || '',
        createdBy: req.user.sub,
      });
      await doc.save({ session });
      saved.push(doc);
    }
  });
  res.json({ ok: true, saved: saved.length, skipped });
}));

r.get('/accounting/entries', perm, ah(async (req, res) => {
  const { type, from, to, year, month, limit = 100, offset = 0 } = req.query;
  const qy = {};
  if (type) qy.type = type;
  if (from || to) {
    qy.date = {};
    if (from) qy.date.$gte = new Date(`${from}T00:00:00Z`);
    if (to) qy.date.$lte = new Date(`${to}T23:59:59Z`);
  }
  if (year && month) {
    const m = new Date(Date.parse(`${month} 1, ${year}`)).getMonth() + 1;
    const y = Number(year);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    qy.date = { $gte: start, $lt: end };
  }
  const items = await LedgerEntry.find(qy).sort({ date: -1 }).skip(Number(offset)).limit(Math.min(Number(limit), 200));
  const total = await LedgerEntry.countDocuments(qy);
  const sum = items.reduce((a, e) => a + num(e.amount), 0);
  res.json({ items, total, total_amount: sum.toFixed(2) });
}));

r.put('/accounting/entries/:id', perm, ah(async (req, res) => {
  const doc = await LedgerEntry.findById(req.params.id);
  if (!doc) throw notFound('Entry');
  const b = req.body || {};
  Object.assign(doc, {
    amount: b.amount !== undefined ? toMoney(b.amount) : doc.amount,
    date: b.date !== undefined ? new Date(b.date.includes('-') ? b.date : parseAppDate(b.date)) : doc.date,
    description: b.description ?? doc.description,
  });
  if (b.sectorId) {
    const sector = await AccountSector.findById(b.sectorId);
    if (!sector) throw bad('That sector does not exist.', 'sectorId');
    doc.sectorId = sector._id;
    doc.sectorName = sector.name;
  }
  await doc.save();
  res.json(doc);
}));

r.delete('/accounting/entries/:id', perm, ah(async (req, res) => {
  await LedgerEntry.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
}));

r.get('/accounting/settings', perm, ah(async (req, res) => res.json((await AccountingSetting.findOne()) || null)));

r.put('/accounting/settings', perm, ah(async (req, res) => {
  const b = req.body || {};
  for (const f of ['companyId', 'apiLink', 'username', 'password']) {
    if (!b[f]) throw bad(`${f === 'companyId' ? 'Company id' : f === 'apiLink' ? 'API link' : f} is required.`, f.replace('companyId', 'companyId'));
  }
  await AccountingSetting.deleteMany({});
  res.json(await AccountingSetting.create(b));
}));

async function billingTotals(from, to) {
  const match = { date: { $gte: new Date(`${from}T00:00:00Z`), $lte: new Date(`${to}T23:59:59Z`) } };
  const rows = await Invoice.aggregate([
    { $match: match },
    { $addFields: { gross: { $toDouble: '$grossTotal' }, depositFlag: { $cond: { if: { $gt: ['$depositType', ''] }, then: 'deposit', else: 'regular' } } } },
    { $group: { _id: '$depositFlag', gross: { $sum: '$gross' }, count: { $sum: 1 } } },
  ]);
  const paidRows = await InvoicePayment.aggregate([
    { $match: { paidAt: match.date } },
    { $group: { _id: null, paid: { $sum: { $toDouble: '$amount' } } } },
  ]);
  const regular = rows.find((r0) => r0._id === 'regular') || { gross: 0, count: 0 };
  const deposit = rows.find((r0) => r0._id === 'deposit') || { gross: 0, count: 0 };
  const paid = round2(paidRows[0]?.paid || 0);
  return {
    charged: round2(regular.gross),
    chargedCount: regular.count,
    depositCharged: round2(deposit.gross),
    depositCount: deposit.count,
    paid,
    due: round2(regular.gross + deposit.gross - paid),
  };
}

r.get('/accounting/reports/summary', perm, ah(async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) throw bad('A date range (from, to) is required.');
  const range = { $gte: new Date(`${from}T00:00:00Z`), $lte: new Date(`${to}T23:59:59Z`) };
  const byType = await LedgerEntry.aggregate([
    { $match: { date: range } },
    { $group: { _id: '$type', total: { $sum: { $toDouble: '$amount' } } } },
  ]);
  const income = round2(byType.find((x) => x._id === 'income')?.total || 0);
  const expense = round2(byType.find((x) => x._id === 'expense')?.total || 0);
  const billing = await billingTotals(from, to);
  const totalIncome = round2(income + billing.paid);
  res.json({ income: income.toFixed(2), expense: expense.toFixed(2), billing, totalIncome: totalIncome.toFixed(2), balance: round2(totalIncome - expense).toFixed(2) });
}));

r.get('/accounting/reports/:type', perm, ah(async (req, res) => {
  const { type } = req.params;
  if (!['income', 'expense'].includes(type)) throw bad('Type must be income or expense.');
  const { from, to } = req.query;
  if (!from || !to) throw bad('A date range (from, to) is required.');
  const entries = await LedgerEntry.find({ type, date: { $gte: new Date(`${from}T00:00:00Z`), $lte: new Date(`${to}T23:59:59Z`) } }).sort({ date: 1 });
  const total = round2(entries.reduce((a, e) => a + num(e.amount), 0));
  const billing = type === 'income' ? await billingTotals(from, to) : null;
  res.json({ type, entries, total: total.toFixed(2), billing });
}));

export default r;
