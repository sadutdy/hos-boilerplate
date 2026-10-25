# 13 — Reports

Card-grid index page; every figure **derived at read time** (no summary tables). Range
helper shared by all reports: `?from&to` default last N days; **reversed dates swapped,
not rejected**; span capped at **366 days**. Each card hidden unless the role has the
underlying permission.

## 1. Outstanding lab work (perm `lab_test_view`)

- Unit = **test row** (a part-reported request still shows its pending culture).
- Rows: tests with blank `result`, joined to request date + patient; ordered by age
  (oldest first); each with `days` = whole days since request date.
- Counts: `overdue` = tests ≥ 3 days; `byTest` = outstanding grouped by test name.

## 2. Prescribed vs dispensed (drug usage) (perm `view_pharmacy_reports`)

- Range default 30 days. Matched on the **drug name text** (so free-typed drugs count).
- Left: prescribed count per name (`prescriptions` in range, `$unwind items`).
- Right: dispensed per name (`pharmacy sales` in range → Σ `quantity`, Σ `lineTotal` value).
- Output rows: union of names sorted by activity; `totalValue` footer. A big
  prescribed≫dispensed gap signals stock-out or off-system dispensing.

## 3. Aged debtors (perm `view_payment_reports`)

- Invoices with `balance > 0.001`, grouped by patient:
  '{ patient, invoiceCount, owed (Σ balance), oldest invoice date, days }';
  sorted by owed desc. Age from the **oldest unsettled invoice**, not newest.
- Buckets by patient age on money: `0–30 / 31–60 / 61–90 / 90+` days; footer with total
  owed and per-bucket sums; empty state "Nothing outstanding".

## 4. Bed occupancy / length of stay (no special permission — auth only)

- Admission units only — **never consults any bed status cache**.
- Range default last 30 days. Candidate admissions: still open (`dTime: null`) **or**
  discharged within range; admitted within range.
- **Per-day series**: for each day, occupied = admissions where
  `admittedAt ≤ endOfDay(day)` and (`dTime: null` or `dTime ≥ startOfDay(day)`);
  `percent = round(occupied / max(1, beds.count) × 100)`.
- Summaries: `totalBeds`, `currentlyOccupied`, `discharges`,
  `averageStay = mean(max(1, LOS))` over closed admissions (LOS floors at 1 day, 1 dp),
  `peak` = max day occupancy, `byWard` = admissions grouped by ward name
  ("Uncategorised" / "Removed bed" fallbacks).

## 5. Accounting reports

See 12-accounting §4 (type report + combined summary) — part of the accounting menu,
surfaced on the reports grid as well.

## 6. Endpoints

| API |
|---|
| `GET /api/v1/reports/lab?from&to` |
| `GET /api/v1/reports/drug-usage?from&to` |
| `GET /api/v1/reports/debtors?from&to` |
| `GET /api/v1/reports/occupancy?from&to` |
| `GET /api/v1/reports/accounting/:type?from&to` |
| `GET /api/v1/reports/accounting/summary?from&to` |
| `GET /api/v1/reports` (card definitions with permission booleans for the frontend) |

All JSON; the React web client renders print-friendly layouts (or future server PDF).
