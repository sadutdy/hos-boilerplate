import mongoose, { Schema } from 'mongoose';
import { moneyTransform } from '../util.js';

const UserSchema = new Schema({
  firstName: { type: String, required: true, maxlength: 20 },
  lastName: { type: String, required: true, maxlength: 20 },
  login: { type: String, required: true, unique: true, maxlength: 20 },
  email: { type: String, maxlength: 100 },
  passwordHash: { type: String, required: true },
  role: { type: String, required: true, enum: ['admin', 'doctor', 'nurse', 'pharmacist', 'laboratorist', 'accountant', 'receptionist', 'patient'] },
  phone: { type: String, maxlength: 20 },
  about: { type: String, maxlength: 200 },
  addDate: Date,
}, { versionKey: false });

const refreshTokenSchema = new mongoose.Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  tokenHash: { type: String }, 
  ip: String,
  userAgent: String,
  revokedAt: Date,
  expiresAt: { type: Date },
}, { versionKey: false });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const passwordResetSchema = new mongoose.Schema({
  email: String,
  tokenHash: String,
  usedAt: Date,
  expiresAt: { type: Date },
}, { versionKey: false });
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const verificationCodeSchema = new mongoose.Schema({
  userId: Schema.Types.ObjectId,
  ipAddress: String,
  code: String,
  status: { type: String, default: 'active' },
  usedAt: Date,
  expiresAt: { type: Date },
}, { versionKey: false });
verificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const activityLogSchema = new mongoose.Schema({
  description: String,
  details: String,
  userType: { type: String, default: 'registered' },
  userId: Schema.Types.ObjectId,
  ip: String,
  userAgent: String,
  locale: String,
  referer: String,
  method: String,
  route: String,
  rel: { model: String, id: String },
  deletedAt: Date,
}, { versionKey: false });

const rolePermissionSchema = new mongoose.Schema({
  role: { type: String, unique: true, required: true },
  keys: [String],
}, { versionKey: false });

export const User = mongoose.model('User', UserSchema);
export const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);
export const PasswordReset = mongoose.model('PasswordReset', passwordResetSchema);
export const VerificationCode = mongoose.model('VerificationCode', verificationCodeSchema);
export const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);
export const RolePermission = mongoose.model('RolePermission', rolePermissionSchema);
