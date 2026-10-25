import { Router } from 'express';
import mongoose from 'mongoose';
import { Prescription, LabCategory, Lab } from '../models/pharmacy.js';
import { Patient, Doctor } from '../models/clinic.js';
import { Medicine } from '../models/pharmacy.js';
import { ah, bad, notFound, withTxn, dateStr } from '../util.js';
import { auth, activity, requirePermission } from '../middleware/auth.js';

const r = Router();
r.use(auth, activity);

async function cleanPrescriptionItems(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (const it of items) {
    let name = it.name || null;
    if (it.medicineId) {
      const med = await Medicine.findById(it.medicineId);
      if (!med) throw bad(`Medicine ${it.medicineId} does not exist.`, 'items');
      name = med.name;
    }
    if (!name || !name.trim()) continue;
    out.push({
      medicineId: it.medicineId || null,
      name,
      dosage: it.dosage || null,
      duration: it.duration || null,
      instructions: it.instructions || null,
    });
  }
  return out;
}

function rxSummary(items) {
  return items.map((it) => [it.name, it.dosage, it.duration ? `for ${it.duration}` : null].filter(Boolean).join(' ')).join(', ').slice(0, 1000);
}

r.get('/prescriptions', requirePermission('prescription_view'), ah(async (req, res) => {
  const { patient, doctor, drug, limit = 25, offset = 0 } = req.query;
  const qy = {};
  if (patient) {
    if (!mongoose.isValidObjectId(patient)) throw bad('Patient filter must be an id.', 'patient');
    qy.patientId = patient;
  }
  if (doctor) {
    if (!mongoose.isValidObjectId(doctor)) throw bad('Doctor filter must be an id.', 'doctor');
    qy.doctorId = doctor;
  }
  if (drug) qy['items.name'] = { $regex: drug, $options: 'i' };
  const items = await Prescription.find(qy).sort({ _id: -1 }).skip(Number(offset)).limit(Math.min(Number(limit), 100));
  const total = await Prescription.countDocuments(qy);
  const patients = await Patient.find({ _id: { $in: items.map((p) => p.patientId) } }).select('name').lean();
  const doctors = await Doctor.find({ _id: { $in: items.map((p) => p.doctorId) } }).select('name').lean();
  res.json({
    items: items.map((p) => p.toObject()),
    enriched: null,
    patientNames: Object.fromEntries(patients.map((p) => [p._id, p.name])),
    doctorNames: Object.fromEntries(doctors.map((d) => [d._id, d.name])),
    total,
  });
}));

r.post('/prescriptions', requirePermission('prescription_add'), ah(async (req, res) => {
  const b = req.body || {};
  if (!b.patientId) throw bad('Patient is required.', 'patientId');
  if (!b.doctorId) throw bad('Doctor is required.', 'doctorId');
  const items = await cleanPrescriptionItems(b.items);
  if (!items.length) throw bad('Add at least one medicine.', 'items');
  const doc = await Prescription.create({
    patientId: b.patientId,
    doctorId: b.doctorId,
    date: b.date ? new Date(b.date) : new Date(),
    symptom: b.symptom || null,
    advice: b.advice || null,
    note: b.note || null,
    validity: b.validity || null,
    items,
    summary: rxSummary(items),
    createdBy: req.user.sub,
  });
  res.json(doc);
}));

r.get('/prescriptions/on-drug', requirePermission('prescription_view'), ah(async (req, res) => {
  const { drug } = req.query;
  if (!drug) throw bad('A drug name is required.', 'drug');
  const docs = await Prescription.find({ 'items.name': { $regex: drug, $options: 'i' } }).select('patientId date items');
  const patients = await Patient.find({ _id: { $in: docs.map((d) => d.patientId) } }).select('name patientId').lean();
  res.json({
    items: docs.map((d) => {
      const p = patients.find((x) => String(x._id) === String(d.patientId));
      return { prescriptionId: d._id, date: d.date, patientId: d.patientId, patientName: p?.name || 'Removed', patientCode: p?.patientId || '', onThisDrug: d.items.filter((i) => i.name.toLowerCase().includes(drug.toLowerCase())) };
    }),
  });
}));

r.get('/prescriptions/:id', requirePermission('prescription_view'), ah(async (req, res) => {
  const doc = await Prescription.findById(req.params.id);
  if (!doc) throw notFound('Prescription');
  const patient = await Patient.findById(doc.patientId).select('name patientId');
  const doctor = await Doctor.findById(doc.doctorId).select('name');
  res.json({ ...doc.toObject(), patientName: patient?.name || 'Unknown', patientCode: patient?.patientId || '', doctorName: doctor?.name || 'Removed' });
}));

r.put('/prescriptions/:id', requirePermission('prescription_update'), ah(async (req, res) => {
  const doc = await Prescription.findById(req.params.id);
  if (!doc) throw notFound('Prescription');
  const b = req.body || {};
  const items = await cleanPrescriptionItems(b.items);
  if (!items.length) throw bad('Add at least one medicine.', 'items');
  Object.assign(doc, {
    date: b.date !== undefined ? new Date(b.date) : doc.date,
    symptom: b.symptom ?? doc.symptom,
    advice: b.advice ?? doc.advice,
    note: b.note ?? doc.note,
    validity: b.validity ?? doc.validity,
    items,
    summary: rxSummary(items),
  });
  await doc.save();
  res.json(doc);
}));

r.delete('/prescriptions/:id', requirePermission('prescription_delete'), ah(async (req, res) => {
  await Prescription.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
}));

r.get('/lab-categories', requirePermission('lab_test_view'), ah(async (req, res) => {
  const items = await LabCategory.find().sort({ name: 1 });
  const usage = items.length ? await Lab.aggregate([{ $unwind: '$tests' }, { $group: { _id: '$tests.labCategoryId', count: { $sum: 1 } } }]) : [];
  res.json({ items, usage: items.map((c) => ({ id: c._id, requests: usage.filter((u) => String(u._id) === String(c._id)).reduce((a, u) => a + u.count, 0) })) });
}));

r.post('/lab-categories', requirePermission('lab_test_add'), ah(async (req, res) => {
  const b = req.body || {};
  if (!b.name) throw bad('Name is required.', 'name');
  if (await LabCategory.exists({ name: b.name })) throw bad('That test is already in the catalogue.', 'name');
  res.json(await LabCategory.create({ name: b.name, description: b.description || '', referenceValue: b.referenceValue || '', procedureId: b.procedureId || '' }));
}));

r.put('/lab-categories/:id', requirePermission('lab_test_update'), ah(async (req, res) => {
  const cat = await LabCategory.findById(req.params.id);
  if (!cat) throw notFound('Test');
  const b = req.body || {};
  if (!b.name) throw bad('Name is required.', 'name');
  if (await LabCategory.exists({ name: b.name, _id: { $ne: cat._id } })) throw bad('That test is already in the catalogue.', 'name');
  Object.assign(cat, { name: b.name, description: b.description ?? cat.description, referenceValue: b.referenceValue ?? cat.referenceValue });
  await cat.save();
  res.json(cat);
}));

r.delete('/lab-categories/:id', requirePermission('lab_test_delete'), ah(async (req, res) => {
  const cat = await LabCategory.findById(req.params.id);
  if (!cat) throw notFound('Test');
  if (await Lab.exists({ 'tests.labCategoryId': cat._id })) {
    throw new (await import('../util.js')).HttpError(409, `${cat.name} has been requested, so it stays in the catalogue.`);
  }
  await LabCategory.deleteOne({ _id: cat._id });
  res.json({ ok: true });
}));

r.get('/labs', requirePermission('lab_test_view'), ah(async (req, res) => {
  const { patient, status = 'pending', limit = 25, offset = 0 } = req.query;
  const qy = {};
  if (patient) {
    if (!mongoose.isValidObjectId(patient)) throw bad('Patient filter must be an id.', 'patient');
    qy.patientId = patient;
  }
  // pending = any unreported test (derived status requested or partial): the technician queue.
  if (status === 'pending') qy['tests.result'] = null;
  else if (status === 'partial' || status === 'reported') qy.status = status;
  // 'any' kept as an alias so links made before the rename still work.
  else if (status !== 'all' && status !== 'any') throw bad('Unknown status filter.', 'status');
  const items = await Lab.find(qy).sort({ _id: -1 }).skip(Number(offset)).limit(Math.min(Number(limit), 100));
  const total = await Lab.countDocuments(qy);
  const patients = await Patient.find({ _id: { $in: items.map((l) => l.patientId) } }).select('name').lean();
  res.json({ items, patientNames: Object.fromEntries(patients.map((p) => [p._id, p.name])), total });
}));

r.post('/labs', requirePermission('lab_test_add'), ah(async (req, res) => {
  const b = req.body || {};
  if (!b.patientId) throw bad('Patient is required.', 'patientId');
  if (!b.date) throw bad('Date is required.', 'date');
  if (!Array.isArray(b.testIds) || !b.testIds.length) throw bad('Add at least one test.', 'tests');
  if (b.testIds.some((t) => !mongoose.isValidObjectId(t))) throw bad('One of the tests does not exist.', 'tests');
  const patient = await Patient.findById(b.patientId);
  if (!patient) throw bad('That patient does not exist.', 'patientId');
  const doctor = b.doctorId ? await Doctor.findById(b.doctorId) : null;
  if (b.doctorId && !doctor) throw bad('That doctor does not exist.', 'doctorId');
  const cats = await LabCategory.find({ _id: { $in: b.testIds } });
  if (cats.length !== b.testIds.length) throw bad('One of the tests does not exist.', 'tests');

  const doc = await Lab.create({
    patientId: patient._id,
    doctorId: doctor?._id || null,
    date: new Date(b.date),
    tests: cats.map((c) => ({ labCategoryId: c._id, name: c.name, referenceValue: c.referenceValue || null, result: null, status: 'requested' })),
    status: 'requested',
    patientName: patient.name,
    patientPhone: patient.phone,
    patientAddress: patient.address,
    doctorName: doctor?.name || null,
    requestUserId: req.user.sub,
  });
  res.json(doc);
}));

function deriveStatus(tests) {
  const reported = tests.filter((t) => t.result && t.result !== '').length;
  return reported === 0 ? 'requested' : reported === tests.length ? 'reported' : 'partial';
}

r.get('/labs/:id', requirePermission('lab_test_view'), ah(async (req, res) => {
  const doc = await Lab.findById(req.params.id);
  if (!doc) throw notFound('Lab request');
  const patient = await Patient.findById(doc.patientId).select('name patientId');
  const doctor = doc.doctorId ? await Doctor.findById(doc.doctorId).select('name') : null;
  res.json({ ...doc.toObject(), patientName: patient?.name, patientCode: patient?.patientId, doctorName: doctor?.name || null });
}));

r.put('/labs/:id', requirePermission('lab_test_update'), ah(async (req, res) => {
  const doc = await Lab.findById(req.params.id);
  if (!doc) throw notFound('Lab request');
  const b = req.body || {};

  if (b.date !== undefined) {
    if (!b.date) throw bad('Date is required.', 'date');
    doc.date = new Date(b.date);
  }
  if (b.doctorId !== undefined) {
    if (b.doctorId) {
      const doctor = await Doctor.findById(b.doctorId);
      if (!doctor) throw bad('That doctor does not exist.', 'doctorId');
      doc.doctorId = doctor._id;
      doc.doctorName = doctor.name;
    } else {
      doc.doctorId = null;
      doc.doctorName = null;
    }
  }

  // Attach: append snapshot rows for catalogue ids, skipping tests already present.
  for (const catId of (Array.isArray(b.addTestIds) ? b.addTestIds : [])) {
    const cat = await LabCategory.findById(catId);
    if (!cat) throw bad('One of the tests does not exist.', 'addTestIds');
    if (doc.tests.some((t) => String(t.labCategoryId) === String(cat._id))) continue;
    doc.tests.push({ labCategoryId: cat._id, name: cat.name, referenceValue: cat.referenceValue || null, result: null, status: 'requested' });
  }

  // Remove: match test subdoc ids or catalogue ids; reported results vanish with the row.
  const removeKeys = new Set((Array.isArray(b.removeTestIds) ? b.removeTestIds : []).map(String));
  if (removeKeys.size) {
    doc.tests = doc.tests.filter((t) => !removeKeys.has(String(t._id)) && !removeKeys.has(String(t.labCategoryId)));
  }

  if (!doc.tests.length) throw bad('The request must keep at least one test.', 'tests');
  doc.status = deriveStatus(doc.tests);
  doc.reportedAt = doc.status === 'reported' ? (doc.reportedAt || new Date()) : null;
  await doc.save();
  res.json(doc);
}));

r.post('/labs/:id/results', requirePermission('lab_test_update'), ah(async (req, res) => {
  const doc = await Lab.findById(req.params.id);
  if (!doc) throw notFound('Lab request');
  const results = req.body?.results || {};
  await withTxn(async (session) => {
    const fresh = await Lab.findById(doc._id).session(session);
    for (const test of fresh.tests) {
      const incoming = results[String(test.labCategoryId)] ?? results[test._id ? String(test._id) : ''];
      if (incoming === undefined) continue;
      const blank = incoming === null || incoming === '';
      if (blank && test.result !== null && test.result !== '') continue;
      if (!blank) {
        test.result = String(incoming).slice(0, 1000);
        test.status = 'reported';
        test.reportedAt = new Date();
      }
    }
    await Lab.updateOne({ _id: fresh._id }, { $set: { tests: fresh.tests } }, { session });
    fresh.status = deriveStatus(fresh.tests);
    await Lab.updateOne({ _id: fresh._id }, { $set: { status: fresh.status, reportedAt: fresh.status === 'reported' ? new Date() : null } }, { session });
  });
  const out = await Lab.findById(doc._id);
  res.json(out);
}));

r.delete('/labs/:id', requirePermission('lab_test_delete'), ah(async (req, res) => {
  await Lab.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
}));

export default r;
