import { Router } from 'express';
import mongoose from 'mongoose';
import { Invoice, InvoicePayment } from '../models/billing.js';
import { Patient, Service, Doctor } from '../models/clinic.js';
import { ah, bad, notFound, withTxn, round2, toMoney, num, HttpError } from '../util.js';
import { auth, activity, requirePermission } from '../middleware/auth.js';

const r = Router();
r.use(auth, activity);

const TOL = 0.004;

async function paidAmount(invoiceId, session = null) {
  const prove = await InvoicePayment.aggregate([
    { $match: { invoiceId: new mongoose.Types.ObjectId(String(invoiceId)) } },
    { $group: { _id: null, total: { $sum: { $toDouble: '$amount' } } } },
  ]);
  return round2(prove[0]?.total || 0);
}

function settlement(paid, balance) {
  if (paid <= 0) return 'unpaid';
  if (balance > TOL) return 'part paid';
  return 'paid';
}

async function invoiceView(invoice) {
  const paid = await paidAmount(invoice._id);
  const balance = round2(num(invoice.grossTotal) - paid);
  const payments = await InvoicePayment.find({ invoiceId: invoice._id }).sort({ paidAt: 1 }).lean();
  return {
    ...invoice.toObject(),
    paid: paid.toFixed(2),
    balance: balance.toFixed(2),
    settlement: settlement(paid, balance),
    payments: payments.map((p) => ({ ...p, amount: num(p.amount).toFixed(2) })),
    patientName: invoice.patientName,
    patientPhone: invoice.patientPhone,
    patientAddress: invoice.patientAddress,
    doctorName: invoice.doctorName || null,
  };
}

r.get('/invoices', requirePermission('invoice_view'), ah(async (req, res) => {
  const { patient, show = 'outstanding', limit = 200 } = req.query;
  const qy = {};
  if (patient) {
    if (!mongoose.isValidObjectId(patient)) throw bad('Patient filter must be an id.', 'patient');
    qy.patientId = patient;
  }
  const items = await Invoice.find(qy).sort({ _id: -1 }).limit(Math.min(Number(limit), 200)).lean();
  let withMoney = [];
  for (const inv of items) {
    const paid = await paidAmount(inv._id);
    const balance = round2(num(inv.grossTotal) - paid);
    withMoney.push({ ...inv, paid: paid.toFixed(2), balance: balance.toFixed(2), settlement: settlement(paid, balance) });
  }
  if (show === 'outstanding') withMoney = withMoney.filter((i) => parseFloat(i.balance) > TOL);
  else if (show === 'settled') withMoney = withMoney.filter((i) => parseFloat(i.balance) <= TOL);
  const owed = withMoney.reduce((a, i) => a + Math.max(0, parseFloat(i.balance)), 0);
  res.json({
    items: withMoney.map((i) => ({ ...i, balance: parseFloat(i.balance).toFixed(2) })),
    total: withMoney.length,
    owed: owed.toFixed(2),
  });
}));

r.get('/invoices/create-data', requirePermission('payment_add'), ah(async (req, res) => {
  const patients = await Patient.find().sort({ name: 1 }).select('name patientId');
  const doctors = await Doctor.find().sort({ name: 1 }).select('name');
  const services = await Service.find().sort({ name: 1 });
  let patient = null;
  if (req.query.patient && mongoose.isValidObjectId(req.query.patient)) {
    patient = await Patient.findById(req.query.patient).select('name patientId');
  }
  res.json({ patients, doctors, services, patient });
}));

r.post('/invoices', requirePermission('payment_add'), ah(async (req, res) => {
  const b = req.body || {};
  if (!b.patientId) throw bad('Patient is required.', 'patientId');
  if (!b.date) throw bad('Date is required.', 'date');
  const patient = await Patient.findById(b.patientId);
  if (!patient) throw bad('That patient does not exist.', 'patientId');
  const doctor = b.doctorId ? await Doctor.findById(b.doctorId) : null;
  if (b.doctorId && !doctor) throw bad('That doctor does not exist.', 'doctorId');

  let items = await (async () => {
    const out = [];
    for (const it of b.items || []) {
      let name = it.name || null;
      let defaultPrice = 0;
      if (it.serviceId) {
        const svc = await Service.findById(it.serviceId);
        if (!svc) throw bad('One of the charges does not exist on the price list.', 'items');
        name = svc.name;
        defaultPrice = num(svc.price);
      }
      const quantity = Number(it.quantity ?? 1);
      if (!name || !String(name).trim() || !(quantity >= 1)) continue;
      const unitPrice = it.unitPrice !== undefined && it.unitPrice !== null && it.unitPrice !== '' ? round2(Number(it.unitPrice)) : defaultPrice;
      out.push({ serviceId: it.serviceId || null, name, quantity, unitPrice, lineTotal: round2(unitPrice * quantity) });
    }
    return out;
  })();
  if (!items.length) throw bad('Add at least one charge to the invoice.', 'items');
  const amount = round2(items.reduce((a, it) => a + it.lineTotal, 0));
  const discount = round2(Number(b.discount) || 0);
  if (discount > amount) throw bad('The discount is larger than the invoice.', 'discount');
  const vat = round2(Number(b.vat) || 0);
  const grossTotal = round2(amount - discount + vat);

  const invoice = await Invoice.create({
    patientId: patient._id,
    patientName: patient.name,
    patientPhone: patient.phone || '',
    patientAddress: patient.address || '',
    doctorId: doctor?._id || null,
    doctorName: doctor?.name || '',
    date: new Date(b.date),
    items: items.map((it) => ({ ...it, unitPrice: toMoney(it.unitPrice), lineTotal: toMoney(it.lineTotal) })),
    amount: toMoney(amount),
    discount: toMoney(discount),
    vat: toMoney(vat),
    grossTotal: toMoney(grossTotal),
    remarks: b.remarks || '',
    depositType: b.depositType || '',
    createdBy: req.user.sub,
  });
  res.json(await invoiceView(invoice));
}));

r.get('/invoices/:id', requirePermission('invoice_view'), ah(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) throw notFound('Invoice');
  res.json(await invoiceView(invoice));
}));

r.post('/invoices/:id/pay', requirePermission('payment_add'), ah(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) throw notFound('Invoice');
  const b = req.body || {};
  const amount = round2(Number(b.amount));
  if (!(amount > 0)) throw bad('An amount above zero is required.', 'amount');
  const method = (b.method || '').slice(0, 60) || null;
  const reference = (b.reference || '').slice(0, 120) || null;

  const payment = await withTxn(async (session) => {
    const fresh = await Invoice.findById(invoice._id).session(session);
    const paidRows = await InvoicePayment.find({ invoiceId: invoice._id }).session(session);
    const paid = round2(paidRows.reduce((a, p) => a + num(p.amount), 0));
    const balance = round2(num(fresh.grossTotal) - paid);
    if (amount > balance + TOL) {
      throw bad(`Only ${balance.toFixed(2)} is outstanding on this invoice.`, 'amount');
    }
    const doc = new InvoicePayment({ invoiceId: invoice._id, amount: toMoney(amount), method, reference, paidAt: new Date() });
    await doc.save({ session });
    return doc;
  });
  res.json({ ok: true, paymentId: payment._id });
}));

r.delete('/invoices/:id', requirePermission('payment_delete'), ah(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) throw notFound('Invoice');
  const paid = await paidAmount(invoice._id);
  if (paid > 0) {
    throw new HttpError(409, 'Money has been taken against this invoice, so it cannot be deleted.');
  }
  await withTxn(async (session) => {
    await InvoicePayment.deleteMany({ invoiceId: invoice._id }, { session });
    await Invoice.deleteOne({ _id: invoice._id }, { session });
  });
  res.json({ ok: true });
}));

export default r;
