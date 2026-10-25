import mongoose from 'mongoose';

const moneyItem = { versionKey: false, toJSON: { transform: (doc, ret) => {
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

const invoiceSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  patientName: { type: String, required: true, maxlength: 100 },
  patientPhone: { type: String, maxlength: 100 },
  patientAddress: { type: String, maxlength: 200 },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
  doctorName: { type: String, maxlength: 100 },
  date: { type: Date, required: true },
  items: [{
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service' },
    name: { type: String, required: true, maxlength: 200 },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: mongoose.Types.Decimal128,
    lineTotal: mongoose.Types.Decimal128,
  }],
  amount: mongoose.Types.Decimal128,
  discount: mongoose.Types.Decimal128,
  vat: mongoose.Types.Decimal128,
  grossTotal: mongoose.Types.Decimal128,
  remarks: { type: String, maxlength: 500 },
  depositType: { type: String, default: '' },
  createdBy: mongoose.Schema.Types.ObjectId,
}, moneyItem);

const invoicePaymentSchema = new mongoose.Schema({
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
  amount: mongoose.Types.Decimal128,
  method: { type: String, maxlength: 60 },
  reference: { type: String, maxlength: 120 },
  paidAt: { type: Date, default: Date.now },
}, moneyItem);

export const Invoice = mongoose.model('Invoice', invoiceSchema);
export const InvoicePayment = mongoose.model('InvoicePayment', invoicePaymentSchema);
