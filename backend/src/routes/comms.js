import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import express, { Router } from 'express';
import mongoose from 'mongoose';
import { NotificationType, MessageTemplate, CommsLog, AppSettings } from '../models/org.js';
import { Patient, Doctor } from '../models/clinic.js';
import { ah, bad, notFound, conflict, HttpError } from '../util.js';
import { auth, activity, requirePermission, requireAnyPermission, requireRole } from '../middleware/auth.js';
import { sendMessages, REMINDER_JOBS, STORAGE_DIR, DEFAULT_REMINDER_TEXT } from '../services/comms.js';

const r = Router();
r.use(auth, activity);

const CHANNELS = ['sms', 'voice'];
const MAX_RECORDING_BYTES = 10 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Templates

// Senders read templates to pick one; managing them needs send_notification.
r.get('/message-templates', requireAnyPermission(['send_notification', 'send_sms/voice']), ah(async (req, res) => {
  res.json({ items: await MessageTemplate.find().sort({ name: 1 }) });
}));

function templateFields(b, doc) {
  const name = b.name !== undefined ? String(b.name).trim() : doc?.name;
  if (!name) throw bad('Name is required.', 'name');
  if (name.length > 100) throw bad('Name must be 100 characters or fewer.', 'name');
  const channel = b.channel !== undefined ? b.channel : (doc?.channel || 'sms');
  if (!CHANNELS.includes(channel)) throw bad('Channel must be sms or voice.', 'channel');
  const text = b.text !== undefined ? String(b.text) : (doc?.text || '');
  if (text.length > 1000) throw bad('Text must be 1000 characters or fewer.', 'text');
  if (channel === 'sms' && !text.trim()) throw bad('An SMS template needs text.', 'text');
  return { name, channel, text };
}

r.post('/message-templates', requirePermission('send_notification'), ah(async (req, res) => {
  const f = templateFields(req.body || {});
  if (await MessageTemplate.exists({ name: f.name })) throw bad('That template is already on the list.', 'name');
  res.status(201).json(await MessageTemplate.create({ ...f, createdBy: req.user.sub }));
}));

r.put('/message-templates/:id', requirePermission('send_notification'), ah(async (req, res) => {
  const doc = await MessageTemplate.findById(req.params.id);
  if (!doc) throw notFound('Template');
  const f = templateFields(req.body || {}, doc);
  if (await MessageTemplate.exists({ name: f.name, _id: { $ne: doc._id } })) throw bad('That template is already on the list.', 'name');
  doc.set(f);
  await doc.save();
  res.json(doc);
}));

// Reads a WAV header; returns { channels, sampleRate } or null when it is not a PCM WAV.
function wavFormat(buf) {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
  for (let off = 12; off + 8 <= buf.length;) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ' && off + 16 <= buf.length) {
      return { format: buf.readUInt16LE(off + 8), channels: buf.readUInt16LE(off + 10), sampleRate: buf.readUInt32LE(off + 12) };
    }
    off += 8 + size + (size % 2);
  }
  return null;
}

// Upload the recording for a voice template: raw body, Content-Type audio/wav.
r.put('/message-templates/:id/media', requirePermission('send_notification'),
  express.raw({ type: ['audio/wav', 'audio/x-wav', 'audio/wave', 'application/octet-stream'], limit: MAX_RECORDING_BYTES }),
  ah(async (req, res) => {
    const doc = await MessageTemplate.findById(req.params.id);
    if (!doc) throw notFound('Template');
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const fmt = wavFormat(buf);
    if (!fmt) throw bad('Upload a .wav recording.', 'media');
    // Telephony providers play 8 kHz mono PCM; refuse anything else rather than send noise.
    if (fmt.format !== 1 || fmt.channels !== 1 || fmt.sampleRate !== 8000) {
      throw bad(`The recording is ${fmt.sampleRate} Hz, ${fmt.channels === 1 ? 'mono' : `${fmt.channels} channels`}. Convert it to 8 kHz mono PCM WAV first.`, 'media');
    }
    const rel = path.join('templates', `${doc._id}.wav`);
    await fs.mkdir(path.join(STORAGE_DIR, 'templates'), { recursive: true });
    await fs.writeFile(path.join(STORAGE_DIR, rel), buf);
    doc.set({ mediaPath: rel, channel: 'voice' });
    await doc.save();
    res.json(doc);
  }));

r.delete('/message-templates/:id', requirePermission('send_notification'), ah(async (req, res) => {
  const doc = await MessageTemplate.findById(req.params.id);
  if (!doc) throw notFound('Template');
  const user = await NotificationType.findOne({ templateId: doc._id });
  if (user) throw conflict(`That template is used by the ${user.key} reminder, so it stays.`);
  await doc.deleteOne();
  if (doc.mediaPath) await fs.rm(path.join(STORAGE_DIR, doc.mediaPath), { force: true });
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Reminder settings

async function reminderPayload() {
  const [items, settings] = await Promise.all([NotificationType.find().sort({ key: 1 }).lean(), AppSettings.findOne().lean()]);
  return {
    items: items.map((t) => ({ ...t, time: settings?.reminderCron?.[t.key] || '', fallbackText: DEFAULT_REMINDER_TEXT[t.key] })),
    timezone: settings?.timezone || 'UTC',
  };
}

r.get('/notification-types', requirePermission('send_notification'), ah(async (req, res) => {
  res.json(await reminderPayload());
}));

r.put('/notification-types/:key', requirePermission('send_notification'), ah(async (req, res) => {
  const { key } = req.params;
  if (!REMINDER_JOBS[key]) throw notFound('Notification type');
  const b = req.body || {};
  const doc = (await NotificationType.findOne({ key })) || new NotificationType({ key, channel: 'sms' });
  if (b.enabled !== undefined) doc.set('enabled', Boolean(b.enabled));
  if (b.channel !== undefined) {
    if (!CHANNELS.includes(b.channel)) throw bad('Channel must be sms or voice.', 'channel');
    doc.set('channel', b.channel);
  }
  if (b.defaultText !== undefined) {
    if (String(b.defaultText).length > 1000) throw bad('Text must be 1000 characters or fewer.', 'defaultText');
    doc.set('defaultText', String(b.defaultText));
  }
  if (b.templateId !== undefined) {
    if (b.templateId && (!mongoose.isValidObjectId(b.templateId) || !(await MessageTemplate.exists({ _id: b.templateId })))) {
      throw bad('That template does not exist.', 'templateId');
    }
    doc.set('templateId', b.templateId || undefined);
  }
  if (doc.channel === 'voice' && doc.enabled) {
    const tpl = doc.templateId ? await MessageTemplate.findById(doc.templateId).lean() : null;
    if (!tpl?.mediaPath) throw bad('Voice reminders need a template with a recording.', 'templateId');
  }
  if (b.time !== undefined) {
    if (b.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time)) throw bad('Time must be HH:MM (24-hour).', 'time');
    await AppSettings.updateOne({}, { $set: { [`reminderCron.${key}`]: b.time || '' } }, { upsert: true });
  }
  await doc.save();
  res.json(await reminderPayload());
}));

// Run a reminder now from the settings screen (same code path as the scheduler and worker).
r.post('/notification-types/:key/run', requirePermission('send_notification'), ah(async (req, res) => {
  const run = REMINDER_JOBS[req.params.key];
  if (!run) throw notFound('Notification type');
  res.json(await run({ days: req.body?.days ?? 1 }));
}));

// ---------------------------------------------------------------------------
// Comms log

r.get('/comms-logs', requirePermission('view_sms_voice_reports'), ah(async (req, res) => {
  const { type, key, status, from, to, q, limit = 50, offset = 0 } = req.query;
  const qy = {};
  if (type) qy.type = type;
  if (key) qy.key = key;
  if (status) qy.status = status;
  if (q) qy.recipient = { $regex: String(q).replace(/\D/g, '') || '^$' };
  if (from || to) {
    qy.createdAt = {};
    if (from) qy.createdAt.$gte = new Date(`${from}T00:00:00Z`);
    if (to) qy.createdAt.$lt = new Date(new Date(`${to}T00:00:00Z`).getTime() + 86400e3);
    if (Object.values(qy.createdAt).some((d) => Number.isNaN(d.getTime()))) throw bad('Dates must be YYYY-MM-DD.', 'from');
  }
  const [items, total, counts] = await Promise.all([
    CommsLog.find(qy).sort({ createdAt: -1 }).skip(Number(offset) || 0).limit(Math.min(Number(limit) || 50, 200)).lean(),
    CommsLog.countDocuments(qy),
    CommsLog.aggregate([{ $match: qy }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  const patients = await Patient.find({ _id: { $in: items.map((l) => l.recipientPatientId).filter(Boolean) } }).select('name').lean();
  const names = new Map(patients.map((p) => [String(p._id), p.name]));
  res.json({
    items: items.map((l) => ({ ...l, patientName: l.recipientPatientId ? names.get(String(l.recipientPatientId)) || null : null })),
    total,
    counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
  });
}));

r.delete('/comms-logs/:id', requireRole(['admin']), ah(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Log entry');
  const out = await CommsLog.deleteOne({ _id: req.params.id });
  if (!out.deletedCount) throw notFound('Log entry');
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Broadcast ("Send Notification")

const RECIPIENT_TYPES = ['patients', 'all-patients', 'doctors', 'manual'];

async function broadcastRecipients(b) {
  const ids = (list, field) => {
    if (!Array.isArray(list) || !list.length) throw bad('Pick at least one recipient.', field);
    if (list.some((id) => !mongoose.isValidObjectId(id))) throw bad('One of the recipients does not exist.', field);
    return list;
  };
  switch (b.recipientType) {
    case 'patients':
      return (await Patient.find({ _id: { $in: ids(b.patientIds, 'patientIds') } }).select('name phone').lean())
        .map((p) => ({ phone: p.phone, name: p.name, patientId: p._id, ctx: { patient: { name: p.name } } }));
    case 'all-patients':
      return (await Patient.find({ phone: { $nin: [null, ''] } }).select('name phone').lean())
        .map((p) => ({ phone: p.phone, name: p.name, patientId: p._id, ctx: { patient: { name: p.name } } }));
    case 'doctors': {
      const qy = Array.isArray(b.doctorIds) && b.doctorIds.length ? { _id: { $in: ids(b.doctorIds, 'doctorIds') } } : { phone: { $nin: [null, ''] } };
      return (await Doctor.find(qy).select('name phone').lean()).map((d) => ({ phone: d.phone, name: d.name, ctx: { doctor: { name: d.name } } }));
    }
    case 'manual': {
      const phones = String(b.phoneList || '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
      if (!phones.length) throw bad('Enter at least one phone number.', 'phoneList');
      if (phones.length > 500) throw bad('Enter 500 numbers or fewer.', 'phoneList');
      return phones.map((phone) => ({ phone }));
    }
    default:
      throw bad('Choose who receives the message.', 'recipientType');
  }
}

r.post('/messages/broadcast', requirePermission('send_sms/voice'), ah(async (req, res) => {
  const b = req.body || {};
  if (!CHANNELS.includes(b.channel)) throw bad('Channel must be sms or voice.', 'channel');
  if (!RECIPIENT_TYPES.includes(b.recipientType)) throw bad('Choose who receives the message.', 'recipientType');
  const style = b.style === 'campaign' ? 'campaign' : 'quick';

  let template = null;
  if (b.templateId) {
    if (!mongoose.isValidObjectId(b.templateId) || !(template = await MessageTemplate.findById(b.templateId))) throw bad('That template does not exist.', 'templateId');
  }
  const text = String(b.text ?? '').trim() || template?.text || '';
  if (b.channel === 'sms') {
    if (!text) throw bad('Write a message or pick a template.', 'text');
    if (text.length > 1000) throw bad('The message must be 1000 characters or fewer.', 'text');
  } else if (!template?.mediaPath) {
    throw bad('Pick a voice template that has a recording.', 'templateId');
  }

  const recipients = await broadcastRecipients(b);
  if (b.dryRun) {
    return res.json({ dryRun: true, recipients: recipients.length, withoutPhone: recipients.filter((x) => !x.phone).length });
  }
  const out = await sendMessages({
    channel: b.channel, key: 'broadcast', recipients, text, mediaPath: template?.mediaPath, style,
    title: template?.name || 'Hospital message',
  });
  if (out.status === 'skipped') throw new HttpError(422, out.reason, { recipients: out.reason });
  res.json(out);
}));

// ---------------------------------------------------------------------------
// Worker-only job triggers (token-protected; never public).

export const workerRouter = Router();

function workerToken(req, res, next) {
  const expected = process.env.WORKER_TOKEN;
  if (!expected) return next(new HttpError(503, 'Job triggers are disabled: WORKER_TOKEN is not set.'));
  const given = Buffer.from(String(req.header('x-worker-token') || ''));
  const want = Buffer.from(expected);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return next(new HttpError(401, 'Invalid worker token.'));
  next();
}

workerRouter.post('/jobs/appointment-reminder', workerToken, ah(async (req, res) => {
  res.json(await REMINDER_JOBS.appointment({ days: req.body?.days ?? 1 }));
}));

workerRouter.post('/jobs/payment-reminder', workerToken, ah(async (req, res) => {
  res.json(await REMINDER_JOBS.payment());
}));

export default r;
