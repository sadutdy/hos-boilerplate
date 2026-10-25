import { Router } from 'express';
import { Institute, AppSettings, GatewayCredential, Integration } from '../models/org.js';
import { ah, bad, notFound } from '../util.js';
import { auth, activity, requirePermission, requireRole } from '../middleware/auth.js';

const r = Router();
r.use(auth, activity);

r.get('/institute', ah(async (req, res) => res.json((await Institute.findOne()) || null)));

r.put('/institute', requirePermission('hospital_information_add'), ah(async (req, res) => {
  const b = req.body || {};
  if (!b.name) throw bad('Name is required.', 'name');
  let doc = await Institute.findOne();
  if (!doc) doc = new Institute({});
  doc.set({
    name: b.name,
    establishedYear: b.establishedYear ?? doc.establishedYear,
    website: b.website ?? doc.website,
    email: b.email ?? doc.email,
    phone: b.phone ?? doc.phone,
    address: b.address ?? doc.address,
    logoUrl: b.logoUrl ?? doc.logoUrl,
  });
  await doc.save();
  res.json(doc);
}));

r.get('/settings/app', ah(async (req, res) => {
  const doc = await AppSettings.findOne();
  res.json(doc || {
    title: 'HOS Demo Hospital',
    currency: 'PKR',
    language: 'en',
    timezone: 'UTC',
    discountDefault: 0,
    vatDefault: 0,
  });
}));

r.put('/settings/app', requireRole('admin'), ah(async (req, res) => {
  const b = req.body || {};
  if (!b.title) throw bad('Title is required.', 'title');
  if (b.currency && String(b.currency).length > 8) throw bad('Currency is too long.', 'currency');
  let doc = await AppSettings.findOne();
  if (!doc) doc = new AppSettings({});
  doc.set({
    title: b.title,
    loginTitle: b.loginTitle ?? doc.loginTitle,
    logoUrl: b.logoUrl ?? doc.logoUrl,
    invoiceLogoUrl: b.invoiceLogoUrl ?? doc.invoiceLogoUrl,
    address: b.address ?? doc.address,
    phone: b.phone ?? doc.phone,
    email: b.email ?? doc.email,
    currency: b.currency ?? doc.currency,
    language: b.language ?? doc.language,
    discountDefault: b.discountDefault ?? doc.discountDefault,
    vatDefault: b.vatDefault ?? doc.vatDefault,
    timezone: b.timezone ?? doc.timezone,
    paymentGateway: b.paymentGateway ?? doc.paymentGateway,
    smsGateway: b.smsGateway ?? doc.smsGateway,
    reminderCron: b.reminderCron ? { ...doc.reminderCron?.toObject?.(), ...b.reminderCron } : doc.reminderCron,
  });
  await doc.save();
  res.json(doc);
}));

r.get('/gateways', requireRole('admin'), ah(async (req, res) => res.json({ items: await GatewayCredential.find().sort({ name: 1 }) })));

r.put('/gateways/:name', requireRole('admin'), ah(async (req, res) => {
  const doc = await GatewayCredential.findOne({ name: req.params.name });
  if (!doc) throw notFound('Gateway');
  const b = req.body || {};
  const allowed = ['merchantKey', 'salt', 'apiUsername', 'apiPassword', 'apiSignature'];
  for (const f of allowed) {
    if (b[f] !== undefined && b[f] !== '***') doc.set(f, b[f]);
  }
  if (b.status !== undefined) {
    if (!['enabled', 'disabled'].includes(b.status)) throw bad('Status must be enabled or disabled.', 'status');
    doc.set('status', b.status);
  }
  await doc.save();
  res.json(doc);
}));

r.get('/integrations', requireRole('admin'), ah(async (req, res) => res.json({ items: await Integration.find() })));

r.put('/integrations/:channel', requireRole('admin'), ah(async (req, res) => {
  if (!['sms', 'voice'].includes(req.params.channel)) throw bad('Channel must be sms or voice.', 'channel');
  const b = req.body || {};
  if (b.provider && !['ictcore', 'telenor', 'bizsms', 'mock'].includes(b.provider)) throw bad('Unknown provider.', 'provider');
  let doc = await Integration.findOne({ channel: req.params.channel });
  if (!doc) doc = new Integration({ channel: req.params.channel, provider: 'mock' });
  for (const f of ['provider', 'url', 'accountId', 'mask']) {
    if (b[f] !== undefined) doc.set(f, b[f]);
  }
  for (const f of ['username', 'password']) {
    if (b[f] !== undefined && b[f] !== '***') doc.set(f, b[f]);
  }
  await doc.save();
  res.json(doc);
}));

export default r;
