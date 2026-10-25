# 05 — Doctors, Departments, Services (Price List)

## 1. Doctors

One doctor register feeds appointment / prescription / lab / invoice selects — a clean
install blocks clinical modules until a doctor exists.

### Fields (collection `doctors`)

| field | rule |
|---|---|
| `name` | required, max 100 (a locum starting Monday has only a name) |
| `email` | optional, format-checked, **unique when given** (excluding self) |
| `phone`, `address` | optional |
| `department` | **department NAME as text** (see §2 cascade) |
| `specialist` (PHP `profile`) | qualification/profession, max 100 |
| `imgUrl` | photo ≤ 2 MB |

- List: search `q` on name/department/phone/email, sort name asc, 25/page, plus an
  **upcoming-load column** = count of appointments per doctor with `date >= today` and
  status not in `cancelled/no show` (an aggregated projection).
- Profile: department, qualification, contact + **recent 20 appointments** (date desc)
  with patient links; buttons "Book an appointment".
- Delete guard: **blocked if any appointment references the doctor** ("…has appointments on
  file, so the record stays."). Photo file not removed.

## 2. Departments

| field | rule |
|---|---|
| `name` | required, max 100, unique ("That department is already on the list.") |
| `description` | optional, max 1000 |

- List shows per-department **doctor usage counts** and an **unlisted list** of distinct
  `doctor.department` texts that have no department row (legacy of text-based fields).
- **Adopt** action: create department rows for all such doctor-used names in one call.
- **Rename cascade:** doctor.department is text, and rename must carry doctors along:
  one transaction — update department name, then `doctors.updateMany({ department: oldName },
  { department: newName })`. Report "moved N doctor record(s)".
- **Delete guard:** blocked while doctors carry the name.

> Same asymmetry applies as with patient `doctorName`: renaming a *doctor* never rewrites
> patient.doctor text. Confirm this is acceptable.

## 3. Services (billable price list)

This is the `payment_category` table — mounted at `/services` so it can never collide with
`/invoices/{id}`. Invoice line items reference it (see 11).

### Fields (collection `services`)

| field | rule |
|---|---|
| `name` (PHP `category`) | required, max 100, unique ("That service is already on the price list.") |
| `description` | optional, max 100 |
| `price` (PHP `cPrice`) | optional numeric ≥ 0, **normalised to 2 dp** |
| `type` | optional grouping label (list sorts/filters by it) |
| `dCommission`, `hCommission` | optional ints 0–100 — recorded, **applied to nothing** (roadmap: doctor/hospital split decisions) |

- List shows a **usage count** (invoice lines referencing it) so price editors can see what
  is already billed.
- Price philosophy (invariant): the list price is the *current* price and is **copied onto
  invoice lines at charge time** — editing prices never rewrites historical bills.
- Delete guard: blocked if any `invoice_item` references it.

## 4. Data flow

```
departments (or Adopt) → doctors → services  (bootstrap order)
patients/doctors selects on appointments, prescriptions, lab requests, invoices
rename department → doctor rows updated in one transaction
service price change → only future invoices
```
