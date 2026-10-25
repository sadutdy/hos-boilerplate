import { Router } from 'express';
import mongoose from 'mongoose';
import { Appointment } from '../models/ward.js';
import { Patient } from '../models/clinic.js';
import { Doctor } from '../models/clinic.js';
import { ah, bad, notFound, withTxn, dateStr } from '../util.js';
import { auth, activity, requirePermission } from '../middleware/auth.js';
import { APPOINTMENT_STATUSES } from '../config/permissions.js';

const r = Router();
r.use(auth, activity);

async function resolveName(id, model, label) {
  const doc = await model.findById(id).select('name');
  return doc ? doc.name : null;
}

async function endOfDayAppointments(filter) {
  const items = await Appointment.find(filter).collation({ locale: 'en' }).sort({ startDateTime: 1 });
  const patients = await Patient.find({ _id: { $in: items.map((a) => a.patientId) } }).select('name');
  const doctors = await Doctor.find({ _id: { $in: items.map((a) => a.doctorId) } }).select('name');
  return items.map((a) => ({
    ...a.toObject(),
    patientName: patients.find((p) => String(p._id) === String(a.patientId))?.name || 'Unknown patient',
    doctorName: doctors.find((d) => String(d._id) === String(a.doctorId))?.name || 'Removed doctor',
  }));
}

r.get('/appointment-calendar', requirePermission('appointment_view'), ah(async (req, res) => {
  const { date = dateStr(new Date()), doctor, status } = req.query;
  const qy = { date };
  if (doctor) qy.doctorId = doctor;
  if (status) qy.status = status;
  const items = await endOfDayAppointments(qy);
  res.json({ date, items, count: items.length, empty: items.length === 0 ? `Nothing booked for ${date}.` : null });
}));

r.get('/appointments', requirePermission('appointment_view'), ah(async (req, res) => {
  const { date, doctor, status, limit = 25, offset = 0 } = req.query;
  const qy = {};
  if (date) qy.date = date;
  if (doctor) qy.doctorId = doctor;
  if (status) qy.status = status;
  const items = await Appointment.find(qy).sort({ startDateTime: 1 }).skip(Number(offset)).limit(Math.min(Number(limit), 100));
  const total = await Appointment.countDocuments(qy);
  res.json({ items, total });
}));

r.post('/appointments', requirePermission('appointment_add'), ah(async (req, res) => {
  const b = req.body || {};
  if (!b.patientId) throw bad('Patient is required.', 'patientId');
  if (!b.doctorId) throw bad('Doctor is required.', 'doctorId');
  if (!b.date || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) throw bad('A valid date is required.', 'date');
  if (!b.start || !/^\d{2}:\d{2}$/.test(b.start)) throw bad('A start time (HH:MM) is required.', 'start');
  const minutes = b.minutes === undefined ? 15 : Number(b.minutes);
  if (!(minutes >= 5 && minutes <= 480)) throw bad('Duration must be 5 to 480 minutes.', 'minutes');
  const status = b.status === undefined ? 'scheduled' : b.status;
  if (!(APPOINTMENT_STATUSES.includes(status))) throw bad('Status is not valid.', 'status');
  if (!(await Patient.exists({ _id: b.patientId }))) throw bad('That patient does not exist.', 'patientId');
  if (!(await Doctor.exists({ _id: b.doctorId }))) throw bad('That doctor does not exist.', 'doctorId');

  const start = new Date(`${b.date}T${b.start}:00Z`);
  const end = new Date(start.getTime() + minutes * 60000);
  const timeSlot = `${b.start} - ${end.toISOString().slice(11, 16)}`;

  const created = await withTxn(async (session) => {
    const clash = await Appointment.findOne({
      doctorId: b.doctorId,
      status: { $nin: ['cancelled', 'no show'] },
      startDateTime: { $lt: end },
      endDateTime: { $gt: start },
    }).session(session);
    if (clash) {
      const other = await Patient.findById(clash.patientId).session(session);
      const e = bad(`That doctor is already booked ${clash.timeSlot} with ${other ? other.name : 'another patient'}.`, 'start');
      throw e;
    }
    const doc = new Appointment({
      patientId: b.patientId,
      doctorId: b.doctorId,
      date: b.date,
      startDateTime: start,
      endDateTime: end,
      minutes,
      timeSlot,
      sTimeKey: `${b.date.replace(/-/g, '')}${b.start.replace(':', '')}`,
      status,
      remarks: b.remarks || '',
      vitals: b.vitals || {},
      bookingUserId: req.user.sub,
    });
    await doc.save({ session });
    return doc;
  });
  res.json(created);
}));

r.get('/appointments/:id', requirePermission('appointment_view'), ah(async (req, res) => {
  const doc = await Appointment.findById(req.params.id);
  if (!doc) throw notFound('Appointment');
  const patient = await Patient.findById(doc.patientId).select('name patientId');
  const doctor = await Doctor.findById(doc.doctorId).select('name');
  res.json({ ...doc.toObject(), patientName: patient?.name || 'Unknown patient', doctorName: doctor?.name || 'Removed doctor' });
}));

r.put('/appointments/:id', requirePermission('appointment_update'), ah(async (req, res) => {
  const doc = await Appointment.findById(req.params.id);
  if (!doc) throw notFound('Appointment');
  const b = req.body || {};
  const start = b.date && b.start ? new Date(`${b.date}T${b.start}:00Z`) : doc.startDateTime;
  const minutes = b.minutes !== undefined ? Number(b.minutes) : doc.minutes;
  if (!(minutes >= 5 && minutes <= 480)) throw bad('Duration must be 5 to 480 minutes.', 'minutes');
  const end = new Date(start.getTime() + minutes * 60000);
  const date = b.date || doc.date;
  Object.assign(doc, {
    startDateTime: start,
    endDateTime: end,
    minutes,
    date,
    timeSlot: start.toISOString().slice(11, 16) + ' - ' + end.toISOString().slice(11, 16),
    status: b.status !== undefined ? (APPOINTMENT_STATUSES.includes(b.status) ? b.status : doc.status) : doc.status,
    remarks: b.remarks ?? doc.remarks,
    vitals: b.vitals !== undefined ? { ...doc.vitals, ...b.vitals } : doc.vitals,
  });
  await withTxn(async (session) => {
    const clash = await Appointment.findOne({
      _id: { $ne: doc._id },
      doctorId: doc.doctorId,
      status: { $nin: ['cancelled', 'no show'] },
      startDateTime: { $lt: end },
      endDateTime: { $gt: start },
    }).session(session);
    if (clash) {
      const other = await Patient.findById(clash.patientId).session(session);
      throw bad(`That doctor is already booked ${clash.timeSlot} with ${other ? other.name : 'another patient'}.`, 'start');
    }
    await doc.save({ session });
  });
  res.json(doc);
}));

r.delete('/appointments/:id', requirePermission('appointment_cancel'), ah(async (req, res) => {
  await Appointment.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
}));

export default r;
