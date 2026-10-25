import { Router } from 'express';
import { Lab, Prescription, PharmacySale } from '../models/pharmacy.js';
import { LabCategory } from '../models/pharmacy.js';
import { Patient, Doctor } from '../models/clinic.js';
import { Admission, Bed, BedCategory } from '../models/ward.js';
import { Invoice, InvoicePayment } from '../models/billing.js';
import { ah, num, round2, dateStr } from '../util.js';
import { auth, activity, requirePermission } from '../middleware/auth.js';

const r = Router();
r.use(auth, activity);

function range(req, defaultDays = 30) {
  let from = req.query.from ? new Date(`${req.query.from}T00:00:00Z`) : new Date(Date.now() - defaultDays * 86400e3);
  let to = req.query.to ? new Date(`${req.query.to}T23:59:59Z`) : new Date();
  if (from > to) [from, to] = [to, from];
  if ((to - from) / 86400e3 > 366) from = new Date(to.getTime() - 366 * 86400e3);
  return { from, to };
}

r.get('/reports', ah(async (req, res) => {
  res.json({
    cards: [
      { key: 'lab', path: '/reports/lab', permission: 'lab_test_view', title: 'Outstanding lab work' },
      { key: 'drug-usage', path: '/reports/drug-usage', permission: 'view_pharmacy_reports', title: 'Prescribed vs dispensed' },
      { key: 'debtors', path: '/reports/debtors', permission: 'view_payment_reports', title: 'Aged debtors' },
      { key: 'occupancy', path: '/reports/occupancy', permission: null, title: 'Bed occupancy & length of stay' },
      { key: 'accounting', path: '/accounting/reports/income', permission: 'accounting', title: 'Accounting' },
    ],
  });
}));

r.get('/reports/lab', requirePermission('lab_test_view'), ah(async (req, res) => {
  const now = new Date();
  const labs = await Lab.find({ 'tests.result': null }).lean();
  const patients = await Patient.find({ _id: { $in: labs.map((l) => l.patientId) } }).select('name patientId').lean();
  const rows = [];
  for (const lab of labs) {
    const days = Math.floor((now.getTime() - new Date(lab.date).getTime()) / 86400e3);
    for (const test of lab.tests) {
      if (test.result !== null && test.result !== '') continue;
      const p = patients.find((x) => String(x._id) === String(lab.patientId));
      rows.push({ labId: lab._id, testId: test._id, test: test.name, requestedOn: lab.date, patientId: lab.patientId, patientName: p?.name || 'Unknown patient', patientCode: p?.patientId || '', days });
    }
  }
  rows.sort((a, b) => b.days - a.days);
  const byTest = {};
  for (const row of rows) byTest[row.test] = (byTest[row.test] || 0) + 1;
  res.json({
    items: rows,
    overdue: rows.filter((x) => x.days >= 3).length,
    byTest: Object.entries(byTest).map(([test, count]) => ({ test, count })).sort((a, b) => b.count - a.count),
  });
}));

r.get('/reports/drug-usage', requirePermission('view_pharmacy_reports'), ah(async (req, res) => {
  const { from, to } = range(req);
  const prescs = await Prescription.find({ date: { $gte: from, $lte: to } }).select('items').lean();
  const sales = await PharmacySale.find({ date: { $gte: from, $lte: to } }).select('items').lean();
  const prescribed = {};
  for (const p of prescs) for (const it of p.items) prescribed[it.name] = (prescribed[it.name] || 0) + 1;
  const dispensedQ = {};
  const dispensedV = {};
  for (const s of sales) for (const it of s.items) {
    dispensedQ[it.name] = (dispensedQ[it.name] || 0) + it.quantity;
    dispensedV[it.name] = (dispensedV[it.name] || 0) + num(it.lineTotal);
  }
  const names = [...new Set([...Object.keys(prescribed), ...Object.keys(dispensedQ)])];
  const items = names.map((name) => ({
    name,
    prescribed: prescribed[name] || 0,
    dispensed: dispensedQ[name] || 0,
    value: round2(dispensedV[name] || 0).toFixed(2),
  }));
  items.sort((a, b) => (b.dispensed + b.prescribed) - (a.dispensed + a.prescribed));
  res.json({ from: dateStr(from), to: dateStr(to), items, totalValue: round2(items.reduce((a, i) => a + Number(i.value), 0)).toFixed(2) });
}));

r.get('/reports/debtors', requirePermission('view_payment_reports'), ah(async (req, res) => {
  const { from, to } = range(req, 90);
  const invoices = await Invoice.find({ date: { $lte: to } }).lean();
  const pays = await InvoicePayment.find({}).lean();
  const byInv = {};
  for (const p of pays) byInv[String(p.invoiceId)] = (byInv[String(p.invoiceId)] || 0) + num(p.amount);
  const patients = await Patient.find({}).select('name patientId phone').lean();
  const byPatient = {};
  for (const inv of invoices) {
    const paid = round2(byInv[String(inv._id)] || 0);
    const balance = round2(num(inv.grossTotal) - paid);
    if (balance <= 0.001) continue;
    const key = String(inv.patientId);
    if (!byPatient[key]) byPatient[key] = { patientId: inv.patientId, invoices: 0, owed: 0, oldest: inv.date };
    const g = byPatient[key];
    g.invoices += 1;
    g.owed = round2(g.owed + balance);
    if (new Date(inv.date) < new Date(g.oldest)) g.oldest = inv.date;
  }
  const items = Object.values(byPatient).map((g) => ({
    ...g,
    owed: g.owed.toFixed(2),
    days: Math.floor((Date.now() - new Date(g.oldest).getTime()) / 86400e3),
    patientName: patients.find((p) => String(p._id) === String(g.patientId))?.name || 'Unknown patient',
    patientCode: patients.find((p) => String(p._id) === String(g.patientId))?.patientId || '',
    phone: patients.find((p) => String(p._id) === String(g.patientId))?.phone || '',
  }));
  items.sort((a, b) => Number(b.owed) - Number(a.owed));
  const buckets = { '0 to 30 days': 0, '31 to 60 days': 0, '61 to 90 days': 0, 'over 90 days': 0 };
  for (const i of items) {
    const amt = Number(i.owed);
    if (i.days <= 30) buckets['0 to 30 days'] = round2(buckets['0 to 30 days'] + amt);
    else if (i.days <= 60) buckets['31 to 60 days'] = round2(buckets['31 to 60 days'] + amt);
    else if (i.days <= 90) buckets['61 to 90 days'] = round2(buckets['61 to 90 days'] + amt);
    else buckets['over 90 days'] = round2(buckets['over 90 days'] + amt);
  }
  res.json({
    items,
    buckets: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.toFixed(2)])),
    total: round2(items.reduce((a, i) => a + Number(i.owed), 0)).toFixed(2),
  });
}));

r.get('/reports/occupancy', ah(async (req, res) => {
  const { from, to } = range(req);
  const totalBeds = Math.max(1, await Bed.countDocuments());
  const admissions = await Admission.find({
    $or: [{ dTime: null }, { dTime: { $gte: from } }],
    admittedAt: { $lte: to },
  }).lean();
  const bedsMeta = await Bed.find({ _id: { $in: admissions.map((a) => a.bedId) } }).populate('wardId', 'name').lean();
  const wardNames = Object.fromEntries(bedsMeta.map((b) => [String(b._id), b.wardId?.name || 'Removed bed']));
  const byDay = [];
  for (let d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())); d <= to; d = new Date(d.getTime() + 86400e3)) {
    const dayStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayEnd = new Date(dayStart.getTime() + 86399e3);
    const occupied = admissions.filter((a) => new Date(a.admittedAt) <= dayEnd && (a.dTime == null || new Date(a.dTime) >= dayStart)).length;
    byDay.push({ date: dateStr(dayStart), occupied, percent: Math.round((occupied / totalBeds) * 100) });
  }
  const closed = admissions.filter((a) => a.dTime != null);
  const stays = closed.map((a) => Math.max(1, Math.floor((new Date(a.dTime).getTime() - new Date(a.admittedAt).getTime()) / 86400e3)));
  const byWard = {};
  for (const a of admissions) {
    const wardName = wardNames[String(a.bedId)] || 'Removed bed';
    byWard[wardName] = (byWard[wardName] || 0) + 1;
  }
  const avgStay = stays.length ? Math.round((stays.reduce((a, s) => a + s, 0) / stays.length) * 10) / 10 : 0;
  res.json({
    from: dateStr(from),
    to: dateStr(to),
    totalBeds,
    currentlyOccupied: admissions.filter((a) => a.dTime == null).length,
    discharges: closed.length,
    averageStay: avgStay.toFixed(1),
    averageStayDays: avgStay,
    peak: byDay.reduce((a, d) => Math.max(a, d.occupied), 0),
    byWard: Object.entries(byWard).map(([ward, count]) => ({ ward, count })).sort((a, b) => b.count - a.count),
    series: byDay,
  });
}));

export default r;
