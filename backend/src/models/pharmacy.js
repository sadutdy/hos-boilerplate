import mongoose from 'mongoose';

const opts = { versionKey: false, toJSON: { transform: (doc, ret) => {
  const conv = (o) => o;
  return ret;
} } };

const moneyItem = { toJSON: { transform: (doc, ret) => {
  const fix = (o) => {
    if (!o || typeof o !== 'object') return o;
    for (const [k, v] of Object.entries(o)) {
      if (v instanceof mongoose.Types.Decimal128) o[k] = Number(v.toString()).toFixed(2);
      else if (Array.isArray(v)) v.forEach(fix);
      else if (v && typeof v === 'object') fix(v);
    }
    return o;
  };
  return fix(ret);
} } };

const medicineCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 100 },
  description: { type: String, maxlength: 100 },
}, { versionKey: false });

const medicineSchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 100 },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicineCategory' },
  generic: { type: String, maxlength: 100 },
  company: { type: String, maxlength: 100 },
  effects: { type: String, maxlength: 100 },
  box: { type: String, maxlength: 100 },
  price: mongoose.Types.Decimal128,
  sellingPrice: mongoose.Types.Decimal128,
  quantity: { type: Number, min: 0, default: 0 },
  expiryDate: Date,
  addDate: { type: Date, default: Date.now },
}, moneyItem);

const prescriptionSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
  date: { type: Date, required: true },
  symptom: { type: String, maxlength: 100 },
  advice: { type: String, maxlength: 1000 },
  note: { type: String, maxlength: 1000 },
  validity: { type: String, maxlength: 100 },
  items: [{
    medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' },
    name: { type: String, required: true, maxlength: 200 },
    dosage: { type: String, maxlength: 100 },
    duration: { type: String, maxlength: 100 },
    instructions: { type: String, maxlength: 500 },
  }],
  summary: String,
  state: { type: String, default: 'issued' },
  createdBy: mongoose.Schema.Types.ObjectId,
}, moneyItem);

const labCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 100 },
  description: { type: String, maxlength: 100 },
  referenceValue: { type: String, maxlength: 1000 },
});
labCategorySchema.set('versionKey', false);

const labSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
  date: { type: Date, required: true },
  tests: [{
    labCategoryId: mongoose.Schema.Types.ObjectId,
    name: { type: String, maxlength: 200 },
    referenceValue: String,
    result: { type: String, maxlength: 1000, default: null },
    status: { type: String, enum: ['requested', 'reported'], default: 'requested' },
    reportedAt: Date,
  }],
  status: { type: String, enum: ['requested', 'partial', 'reported'], default: 'requested' },
  reportedAt: Date,
  patientName: String,
  patientPhone: String,
  patientAddress: String,
  doctorName: String,
  requestUserId: mongoose.Schema.Types.ObjectId,
}, { versionKey: false });

const pharmacySaleSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient' },
  date: { type: Date, required: true },
  items: [{
    medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' },
    name: { type: String, required: true, maxlength: 200 },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: mongoose.Types.Decimal128,
    lineTotal: mongoose.Types.Decimal128,
  }],
  amount: mongoose.Types.Decimal128,
  discount: mongoose.Types.Decimal128,
  vat: mongoose.Types.Decimal128,
  grossTotal: mongoose.Types.Decimal128,
  amountReceived: mongoose.Types.Decimal128,
  status: { type: String, default: 'paid' },
  saleUserId: mongoose.Schema.Types.ObjectId,
}, moneyItem);

export const MedicineCategory = mongoose.model('MedicineCategory', medicineCategorySchema);
export const Medicine = mongoose.model('Medicine', medicineSchema);
export const Prescription = mongoose.model('Prescription', prescriptionSchema);
export const LabCategory = mongoose.model('LabCategory', labCategorySchema);
export const Lab = mongoose.model('Lab', labSchema);
export const PharmacySale = mongoose.model('PharmacySale', pharmacySaleSchema);
