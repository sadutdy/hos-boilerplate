# 02 — MongoDB Database Schema

Mongoose 8 schemas. **Transactions require a replica set** — run with `mongod --replSet`
(or Atlas). All collections live in one database; timestamps enabled except where noted.

Naming: camelCase fields; collections plural (`patients`, `appointments`, …).
Idioms: refs are ObjectId; display codes are separate string fields; money is Decimal128
(represent as `MongooseTypes.Decimal128`, TOJSON transform to string `"500.00"`).

---

## 1. `counters`

```ts
{ name: string (unique)   // 'patientId', 'saleNumber', ...
  seq: number }
```
Allocation helper `nextCounter(name)` = `findOneAndUpdate({ name }, { $inc: { seq: 1 } },
{ upsert: true, new: true })` — atomic; a transaction runner is not needed here.

---

## 2. `users`

```ts
{ firstName, lastName, login (unique), email (unique), passwordHash,
  role: 'admin'|'doctor'|'nurse'|'pharmacist'|'laboratorist'|'accountant'|'receptionist'|'patient',
  phone, desc,                             // 'desc' → about
  addDate, registrationTime }
```
- Indexes: `{ login: 1 unique }`, `{ email: 1 unique }`, `{ role: 1 }`.
- Access: bcrypt cost ≥ 10; never select `passwordHash` by default.

### `refreshTokens`
`{ userId, tokenHash, expiresAt, revokedAt?, ip, userAgent }`
Index: `{ tokenHash: 1 }`, `{ userId: 1, expiresAt: 1 }` TTL?
(ttl on expiresAt, revoke check application-side).

### `passwordResetTokens`
`{ email, tokenHash, expiresAt, usedAt? }` — TTL 60 min.

### `verificationCodes`
`{ userId, ipAddress, code, status: 'active'|'used', expiresAt (TTL), usedAt? }`
Index: `{ userId: 1, ipAddress: 1 }`.

---

## 3. `rolePermissions`
```ts
{ role: 'admin'|'doctor'|'nurse'|'pharmacist'|'laboratorist'|'accountant'|'receptionist',
  keys: [string] }                                // granted keys
```
One doc per staff role; `patient` has none until the patient portal is designed.
Unique `{ role: 1 }`. Catalogue (90 keys) lives in code
(`backend/src/config/permissions.js`), not in the DB. Admin seeded with all.

Key list (grouped, complete):

- patients: `patient_view/add/update/delete`, `patient_medical_history`, `patient_portal_access`, `patient_bulk_add`
- appointments: `appointment_view/add/update/cancel`, `appointment_calendar`, `view_appointment_reports`
- admissions/beds/wards: `admission_view/add/discharge`, `bed_view/allot/release`, `ward_view/add/update/delete`
- clinical: `prescription_view/add/update/delete`, `lab_test_view/add/update/delete`, `diagnostic_report_view/add`, `operation_theatre_view/schedule`
- pharmacy: `medicine_view/add/update/delete`, `pharmacy_sale`, `pharmacy_stock_view`, `view_pharmacy_reports`
- staff: `doctor_view/add/update/delete/portal_access/schedule`, `nurse_view/add/update/delete`, `staff_view/add/update/delete`, `department_view/add/update/delete`
- money: `payment_view/add/update/delete`, `patient_deposit`, `invoice_view`, `invoice_print`, `expense_view/add/update/delete`, `payroll_view/process`, `view_payment_reports`, `accounting`
- comms/admin: `send_sms/voice`, `send_notification`, `view_sms_voice_reports`, `service_view/add/update/delete`, `holidays_view/add/delete`, `hospital_information_add`, `branch_view/add/update/delete`

(character set caveat: the `send_sms/voice` key contains a slash by legacy derivation — keep key strings verbatim to match the catalog; a URL-encoder-safe encoding for route param use is not needed because keys appear only in middleware args.)

---

## 4. `institute` (singleton) and `appSettings` (singleton)

```ts
institute:    { name, establishedYear, website, email, phone, address, logoUrl }
appSettings:  { title, loginTitle, logoUrl, invoiceLogoUrl, address, phone, email,
               facebookId, currency, language, discountDefault, vatDefault, timezone,
               paymentGateway, smsGateway, reminderCron: { appointment, payment } }
```
Single-doc per collection; APIs full-replace.

---

## 5. `patients`
```ts
{ patientId: '000123' (unique, string, counter-allocated),
  name (indexed), fatherName, phone (indexed), email, address,
  sex: 'male'|'female'|'other'|'', dateOfBirth: Date?,
  age: number? (derived at write), bloodGroup: enum|'',
  doctorName: string (free text), imgUrl, howAdded: 'front desk',
  addDate: Date, registrationTime: Date }
```
Indexes: `patientId unique`, `name`, `phone`, `email`.

## 6. `medicalHistory`
```ts
{ patientId: ObjectId ref, title, description,
  date: Date?, imgUrl?,
  patientName, patientAddress, patientPhone,     // snapshots
  registrationTime, createdBy }
```
Index: `{ patientId: 1, date: -1 }`. Delete: plain.

## 7. `appointments`
```ts
{ patientId: ObjectId, doctorId: ObjectId,
  date: Date, startDateTime: Date, endDateTime: Date, minutes: number(5..480, default 15),
  timeSlot: 'HH:MM - HH:MM' (derived), sTimeKey: 'YYYYMMDDhhmm' (derived, optional legacy),
  status: 'scheduled'|'arrived'|'completed'|'cancelled'|'no show',
  remarks?: string(≤500), vitals: { bloodPressure?, pulse?, temperature?, weight? },
  bookingUserId, addDate, registrationTime }
```
Indexes (hot paths):
- `{ doctorId: 1, startDateTime: 1 }` (clash check; day view)
- `{ date: 1 }`, `{ patientId: 1 }`, `{ status: 1 }`.
Clash query: `find({ doctorId, status: { $nin: ['cancelled','no show'] },
  startDateTime: { $lt: end }, endDateTime: { $gt: start } })` — inside the same
  transaction as the insert.

## 8. `doctors`
```ts
{ name (req, indexed), email (unique-sparse when given), phone, address,
  department: string (text), specialist, imgUrl }
```
Delete guard: no `appointments.doctorId` references.

## 9. `departments`
`{ name (unique), description }`. Rename=cascade transaction (doctor text rewrite).

## 10. `services` (price list; PHP `payment_category`)
```ts
{ name (PHP 'category', unique, ≤100), description, price: Decimal128?,
  type?: string, dCommission?: 0-100, hCommission?: 0-100 }
```
Delete guard: referenced by `invoices.items.serviceId`.

## 11. `bedCategories` (wards) & `beds`
```ts
bedCategories: { name (req ≤100), description? }
beds: { wardId: ObjectId, number: string, description?,
        status: 'free'|'occupied' (cache ONLY — derive everywhere),
        lastAdmittedAt?, lastDischargedAt? }
```
Indexes: `{ wardId: 1, number: 1 unique }`.

## 12. `admissions`
```ts
{ patientId: ObjectId, bedId: ObjectId,
  number: string (snapshot), wardId: ObjectId (snapshot), wardName?: snapshot,
  admittedAt: Date, dTime: Date? (null = on ward; the ONLY truth of occupancy),
  status: 'admitted'|'discharged', createdBy }
```
Indexes: `{ dTime: 1 }` (partial for open admits), `{ bedId: 1 }`, `{ patientId: 1 }`,
`{ admittedAt: -1 }`.
Admit txn: verify no open admission for bed and for patient, insert, update bed cache.
Discharge: `updateOne({ _id, dTime: null }, { $set: { dTime, status: 'discharged' } })`
(matched==0 → already discharged, 409 with the stored discharge date), then free bed
inside the same transaction (no-op if the bed was deleted).

## 13. `staff`
```ts
{ type: 'nurse'|'pharmacist'|'laboratorist'|'receptionist'|'accountant',
  name (req), email?, phone?, address?, imgUrl? }
```
Partial unique index: `{ email: 1 }` with `partialFilterExpression: { type: ... }` per
type — or `getIndexes` no; simplest: application-level check in a transaction
(`exists(type, email, excluding id)`) + non-unique index.
No login-link. Unknown/foreign `type` → 404 at route level.

## 14. `medicines` & `medicineCategories`
```ts
medicines: { name (req), box?, unique(model: name+box app-checked),
             categoryId: ref?, generic?, company?, effects?,
             price?: Decimal128 (purchase), sellingPrice?: Decimal128,
             quantity: int ≥ 0, expiryDate?, addDate }
medicineCategories: { name (unique), description? }
```
Delete guards: medicine delete violates not violated directly; block deletion if
prescription fragments reference it (`prescriptions.items.medicineId`); category deletion
blocked if medications reference it.

## 15. `prescriptions`
```ts
{ patientId: ObjectId, doctorId: ObjectId, date: Date,
  symptom?, advice?, note?, validity?,
  items: [ { medicineId?, name (copied-or-typed), dosage?, duration?, instructions? } ],
  summary?: string (recomputed legacy export line), state: 'issued',
  createdBy, createdAt }
```
Indexes: `{ patientId: 1, date: -1 }`, `{ 'items.name': 1 }` (multikey — powers the drug query),
`{ doctorId: 1 }`. Items replaced wholesale on update (single doc write).

## 16. `labCategories`
`{ name: (unique), description?, referenceValue?, procedureId? }`
Delete guard: ever requested.

## 17. `labs` (lab request)
```ts
{ patientId: ObjectId, doctorId?: ObjectId, date: Date,
  tests: [ { labCategoryId?, name (copied), referenceValue? (copied),
             result?: string(≤1000), status: 'requested'|'reported', reportedAt? } ],
  status: 'requested'|'partial'|'reported' (derived), reportedAt?,
  patientName, patientPhone, patientAddress, doctorName (snapshots),
  requestUserId }
```
Indexes: `{ patientId: 1, date: -1 }`, `{ status: 1 }`, `{ 'tests.result': 1 }`
(outstanding report) — note `'tests.result': 1` multikkey matches empty conveniences; the
outstanding query is `labs.find({ 'tests.result': null })` semantics via `$elemMatch`.

## 18. `pharmacySales` (PHP `pharmacy_payment`)
```ts
{ patientId?: ObjectId,                     // optional counter sale
  date: Date, items: [ { medicineId?, name, quantity ≥ 1,
                         unitPrice: Decimal128 (snapshot), lineTotal } ],
  amount: Decimal128 (Σ lineTotal), discount: Decimal128, vat: Decimal128,
  grossTotal: Decimal128 (max(0, amount − discount + vat)),
  amountReceived: Decimal128 (default grossTotal), status: 'paid',
  saleUserId, saleNumber? (counter display) }
```
Indexes: `{ date: -1 }`, `{ patientId: 1 }`. Sale txn stock contract in 10-pharmacy.

## 19. `invoices` & `invoicePayments`
```ts
invoices: { patientId: ObjectId, doctorId?: ObjectId, date: Date,
  discount: Decimal128, vat: Decimal128, remarks?,
  items: [ { serviceId?: ObjectId, name (copied), quantity ≥ 1,
             unitPrice: Decimal128 (snapshot), lineTotal } ],
  amount: Decimal128 (Σ lineTotal), grossTotal: Decimal128,
  depositType?: string (regular invoices empty),  // future deposit feature
  createdBy, createdAt }
invoicePayments: { invoiceId: ObjectId, amount: Decimal128, method?, reference?,
                   paidAt: Date }
```
Indexes: `invoices { patientId: 1, date: -1 }`, `{ date: 1 }`;
`invoicePayments { invoiceId: 1 }`.
Derived: `paid`, `balance`, `settlement` — always computed (module 11 contract).

## 20. `accountSectors` & `ledgerEntries`
```ts
accountSectors: { name (≤500), type: 'income'|'expense' }
ledgerEntries:  { sectorId: ObjectId, sectorName (snapshot), type: 'income'|'expense',
                  amount: Decimal128, date: Date, description?, createdBy }
```
Indexes: `{ type: 1, date: -1 }`.

## 21. `gatewayCredentials`, `accountingSettings`, `integrations`
```ts
gatewayCredentials: { name (unique), merchantKey?, salt?, apiUsername?, apiPassword?,
                      apiSignature?, status: 'enabled'|'disabled' }   // one enabled
accountingSettings: { companyId, apiLink, username, password } (singleton; secrets un-readable)
integrations: { channel: 'sms'|'voice', provider: 'ictcore'|'telenor'|'bizsms',
                url?, username?, password?, accountId?, mask? }   // one per channel
```
All secrets write-only at the API layer.

## 22. `notificationTypes`, `messageTemplates`
```ts
notificationTypes:  { key: 'appointment'|'payment', channel: 'sms'|'voice', enabled }
messageTemplates:   { name (unique), text?, mediaPath?, providerRefs?, createdBy }
```

## 23. `commsLogs`
```ts
{ type: 'sms'|'voice'|'email', key: 'appointment'|'payment'|'broadcast'|'otp',
  recipient: string (normalised), recipientPatientId?: ObjectId,
  message: string, provider, providerRef?, status: 'queued'|'sent'|'failed',
  error?, createdAt, updatedAt }
```
Index: `{ createdAt: -1 }`, `{ key: 1, recipient: 1 }` (dedupe query).

## 24. `activityLogs`
```ts
{ description, details?, userType: 'registered'|'guest'|'crawler', userId?,
  ip, userAgent, locale, referer, method, route,
  rel?: { model, id }, createdAt, deletedAt? }
```
Indexes: `{ createdAt: -1 }`, `{ userId: 1 }`.

## 25. `doctorSchedules` (roadmap, optional)
`{ doctorId (unique), windows: [ { weekday: 0-6, start: 'HH:MM', end: 'HH:MM' } ],
holidays: [Date] }` — used by booking only if the schedule-enforcing feature is built.

---

## Ordering & seeding

Seeder order: appSettings → institute (optional; admin prompts) →
users(admin) → rolePermissions (all keys for admin) →
departments → doctors → services → medicineCategories/medicines →
bedCategories/beds → accountSectors → demo patients/appointments/… (DemoDataSeeder port).
