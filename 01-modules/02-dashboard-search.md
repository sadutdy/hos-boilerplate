# 02 — Dashboard & Global Search

## 1. Dashboard

One dashboard for **all roles** (no per-role branching in the PHP app). Everything is
computed at read time. Numbers:

| Card | Derivation |
|---|---|
| patients | count `patients` |
| doctors | count `doctors` |
| nurses | count `nurses` |
| total staff | doctors + nurses + receptionists + pharmacists + laboratorists + accountants |
| beds | total = count `beds`; **occupied = count of admissions with `dTime: null`** (fixed from the PHP bug that counted an old allotment collection); free = max(0, total−occupied); occupancy % |
| appointments | total count; pending = count with `status: 'pending'` (lowercased compare) |
| clinical activity | counts of prescriptions, lab requests, diagnostic reports, medicines |
| money | income = Σ `payments.amountReceived` (invoices), expenses = Σ `ledgerEntries.amount` where `type: 'expense'` (unified cash book, see 12 §5), balance = income − expenses |

- Recent lists (limit 5, newest first): patients (`patientId, name, phone, sex, age,
  addDate`) and appointments (patient/doctor resolved by id, `date, timeSlot, status`).
- GET `/api/v1/dashboard` returns `{ counts, beds, money, recent: { patients,
  appointments } }`. Implementable as an aggregation pipeline with a few `$facet`s or
  parallel queries — no write-time summaries.

## 2. Global search

- `GET /api/v1/search?q=...` — used by the global search box in the web header.
- Term trimmed; **< 2 chars** → `{ term, patients: [], doctors: [], count: 0, message:
  'Enter at least two characters.' }`.
- Case-insensitive regex search, limit 25 each:
  - patients over `patientId | name | phone | email | address | bloodGroup`
    → return `{ id, patientId, name, phone, sex, age, bloodGroup }`
  - doctors over `name | phone | email | department | specialist`
    → return `{ id, name, phone, email }`
- Response shape: `{ term, patients, doctors, count }` (count = both lists). Requires no
  special permission beyond authentication.
