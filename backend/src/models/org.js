import mongoose from 'mongoose';
import { moneyTransform } from '../util.js';

const instituteSettings = { versionKey: false };
const moneyOpts = { versionKey: false, toJSON: { transform: moneyTransform() } };

const instituteSchema = new mongoose.Schema({
  name: { type: String, required: true },
  establishedYear: String,
  website: String,
  email: String,
  phone: String,
  address: String,
  logoUrl: String,
}, { ...instituteSettings, statics: {} });
export const Institute = mongoose.model('Institute', instituteSchema);

const appSettingsSchema = new mongoose.Schema({
  title: String,
  loginTitle: String,
  logoUrl: String,
  invoiceLogoUrl: String,
  address: String,
  phone: String,
  email: String,
  currency: { type: String, default: 'PKR' },
  language: { type: String, default: 'en' },
  discountDefault: Number,
  vatDefault: Number,
  timezone: { type: String, default: 'UTC' },
  paymentGateway: String,
  smsGateway: String,
  // Daily send time per reminder, 'HH:MM' in `timezone`; blank = that job never runs on its own.
  reminderCron: { appointment: String, payment: String },
  phoneCountryCode: { type: String, default: '92' },
}, instituteSettings);
export const AppSettings = mongoose.model('AppSettings', appSettingsSchema);

const gatewaySchema = new mongoose.Schema({
  name: { type: String, required: true },
  merchantKey: String,
  salt: String,
  apiUsername: String,
  apiPassword: String,
  apiSignature: String,
  status: { type: String, enum: ['enabled', 'disabled'], default: 'disabled' },
}, { versionKey: false, toJSON: { transform: (doc, ret) => { for (const k of ['merchantKey', 'salt', 'apiUsername', 'apiPassword', 'apiSignature']) { if (ret[k]) ret[k] = '***'; ret[k + 'Configured'] = Boolean(doc.get(k)); } return ret; } } });
export const GatewayCredential = mongoose.model('GatewayCredential', gatewaySchema);

const accountingSettingsSchema = new mongoose.Schema({
  companyId: String,
  apiLink: String,
  username: String,
  password: String,
}, { versionKey: false, toJSON: { transform: (doc, ret) => { if (ret.password) ret.password = '***'; ret.passwordConfigured = Boolean(doc.get('password')); return ret; } } });
export const AccountingSetting = mongoose.model('AccountingSetting', accountingSettingsSchema);

const integrationSchema = new mongoose.Schema({
  channel: { type: String, enum: ['sms', 'voice'], unique: true },
  provider: { type: String, enum: ['ictcore', 'telenor', 'bizsms', 'mock'] },
  url: String,
  username: String,
  password: String,
  accountId: String,
  mask: String,
}, { versionKey: false, toJSON: { transform: (doc, ret) => { for (const k of ['username', 'password']) { if (ret[k]) ret[k] = '***'; } } } });
export const Integration = mongoose.model('Integration', integrationSchema);

const notificationTypeSchema = new mongoose.Schema({
  key: { type: String, enum: ['appointment', 'payment'], unique: true, required: true },
  channel: { type: String, enum: ['sms', 'voice'] },
  enabled: { type: Boolean, default: false },
  defaultText: { type: String, maxlength: 1000 },
  // Voice reminders play this template's recording; SMS reminders use its text when set.
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'MessageTemplate' },
}, { versionKey: false });
export const NotificationType = mongoose.model('NotificationType', notificationTypeSchema);

const messageTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, maxlength: 100 },
  channel: { type: String, enum: ['sms', 'voice', null] },
  text: { type: String, maxlength: 1000 },
  // Relative path under STORAGE_DIR of an 8 kHz mono .wav (voice templates).
  mediaPath: String,
  createdBy: mongoose.Schema.Types.ObjectId,
}, { versionKey: false });
export const MessageTemplate = mongoose.model('MessageTemplate', messageTemplateSchema);

const commsLogSchema = new mongoose.Schema({
  type: { type: String, enum: ['sms', 'voice', 'email'] },
  key: { type: String, enum: ['appointment', 'payment', 'broadcast', 'otp'] },
  recipient: String,
  recipientPatientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient' },
  // What the message was about (appointment ids, or patient id + day for payment reminders): the dedupe key.
  // An array because one identical message to one phone can cover several appointments.
  refIds: [String],
  message: String,
  provider: String,
  providerRef: String,
  status: { type: String, enum: ['queued', 'sent', 'failed'] },
  error: String,
}, { versionKey: false, timestamps: true });
commsLogSchema.index({ createdAt: -1 });
commsLogSchema.index({ key: 1, recipient: 1 });
commsLogSchema.index({ key: 1, refIds: 1 });
export const CommsLog = mongoose.model('CommsLog', commsLogSchema);

const ledgerMoneyOpts = moneyOpts;
const accountSectorSchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 500 },
  type: { type: String, enum: ['income', 'expense'], required: true },
}, instituteSettings);
export const AccountSector = mongoose.model('AccountSector', accountSectorSchema);

const ledgerEntrySchema = new mongoose.Schema({
  sectorId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountSector' },
  sectorName: String,
  type: { type: String, enum: ['income', 'expense'] },
  amount: mongoose.Types.Decimal128,
  date: Date,
  description: String,
  createdBy: mongoose.Schema.Types.ObjectId,
}, ledgerMoneyOpts);
export const LedgerEntry = mongoose.model('LedgerEntry', ledgerEntrySchema);
