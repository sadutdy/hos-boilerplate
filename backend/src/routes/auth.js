import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { User, RolePermission, ActivityLog } from '../models/auth.js';
import { Institute } from '../models/org.js';
import { PERMISSION_CATALOGUE, PERMISSION_ROLES, USER_ROLES } from '../config/permissions.js';
import { ah, HttpError, bad, forbidden, notFound, withTxn, dateStr } from '../util.js';
import { flushPermissions } from '../middleware/auth.js';
import { auth, activity, requirePermission, requireRole, signToken, currentUser } from '../middleware/auth.js';
import { flushPermissions as flush } from '../middleware/auth.js';

const r = Router();
r.use(activity);

function issueTokens(user, req) {
  const token = signToken(user);
  return { token };
}

r.post('/auth/login', ah(async (req, res) => {
  const { login, password } = req.body || {};
  if (!login || !password) throw bad('Your username/password combination was incorrect');
  const user = await User.findOne({ login });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(401, 'Your username/password combination was incorrect');
  }
  res.json({
    user: { id: user._id, login: user.login, name: `${user.firstName} ${user.lastName}`, role: user.role, phone: user.phone },
    token: issueTokens(user).token,
    hospitalName: (await Institute.findOne())?.name || null,
    needsInstitute: !(await Institute.findOne()),
    permissions: user.role === 'admin' ? PERMISSION_CATALOGUE : (await RolePermission.findOne({ role: user.role }))?.keys || [],
  });
}));

r.get('/auth/bootstrap', auth, ah(async (req, res) => {
  const user = await currentUser(req);
  const institute = await Institute.findOne();
  res.json({
    user: { id: user._id, name: `${user.firstName} ${user.lastName}`, role: user.role, phone: user.phone },
    hospitalName: institute?.name || null,
    permissions: user.role === 'admin' ? PERMISSION_CATALOGUE : (await RolePermission.findOne({ role: user.role }))?.keys || [],
  });
}));

r.post('/auth/refresh', ah(async (req, res) => {
  const { token } = req.body || {};
  try { jwt.verify(token, process.env.JWT_SECRET); } catch { throw new HttpError(401, 'Invalid token.'); }
  res.json({ ok: true });
}));

r.post('/forgot-password', ah(async (req, res) => {
  const { email } = req.body || {};
  const user = email ? await User.findOne({ email }) : null;
  if (user) {
    const token = jwt.sign({ sub: String(user._id), purpose: 'reset' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    console.log(`[dev] password reset link: POST /api/v1/auth/reset {token, password}`);
    res.json({ ok: true, message: 'If that email is on file, a reset link has been sent.' });
  } else {
    res.json({ ok: true, message: 'If that email is on file, a reset link has been sent.' });
  }
}));

r.post('/reset', ah(async (req, res) => {
  const { token, password } = req.body || {};
  if (!password || password.length < 6) throw bad('Password must be at least 6 characters.', 'password');
  let payload;
  try { payload = jwt.verify(token, process.env.JWT_SECRET); } catch { throw bad('This reset link has expired. Request a new one.'); }
  if (payload.purpose !== 'reset') throw bad('This reset link has expired. Request a new one.');
  await User.updateOne({ _id: payload.sub }, { passwordHash: await bcrypt.hash(password, 10) });
  res.json({ ok: true });
}));

// Must stay above '/auth/impersonate/:userId' so 'exit' is not read as a user id.
r.post('/auth/impersonate/exit', auth, ah(async (req, res) => {
  if (!req.user.impersonatedBy) throw bad('You are not impersonating anyone.');
  const admin = await User.findById(req.user.impersonatedBy);
  if (!admin || admin.role !== 'admin') throw forbidden();
  ActivityLog.create({ description: `impersonate.exit ${req.user.sub}`, userType: 'registered', userId: admin._id, method: 'POST', route: req.originalUrl });
  res.json({ token: signToken(admin), user: { id: admin._id, login: admin.login, name: `${admin.firstName} ${admin.lastName}`, role: admin.role } });
}));

r.post('/auth/impersonate/:userId', auth, ah(async (req, res) => {
  const me = await currentUser(req);
  if (me.role !== 'admin') throw forbidden();
  const target = await User.findById(req.params.userId);
  if (!target) throw notFound('User');
  ActivityLog.create({ description: `impersonate.start ${target.login}`, userType: 'registered', userId: me._id, method: 'POST', route: req.originalUrl });
  const token = signToken(target, { impersonatedBy: String(me._id) });
  res.json({ token, impersonated: { id: target._id, login: target.login, name: `${target.firstName} ${target.lastName}`, role: target.role } });
}));

r.get('/auth/me', auth, ah(async (req, res) => res.json(await User.findById(req.user.sub).select('firstName lastName login email role phone about'))));
r.put('/auth/me', auth, ah(async (req, res) => {
  const b = req.body || {};
  await User.updateOne({ _id: req.user.sub }, { $set: { firstName: b.firstName, lastName: b.lastName, phone: b.phone, about: b.about, ...(b.password ? { passwordHash: await bcrypt.hash(b.password, 10) } : {}) } });
  res.json({ ok: true });
}));
r.post('/auth/me/password', auth, ah(async (req, res) => {
  const { currentPassword, newPassword, confirm } = req.body || {};
  const user = await User.findById(req.user.sub);
  if (!(await bcrypt.compare(currentPassword || '', user.passwordHash))) throw bad('Your current password was incorrect, nothing has changed.', 'currentPassword');
  if (!newPassword || newPassword.length < 6) throw bad('Password must be at least 6 characters.', 'newPassword');
  if (newPassword !== confirm) throw bad('New Password and confirm password did not match!', 'confirm');
  await User.updateOne({ _id: req.user.sub }, { passwordHash: await bcrypt.hash(newPassword, 10) });
  res.json({ ok: true });
}));

const parseUser = (b) => {
  if (!b.firstName) throw bad('First name is required.', 'firstName');
  if (!b.lastName) throw bad('Last name is required.', 'lastName');
  if (!b.login) throw bad('Login is required.', 'login');
  if (!b.email) throw bad('Email is required.', 'email');
  if (!b.role || !USER_ROLES.includes(b.role)) throw bad('Role is required.', 'role');
  return b;
};

r.get('/users', auth, ah(async (req, res) => {
  const { q, limit = 25, offset = 0 } = req.query;
  const qy = q ? { $or: [
    { firstName: new RegExp(q, 'i') },
    { lastName: new RegExp(q, 'i') },
    { login: new RegExp(q, 'i') },
    { email: new RegExp(q, 'i') },
  ] } : {};
  const items = await User.find(qy).select('firstName lastName login email role phone').sort({ firstName: 1 }).skip(Number(offset)).limit(Math.min(Number(limit), 100));
  const total = await User.countDocuments(qy);
  res.json({ items, total });
}));

r.post('/users', auth, ah(async (req, res) => {
  const b = parseUser(req.body || {});
  if (await User.exists({ $or: [{ login: b.login }, { email: b.email }] })) {
    throw bad('A user already exists with that email or login.', 'login');
  }
  if (!b.password) throw bad('Password is required.', 'password');
  const user = await User.create({ ...b, passwordHash: await bcrypt.hash(b.password, 10), addDate: new Date(), phone: b.phone || '' });
  res.json({ id: user._id });
}));

r.put('/users/:id', auth, ah(async (req, res) => {
  const me = await currentUser(req);
  if (me.role !== 'admin') throw forbidden();
  const b = parseUser(req.body || {});
  const dup = await User.findOne({ $or: [{ login: b.login }, { email: b.email }], _id: { $ne: req.params.id } });
  if (dup) throw bad('A user already exists with that email or login.', 'login');
  const patch = { firstName: b.firstName, lastName: b.lastName, login: b.login, email: b.email, role: b.role, phone: b.phone || '', about: b.about || '' };
  if (b.password) patch.passwordHash = await bcrypt.hash(b.password, 10);
  await User.updateOne({ _id: req.params.id }, patch);
  res.json({ ok: true });
}));

r.delete('/users/:id', auth, ah(async (req, res) => {
  const me = await currentUser(req);
  if (me.role !== 'admin') throw forbidden();
  if (String(me._id) === String(req.params.id)) throw bad('You cannot delete your own account.');
  await User.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
}));

r.get('/permissions/catalogue', auth, ah(async (req, res) => res.json(PERMISSION_CATALOGUE)));

r.get('/roles/:role/permissions', auth, requireRole(['admin']), ah(async (req, res) => {
  const { role } = req.params;
  if (!PERMISSION_ROLES.includes(role)) throw new HttpError(404, `No permission set found for ${role}.`);
  // Roles added after the first seed have no doc yet: that means nothing granted.
  const doc = await RolePermission.findOne({ role });
  res.json(doc || { role, keys: [] });
}));

r.put('/roles/:role/permissions', auth, requireRole(['admin']), ah(async (req, res) => {
  const { role } = req.params;
  if (!PERMISSION_ROLES.includes(role)) throw bad(`Unknown role ${role}.`);
  const keys = req.body?.keys ?? null;
  if (!Array.isArray(keys)) throw bad('An array of permission keys is required.', 'keys');
  const unknown = keys.filter((k) => !PERMISSION_CATALOGUE.includes(k));
  if (unknown.length) throw bad(`Unknown permission keys: ${unknown.join(', ')}.`, 'keys');
  await RolePermission.updateOne({ role }, { keys }, { upsert: true });
  flushPermissions();
  res.json({ ok: true });
}));

r.post('/permissions/sync', auth, requireRole(['admin']), ah(async (req, res) => {
  const { prune = false, dryRun = false } = req.body || {};
  let added = 0, pruned = 0;
  const report = [];
  for (const role of PERMISSION_ROLES) {
    const doc = (await RolePermission.findOne({ role })) || { keys: [] };
    const have = new Set(doc.keys || []);
    for (const key of PERMISSION_CATALOGUE) {
      if (have.has(key)) continue;
      if (!dryRun) {
        if (role === 'admin' || true) {
          // add missing keys: granted for admin, denied (absent) for others — spec: added to admin only to avoid lockout
        }
        if (role === 'admin') { await RolePermission.updateOne({ role }, { $addToSet: { keys: key } }, { upsert: true }); added++; }
      } else if (role === 'admin') { added++; }
      report.push({ role, key, action: 'add' });
    }
    const stale = (doc.keys || []).filter((k) => !PERMISSION_CATALOGUE.includes(k));
    if (prune && stale.length) {
      if (!dryRun) { await RolePermission.updateOne({ role }, { $set: { keys: (doc.keys || []).filter((k) => PERMISSION_CATALOGUE.includes(k)) } }); }
      pruned += stale.length;
      report.push(...stale.map((key) => ({ role, key, action: 'prune' })));
    }
  }
  flushPermissions();
  res.json({ ok: true, dryRun, added, pruned, report });
}));

r.get('/activity', auth, requireRole(['admin']), ah(async (req, res) => {
  const { q, user, method, route, ip, limit = 25, offset = 0 } = req.query;
  const qy = {};
  if (q) qy.description = { $regex: q, $options: 'i' };
  if (user) qy.userId = user;
  if (method) qy.method = method;
  if (route) qy.route = { $regex: route, $options: 'i' };
  if (ip) qy.ip = { $regex: ip };
  const items = await ActivityLog.find(qy).sort({ createdAt: -1 }).skip(Number(offset)).limit(Math.min(Number(limit), 100));
  const total = await ActivityLog.countDocuments(qy);
  res.json({ items, total });
}));

r.get('/activity/:id', auth, requireRole(['admin']), ah(async (req, res) => {
  const entry = await ActivityLog.findById(req.params.id);
  if (!entry) throw notFound('Log entry');
  const related = await ActivityLog.find({ userId: entry.userId }).sort({ createdAt: -1 }).limit(25);
  res.json({ entry, related });
}));

r.post('/activity/clear', auth, requireRole(['admin']), ah(async (req, res) => {
  const out = await ActivityLog.updateMany({ deletedAt: null }, { deletedAt: new Date() });
  res.json({ ok: true, count: out.modifiedCount });
}));

r.get('/activity/cleared', auth, requireRole(['admin']), ah(async (req, res) => {
  const items = await ActivityLog.find({ deletedAt: { $ne: null } }).sort({ deletedAt: -1 }).limit(100);
  res.json({ items });
}));

r.post('/activity/restore', auth, requireRole(['admin']), ah(async (req, res) => {
  const out = await ActivityLog.updateMany({ deletedAt: { $ne: null } }, { deletedAt: null });
  res.json({ ok: true, count: out.modifiedCount });
}));

r.post('/activity/destroy', auth, requireRole(['admin']), ah(async (req, res) => {
  const out = await ActivityLog.deleteMany({ deletedAt: { $ne: null } });
  res.json({ ok: true, count: out.deletedCount });
}));

export default r;
