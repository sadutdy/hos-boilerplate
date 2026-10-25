import { Router } from 'express';
import { Staff } from '../models/ward.js';
import { ah, bad, notFound, HttpError } from '../util.js';
import { auth, activity, requirePermissionFn } from '../middleware/auth.js';
import { STAFF_TYPES } from '../config/permissions.js';

const r = Router();
r.use(auth, activity);

const resolveType = (req) => {
  if (!STAFF_TYPES.includes(req.params.type)) throw new HttpError(404, 'Not found.');
  return req.params.type;
};
const permFor = (f) => requirePermissionFn((req) => {
  const type = STAFF_TYPES.includes(req.params.type) ? req.params.type : null;
  return type === 'nurse' ? `nurse_${f}` : `staff_${f}`;
});

r.get('/staff/:type', permFor('view'), ah(async (req, res) => {
  const type = resolveType(req);
  const { q, limit = 25, offset = 0 } = req.query;
  const qy = { type };
  if (q) {
    const rx = { $regex: q, $options: 'i' };
    qy.$or = ['name', 'phone', 'email'].map((f) => ({ [f]: rx }));
  }
  const items = await Staff.find(qy).sort({ name: 1 }).skip(Number(offset)).limit(Math.min(Number(limit), 100));
  const total = await Staff.countDocuments(qy);
  res.json({ items, total });
}));

r.post('/staff/:type', permFor('add'), ah(async (req, res) => {
  const type = resolveType(req);
  const b = req.body || {};
  if (!b.name) throw bad('Name is required.', 'name');
  if (b.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email)) throw bad('Email is invalid.', 'email');
  if (b.email && (await Staff.exists({ type, email: b.email }))) {
    throw bad('Someone on this list already has that email address.', 'email');
  }
  res.json(await Staff.create({ type, name: b.name, email: b.email || '', phone: b.phone || '', address: b.address || '', imgUrl: b.imgUrl || '' }));
}));

r.get('/staff/:type/:id', permFor('view'), ah(async (req, res) => {
  resolveType(req);
  const doc = await Staff.findById(req.params.id);
  if (!doc) throw notFound('Staff record');
  res.json(doc);
}));

r.put('/staff/:type/:id', permFor('update'), ah(async (req, res) => {
  resolveType(req);
  const doc = await Staff.findById(req.params.id);
  if (!doc) throw notFound('Staff record');
  const b = req.body || {};
  if (b.name !== undefined && !b.name) throw bad('Name is required.', 'name');
  if (b.email && b.email !== doc.email && (await Staff.exists({ type: doc.type, email: b.email }))) {
    throw bad('Someone on this list already has that email address.', 'email');
  }
  Object.assign(doc, {
    name: b.name ?? doc.name,
    email: b.email ?? doc.email,
    phone: b.phone ?? doc.phone,
    address: b.address ?? doc.address,
    imgUrl: b.imgUrl !== undefined ? b.imgUrl : doc.imgUrl,
  });
  await doc.save();
  res.json(doc);
}));

r.delete('/staff/:type/:id', permFor('delete'), ah(async (req, res) => {
  resolveType(req);
  await Staff.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
}));

export default r;
