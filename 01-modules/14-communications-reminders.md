# 14 — Communications & Reminders (SMS / Voice via ICTCore)

## 1. Architecture decision

The PHP app talks to three providers with duplicated phone-normalisation, `sox` shell-outs and hard-coded Telenor/bizSMS endpoints. Replacement:

- **Provider abstraction** `services/comms.js` with one interface: `sendSms(text, recipients), sendVoice(wav, recipients), campaign(channel, groupId, ...)`.
- Primary adapter: **ICTCore REST** (URL + user + password per channel, account id).
- Optional adapters: Telenor corporate SMS, bizSMS branded SMS — isolated per adapter; credentials in `integrations` docs, never hard-coded.
- **Phone normalisation in exactly one utility** (`normalizePhone(phone, countryCode='92')`): trim → leading `0` → country code → strip non-digits → require ≥ 10 digits, else reject the recipient. Used by every path.

## 2. Broadcast messages ("Send Notification")

One screen, two modes (channel), two delivery styles:

- **Channel**: `sms` (free text) or `voice` (pick a recorded template from `messageTemplates`, or upload a new `.wav` → normalised 8 kHz mono via conversion service).
- **Recipients**: `patients` / `doctors` / `all patients` / **manual list "testing"** (comma-separated phone numbers).
- **Style**: `quick` (one direct transmission per contact) or `campaign` (ICTCore group + campaign, or Telenor list).
- Sender mask (SMS): hospital name stripped to alphanumerics, max 11 chars, fallback to app name.
- Permission: `send_sms/voice`. Every sent campaign/direct send logged into `commsLogs` (see §5).

Endpoint: `POST /api/v1/messages/broadcast { channel, templateId?|uploadId?, text?, recipientType, phoneList?, style }`.

## 3. Templates (voice recordings; SMS templates with placeholders = NEW)

PHP's `message` table held: name, description, recording path, ictcore ids. In the rebuild: `messageTemplates { name (unique), text?, mediaPath?, ictcoreIds?, createdBy }`

- CRUD: `GET/POST/PUT/DELETE /api/v1/message-templates`; delete also removes the media file.
  Permission `send_notification` (configuring templates); `send_sms/voice` covers sending only.
- **Placeholders do not exist in the PHP code** (all sends are static). The rebuild adds them as a new feature: `{{patient.name}}`, `{{appointment.date}}`, `{{invoice.balance}}` — render context is patient/doctor/appointment/invoice document; unknown placeholder → drop it (fail-soft), not the send.
- Reminder jobs use these templates (see reminders).

## 4. Reminder jobs & notification types

`notificationTypes` (port of `notification_type`): `{ key: 'appointment' | 'payment', channel: 'sms' | 'voice', enabled }` + per-key default text template (replaces the misnamed leftover php tables `ictcore_attendance` — appointment reminder — and `ictcore_fees` — payment reminder).

| Job | Target | Text default |
|---|---|---|
| `appointment-reminder --days=1` (0 = today) | up to 200 appointments for that date (joined patients), excluding `cancelled/completed` | "Reminder: you have an appointment at our hospital on {date}. Please arrive ten minutes early." |
| `payment-reminder` | up to 200 patients whose derived invoice balance (Σ `grossTotal` − Σ `invoicePayments.amount`) exceeds 0.004 — one message per patient, not per invoice (invoices have no stored status; settlement is always derived, see 11) | "You have an outstanding balance at our hospital. Please contact reception to settle it." |

Behaviour contract (port): every mis-configured prerequisite → result `{ status: 'skipped', reason }`, never a crash; phone rows failing the ≥10-digit rule are excluded individually; run via node-cron + a worker-only HTTP trigger (token-protected — fix the PHP public endpoint).

Scheduling UI: notification settings screen sets `{ key: channel }` options + a reminder time (replaces `cronschedule` + flat-file time settings).

## 5. Comms log

Replace the never-written `sms_log` with a real outbox:

`commsLogs { type: 'sms' | 'voice', key ('appointment'|'payment'|'broadcast'|'otp'), recipient (phone), recipientPatientId?, message, provider, providerRef?, status: 'queued|sent|failed', error?, createdAt, updatedAt }`

- API: `GET /api/v1/comms-logs?type&from&to&status` (date range; staff view), delete per row (admin).
- This is also the dedupe/query substrate for reminder jobs (`reminderLogs` folded into commsLogs with `key`).

## 6. OTP / verification codes

`verificationCodes { userId, code (4-digit), ipAddress, status, expiresAt, usedAt }`

- Used by optional login 2FA (module 01). Fix in rebuild: expire after 15 min, mark used, one active code per (user, ip), send through the standard comms path (log to commsLogs).

## 7. Email

PHP tables `email`/`email_settings` were never wired. Replacement (new, optional MVP): SMTP from env; send invoice/lab PDFs later. Keep the outbox-delta idea: if emails get sent, they write `commsLogs` with `type: 'email'`. Until the first email feature is actually designed, model only the commsLogs shape.

## 8. Build decisions (rebuild)

- **Provider calls** mirror the PHP app: ICTCore `contacts`, `groups`, `contacts/:id/link/:group`,
  `messages/texts` + `programs/sendsms`, `messages/recordings` + `/media` + `programs/voicemessage`,
  `campaigns` + `/start`, `transmissions` + `/send` (basic auth, `X-HTTP-Method-Override`);
  Telenor `auth.jsp` → `sendsms.jsp` (CSV of numbers, `mask`); bizSMS one GET per number.
  Voice is ICTCore-only; Telenor/bizSMS voice fail the rows with a clear error. A `mock`
  provider logs sends without leaving the server (development).
- **Outbox:** rows are written `queued`, then marked `sent`/`failed`. A provider error never
  fails the request — it fails the rows, with the error stored on each.
- **Dedupe:** `commsLogs.refIds` holds what a row covered (appointment ids; `patientId:YYYY-MM-DD`
  for payment reminders). Runs skip anything with a `sent` row. Identical text to the same
  number is sent once and covers all its refIds.
- **Placeholders** render per recipient; a campaign carries one text, so personalised text
  falls back to direct sends. Legacy single-brace names (`{name}`, `{date}`, …) are aliased.
- **Scheduling:** `appSettings.reminderCron.{appointment,payment}` = daily `HH:MM` in
  `appSettings.timezone`; an in-process minute tick runs due jobs (catch-up on start the same
  day). `DISABLE_SCHEDULER=1` when an external worker calls `/jobs/*` instead.
- **Recordings:** no server-side conversion; uploads must already be 8 kHz mono PCM WAV
  (refused otherwise with the measured format). Stored under `STORAGE_DIR/templates/`.
- **Phone normalisation:** separators stripped first, then `00…` → international,
  `0…` → `appSettings.phoneCountryCode` (default `92`).
- **OTP (§6)** is not wired yet: it belongs to the module 01 login flow.

## 9. Data flow

```
broadcast screen → channel/template/recipients → comms service (provider adapter) → commsLogs rows per send
reminder cron/worker → notificationType config → queries (appointments / invoices) → normalise phones → group contacts → provider campaign → commsLogs
2FA login → verificationCodes → SMS via comms service
```
