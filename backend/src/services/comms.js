// Communications: one send path for broadcasts and reminder jobs.
//
// Every send goes through sendMessages(), which
//   1. resolves the channel's integration and provider adapter (missing → soft skip),
//   2. normalises phones in one place (rows under 10 digits are dropped individually),
//   3. writes commsLogs rows as `queued` (the outbox), then marks them `sent` / `failed`.
// Adapters never throw past sendMessages(): a provider error fails the rows, never the request.
//
// Provider call shapes are ported from the PHP app (ICTCoreController / CronjobController).
import fs from 'node:fs/promises';
import path from 'node:path';
import { CommsLog, Integration, AppSettings, Institute, NotificationType, MessageTemplate } from '../models/org.js';
import { Patient } from '../models/clinic.js';
import { Appointment } from '../models/ward.js';
import { Invoice } from '../models/billing.js';
import { normalizePhone, round2 } from '../util.js';

export const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || 'storage');
const PROVIDER_TIMEOUT_MS = 15000;
const JOB_LIMIT = 200;

// ---------------------------------------------------------------------------
// Placeholders: {{patient.name}}, {{appointment.date}}, {{invoice.balance}}, ...
// Unknown placeholders render as '' (fail-soft): a typo never blocks a send.
// Single-brace names from the seeded/legacy texts ({name}, {date}, ...) are aliased.

const LEGACY_PLACEHOLDERS = {
  name: 'patient.name',
  date: 'appointment.date',
  time: 'appointment.time',
  balance: 'invoice.balance',
  institute: 'institute.name',
};

export function renderTemplate(text, ctx = {}) {
  if (!text) return '';
  const lookup = (p) => {
    const v = p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), ctx);
    return v == null ? '' : String(v);
  };
  return text
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, p) => lookup(p))
    .replace(/\{(\w+)\}/g, (m, k) => (LEGACY_PLACEHOLDERS[k] ? lookup(LEGACY_PLACEHOLDERS[k]) : m))
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

// Sender mask: configured mask, else hospital name as alphanumerics (max 11), else app name.
export function senderMask(integration, instituteName) {
  if (integration?.mask) return integration.mask.slice(0, 11);
  const fromName = String(instituteName || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 11);
  return fromName || String(process.env.APP_NAME || 'HOS').replace(/[^A-Za-z0-9]/g, '').slice(0, 11) || 'HOS';
}

// ---------------------------------------------------------------------------
// Provider adapters. Interface:
//   sendSms({ text, phones, mask })            → [{ phone, ok, ref?, error? }]
//   sendVoice({ media, phones, title })        → [{ phone, ok, ref?, error? }]
//   campaign({ channel, title, text, media, contacts: [{ phone, name }], mask }) → { ok, ref?, error? }
//   check()                                    → null when usable, else the reason it is not

const mockAdapter = () => {
  const ref = () => `mock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    check: () => null,
    sendSms: async ({ phones }) => phones.map((phone) => ({ phone, ok: true, ref: ref() })),
    sendVoice: async ({ phones }) => phones.map((phone) => ({ phone, ok: true, ref: ref() })),
    campaign: async () => ({ ok: true, ref: ref() }),
  };
};

class ProviderError extends Error {}

async function fetchWithTimeout(url, init = {}) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
  } catch (e) {
    throw new ProviderError(e.name === 'TimeoutError' ? 'Provider did not answer within 15 s.' : `Provider unreachable: ${e.message}`);
  }
}

// ICTCore REST: basic auth, JSON bodies, X-HTTP-Method-Override, ids returned as bare JSON scalars.
function ictcoreAdapter(integ) {
  const base = String(integ.url || '').replace(/\/+$/, '');
  const authz = 'Basic ' + Buffer.from(`${integ.username || ''}:${integ.password || ''}`).toString('base64');
  const accountId = integ.accountId || '1';

  async function call(method, route, body, contentType = 'application/json') {
    const res = await fetchWithTimeout(`${base}/${route}`, {
      method,
      headers: { Authorization: authz, 'Content-Type': contentType, 'X-HTTP-Method-Override': method },
      body: contentType === 'application/json' ? JSON.stringify(body ?? {}) : body,
    });
    const raw = await res.text();
    let data = raw;
    try { data = JSON.parse(raw); } catch { /* bare text */ }
    if (!res.ok || data?.error) {
      const msg = data?.error?.message || data?.error || `${res.status} ${res.statusText}`;
      throw new ProviderError(`ICTCore ${route}: ${msg}`);
    }
    return data;
  }

  async function smsProgram(title, text) {
    const textId = await call('POST', 'messages/texts', { name: title, data: text, type: 'utf-8', description: '' });
    return call('POST', 'programs/sendsms', { name: title, text_id: textId });
  }

  async function voiceProgram(title, media) {
    const recordingId = await call('POST', 'messages/recordings', { name: title, description: '' });
    await call('PUT', `messages/recordings/${recordingId}/media`, await fs.readFile(media), 'audio/x-wav');
    return call('POST', 'programs/voicemessage', { name: title, recording_id: recordingId });
  }

  async function sendEach(programId, title, phones) {
    const out = [];
    for (const phone of phones) {
      try {
        const contactId = await call('POST', 'contacts', { first_name: phone, last_name: '', phone, email: '' });
        const tid = await call('POST', 'transmissions', {
          title, program_id: programId, account_id: accountId, contact_id: contactId, origin: 1, direction: 'outbound',
        });
        await call('POST', `transmissions/${tid}/send`, {});
        out.push({ phone, ok: true, ref: `transmission:${tid}` });
      } catch (e) {
        out.push({ phone, ok: false, error: e.message });
      }
    }
    return out;
  }

  return {
    check: () => (!base ? 'The ICTCore URL is not set.' : !integ.username ? 'The ICTCore username is not set.' : null),
    sendSms: async ({ text, phones }) => sendEach(await smsProgram('Hospital message', text), 'Hospital message', phones),
    sendVoice: async ({ media, phones, title }) => sendEach(await voiceProgram(title, media), title, phones),
    async campaign({ channel, title, text, media, contacts }) {
      const groupId = await call('POST', 'groups', { name: title, description: 'Created by HOS-Boilerplate' });
      for (const c of contacts) {
        const contactId = await call('POST', 'contacts', { first_name: c.name || c.phone, last_name: '', phone: c.phone, email: '' });
        await call('PUT', `contacts/${contactId}/link/${groupId}`, {});
      }
      const programId = channel === 'voice' ? await voiceProgram(title, media) : await smsProgram(title, text);
      const campaignId = await call('POST', 'campaigns', {
        program_id: programId, group_id: groupId, delay: '', try_allowed: '', account_id: accountId,
      });
      await call('PUT', `campaigns/${campaignId}/start`, {});
      return { ok: true, ref: `campaign:${campaignId}` };
    },
  };
}

// Telenor corporate SMS: session from auth.jsp, then one sendsms.jsp call for a CSV of numbers.
function telenorAdapter(integ) {
  const base = String(integ.url || 'https://telenorcsms.com.pk:27677/corporate_sms2/api').replace(/\/+$/, '');
  const xmlTag = (xml, tag) => (new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml) || [])[1];

  async function sendBulk(text, phones, mask) {
    const auth = await fetchWithTimeout(`${base}/auth.jsp?${new URLSearchParams({ msisdn: integ.username, password: integ.password })}`);
    const authXml = await auth.text();
    if (xmlTag(authXml, 'response') !== 'OK') throw new ProviderError(`Telenor login failed: ${xmlTag(authXml, 'data') || auth.status}`);
    const qs = new URLSearchParams({ session_id: xmlTag(authXml, 'data'), to: phones.join(','), text });
    if (mask) qs.set('mask', mask);
    const res = await fetchWithTimeout(`${base}/sendsms.jsp?${qs}`);
    const xml = await res.text();
    if (xmlTag(xml, 'response') !== 'OK') throw new ProviderError(`Telenor send failed: ${xmlTag(xml, 'data') || res.status}`);
    return xmlTag(xml, 'data');
  }

  return {
    check: () => (!integ.username || !integ.password ? 'The Telenor MSISDN and password are not set.' : null),
    async sendSms({ text, phones, mask }) {
      try {
        const ref = await sendBulk(text, phones, mask);
        return phones.map((phone) => ({ phone, ok: true, ref }));
      } catch (e) {
        return phones.map((phone) => ({ phone, ok: false, error: e.message }));
      }
    },
    sendVoice: async ({ phones }) => phones.map((phone) => ({ phone, ok: false, error: 'Voice through Telenor is not supported yet.' })),
    async campaign({ channel, text, contacts, mask }) {
      if (channel === 'voice') return { ok: false, error: 'Voice through Telenor is not supported yet.' };
      return { ok: true, ref: await sendBulk(text, contacts.map((c) => c.phone), mask) };
    },
  };
}

// bizSMS branded SMS: one GET per number.
function bizsmsAdapter(integ) {
  const base = integ.url || 'http://api.bizsms.pk/api-send-branded-sms.aspx';
  async function sendSms({ text, phones, mask }) {
    const out = [];
    for (const phone of phones) {
      try {
        const qs = new URLSearchParams({ username: integ.username, pass: integ.password, text, masking: mask || '', destinationnum: phone, language: 'English' });
        const res = await fetchWithTimeout(`${base}?${qs}`);
        const body = (await res.text()).trim();
        if (!res.ok || /error|invalid|fail/i.test(body)) throw new ProviderError(`bizSMS: ${body || res.status}`);
        out.push({ phone, ok: true, ref: body.slice(0, 120) });
      } catch (e) {
        out.push({ phone, ok: false, error: e.message });
      }
    }
    return out;
  }
  return {
    check: () => (!integ.username || !integ.password ? 'The bizSMS username and password are not set.' : null),
    sendSms,
    sendVoice: async ({ phones }) => phones.map((phone) => ({ phone, ok: false, error: 'bizSMS does not support voice.' })),
    async campaign({ channel, text, contacts, mask }) {
      if (channel === 'voice') return { ok: false, error: 'bizSMS does not support voice.' };
      const results = await sendSms({ text, phones: contacts.map((c) => c.phone), mask });
      const failed = results.filter((r) => !r.ok);
      return failed.length === results.length
        ? { ok: false, error: failed[0]?.error || 'bizSMS send failed.' }
        : { ok: true, ref: `bizsms-batch-${Date.now().toString(36)}` };
    },
  };
}

const ADAPTERS = { mock: mockAdapter, ictcore: ictcoreAdapter, telenor: telenorAdapter, bizsms: bizsmsAdapter };

// ---------------------------------------------------------------------------
// The one send path.

const skipped = (reason) => ({ status: 'skipped', reason, sent: 0, failed: 0, contacts: 0, invalid: [] });

/**
 * @param {object} p
 * @param {'sms'|'voice'} p.channel
 * @param {'appointment'|'payment'|'broadcast'|'otp'} p.key
 * @param {{ phone: string, name?: string, patientId?: any, refId?: string, ctx?: object }[]} p.recipients
 * @param {string} [p.text]        SMS text; may contain placeholders rendered per recipient.
 * @param {string} [p.mediaPath]   voice recording, relative to STORAGE_DIR.
 * @param {'quick'|'campaign'} [p.style]
 * @param {string} [p.title]       campaign / group name at the provider.
 */
export async function sendMessages({ channel, key, recipients, text = '', mediaPath, style = 'quick', title = 'Hospital message' }) {
  const integ = await Integration.findOne({ channel });
  if (!integ?.provider) return skipped(`No ${channel.toUpperCase()} provider is configured.`);
  const make = ADAPTERS[integ.provider];
  if (!make) return skipped(`Unknown provider ${integ.provider}.`);
  const adapter = make(integ);
  const notReady = adapter.check();
  if (notReady) return skipped(notReady);

  let media = null;
  if (channel === 'voice') {
    if (!mediaPath) return skipped('Voice messages need a recorded template.');
    media = path.join(STORAGE_DIR, mediaPath);
    try { await fs.access(media); } catch { return skipped('The recording file for this template is missing.'); }
  }

  const [settings, institute] = await Promise.all([AppSettings.findOne(), Institute.findOne()]);
  const countryCode = settings?.phoneCountryCode || process.env.COUNTRY_CODE || '92';
  const mask = senderMask(integ, institute?.name || settings?.title);

  // Normalise; drop rows under 10 digits individually. The same text to the same number is
  // sent once, but the row keeps every refId it covers so the dedupe marks them all.
  const invalid = [];
  const byKey = new Map();
  for (const r of recipients) {
    const phone = normalizePhone(r.phone, countryCode);
    if (!phone) { invalid.push({ phone: r.phone || '', name: r.name, reason: 'not a usable phone number' }); continue; }
    const message = channel === 'sms' ? renderTemplate(text, { institute: { name: institute?.name || settings?.title || '' }, ...r.ctx }) : (text || path.basename(mediaPath));
    const k = `${phone}\u0000${message}`;
    const prev = byKey.get(k);
    if (prev) { if (r.refId) prev.refIds.push(r.refId); continue; }
    byKey.set(k, { ...r, phone, message, refIds: r.refId ? [r.refId] : [] });
  }
  const rows = [...byKey.values()];
  if (!rows.length) return { ...skipped('None of the recipients has a usable phone number.'), invalid };
  if (channel === 'sms' && rows.some((r) => !r.message)) return { ...skipped('The message is empty.'), invalid };

  // A campaign carries one text: per-recipient placeholders force direct sends.
  const effectiveStyle = style === 'campaign' && channel === 'sms' && new Set(rows.map((r) => r.message)).size > 1 ? 'quick' : style;

  const logs = await CommsLog.insertMany(rows.map((r) => ({
    type: channel, key, recipient: r.phone, recipientPatientId: r.patientId || undefined, refIds: r.refIds,
    message: r.message.slice(0, 1000), provider: integ.provider, status: 'queued',
  })));
  const rowKey = (phone, message) => `${phone}\u0000${message}`;
  const logByKey = new Map(logs.map((l, i) => [rowKey(rows[i].phone, rows[i].message), l]));

  const results = [];
  let campaignRef;
  try {
    if (effectiveStyle === 'campaign') {
      const out = await adapter.campaign({ channel, title, text: rows[0].message, media, contacts: rows.map((r) => ({ phone: r.phone, name: r.name })), mask });
      campaignRef = out.ref;
      for (const r of rows) results.push({ phone: r.phone, message: r.message, ok: out.ok, ref: out.ref, error: out.error });
    } else if (channel === 'voice') {
      const out = await adapter.sendVoice({ media, phones: rows.map((r) => r.phone), title });
      results.push(...out.map((x) => ({ ...x, message: rows[0].message })));
    } else {
      // Group identical texts so bulk-capable providers send them in one call.
      const groups = new Map();
      for (const r of rows) groups.set(r.message, [...(groups.get(r.message) || []), r.phone]);
      for (const [msg, phones] of groups) {
        const out = await adapter.sendSms({ text: msg, phones, mask });
        results.push(...out.map((x) => ({ ...x, message: msg })));
      }
    }
  } catch (e) {
    const done = new Set(results.map((x) => rowKey(x.phone, x.message)));
    for (const r of rows) if (!done.has(rowKey(r.phone, r.message))) results.push({ phone: r.phone, message: r.message, ok: false, error: e.message });
  }

  await CommsLog.bulkWrite(results.map((x) => ({
    updateOne: {
      filter: { _id: logByKey.get(rowKey(x.phone, x.message))._id },
      update: { $set: x.ok ? { status: 'sent', providerRef: x.ref } : { status: 'failed', error: String(x.error || 'Send failed.').slice(0, 500) } },
    },
  })));

  const sent = results.filter((x) => x.ok).length;
  return {
    status: 'done', provider: integ.provider, style: effectiveStyle, campaignRef,
    contacts: rows.length, sent, failed: results.length - sent, invalid,
    errors: [...new Set(results.filter((x) => !x.ok).map((x) => x.error))].slice(0, 5),
  };
}

// ---------------------------------------------------------------------------
// Reminder jobs. Every misconfiguration returns { status: 'skipped', reason } — never throws.

export const DEFAULT_REMINDER_TEXT = {
  appointment: 'Reminder: you have an appointment at our hospital on {{appointment.date}}. Please arrive ten minutes early.',
  payment: 'You have an outstanding balance at our hospital. Please contact reception to settle it.',
};

// Today's date in the hospital timezone, shifted by `days`, as YYYY-MM-DD.
export function localDate(timezone, days = 0, now = new Date()) {
  let today;
  try { today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC' }).format(now); }
  catch { today = now.toISOString().slice(0, 10); }
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function reminderConfig(key) {
  const type = await NotificationType.findOne({ key });
  if (!type) return { skip: `${key === 'appointment' ? 'Appointment' : 'Payment'} reminders are not set up.` };
  if (!type.enabled) return { skip: `${key === 'appointment' ? 'Appointment' : 'Payment'} reminders are turned off.` };
  const channel = type.channel || 'sms';
  const template = type.templateId ? await MessageTemplate.findById(type.templateId) : null;
  if (channel === 'voice' && !template?.mediaPath) return { skip: 'Voice reminders need a recorded template.' };
  return { channel, text: template?.text || type.defaultText || DEFAULT_REMINDER_TEXT[key], mediaPath: template?.mediaPath };
}

export async function runAppointmentReminder({ days = 1, now = new Date() } = {}) {
  try {
    const cfg = await reminderConfig('appointment');
    if (cfg.skip) return skipped(cfg.skip);
    const settings = await AppSettings.findOne();
    const date = localDate(settings?.timezone, Number(days) || 0, now);

    const appts = await Appointment.find({ date, status: { $nin: ['cancelled', 'completed'] } })
      .sort({ startDateTime: 1 }).limit(JOB_LIMIT).lean();
    const done = new Set(await CommsLog.distinct('refIds', { key: 'appointment', status: 'sent', refIds: { $in: appts.map((a) => String(a._id)) } }));
    const todo = appts.filter((a) => !done.has(String(a._id)));
    const patients = await Patient.find({ _id: { $in: todo.map((a) => a.patientId) } }).select('name phone').lean();
    const byId = new Map(patients.map((p) => [String(p._id), p]));

    const recipients = todo.map((a) => {
      const p = byId.get(String(a.patientId));
      return {
        phone: p?.phone, name: p?.name, patientId: a.patientId, refId: String(a._id),
        ctx: { patient: { name: p?.name || '' }, appointment: { date, time: (a.timeSlot || '').split(' - ')[0] } },
      };
    });
    const base = { date, appointments: appts.length, alreadyReminded: appts.length - todo.length };
    if (!recipients.length) return { ...skipped(appts.length ? 'Every appointment on that day was already reminded.' : `No appointments on ${date}.`), ...base };

    const out = await sendMessages({ channel: cfg.channel, key: 'appointment', recipients, text: cfg.text, mediaPath: cfg.mediaPath, style: 'campaign', title: `Appointment reminder ${date}` });
    return { ...out, ...base };
  } catch (e) {
    return skipped(`Reminder job failed: ${e.message}`);
  }
}

export async function runPaymentReminder({ now = new Date() } = {}) {
  try {
    const cfg = await reminderConfig('payment');
    if (cfg.skip) return skipped(cfg.skip);
    const settings = await AppSettings.findOne();
    const day = localDate(settings?.timezone, 0, now);

    // Derived balance per patient: Σ grossTotal − Σ payments, never a stored status.
    const owing = await Invoice.aggregate([
      { $lookup: { from: 'invoicepayments', localField: '_id', foreignField: 'invoiceId', as: 'payments' } },
      { $group: {
        _id: '$patientId',
        gross: { $sum: { $toDouble: { $ifNull: ['$grossTotal', 0] } } },
        paid: { $sum: { $sum: { $map: { input: '$payments', as: 'p', in: { $toDouble: { $ifNull: ['$$p.amount', 0] } } } } } },
      } },
      { $project: { balance: { $subtract: ['$gross', '$paid'] } } },
      { $match: { balance: { $gt: 0.004 } } },
      { $sort: { balance: -1 } },
      { $limit: JOB_LIMIT },
    ]);
    const refOf = (pid) => `${pid}:${day}`;
    const done = new Set(await CommsLog.distinct('refIds', { key: 'payment', status: 'sent', refIds: { $in: owing.map((o) => refOf(o._id)) } }));
    const todo = owing.filter((o) => !done.has(refOf(o._id)));
    const patients = await Patient.find({ _id: { $in: todo.map((o) => o._id) } }).select('name phone').lean();
    const byId = new Map(patients.map((p) => [String(p._id), p]));
    const currency = settings?.currency || '';

    const recipients = todo.map((o) => {
      const p = byId.get(String(o._id));
      return {
        phone: p?.phone, name: p?.name, patientId: o._id, refId: refOf(o._id),
        ctx: { patient: { name: p?.name || '' }, invoice: { balance: `${currency} ${round2(o.balance).toFixed(2)}`.trim() } },
      };
    });
    const base = { date: day, patients: owing.length, alreadyReminded: owing.length - todo.length };
    if (!recipients.length) return { ...skipped(owing.length ? 'Every patient who owes money was already reminded today.' : 'Nobody has an outstanding balance.'), ...base };

    const out = await sendMessages({ channel: cfg.channel, key: 'payment', recipients, text: cfg.text, mediaPath: cfg.mediaPath, style: 'campaign', title: `Payment reminder ${day}` });
    return { ...out, ...base };
  } catch (e) {
    return skipped(`Reminder job failed: ${e.message}`);
  }
}

export const REMINDER_JOBS = { appointment: runAppointmentReminder, payment: runPaymentReminder };
