# HOS-Boilerplate — Specification (Express.js + MongoDB + React/React Native)

This folder is the specification for **HOS-Boilerplate**, a Node.js rebuild of the legacy
**ICTHospital** app (Laravel 12 + MySQL, source at `../ICTHospital`):

- **Backend:** Express.js + Mongoose + MongoDB (replica set — transactions are required)
- **Frontends:** React (web, staff/admin) + React Native (mobile, doctors/patients)
- **Auth:** JWT access + refresh tokens, role-based permissions
- **Source of truth for this spec:** a code-level read of every controller, model,
  migration and feature test in the Laravel codebase.

Documents:

| File | Contents |
|---|---|
| `01-modules/*.md` | Every module: functionality, screens, fields, business rules, data flow |
| `01-modules/database-schema.md` | MongoDB collections, fields, indexes, invariants |
| `01-modules/api-spec.md` | REST API — all endpoints, request/response shapes, error contracts |
| `01-modules/SPEC-FIXES.md` | Resolved contradictions between the documents (applied) |

---

## 1. Global conventions (apply to every module doc)

### 1.1 Auth & permissions
- A single `users` collection; log in with **username (`login`)** + password.
- `role`: `admin | doctor | nurse | pharmacist | laboratorist | accountant | receptionist | patient`
  (Laravel stored the role as `users.group` strings; permission checks use the lowercased role).
- **90 permissions**, granted per role: every staff role (`admin`, `doctor`, `nurse`,
  `pharmacist`, `laboratorist`, `accountant`, `receptionist`) has its own grant set; `patient`
  has none until the patient portal is designed. Full catalogue with keys in
  `database-schema.md` §3. Enforcement = a `requirePermission('<key>')`
  middleware on routes; the frontend hides menu items it can't open. There are **no per-user
  overrides** — permissions are role-scoped only.
- Admin always has everything (seeded).

### 1.2 Money, dates, ids
- **Money:** store as **Decimal128** (Mongoose `mongoose.Types.Decimal128`), 2 dp, rounded at
  write time. Money columns in the PHP app are `varchar` — never port that.
- **Dates:** BSON `Date` (ISO). Never strings.
- **Numeric ids / display codes:** keep the display-code pattern — `patientId` is a zero-padded
  6-digit **string** generated from a `counters` collection (never reuse after delete).
  Relationships use ObjectId references.
- **Snapshot copies:** where the PHP app deliberately copies denormalized display data at write
  time (e.g. `patientName/patientPhone/patientAddress` onto invoices, prescriptions, lab
  requests, medical history; bed `number`/`category` onto admissions; item `name`/`unitPrice`
  copied from price lists at charge time), **keep that design**. It is a record-keeping
  invariant: written records must not change when a catalogue edited later.
- **Derived values are never typed by hand**: settlement status (unpaid / part paid / paid),
  lab request status (`requested | partial | reported`), bed occupancy, report figures —
  always computed from child rows at read/write time.

### 1.3 Concurrency (transactions are load-bearing)
The PHP app guards these races with DB transactions + row locks. In MongoDB each becomes a
**multi-document transaction** (`session.startTransaction()` on a replica set), or an atomic
single-op guard where possible:

| Race | PHP guard | Mongo rebuild |
|---|---|---|
| Two clerks registering patients get distinct ids | `SELECT MAX... FOR UPDATE` + insert | increment a `counters` doc with `findOneAndUpdate` (atomic) |
| Two clerks booking the same doctor slot | same-transaction overlap check `FOR UPDATE` | transaction: insert + overlap check; retry on `TransientTransactionError` |
| Two clerks admitting to the same bed / same patient | transaction + `lockForUpdate` checks | transaction with guarded inserts (§norm 05) |
| Two part-payments overpaying an invoice | transaction + `lockForUpdate`, refuse > balance + 0.004 | transaction: recompute balance inside txn, append payment, refuse overpay |
| Two counters selling the last units of a medicine | `lockForUpdate` + aggregate same-sale quantities before decrement | transaction: aggregate lines per medicine, guarded `updateOne({_id, quantity: {$gte: qty}}, {$inc:{quantity:-qty}})` inside txn |
| Double discharge | compare-and-set on `d_time: null` | `updateOne({_id, dTime: null}, {...})` — atomic |

- Back-to-back appointment slots are **allowed** (09:00–09:15 + 09:15–09:30 do not clash).
- Watch out for `TransientTransactionError` / `UnknownTransactionCommitResult` — retry with
  the standard loop.

### 1.4 Uploads
Uploads go to object storage (S3-compatible or local disk); the doc stores the relative path.
Uploaded-file replacement rules are kept (e.g. staff photo replace, never auto-clear).

### 1.5 Timezone
Server stores UTC. The PHP app had `Asia/Karachi` hard-coded in places — make timezone a
runtime/tenant setting, not code.

### 1.6 API shape
- REST under `/api/v1`, JSON, camelCase keys.
- Errors: `4xx/5xx` with `{ error: { code, message, fields? } }` — keep the PHP app's
  *field-level reject messages* (they are good): e.g. `start`: "That doctor is already booked
  09:00 - 09:15 with John Smith."
- List endpoints: `?q` search, `?limit&offset` pagination (25 default in PHP), filters by
  exact values, stable sort orders as documented per module.

---

## 2. Module map (Laravel → rebuild)

| # | Module | Docs | Laravel controller(s) |
|---|---|---|---|
| 01 | Auth, users, roles, permissions, activity log | `01-auth-users.md` | UsersController, Auth/*, PermissionController, LaravelLoggerController |
| 02 | Dashboard & global search | `02-dashboard-search.md` | DashboardController, SearchController |
| 03 | Patients & medical history | `03-patients-history.md` | PatientController, MedicalHistoryController |
| 04 | Appointments & reminders | `04-appointments.md` | AppointmentController |
| 05 | Doctors, departments, services (price list) | `05-doctors-departments-services.md` | DoctorController, DepartmentController, PaymentCategoryController |
| 06 | Beds, wards, admissions | `06-beds-admissions.md` | BedController, AdmissionController |
| 07 | Staff (nurse, pharmacist, laboratorist, receptionist, accountant) | `07-staff.md` | StaffController |
| 08 | Prescriptions & medicines | `08-prescriptions-medicines.md` | PrescriptionController, MedicineController |
| 09 | Laboratory | `09-laboratory.md` | LabController, LabCategoryController |
| 10 | Pharmacy (sales, stock) | `10-pharmacy.md` | PharmacyController + BarcodeController |
| 11 | Invoices & billing | `11-invoices.md` | InvoiceController |
| 12 | Accounting | `12-accounting.md` | AccountingController, PaymentGatewayController |
| 13 | Reports | `13-reports.md` | ReportController |
| 14 | Communications & reminders (SMS/voice via ICTCore) | `14-communications-reminders.md` | MessageController, SmsController, TemplateController, ICTCoreController, CronjobController |
| 15 | Settings, institute, branches | `15-settings.md` | SettingsController, InstituteController |

---

## 3. What to DROP (do not rebuild)

The Laravel app is itself a rewrite of CodeIgniter 2 and still carries baggage. Explicit
drop-list for the MongoDB rebuild:

- **Public-website CMS**: `Slide`, `Notice`, `Featured`, `WebsiteSettings`, the legacy
  `service` table (`img_url/title/description`) — nothing consumes them; if a public site is
  ever built it gets its own service, not hospital tables.
- **School leftovers**: dossier of `regiNo/class/section-shift` SMS screens, `smsFormat`
  screen ("supersoft" sender), `smsLog` (never written), `sms_settings` (unused msg91 stub),
  legacy `verify_codes` OTP path, `Level`-based dead code inside MessageController, `FeeCol`
  (`stdBill`), `FeeSetup` (`feesSetup`), 33 school tables already removed by
  `hospital:remove-school-tables`.
- **Dead auth paths**: open registration (RegisterController has no routes), forgotten/reset
  password (no routes wired), `guest` middleware redirect to `/home` (route doesn't exist),
  `SuperAdmin` middleware hard-coding `login == 'ictkashif'`, second `verify_code` OTP flow.
- **Flat-file settings**: `storage/app/public/*.txt` feature flags (`grad_system`, `family`,
  `accounting`, `cronsettings`, `cronsettingdiary`) become real document fields.
- **Dormant tables with no UI**: `time_schedule`/`time_slot` (doctors' weekly availability
  machinery — see 04 for whether to revive), `holidays` (booking never consulted it),
  `Donor` register, `patient_material`, `Email`/`EmailSettings` (never wired). Model them
  only if a roadmap feature needs them.
- **Bugs to fix while porting** (documented in module docs): password change without
  current-password verification, user update requiring password re-entry, duplicated
  unauthenticated `/settings` route, OTP codes never expiring, accounting `between:0,99.99`
  validation, batch-income redirect swallowed, `Expence` spelling (normalize to `expense`
  in the API but migrate legacy data), payment reminder HTTP endpoint with no auth.

---

## 4. Suggested repository layout (target project)

```
hos-boilerplate/
├── backend/
│   ├── src/
│   │   ├── config/            # env, permissions catalogue, roles
│   │   ├── models/            # Mongoose models (02-database-schema.md)
│   │   ├── services/          # counters, ledger, stock, reminding, ictcore client
│   │   ├── controllers/       # one per module
│   │   ├── routes/            # one router per module (03-api-spec.md)
│   │   ├── middleware/        # auth(JWT), requirePermission, activityLog, error handler
│   │   └── jobs/              # node-cron reminders, reminder worker queue
│   └── tests/                 # port the 153 PHP feature tests; key ones listed per module
├── web/                       # React app
└── app/                       # React Native app
```

## 5. Testing: behaviours that MUST be ported as tests

The Laravel app has 153 feature tests that encode the business rules; port them to Jest +
supertest (or Mocha). The highest-value set, per module:

- Patients: id allocation solidity; only name required; age derived from DOB.
- Appointments: overlapping booking refused (error names slot + other patient); touching
  slots allowed; cancelled/no-show slots reusable; edit ignores itself; delete frees slot.
- Beds/admissions: double admit same bed refused; patient admitted twice refused; discharge
  before admit refused; double discharge refused; readmission allowed; occupancy board from
  open admissions.
- Prescriptions: zero-drug prescription refused; item name copied from catalogue;
  "patients on this drug" query; catalogue medicine prescribed can't be deleted.
- Lab: snapshot name/reference; part-reporting `partial`; blank doesn't wipe reported;
  full report sets `report_date`; catalogue test in use can't be deleted.
- Pharmacy: transactions atomic on failure; no negative stock; duplicate-line aggregation;
  free-typed lines allowed with explicit price; reversal restores stock; price snapshot.
- Invoices: ≥1 charge; discount ≤ subtotal; overpay refused (racing too); instalments kept
  not merged; settlement derived; money-taken invoice not deletable; price freeze.
- Services: duplicate refused; invoiced service not deletable; price edit never rewrites
  invoices.
- Reports: outstanding-lab ages correctly; debtors keyed by oldest unsettled invoice;
  occupancy ignores `bed.status`.
- Reminders: soft-skip paths (misconfiguration → "skipped" result, never crash).
