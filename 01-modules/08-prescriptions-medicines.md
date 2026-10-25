# 08 — Prescriptions & Medicines

## 1. Prescriptions

Written for a **patient** (not tied to an appointment). Only `patientId`, `doctorId`,
`date` required. **Drugs are rows — never a packed string** (the central schema improvement
of the modernised PHP app, keep it).

### Fields

`prescriptions`: `{ patientId (req ref), doctorId (req ref), date (req, default today),
symptom? (≤100), advice? (≤1000), note? (≤1000), validity? (≤100), items: [...] }`

`items[]` (embedded in the prescription doc — no separate collection needed):

| field | rule |
|---|---|
| `medicineId` | optional ref (free-typed drugs are legal — a doctor must not be stopped by pharmacy stock) |
| `name` | max 200. **If catalogue id is given, name is copied from the medicine doc (overrides typing). Blank-resolved rows dropped.** |
| `dosage` (≤100), `duration` (≤100), `instructions` (≤500) | optional |

- **Zero valid items → 422** "Add at least one medicine."
- Whole prescription stored + items replaced **wholesale on edit** (one transaction; old
  rows never merged).
- Optional legacy summary: keep a `summary` string ("Amoxil 1+0+1 for 5 days, Paracetamol
  2x") recomputed on write for exports if the downstream consumers need it — or drop it
  in the rebuild and let exports aggregate.

### Endpoints

| API | Notes |
|---|---|
| `GET /prescriptions?patient&doctor&drug&q` | filters: exact patient/doctor; drug prefix with `FOREIGN_KEY doctorId`; `drug` matches embedded item names (`'drugs'` array positionally matched → use `$elemMatch` on `items.name` regex). Sort newest first, 25/page |
| `POST /prescriptions` | create (transaction adds nothing else) |
| `GET /prescriptions/:id` | header + items + patient + doctor |
| `PUT /prescriptions/:id` | validate + replace items |
| `DELETE /prescriptions/:id` | plain (embedded items go with it) |

### "Which patients are on this drug" (headline query)

Match on the **stored item name** (so free-typed drugs match too):
`prescriptions.find({ 'items.name': /amoxil/i })` → projection into patient list.

## 2. Medicine catalogue

### Fields

`medicines`: `{ name (req ≤100, unique with `box`), categoryId? (ref), generic? , company?,
`box`? (pack size), `price`? (purchase), `sellingPrice`? (`selling price`, ≥ 0),
`quantity` (int ≥ 0, default 0), `effects`?, `expiryDate`?, `addDate` }`

### Rules

- **Uniqueness**: same `name` + same `box` = data-entry slip → reject ("That medicine is
  already in the catalogue with the same pack size."). Different pack size is a new line.
- Categories: `medicineCategories { name (req ≤100, unique), description? }`; **delete
  refused while medicines reference it**.
- **Delete guard**: a medicine that has ever been prescribed (`prescriptions.items.medicineId`)
  **cannot be deleted** ("has been prescribed, so it stays in the catalogue."). Embedded-item
  name copies keep prescriptions readable regardless.

### Endpoints

| API |
|---|
| `GET /medicines?q&category` (search over name/generic/company, 30/page) + CRUD |
| `GET /medicine-categories` + CRUD (delete guard) |

## 3. Data flow

```
prescription written (items snapshot names) →
  ["dispense later" → 10-pharmacy screen pre-loads ?prescription=:id → ] counter sale
  drug-usage report (13) joins prescriptions.items x pharmacy sales by name
```
