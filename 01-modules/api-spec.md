# 03 — REST API Specification

Base: `/api/v1` — JSON, camelCase. Two frontends (React web, React Native) both consume
this; mobile additionally expects a compact payload (both lists resolved server-side).

Auth: `Authorization: Bearer <access-token>` (JWT, 15 min) + refresh token rotation.
Permission model after auth: per-endpoint `requirePermission(key)`; the permission map
(02 §14 → schema) is returned to clients via `GET /auth/bootstrap` so menus can hide.

Error envelope:
```json
{ "error": { "code": "VALIDATION", "message": "…", "fields": { "start": "That doctor is already booked 09:00 - 09:15 with John Smith." } } }
```
Accepted codes: `VALIDATION` (422), `CONFLICT` (409), `FORBIDDEN` (403), `UNAUTHORIZED`
(401), `NOT_FOUND` (404), `SERVER` (500). Field-level messages below are contractual —
they were user-facing strings in the PHP app.

---

## 0. Public endpoints

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/auth/meta` | – | hospital name/logo for login screen |
| POST | `/auth/login` | – | `{ login, password }` → data `{ token, role, menu permissions }` |
| POST | `/auth/method/mail` | – | forgot password token |
| POST | `/auth/reset` | – | reset with token |
| POST | `/auth/refresh` | – | exchange refresh token |

## 1. Auth & users (`permission` on `/users` = admin only)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/auth/bootstrap` | auth | role, permission keys, hospital name |
| POST | `/auth/status` | – | 2FA code check |
| GET | `/users` | admin | list |
| POST | `/users` | admin | create |
| GET | `/users/:id` | admin | |
| PUT | `/users/:id` | admin | partial; password optional |
| DELETE | `/users/:id` | admin | cannot delete own account |
| POST | `/auth/impersonate/:userId` | admin | issues a target-user token (`impersonatedBy` claim) |
| POST | `/auth/impersonate/exit` | impersonated token | issues a fresh token for the original admin |
| GET | `/auth/me` | auth | profile |
| PUT | `/auth/me` | auth | name/phone |
| POST | `/auth/me/password` | auth | verifies current password |
| GET | `/activity?q&user&method&route&ip&limit&offset` | admin | activity log |
| GET | `/activity/:id` | admin | entry + related activities |
| POST | `/activity/clear` | admin | soft-trash all |
| GET | `/activity/cleared` | admin | trash |
| POST | `/activity/restore` | admin | restore all |
| POST | `/activity/destroy` | admin | destroy trash |
| GET | `/roles/:role/permissions` | admin | `{ role, keys }` |
| PUT | `/roles/:role/permissions` | admin | full array replace |
| POST | `/permissions/sync` | admin | `{ prune?: boolean, dryRun?: boolean }` |

## 2. Dashboard & search

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/dashboard` | auth | counts + beds + money + recent |
| GET | `/search?q=` | auth | `{ patients[25], doctors[25], count }`; < 2 chars → `message` |

## 3. Patients  (`patient_view/add/update/delete` per action)

| Method | Path | Notes |
|---|---|---|
| GET | `/patients?q&limit&offset` | LIKE name/patientId/phone/email; newest first |
| POST | `/patients` | only `name` required; returns the new patient (patientId) |
| GET | `/patients/:id` | profile |
| PUT | `/patients/:id` | age re-derived from DOB |
| DELETE | `/patients/:id` | no guard (legacy behaviour) |

## 4. Medical history (`patient_medical_history`)

`GET /medical-history?patient&q&limit&offset` (sort date desc) ·
`POST /medical-history` · `GET /medical-history/:id` · `PUT /medical-history/:id` ·
`DELETE /medical-history/:id` — all with the single permission key; patientId required;
snapshots recorded server-side.

## 5. Appointments

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/appointment-calendar?date&doctor&status` | `appointment_view` | day view; sorted by startDateTime; count meta |
| GET | `/appointments?date&doctor&status&limit&offset` | `appointment_view` | same data, paged (mobile) |
| POST | `/appointments` | `appointment_add` | overlap check in-transaction; 422 with `start` message |
| GET | `/appointments/:id` | `appointment_view` | resolves patient + doctor |
| PUT | `/appointments/:id` | `appointment_update` | excludes self from clash check |
| DELETE | `/appointments/:id` | `appointment_cancel` | frees the slot |
| GET | `/doctors/:id/upcoming-appointments?limit` | `appointment_view` | doctor profile panel |

## 6. Doctors / Departments / Services

| Method | Path | Permission |
|---|---|---|
| GET / POST / GET/:id / PUT/:id / DELETE/:id | `/doctors` (+`?q`) | `doctor_*` |
| GET | `/departments` | `department_view` |
| POST | `/departments` | `department_add` |
| POST | `/departments/adopt` | `department_add` — creates rows for all doctor-text names |
| PUT | `/departments/:id` | `department_update` — cascade rename of doctors (returns movedCount) |
| DELETE | `/departments/:id` | `department_delete` — blocked while used |
| GET / POST / PUT / DELETE | `/services` (+`?q&type`) | `service_*` — delete blocked once invoiced |

## 7. Beds / wards / admissions

| Method | Path | Permission |
|---|---|---|
| GET | `/beds?ward=` + creating/updating/deleting a ward/bed | `bed_view`; `ward_*` |
| GET | `/beds/categories` + CRUD | `ward_*` (delete guard) |
| GET | `/admissions?show=current|discharged|all&limit&offset` | `admission_view` |
| GET | `/admissions/create-data?patient=` | `admission_add` — patients + free beds |
| POST | `/admissions` | `admission_add` — double-admit 422 messages on `bedId`/`patientId` |
| GET | `/admissions/:id` | `admission_view` |
| POST | `/admissions/:id/discharge` | `admission_discharge` — `{ dTime? }`; C&S semantics |
| GET | `/reports/occupancy` | (auth only) |

## 8. Staff

| Method | Path | Permission |
|---|---|---|
| GET / POST / GET/:id / PUT / DELETE | `/staff/:type` | `nurse_*` for `nurse`, `staff_*` otherwise; unknown `type` → 404 |

## 9. Prescriptions / Medicines

| Method | Path | Permission |
|---|---|---|
| GET / POST / GET/:id / PUT / DELETE | `/prescriptions?patient&doctor&drug` | `prescription_*` |
| GET / POST / PUT / DELETE | `/medicines?q&category` | `medicine_*` |
| GET / POST / PUT / DELETE | `/medicine-categories` | `medicine_*` |

## 10. Laboratory

| Method | Path | Permission |
|---|---|---|
| GET / POST / GET/:id / PUT / DELETE | `/labs?status=pending|partial|reported|all&patient` (default `pending` = any unreported test) | `lab_test_*` |
| GET / POST / PUT / DELETE | `/lab-categories` | `lab_test_*` |
| POST | `/labs/:id/results` `{ results: { [testKey]: value|'' } }` | `lab_test_update` |

## 11. Pharmacy sales

| Method | Path | Permission |
|---|---|---|
| GET | `/pharmacy-sales?from&to&patient` | `pharmacy_sale` (list); `pharmacy_stock_view` for stock data |
| GET | `/pharmacy-sales/create-data?prescription&patient` | — prefill payload |
| POST | `/pharmacy-sales` | `pharmacy_sale` — 422 `items` message on stock shortfall |
| GET | `/pharmacy-sales/:id` | receipt |
| DELETE | `/pharmacy-sales/:id` | reversal (restores stock) |

## 12. Invoices

| Method | Path | Permission |
|---|---|---|
| GET | `/invoices?patient&show=outstanding|settled|all&limit&offset` | `invoice_view`; meta includes `owed` |
| POST | `/invoices` | `payment_add` |
| GET | `/invoices/:id` | `invoice_view` |
| POST | `/invoices/:id/pay` | `payment_add` |
| DELETE | `/invoices/:id` | `payment_delete` |

## 13. Accounting

| Method | Path | Permission |
|---|---|---|
| GET / POST / PUT / DELETE | `/accounting/sectors` | `accounting` |
| POST | `/accounting/batch` `{ type, entries[] }` | `accounting` |
| GET / PUT / DELETE | `/accounting/entries?type&from&to&year&month` | `accounting` |
| GET | `/accounting/settings` | `accounting` (secrets masked) |
| PUT | `/accounting/settings` | `accounting` |
| GET | `/accounting/reports/:type?from&to` | `accounting` |
| GET | `/accounting/reports/summary?from&to` | `accounting` |

## 14. Reports

| Method | Path | Permission |
|---|---|---|
| GET | `/reports` | auth (card list w/ permission flags) |
| GET | `/reports/lab?from&to` | `lab_test_view` |
| GET | `/reports/drug-usage?from&to` | `view_pharmacy_reports` |
| GET | `/reports/debtors?from&to` | `view_payment_reports` |
| GET | `/reports/occupancy?from&to` | auth |

## 15. Communications

| Method | Path | Permission |
|---|---|---|
| POST | `/messages/broadcast { channel, recipientType: patients\|all-patients\|doctors\|manual, patientIds?, doctorIds?, phoneList?, style: quick\|campaign, templateId?, text?, dryRun? }` | `send_sms/voice` |
| GET | `/message-templates` | `send_notification` or `send_sms/voice` (senders pick from the list) |
| POST / PUT / DELETE | `/message-templates` | `send_notification` — delete refused (409) while a reminder uses the template |
| PUT | `/message-templates/:id/media` (raw body, `audio/wav`, ≤ 10 MB, 8 kHz mono PCM only) | `send_notification` |
| GET | `/notification-types` → `{ items[{…, time, fallbackText}], timezone }` | `send_notification` |
| PUT | `/notification-types/:key { enabled?, channel?, defaultText?, templateId?, time? 'HH:MM' }` | `send_notification` |
| POST | `/notification-types/:key/run { days? }` — run the reminder now (same code as the scheduler) | `send_notification` |
| GET | `/comms-logs?type&key&status&from&to&q&limit&offset` → `{ items, total, counts }` | `view_sms_voice_reports` |
| DELETE | `/comms-logs/:id` | admin |

## 16. Settings

| Method | Path | Permission |
|---|---|---|
| GET / PUT | `/institute` | `hospital_information_add` |
| GET / PUT | `/settings/app` | admin |
| GET / POST / PUT / DELETE | `/gateways` (+`/:id/enable`,`/:id/disable`) | `payment_*` |
| GET / PUT | `/integrations/:channel` | admin |

## 17. Jobs / worker (internal)

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/jobs/appointment-reminder { days = 1 }` | `x-worker-token` = `WORKER_TOKEN` (unset → 503) | returns `{ status, reason, contacts, sent, failed, invalid, alreadyReminded }` |
| POST | `/jobs/payment-reminder` | worker token | same shape |

(Soft-skip results, never 500, when not configured.)

## 18. Files

| Method | Path | Notes |
|---|---|---|
| POST | `/uploads { file }` | multipart; returns `{ path }`; size/type validated per use |
| GET | `/storage/*` | static/served objects (web direct; mobile via signed URL) |

---

## Error-message contract (from the PHP app, now user-visible strings)

| Situation | Status | Message |
|---|---|---|
| Overlapping appointment booking | 422 | "That doctor is already booked {timeSlot} with {patientName}." |
| Bed already occupied (admit) | 422 | "That bed is already occupied." |
| Patient already admitted | 422 | "That patient is already admitted. Discharge them first." |
| Discharge twice | 409 | "That admission was already discharged on {date}." |
| Discharge before admit | 422 | "A patient cannot be discharged before they were admitted." |
| Overpaid invoice payment | 422 | "Only {balance} is outstanding on this invoice." |
| Discount greater than invoice subtotal | 422 | "The discount is larger than the invoice." |
| Invoice with no charges | 422 | "Add at least one charge." |
| Prescription with no drugs | 422 | "Add at least one medicine." |
| Pharmacy sale short of stock | 422 | "Only {n} of {name} left in stock, and the sale asks for {m}." |
| Delete a doctor with appointments | 409 | "{name} has appointments on file, so the record stays." |
| Delete an occupied bed | 409 | "Bed {n} is occupied. Discharge the patient first." |
| Ward delete with beds | 409 | "That ward already has {count} beds in it." |
| Delete a prescribed medicine | 409 | "{name} has been prescribed, so it stays in the catalogue." |
| Delete an invoiced service | 409 | "{name} has been invoiced, so it stays on the price list." |
| Delete an invoice with payments | 409 | "Money has been taken against this invoice, so it cannot be deleted." |
| Duplicate login/email user | 422 | "A user already exists with that email or login." |
| Duplicate department/service/medicine/lab category | 422 | "That {thing} is already on the list." |
| No permission | 403 | "You do not have permission to do that." |
