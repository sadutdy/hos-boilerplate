import { Router } from 'express';
import mongoose from 'mongoose';
import { Doctor, Department, Service, Patient } from '../models/clinic.js';
import { Appointment } from '../models/ward.js';
import { ah, bad, notFound, withTxn } from '../util.js';
import { auth, activity, requirePermission } from '../middleware/auth.js';

const r = Router();
r.use(auth, activity);

async function doctorList(filter, req) {
  const { q, limit = 25, offset = 0 } = req.query;
  const qy = { ...filter };
  if (q) {
    const rx = { $regex: q, $options: 'i' };
    qy.$or = ['name', 'department', 'phone', 'email'].map((f) => ({ [f]: rx }));
  }
  const sort = { name: 1 };
  const items = await Doctor.find(qy).sort(sort).skip(Number(offset)).limit(Math.min(Number(limit), 100));
  const total = await Doctor.countDocuments(qy);
  const today = new Date().toISOString().slice(0, 10);
  const loads = dateRange(items.length) && items.length ? await Appointment.aggregate([
    { $match: { doctorId: { $in: items.map((d) => d._id) }, date: { $gte: today }, status: { $nin: ['cancelled', 'no show'] } } },
    { $group: { _id: '$doctorId', count: { $sum: 1 } } },
  ]) : [];
  return {
    items: items.map((d) => ({ ...d.toObject(), upcomingAppointments: loads.find((l) => String(l._id) === String(d._id))?.count || 0 })),
    total,
  };
}
const dateRange = () => true;

async function validateDoctor(b, selfId = null) {
  if (!b.name) throw bad('Name is required.', 'name');
  if (b.email) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email)) throw bad('Email is invalid.', 'email');
    const dup = await Doctor.findOne({ email: b.email, ...(selfId ? { _id: { $ne: selfId } } : {}) });
    if (dup) throw bad('Another doctor is already on file with that email address.', 'email');
  }
  return b;
}

r.get('/doctors', requirePermission('doctor_view'), ah(async (req, res) => res.json(await doctorList({}, req))));

r.post('/doctors', requirePermission('doctor_add'), ah(async (req, res) => {
  const b = await validateDoctor(req.body || {});
  res.json(await Doctor.create({ ...b, department: b.department || '', phone: b.phone || '', address: b.address || '', specialist: b.specialist || '' }));
}));

r.get('/doctors/:id', requirePermission('doctor_view'), ah(async (req, res) => {
  const doctor = await Doctor.findById(req.params.id);
  if (!doctor) throw notFound('Doctor');
  const recent = await Appointment.find({ doctorId: doctor._id }).sort({ date: -1, startDateTime: -1 }).limit(20);
  const patients = await Patient.find({ _id: { $in: recent.map((a) => a.patientId) } }).select('name');
  res.json({
    doctor,
    recentAppointments: recent.map((a) => ({ ...a.toObject(), patientName: patients.find((p) => String(p._id) === String(a.patientId))?.name || 'Removed' })),
  });
}));

r.put('/doctors/:id', requirePermission('doctor_update'), ah(async (req, res) => {
  const doctor = await Doctor.findById(req.params.id);
  if (!doctor) throw notFound('Doctor');
  const b = await validateDoctor(req.body || {}, doctor._id);
  Object.assign(doctor, {
    name: b.name ?? doctor.name,
    email: b.email ?? doctor.email,
    phone: b.phone ?? doctor.phone,
    address: b.address ?? doctor.address,
    department: b.department ?? doctor.department,
    specialist: b.specialist ?? doctor.specialist,
    imgUrl: b.imgUrl ?? doctor.imgUrl,
  });
  await doctor.save();
  res.json(doctor);
}));

r.delete('/doctors/:id', requirePermission('doctor_delete'), ah(async (req, res) => {
  const doctor = await Doctor.findById(req.params.id);
  if (!doctor) throw notFound('Doctor');
  if (await Appointment.exists({ doctorId: doctor._id })) {
    throw new (await import('../util.js')).HttpError(409, `${doctor.name} has appointments on file, so the record stays.`);
  }
  await Doctor.deleteOne({ _id: doctor._id });
  res.json({ ok: true });
}));

r.get('/departments', requirePermission('department_view'), ah(async (req, res) => {
  const items = await Department.find().sort({ name: 1 });
  const usage = items.length ? await Doctor.aggregate([
    { $group: { _id: '$department', count: { $sum: 1 } } },
  ]) : [];
  const doctorsTexts = (await Doctor.distinct('department')).filter((n) => n && !items.some((d) => d.name === n));
  res.json({
    items,
    usage: items.map((d) => ({ id: d._id, name: d.name, doctors: usage.filter((u) => u._id === d.name).reduce((a, u) => a + u.count, 0) })),
    unlisted: doctorsTexts,
  });
}));

r.post('/departments', requirePermission('department_add'), ah(async (req, res) => {
  const b = req.body || {};
  if (!b.name) throw bad('Name is required.', 'name');
  if (await Department.exists({ name: b.name, ...(b._id ? { _id: { $ne: b._id } } : {}) })) throw bad('That department is already on the list.', 'name');
  res.json(await Department.create({ name: b.name, description: b.description || '' }));
}));

r.post('/departments/adopt', requirePermission('department_add'), ah(async (req, res) => {
  const items = await Department.find().select('name');
  const names = (await Doctor.distinct('department')).filter((n) => n && !items.some((d) => d.name === n));
  if (!names.length) return res.json({ ok: true, created: 0, message: 'Nothing to adopt — every department doctors use is already on the list.' });
  const docs = await Department.insertMany(names.map((name) => ({ name, description: '' })));
  res.json({ ok: true, created: docs.length, message: `Added ${docs.length} department(s) already in use by doctors.` });
}));

r.put('/departments/:id', requirePermission('department_update'), ah(async (req, res) => {
  const dept = await Department.findById(req.params.id);
  if (!dept) throw notFound('Department');
  const b = req.body || {};
  if (!b.name) throw bad('Name is required.', 'name');
  if (b.name !== dept.name && await Department.exists({ name: b.name })) throw bad('That department is already on the list.', 'name');
  const oldName = dept.name;
  await withTxn(async (session) => {
    dept.name = b.name;
    dept.description = b.description !== undefined ? b.description : dept.description;
    await dept.save({ session });
    let moved = 0;
    if (oldName !== b.name) {
      const out = await Doctor.updateMany({ department: oldName }, { department: b.name }, { session });
      moved = out.modifiedCount;
    }
    dept._moved = moved;
    return dept;
  });
  res.json({ ...dept.toObject(), movedDoctors: dept._moved || 0 });
}));

r.delete('/departments/:id', requirePermission('department_delete'), ah(async (req, res) => {
  const dept = await Department.findById(req.params.id);
  if (!dept) throw notFound('Department');
  const count = await Doctor.countDocuments({ department: dept.name });
  if (count > 0) throw new (await import('../util.js')).HttpError(409, `${dept.name} has ${count} doctor(s) in it. Move them first, or rename it instead.`);
  await Department.deleteOne({ _id: dept._id });
  res.json({ ok: true });
}));

r.get('/services', requirePermission('service_view'), ah(async (req, res) => {
  const { type } = req.query;
  const qy = type ? { type } : {};
  const items = await Service.find(qy).sort({ type: 1, name: 1 });
  const types = [...new Set(items.map((s) => s.type).filter(Boolean))].sort();
  const usage = items.length ? await (await import('../models/billing.js')).Invoice.aggregate([
    { $unwind: '$items' },
    { $match: { 'items.serviceId': { $in: items.map((s) => s._id) } } },
    { $group: { _id: '$items.serviceId', count: { $sum: 1 } } },
  ]) : [];
  res.json({ items, types, usage: items.map((s) => ({ id: s._id, name: s.name, invoices: usage.find((u) => String(u._id) === String(s._id))?.count || 0 })) });
}));

async function validateService(b, selfId = null) {
  if (!b.name) throw bad('Name is required.', 'name');
  if (await Service.exists({ name: b.name, ...(selfId ? { _id: { $ne: selfId } } : {}) })) throw bad('That service is already on the price list.', 'name');
  if (b.price !== undefined && b.price !== null && !(Number(b.price) >= 0)) throw bad('Price must be zero or more.', 'price');
  for (const c of ['dCommission', 'hCommission']) {
    if (b[c] !== undefined && b[c] !== null && !(b[c] >= 0 && b[c] <= 100)) throw bad(`${c === 'dCommission' ? 'Doctor' : 'Hospital'} commission must be 0 to 100.`, c);
  }
  return b;
}

r.post('/services', requirePermission('service_add'), ah(async (req, res) => {
  const b = await validateService(req.body || {});
  res.json(await Service.create({ ...b, price: b.price !== undefined ? b.price : undefined, type: b.type || '', description: b.description || '' }));
}));

r.put('/services/:id', requirePermission('service_update'), ah(async (req, res) => {
  const svc = await Service.findById(req.params.id);
  if (!svc) throw notFound('Service');
  const b = await validateService(req.body || {}, svc._id);
  Object.assign(svc, {
    name: b.name ?? svc.name,
    description: b.description ?? svc.description,
    price: b.price !== undefined ? b.price : svc.price,
    type: b.type ?? svc.type,
    dCommission: b.dCommission ?? svc.dCommission,
    hCommission: b.hCommission ?? svc.hCommission,
  });
  await svc.save();
  res.json(svc);
}));

r.delete('/services/:id', requirePermission('service_delete'), ah(async (req, res) => {
  const svc = await Service.findById(req.params.id);
  if (!svc) throw notFound('Service');
  const { Invoice } = await import('../models/billing.js');
  if (await Invoice.exists({ 'items.serviceId': svc._id })) {
    throw new (await import('../util.js')).HttpError(409, `${svc.name} has been invoiced, so it stays on the price list.`);
  }
  await Service.deleteOne({ _id: svc._id });
  res.json({ ok: true });
}));

export default r;
