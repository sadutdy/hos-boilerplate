import { Router } from 'express';
import mongoose from 'mongoose';
import { BedCategory, Bed, Admission } from '../models/ward.js';
import { Patient } from '../models/clinic.js';
import { ah, bad, notFound, withTxn, conflict, dateStr } from '../util.js';
import { auth, activity, requirePermission } from '../middleware/auth.js';

const r = Router();
r.use(auth, activity);

async function occupiedInfo() {
  const open = await Admission.find({ dTime: null }).lean();
  const map = new Map(open.map((a) => [String(a.bedId), a]));
  const patients = open.length ? await Patient.find({ _id: { $in: open.map((a) => a.patientId) } }).select('name').lean() : [];
  return { open, map, patientName: (id) => patients.find((p) => String(p._id) === String(id))?.name || 'Unknown patient' };
}

r.get('/beds', requirePermission('bed_view'), ah(async (req, res) => {
  const { ward } = req.query;
  const qy = ward ? { wardId: ward } : {};
  const beds = await Bed.find(qy).populate('wardId', 'name').lean();
  const { map, patientName } = await occupiedInfo();
  const categories = await BedCategory.find().lean();
  res.json({
    beds: beds.map((b) => {
      const admission = map.get(String(b._id));
      const wardName = b.wardId?.name || (categories.find((c) => String(c._id) === String(b.wardId))?.name) || 'Removed ward';
      return {
        ...b,
        wardName: typeof b.wardId === 'object' ? wardName : wardName,
        occupied: !!admission,
        occupancy: admission ? { admissionId: admission._id, patientName: patientName(admission.patientId), since: admission.admittedAt } : null,
      };
    }),
    categories,
    freeCount: beds.filter((b) => !map.has(String(b._id))).length,
    totalCount: beds.length,
  });
}));

r.get('/beds/categories', requirePermission('ward_view'), ah(async (req, res) => {
  const categories = await BedCategory.find().sort({ name: 1 });
  const usage = await Bed.aggregate([{ $group: { _id: '$wardId', count: { $sum: 1 } } }]);
  res.json({ items: categories, usage: categories.map((c) => ({ id: c._id, beds: usage.find((u) => String(u._id) === String(c._id))?.count || 0 })) });
}));

const wardAdd = requirePermission('ward_add');
r.post('/beds/categories', wardAdd, ah(async (req, res) => {
  const b = req.body || {};
  if (!b.name) throw bad('Name is required.', 'name');
  res.json(await BedCategory.create({ name: b.name, description: b.description || '' }));
}));

r.delete('/beds/categories/:id', requirePermission('ward_delete'), ah(async (req, res) => {
  const cat = await BedCategory.findById(req.params.id);
  if (!cat) throw notFound('Ward');
  if (await Bed.exists({ wardId: cat._id })) {
    throw conflict(`That ward already has beds in it.`);
  }
  await BedCategory.deleteOne({ _id: cat._id });
  res.json({ ok: true });
}));

async function validateBed(b, selfId = null) {
  if (!b.wardId) throw bad('Ward is required.', 'wardId');
  if (!b.number) throw bad('Bed number is required.', 'number');
  if (!(await BedCategory.exists({ _id: b.wardId }))) throw bad('That ward does not exist.', 'wardId');
  const dup = await Bed.findOne({ wardId: b.wardId, number: b.number, ...(selfId ? { _id: { $ne: selfId } } : {}) });
  if (dup) throw bad(`That ward already has a bed numbered ${b.number}.`, 'number');
  return b;
}

r.post('/beds', wardAdd, ah(async (req, res) => {
  const b = await validateBed(req.body || {});
  res.json(await Bed.create({ wardId: b.wardId, number: b.number, description: b.description || '', status: 'free' }));
}));

r.put('/beds/:id', requirePermission('ward_update'), ah(async (req, res) => {
  const bed = await Bed.findById(req.params.id);
  if (!bed) throw notFound('Bed');
  const b = await validateBed(req.body || {}, bed._id);
  Object.assign(bed, { wardId: b.wardId, number: b.number, description: b.description ?? bed.description });
  await bed.save();
  res.json(bed);
}));

r.delete('/beds/:id', requirePermission('ward_delete'), ah(async (req, res) => {
  const bed = await Bed.findById(req.params.id);
  if (!bed) throw notFound('Bed');
  if (await Admission.exists({ bedId: bed._id, dTime: null })) {
    throw conflict(`Bed ${bed.number} is occupied. Discharge the patient first.`);
  }
  await Bed.deleteOne({ _id: bed._id });
  res.json({ ok: true });
}));

r.get('/admissions', requirePermission('admission_view'), ah(async (req, res) => {
  const show = req.query.show || 'current';
  const qy = show === 'current' ? { dTime: null } : show === 'discharged' ? { dTime: { $ne: null } } : {};
  const items = await Admission.find(qy).sort({ admittedAt: -1 }).limit(200);
  const patients = await Patient.find({ _id: { $in: items.map((a) => a.patientId) } }).select('name').lean();
  const beds = await Bed.find({ _id: { $in: items.map((a) => a.bedId) } }).select('number wardId').lean();
  const wards = await BedCategory.find().lean();
  res.json({
    items: items.map((a) => {
      const bed = beds.find((b) => String(b._id) === String(a.bedId));
      const ward = wards.find((w) => String(w._id) === String(bed?.wardId || a.wardId));
      return {
        ...a.toObject(),
        patientName: patients.find((p) => String(p._id) === String(a.patientId))?.name || 'Unknown patient',
        bedNumber: bed?.number || a.number || 'Removed bed',
        wardName: ward?.name || 'Removed ward',
      };
    }),
  });
}));

r.get('/admissions/create-data', requirePermission('admission_add'), ah(async (req, res) => {
  const patients = await Patient.find().sort({ name: 1 }).select('name patientId');
  const beds = await Bed.find().populate('wardId', 'name').lean();
  const { map } = await occupiedInfo();
  res.json({
    patients,
    beds: beds.filter((b) => !map.has(String(b._id))).map((b) => ({ id: b._id, number: b.number, wardName: b.wardId?.name || '' })),
  });
}));

r.post('/admissions', requirePermission('admission_add'), ah(async (req, res) => {
  const b = req.body || {};
  if (!b.patientId) throw bad('Patient is required.', 'patientId');
  if (!b.bedId) throw bad('Bed is required.', 'bedId');
  const patient = await Patient.findById(b.patientId);
  if (!patient) throw bad('That patient does not exist.', 'patientId');
  const bed = await Bed.findById(b.bedId);
  if (!bed) throw bad('That bed does not exist.', 'bedId');
  const admittedAt = b.admittedAt ? new Date(b.admittedAt) : new Date();

  const admission = await withTxn(async (session) => {
    if (await Admission.exists({ bedId: bed._id, dTime: null }).session(session)) {
      throw bad('That bed is already occupied.', 'bedId');
    }
    if (await Admission.exists({ patientId: patient._id, dTime: null }).session(session)) {
      throw bad('That patient is already admitted. Discharge them first.', 'patientId');
    }
    const doc = new Admission({
      patientId: patient._id,
      bedId: bed._id,
      number: bed.number,
      wardId: bed.wardId,
      admittedAt,
      dTime: null,
      status: 'admitted',
      createdBy: req.user.sub,
    });
    await doc.save({ session });
    await Bed.updateOne({ _id: bed._id }, { status: 'occupied', lastAdmittedAt: admittedAt }, { session });
    return doc;
  });
  res.json(admission);
}));

r.get('/admissions/:id', requirePermission('admission_view'), ah(async (req, res) => {
  const doc = await Admission.findById(req.params.id);
  if (!doc) throw notFound('Admission');
  const patient = await Patient.findById(doc.patientId).select('name patientId');
  const bed = await Bed.findById(doc.bedId).select('number wardId');
  res.json({ ...doc.toObject(), patientName: patient?.name, patientCode: patient?.patientId, bedNumber: bed?.number || doc.number });
}));

r.post('/admissions/:id/discharge', requirePermission('admission_discharge'), ah(async (req, res) => {
  const doc = await Admission.findById(req.params.id);
  if (!doc) throw notFound('Admission');
  const dTime = req.body?.dTime ? new Date(req.body.dTime) : new Date();
  if (dTime < doc.admittedAt) throw bad('A patient cannot be discharged before they were admitted.', 'dTime');
  const result = await withTxn(async (session) => {
    const upd = await Admission.updateOne(
      { _id: doc._id, dTime: null },
      { $set: { dTime, status: 'discharged' } },
      { session }
    );
    if (upd.matchedCount === 0) return null;
    await Bed.updateOne(
      { _id: doc.bedId },
      { status: 'free', lastDischargedAt: dTime },
      { session }
    );
    return true;
  });
  if (!result) {
    // Lost the compare-and-set: re-read to name the discharge that won.
    const done = await Admission.findById(doc._id).select('dTime').lean();
    throw conflict(done?.dTime
      ? `That admission was already discharged on ${dateStr(done.dTime)}.`
      : 'That admission was already discharged.');
  }
  res.json({ ok: true, dischargedAt: dTime });
}));

export default r;
