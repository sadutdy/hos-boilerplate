import { Router } from 'express';
import mongoose from 'mongoose';
import { MedicineCategory, Medicine, PharmacySale } from '../models/pharmacy.js';
import { Patient } from '../models/clinic.js';
import { Prescription } from '../models/pharmacy.js';
import { ah, bad, notFound, withTxn, round2, toMoney, num } from '../util.js';
import { auth, activity, requirePermission } from '../middleware/auth.js';

const r = Router();
r.use(auth, activity);

r.get('/medicine-categories', requirePermission('medicine_view'), ah(async (req, res) => {
  const items = await MedicineCategory.find().sort({ name: 1 });
  const usage = items.length ? await Medicine.aggregate([{ $group: { _id: '$categoryId', count: { $sum: 1 } } }]) : [];
  res.json({ items, usage: items.map((c) => ({ id: c._id, medicines: usage.find((u) => String(u._id) === String(c._id))?.count || 0 })) });
}));

r.post('/medicine-categories', requirePermission('medicine_add'), ah(async (req, res) => {
  const b = req.body || {};
  if (!b.name) throw bad('Name is required.', 'name');
  if (await MedicineCategory.exists({ name: b.name })) throw bad('That category already exists.', 'name');
  res.json(await MedicineCategory.create({ name: b.name, description: b.description || '' }));
}));

r.put('/medicine-categories/:id', requirePermission('medicine_update'), ah(async (req, res) => {
  const cat = await MedicineCategory.findById(req.params.id);
  if (!cat) throw notFound('Category');
  const b = req.body || {};
  if (!b.name) throw bad('Name is required.', 'name');
  if (await MedicineCategory.exists({ name: b.name, _id: { $ne: cat._id } })) throw bad('That category already exists.', 'name');
  Object.assign(cat, { name: b.name, description: b.description ?? cat.description });
  await cat.save();
  res.json(cat);
}));

r.delete('/medicine-categories/:id', requirePermission('medicine_delete'), ah(async (req, res) => {
  const cat = await MedicineCategory.findById(req.params.id);
  if (!cat) throw notFound('Category');
  if (await Medicine.exists({ categoryId: cat._id })) {
    throw new (await import('../util.js')).HttpError(409, 'That category still has medicines in it.');
  }
  await MedicineCategory.deleteOne({ _id: cat._id });
  res.json({ ok: true });
}));

r.get('/medicines', requirePermission('medicine_view'), ah(async (req, res) => {
  const { q, category, limit = 30, offset = 0 } = req.query;
  const qy = {};
  if (q) {
    const rx = { $regex: q, $options: 'i' };
    qy.$or = ['name', 'generic', 'company'].map((f) => ({ [f]: rx }));
  }
  if (category) qy.categoryId = category;
  const items = await Medicine.find(qy).sort({ name: 1 }).skip(Number(offset)).limit(Math.min(Number(limit), 100));
  const total = await Medicine.countDocuments(qy);
  res.json({ items, total });
}));

r.post('/medicines', requirePermission('medicine_add'), ah(async (req, res) => {
  const b = req.body || {};
  if (!b.name) throw bad('Name is required.', 'name');
  if (b.categoryId && !(await MedicineCategory.exists({ _id: b.categoryId }))) throw bad('That category does not exist.', 'categoryId');
  if (b.price !== undefined && !(Number(b.price) >= 0)) throw bad('Price must be zero or more.', 'price');
  if (b.sellingPrice !== undefined && !(Number(b.sellingPrice) >= 0)) throw bad('Selling price must be zero or more.', 'sellingPrice');
  if (b.quantity !== undefined && !(Number(b.quantity) >= 0)) throw bad('Quantity must be zero or more.', 'quantity');
  if (await Medicine.exists({ name: b.name, box: b.box || '' })) {
    throw bad('That medicine is already in the catalogue with the same pack size.', 'name');
  }
  res.json(await Medicine.create({
    name: b.name,
    categoryId: b.categoryId || null,
    generic: b.generic || '',
    company: b.company || '',
    effects: b.effects || '',
    box: b.box || '',
    price: b.price !== undefined ? toMoney(b.price) : null,
    sellingPrice: b.sellingPrice !== undefined ? toMoney(b.sellingPrice) : null,
    quantity: b.quantity ?? 0,
    expiryDate: b.expiryDate ? new Date(b.expiryDate) : null,
  }));
}));

r.put('/medicines/:id', requirePermission('medicine_update'), ah(async (req, res) => {
  const doc = await Medicine.findById(req.params.id);
  if (!doc) throw notFound('Medicine');
  const b = req.body || {};
  if (b.name !== undefined && !b.name) throw bad('Name is required.', 'name');
  if (await Medicine.exists({ name: b.name ?? doc.name, box: b.box !== undefined ? b.box : doc.box, _id: { $ne: doc._id } })) {
    throw bad('That medicine is already in the catalogue with the same pack size.', 'name');
  }
  Object.assign(doc, {
    name: b.name ?? doc.name,
    categoryId: b.categoryId !== undefined ? (b.categoryId || null) : doc.categoryId,
    generic: b.generic ?? doc.generic,
    company: b.company ?? doc.company,
    effects: b.effects ?? doc.effects,
    box: b.box ?? doc.box,
    price: b.price !== undefined ? toMoney(b.price) : doc.price,
    sellingPrice: b.sellingPrice !== undefined ? toMoney(b.sellingPrice) : doc.sellingPrice,
    quantity: b.quantity !== undefined ? Number(b.quantity) : doc.quantity,
    expiryDate: b.expiryDate !== undefined ? (b.expiryDate ? new Date(b.expiryDate) : null) : doc.expiryDate,
  });
  await doc.save();
  res.json(doc);
}));

r.delete('/medicines/:id', requirePermission('medicine_delete'), ah(async (req, res) => {
  const doc = await Medicine.findById(req.params.id);
  if (!doc) throw notFound('Medicine');
  if (await Prescription.exists({ 'items.medicineId': doc._id })) {
    throw new (await import('../util.js')).HttpError(409, `${doc.name} has been prescribed, so it stays in the catalogue.`);
  }
  await Medicine.deleteOne({ _id: doc._id });
  res.json({ ok: true });
}));

r.get('/pharmacy-sales', requirePermission('pharmacy_stock_view'), ah(async (req, res) => {
  const { from, to, limit = 25, offset = 0 } = req.query;
  const qy = {};
  if (from || to) {
    qy.date = {};
    if (from) qy.date.$gte = new Date(`${from}T00:00:00Z`);
    if (to) qy.date.$lte = new Date(`${to}T23:59:59Z`);
  }
  const sales = await PharmacySale.find(qy).sort({ _id: -1 }).skip(Number(offset)).limit(Math.min(Number(limit), 100));
  const total = await PharmacySale.countDocuments(qy);

  // Fetch patient details for sales with patientId
  const patientIds = [...new Set(sales.filter(s => s.patientId).map(s => s.patientId.toString()))];
  const patients = patientIds.length > 0
    ? await Patient.find({ _id: { $in: patientIds } }).select('name patientId').lean()
    : [];
  const patientMap = new Map(patients.map(p => [p._id.toString(), { name: p.name, patientId: p.patientId }]));

  const items = sales.map(sale => {
    const patient = sale.patientId ? patientMap.get(sale.patientId.toString()) : null;
    return {
      ...sale.toJSON(),
      patientName: patient?.name || 'Counter sale',
      patientCode: patient?.patientId || '',
    };
  });

  const takings = items.reduce((a, s) => a + num(s.grossTotal), 0);
  res.json({ items, total, takings: takings.toFixed(2) });
}));

r.get('/pharmacy-sales/create-data', requirePermission('pharmacy_sale'), ah(async (req, res) => {
  const medicines = await Medicine.find({ quantity: { $gt: 0 } }).sort({ name: 1 }).limit(500).select('name generic quantity sellingPrice box');
  let prescription = null;
  if (req.query.prescription && mongoose.isValidObjectId(req.query.prescription)) {
    prescription = await Prescription.findById(req.query.prescription).lean();
  }
  let patient = null;
  if (req.query.patient && mongoose.isValidObjectId(req.query.patient)) {
    patient = await Patient.findById(req.query.patient).select('name patientId');
  }
  res.json({ medicines, prescription, patient });
}));

r.post('/pharmacy-sales', requirePermission('pharmacy_sale'), ah(async (req, res) => {
  const b = req.body || {};
  if (!(Array.isArray(b.items) && b.items.length)) throw bad('Add at least one item.', 'items');

  let items = b.items.map((it) => ({ medicineId: it.medicineId || null, name: it.name || null, quantity: Number(it.quantity), unitPrice: it.unitPrice !== undefined && it.unitPrice !== null && it.unitPrice !== '' ? Number(it.unitPrice) : null }))
    .filter((it) => it.medicineId || (it.name && it.name.trim()));
  if (!items.length) throw bad('Add at least one item.', 'items');
  for (const it of items) {
    if (!(it.quantity >= 1)) throw bad('Quantity must be at least 1.', 'items');
  }

  const sale = await withTxn(async (session) => {
    const catalogs = {};
    for (const it of items) {
      if (it.medicineId) {
        if (!catalogs[it.medicineId]) {
          const med = await Medicine.findById(it.medicineId).session(session);
          if (!med) throw bad(`Medicine ${it.medicineId} does not exist.`, 'items');
          catalogs[it.medicineId] = med;
        }
        const med = catalogs[it.medicineId];
        it.name = med.name;
      }
    }
    const wanted = {};
    for (const it of items) if (it.medicineId) wanted[it.medicineId] = (wanted[it.medicineId] || 0) + it.quantity;
    for (const [medId, qty] of Object.entries(wanted)) {
      const med = catalogs[medId];
      const dec = await Medicine.updateOne(
        { _id: med._id, quantity: { $gte: qty } },
        { $inc: { quantity: -qty } },
        { session }
      );
      if (dec.matchedCount === 0) {
        throw bad(`Only ${med.quantity} of ${med.name} left in stock, and the sale asks for ${qty}.`, 'items');
      }
    }
    for (const it of items) {
      const med = catalogs[it.medicineId];
      it.unitPrice = it.unitPrice !== null ? it.unitPrice : num(med?.sellingPrice) || 0;
      it.lineTotal = round2(it.unitPrice * it.quantity);
    }
    const amount = round2(items.reduce((a, it) => a + it.lineTotal, 0));
    const discount = round2(Number(b.discount) || 0);
    const vat = round2(Number(b.vat) || 0);
    const grossTotal = round2(Math.max(0, amount - discount + vat));
    if (discount > amount) throw bad('The discount is larger than the sale.', 'discount');
    const amountReceived = b.amountReceived !== undefined && b.amountReceived !== '' ? round2(Number(b.amountReceived)) : grossTotal;
    const doc = new PharmacySale({
      patientId: b.patientId || null,
      date: b.date ? new Date(b.date) : new Date(),
      items: items.map((it) => ({ ...it, unitPrice: toMoney(it.unitPrice), lineTotal: toMoney(it.lineTotal) })),
      amount: toMoney(amount),
      discount: toMoney(discount),
      vat: toMoney(vat),
      grossTotal: toMoney(grossTotal),
      amountReceived: toMoney(amountReceived),
      status: 'paid',
      saleUserId: req.user.sub,
    });
    await doc.save({ session });
    return doc;
  });
  res.json(sale);
}));

r.get('/pharmacy-sales/:id', requirePermission('pharmacy_stock_view'), ah(async (req, res) => {
  const doc = await PharmacySale.findById(req.params.id);
  if (!doc) throw notFound('Sale');
  const sale = doc.toJSON();
  const patient = sale.patientId ? await Patient.findById(sale.patientId).select('name patientId') : null;
  res.json({ ...sale, patientName: patient?.name || 'Counter sale', patientCode: patient?.patientId || '' });
}));

r.delete('/pharmacy-sales/:id', requirePermission('pharmacy_sale'), ah(async (req, res) => {
  const doc = await PharmacySale.findById(req.params.id);
  if (!doc) throw notFound('Sale');
  await withTxn(async (session) => {
    for (const it of doc.items) {
      if (it.medicineId) {
        await Medicine.updateOne({ _id: it.medicineId }, { $inc: { quantity: it.quantity } }, { session });
      }
    }
    await PharmacySale.deleteOne({ _id: doc._id }, { session });
  });
  res.json({ ok: true, message: 'Sale reversed and stock returned.' });
}));

export default r;
