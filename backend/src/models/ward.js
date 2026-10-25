import mongoose from 'mongoose';
import { APPOINTMENT_STATUSES } from '../config/permissions.js';

const appointmentSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
  date: { type: String, required: true },
  startDateTime: { type: Date, required: true },
  endDateTime: { type: Date, required: true },
  minutes: { type: Number, min: 5, max: 480, default: 15 },
  timeSlot: { type: String, required: true },
  sTimeKey: String,
  status: { type: String, enum: APPOINTMENT_STATUSES, default: 'scheduled' },
  remarks: { type: String, maxlength: 500 },
  vitals: { bloodPressure: String, pulse: String, temperature: String, weight: String },
  bookingUserId: mongoose.Schema.Types.ObjectId,
  addDate: { type: Date, default: Date.now },
  registrationTime: { type: Date, default: Date.now },
}, { versionKey: false });
appointmentSchema.index({ doctorId: 1, startDateTime: 1 });
appointmentSchema.index({ date: 1 });
appointmentSchema.index({ patientId: 1 });

const bedCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 100 },
  description: { type: String, maxlength: 100 },
}, { versionKey: false });

const bedSchema = new mongoose.Schema({
  wardId: { type: mongoose.Schema.Types.ObjectId, ref: 'BedCategory', required: true },
  number: { type: String, required: true, maxlength: 100 },
  description: { type: String, maxlength: 100 },
  status: { type: String, enum: ['free', 'occupied'], default: 'free' },
  lastAdmittedAt: Date,
  lastDischargedAt: Date,
}, { versionKey: false });
bedSchema.index({ wardId: 1, number: 1 }, { unique: true });

const admissionSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  bedId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bed', required: true },
  number: String,
  wardId: mongoose.Schema.Types.ObjectId,
  admittedAt: { type: Date, required: true },
  dTime: { type: Date, default: null },
  status: { type: String, enum: ['admitted', 'discharged'], default: 'admitted' },
  createdBy: mongoose.Schema.Types.ObjectId,
}, { versionKey: false });
admissionSchema.index({ dTime: 1 });
admissionSchema.index({ patientId: 1 });
admissionSchema.index({ bedId: 1 });

const staffSchema = new mongoose.Schema({
  type: { type: String, enum: ['nurse', 'pharmacist', 'laboratorist', 'receptionist', 'accountant'], required: true },
  name: { type: String, required: true, maxlength: 100 },
  email: { type: String, maxlength: 100 },
  phone: { type: String, maxlength: 100 },
  address: { type: String, maxlength: 100 },
  imgUrl: String,
}, { versionKey: false });

export const Appointment = mongoose.model('Appointment', appointmentSchema);
export const BedCategory = mongoose.model('BedCategory', bedCategorySchema);
export const Bed = mongoose.model('Bed', bedSchema);
export const Admission = mongoose.model('Admission', admissionSchema);
export const Staff = mongoose.model('Staff', staffSchema);
