import mongoose from 'mongoose';

const patientSchema = new mongoose.Schema({
  patientId: { type: String, unique: true, required: true },
  name: { type: String, required: true, maxlength: 100 },
  fatherName: { type: String, maxlength: 100 },
  phone: { type: String, maxlength: 100 },
  email: { type: String, maxlength: 190 },
  address: { type: String, maxlength: 100 },
  sex: { type: String, enum: ['male', 'female', 'other', ''] },
  dateOfBirth: Date,
  age: Number,
  bloodGroup: { type: String, default: '' },
  doctorName: { type: String, maxlength: 100 },
  imgUrl: String,
  howAdded: { type: String, default: 'front desk' },
  addDate: { type: Date, default: Date.now },
  registrationTime: { type: Date, default: Date.now },
}, { versionKey: false });
patientSchema.index({ name: 1 });
patientSchema.index({ phone: 1 });

const medicalHistorySchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
  title: { type: String, required: true, maxlength: 100 },
  description: { type: String, required: true, maxlength: 10000 },
  date: Date,
  imgUrl: String,
  patientName: { type: String, maxlength: 100 },
  patientAddress: String,
  patientPhone: String,
  registrationTime: { type: Date, default: Date.now },
  createdBy: mongoose.Schema.Types.ObjectId,
}, { versionKey: false });

const departmentSchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 100 },
  description: { type: String, maxlength: 1000 },
}, { versionKey: false });

const doctorSchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 100 },
  email: { type: String, maxlength: 100 },
  phone: { type: String, maxlength: 100 },
  address: { type: String, maxlength: 100 },
  department: { type: String, maxlength: 100 },
  specialist: { type: String, maxlength: 100 },
  imgUrl: String,
}, { versionKey: false });

const serviceSchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 100 },
  description: { type: String, maxlength: 100 },
  price: mongoose.Types.Decimal128,
  type: { type: String, maxlength: 100 },
  dCommission: { type: Number, min: 0, max: 100 },
  hCommission: { type: Number, min: 0, max: 100 },
}, { versionKey: false, toJSON: { transform: (doc, ret) => { ret.price = ret.price ? Number(ret.price.toString()).toFixed(2) : null; return ret; } } });

export const Patient = mongoose.model('Patient', patientSchema);
export const MedicalHistory = mongoose.model('MedicalHistory', medicalHistorySchema);
export const Department = mongoose.model('Department', departmentSchema);
export const Doctor = mongoose.model('Doctor', doctorSchema);
export const Service = mongoose.model('Service', serviceSchema);
