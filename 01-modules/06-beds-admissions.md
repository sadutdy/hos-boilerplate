# 06 — Beds, Wards, Admissions

## 1. Concept (invariants, port exactly)

- A **ward** (`bed_categories`) is a named ward type ("General", "ICU"). Beds are numbered
  **per ward** — "General 1" and "ICU 1" may coexist (unique compound index
  `{ wardId, number }`).
- An **admission** is the record of a patient-bed stay: `admissions` doc with
  `dTime: null` while on the ward. **Open admission = occupancy. Nothing may ever consult a
  cached bed status for a decision** (keep `bed.status` only as a write-only display cache
  — or drop it entirely and derive everywhere; the API should derive).
- Invariants: **one open admission per bed** and **one open admission per patient**.
- There is no separate charge linkage from admissions to invoices — billing is patient-keyed
  (11). Discharge generates nothing.

## 2. Beds & wards CRUD

| Entity | Fields | Rules |
|---|---|---|
| `bed_categories` (ward) | `name` (req ≤ 100), `description` (≤ 100) | no rename-cascade needed; **delete refused while beds exist** |
| `beds` | `wardId` (req ref), `number` (req ≤ 100), `description` (≤ 100), cache `status`, `lastAdmittedAt`, `lastDischargedAt` | `wardId+number` unique; **delete refused while occupied** ("Bed N is occupied. Discharge the patient first.") |

(no ward-type edit screen in the PHP app; add rename with a guard if the product needs it).

## 3. Admissions

### Endpoints

| API | Notes |
|---|---|
| `GET /admissions?show=current|discharged|all&limit` | default `current` (`dTime: null`); order admitTime desc; limit 200; resolves patient name, bed number/ward name (falls back to admission snapshot if bed deleted) |
| `GET /admissions/create?patient=` | patient select (name + patientId) + **free beds only** (wards − occupied); button disabled when none free |
| `POST /admissions` | admit |
| `GET /admissions/:id` | detail + live "since" duration |
| `POST /admissions/:id/discharge` | discharge (permission `admission_discharge`) |

### Fields (collection `admissions`)

| field | rule |
|---|---|
| `patientId` | req ref |
| `bedId` | req ref |
| `number`, `wardId` | **snapshot** of bed number + ward at admit history's survival survives bed/ward edits or deletions |
| `admittedAt` | provided or `now()` |
| `dTime` | **null = occupied**; set exactly one at discharge |
| `status` | `admitted` → `discharged` (derived from `dTime` for display) |

### Admit transaction (contract)

Inside one transaction:
1. Check no **open admission for that bed** → else field reject on `bedId`: "That bed is
   already occupied."
2. Check no **open admission for that patient** → else reject on `patientId`: "That patient
   is already admitted. Discharge them first."
3. Insert admission (snapshot + times + status `admitted`).
4. Update bed cache (`status: 'occupied'`, `lastAdmittedAt`).
Any failure rolls all back.

### Discharge rules (contract)

- `dTime` optional in the request; blank = now.
- **Already discharged → 409** "That admission was already discharged on {date}." — enforce with
  atomic compare-and-set: `updateOne({ _id, dTime: null }, { $set: { dTime, status:
  'discharged' } })`; `matched == 0` → already discharged.
- **`dTime < admittedAt` → 422** "A patient cannot be discharged before they were
  admitted." (pre-check).
- Free the bed cache **in the same transaction** as the compare-and-set. If the bed was
  deleted meanwhile, the bed update matches nothing and is skipped silently.
- Readmission after discharge is legal (new admission doc). Bed transfer = discharge +
  re-admit.

## 4. Ward board & occupancy

- Ward board `GET /beds?ward=`: list beds grouped by ward; derive occupant per bed from
  open admissions (never `bed.status`); show "N free of M", occupant link "since {time}",
  "Admit" link on free beds, delete button only when free.
- Aggregate occupancy report → 13-reports (per-day series, average stay floored at 1 day,
  by-ward grouping with "Removed bed" fallback).

## 5. Data flow

```
ward board → admit form (free beds) → POST /admissions (txn) → ward board shows occupant
→ LOS clock (live while admitted; fixed span at discharge)
→ patient billed from invoices (not state change)
→ POST discharge (C&S) → bed free instantly (re-admittable by anyone)
```
