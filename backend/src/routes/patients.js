import { Router } from 'express';
import mongoose from 'mongoose';
import { Patient, MedicalHistory } from '../models/clinic.js';
import { nextCounter } from '../models/counter.js';
import { ah, bad, notFound, withTxn, pad6, dateStr, conflict } from '../util.js';
import { auth, activity, requirePermission } from '../middleware/auth.js';

const r = Router();
r.use(auth, activity);

const calcAge = (dob) => (dob ? Math.floor((Date.now() - new Date(dob).getTime()) / 3.15576e10) : null);

async function allocatePatientId() {
  const seq = await nextCounter('patientId');
  return pad6(seq);
}

r.get('/patients', requirePermission('patient_view'), ah(async (req, res) => {
  const { q, limit = 25, offset = 0 } = req.query;
  const qy = {};
  if (q) {
    const rx = { $regex: q, $options: 'i' };
    qy.$or = ['name', 'patientId', 'phone', 'email'].map((f) => ({ [f]: rx }));
  }
  const items = await Patient.find(qy).sort({ _id: -1 }).skip(Number(offset)).limit(Math.min(Number(limit), 100));
  const total = await Patient.countDocuments(qy);
  res.json({ items, total });
}));

r.post('/patients', requirePermission('patient_add'), ah(async (req, res) => {
  const b = req.body || {};
  if (!b.name) throw bad('Name is required.', 'name');
  if (b.name.length > 100) throw bad('Name must be at most 100 characters.', 'name');
  if (b.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email)) throw bad('Email is invalid.', 'email');
  if (b.dateOfBirth && new Date(b.dateOfBirth) > new Date()) throw bad('Date of birth cannot be in the future.', 'dateOfBirth');
  const dob = b.dateOfBirth ? new Date(b.dateOfBirth) : null;
  const age = b.age !== undefined && b.age !== null && b.age !== '' ? Number(b.age) : calcAge(dob);
  const patientId = await allocatePatientId();
  const doc = await Patient.create({
    patientId,
    name: b.name,
    fatherName: b.fatherName || '',
    phone: b.phone || '',
    email: b.email || '',
    address: b.address || '',
    sex: ['male', 'female', 'other'].includes(b.sex) ? b.sex : '',
    dateOfBirth: dob,
    age: age && age > 0 ? age : b.age == null || b.age === '' ? calcAge(dob) : null,
    bloodGroup: b.bloodGroup || '',
    doctorName: b.doctorName || '',
    imgUrl: b.imgUrl || '',
  });
  res.json(doc);
}));

r.get('/patients/:id', requirePermission('patient_view'), ah(async (req, res) => {
  const patient = mongoose.isValidObjectId(req.params.id)
    ? await Patient.findById(req.params.id)
    : await Patient.findOne({ patientId: req.params.id });
  if (!patient) throw notFound('Patient');
  const history = await MedicalHistory.find({ patientId: patient._id }).sort({ date: -1 });
  res.json({ patient, history });
}));

r.put('/patients/:id', requirePermission('patient_update'), ah(async (req, res) => {
  const patient = await Patient.findById(req.params.id);
  if (!patient) throw notFound('Patient');
  const b = req.body || {};
  if (b.name !== undefined && !b.name) throw bad('Name is required.', 'name');
  const dob = b.dateOfBirth !== undefined ? (b.dateOfBirth ? new Date(b.dateOfBirth) : null) : patient.dateOfBirth;
  const newAge = b.age !== undefined ? (b.age === null || b.age === '' ? null : Number(b.age)) : calcAge(dob);
  Object.assign(patient, {
    name: b.name ?? patient.name,
    fatherName: b.fatherName ?? patient.fatherName,
    phone: b.phone ?? patient.phone,
    email: b.email ?? patient.email,
    address: b.address ?? patient.address,
    sex: b.sex !== undefined ? (['male', 'female', 'other'].includes(b.sex) ? b.sex : '') : patient.sex,
    dateOfBirth: dob,
    age: newAge,
    bloodGroup: b.bloodGroup ?? patient.bloodGroup,
    doctorName: b.doctorName ?? patient.doctorName,
    imgUrl: b.imgUrl ?? patient.imgUrl,
  });
  await patient.save();
  res.json(patient);
}));

r.delete('/patients/:id', requirePermission('patient_delete'), ah(async (req, res) => {
  await Patient.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
}));

r.get('/medical-history', requirePermission('patient_medical_history'), ah(async (req, res) => {
  const { patient, q, limit = 25, offset = 0 } = req.query;
  const qy = {};
  if (patient) {
    const p = mongoose.isValidObjectId(patient) ? patient : null;
    if (!p) throw bad('Patient filter must be an id.', 'patient');
    qy.patientId = p;
  }
  if (q) {
    const rx = { $regex: q, $options: 'i' };
    qy.$or = ['title', 'description', 'patientName'].map((f) => ({ [f]: rx }));
  }
  const items = await MedicalHistory.find(qy).sort({ date: -1, _id: -1 }).skip(Number(offset)).limit(Math.min(Number(limit), 100));
  const total = await MedicalHistory.countDocuments(qy);
  res.json({ items, total });
}));

r.post('/medical-history', requirePermission('patient_medical_history'), ah(async (req, res) => {
  const b = req.body || {};
  if (!b.patientId) throw bad('Patient is required.', 'patientId');
  if (!b.title) throw bad('Title is required.', 'title');
  if (!b.description) throw bad('Description is required.', 'description');
  const patient = await Patient.findById(b.patientId);
  if (!patient) throw bad('That patient does not exist.', 'patientId');
  const doc = await MedicalHistory.create({
    patientId: patient._id,
    title: b.title,
    description: b.description,
    date: b.date ? new Date(b.date) : new Date(),
    imgUrl: b.imgUrl || '',
    patientName: patient.name,
    patientAddress: patient.address,
    patientPhone: patient.phone,
    createdBy: req.user.sub,
  });
  res.json(doc);
}));

r.get('/medical-history/:id', requirePermission('patient_medical_history'), ah(async (req, res) => {
  const doc = await MedicalHistory.findById(req.params.id);
  if (!doc) throw notFound('History entry');
  res.json(doc);
}));

r.put('/medical-history/:id', requirePermission('patient_medical_history'), ah(async (req, res) => {
  const doc = await MedicalHistory.findById(req.params.id);
  if (!doc) throw notFound('History entry');
  const b = req.body || {};
  if (b.title !== undefined && !b.title) throw bad('Title is required.', 'title');
  if (b.description !== undefined && !b.description) throw bad('Description is required.', 'description');
  Object.assign(doc, {
    title: b.title ?? doc.title,
    description: b.description ?? doc.description,
    date: b.date !== undefined ? (b.date ? new Date(b.date) : doc.date) : doc.date,
    imgUrl: b.imgUrl !== undefined ? b.imgUrl : doc.imgUrl,
  });
  await doc.save();
  res.json(doc);
}));

r.delete('/medical-history/:id', requirePermission('patient_medical_history'), ah(async (req, res) => {
  await MedicalHistory.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
}));

export default r;
