# 04 — Appointments & Reminders

## 1. Concept

Manual scheduling at the front desk: a **day view** per doctor + status, bookings with
duration, and a status the desk moves by hand. There are **no enforced status transitions**
at the API layer and **no schedule-based availability** (no weekly-schedule UI, no holiday
blocking in the PHP build — see §6).

## 2. Screens & endpoints

| Screen | API |
|---|---|
| day view + filters (date default today, doctor, status) | `GET /appointments?date&doctor&status` — ordered by `startDateTime` asc, **no pagination** (a day) |
| booking form (message-link: `?date`, `?patient`, `?doctor`) | `POST /appointments` |
| detail | `GET /appointments/:id` (resolves patient + doctor) |
| edit | `PUT /appointments/:id` |
| remove ("cost as the cancel") | `DELETE /appointments/:id` (permission `appointment_cancel`) |

Day-view columns: time (`HH:MM - HH:MM`), patient (link; "Unknown patient" for orphan),
doctor, status (colour map), remarks, vitals, actions. Empty state: "Nothing booked for
{date}."

## 3. Fields (collection `appointments`)

| field | rule |
|---|---|
| `patientId` | required ref |
| `doctorId` | required ref |
| `date` | derived from start datetime (`visit day`) |
| `startDateTime`, `endDateTime` | derived: `end = start + minutes` (never user-typed) |
| `minutes` | 5–480, default 15 |
| `timeSlot` | display string "HH:MM - HH:MM" (derived) |
| `sTimeKey` | legacy sort key `YYYYMMDDhhmm` — optional in rebuild; drop if day view sorts by `startDateTime` |
| `status` | enum `scheduled | arrived | completed | cancelled | no show` (new bookings: `scheduled`) |
| `remarks` | max 500 |
| `vitals` | `{ bloodPressure, pulse, temperature, weight }` — all optional strings; **field name is `temperature` (fixes the PHP `temprature` typo)** |
| `bookingUserId` | clerk id |
| `addDate`, `registrationTime` | stamped |

## 4. Double-booking guard (contract, port exactly)

Run **inside one transaction with the insert**:

1. Find for this doctor any appointment with
   `status NOT IN ('cancelled','no show')`, `id != self` (edit), and **strict interval
   overlap**: `existing.start < new.end AND existing.end > new.start`.
2. If found → reject the whole transaction with field error on `start`:
   `"That doctor is already booked {existing.timeSlot} with {patient.name || 'another patient'}."`
3. Otherwise insert and commit.

Constants of the contract:
- Touching ends allowed (back-to-back is the normal clinic day).
- Cancelled / no-show slots are free.
- Editing re-runs the check with self excluded; delete frees its slot.
- Reject names both the conflicting time **and** the other patient.

## 5. Reminder jobs (worker, not part of booking)

- `appointment-reminder [--days=1]`: target day = now + days (`--days=0` = today).
  1. Look up `notificationType { key: 'appointment' }` → channel (`sms` or `voice`) →
     `integrations` doc for that channel (ICTCore credentials). If anything missing →
     result `{ status: 'skipped', reason }` — soft-skip, never crash.
  2. Fetch up to **200** appointments for that date joined to patients, **excluding**
     status in `cancelled/completed` (case-insensitive).
  3. Phone normalisation (shared utility): trim → leading `0` → country code (`92`,
     configurable) → strip non-digits → require ≥ 10 digits else skip row.
  4. Build an ICTCore contact group `"Appointment reminder {date}"`, push contacts, and
     start an SMS campaign. Message text from `reminderTemplates` (key `appointment`) or
     default: "Reminder: you have an appointment at our hospital on {date}. Please arrive
     ten minutes early."
- Dedupe: the PHP app has **no per-appointment "reminder sent" flag**. Replacement design:
  store `reminderLogs { appointmentId | patientId, type: 'appointment' | 'payment',
  sentAt, campaignRef }` and skip already-logged rows (new, recommended).
- Run via `node-cron` (or the worker queue); never an unauthenticated HTTP trigger (fix:
  PHP exposed `/cronjob/payment-reminder` publicly — add a token/worker-only route).

## 6. Holiday/schedule handling — open design decision

- Dormant facts: `time_schedule` (per-doctor weekday windows + duration) and `holidays`
  tables exist with **no consumer code**; booking is constrained **only** by the overlap
  guard.
- Minimum port: keep it that way (manual by design).
- Roadmap option (call it out for MVP+): enforce doctor weekly schedule + day-offs at
  booking time; this is **new behaviour**, modelled as `doctorSchedules { doctorId, windows:
  [{ weekday, start, end }], holidays: [date] }`.
