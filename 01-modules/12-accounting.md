# 12 — Accounting

## 1. Ledger (manual cashbook)

Two collections (PHP `accounting_sector` + `accounting`):

- **`accountSectors`**: `{ name (≤500, required), type: 'income' | 'expense' }`
  (normalise the PHP misspelling `Expence` → `expense` in the API; migrate data).
- **`ledgerEntries`** (`accounting`): `{ sectorId (loose name join in PHP — make it
  `sectorId` ref), name (sector name), type: 'income'|'expense', amount (Decimal128),
  date, description }`.

### Create income/expense entry — batch form (contract)

The PHP screen accepts a **batch**: multiple rows of `{ sector, amount, date,
description }` in one POST. Port this: each row validated (`amount ≥ 0`, date required);
rows with empty amount/date skipped. (Fix PHP bugs: amount cap `between:0,99.99` is
wrong — allow any positive amount; failed rows must 422, not silently drop.)

### Sector delete guard

PHP had none (entries store sector by *name*). New design: sector docs get refs —
recommend **blocked while entries reference it** OR store sector name snapshot on entries
and allow rename-cascade (pick one, document it). Default: ref + block, like other
catalogues.

## 2. Income / expense screens & endpoints

| API |
|---|
| `GET /accounting/sectors` + CRUD |
| `POST /accounting/batch { type: 'income'|'expense', entries: [...] }` |
| `GET /accounting/entries?type&from&to` (also `?year&month` month filter; month name → number server-side) |
| `GET /accounting/entries/:id`, `PUT`, `DELETE` |

## 3. Accounting settings (external integration creds)

Singleton doc `accountingSettings` `{ companyId, apiLink, username, password }` —
credentials for an external accounting API (IctCore-ish). Password **write-only**
(never echoed — fix the PHP view that echoed it back). Full-replace semantics on save.

## 4. Reports (print)

Two printables (browser print pages in the repair):

- **Type report** `GET /accounting/reports/:type?from&to`: rows in the date range
  (inclusive), `total` = Σ amount; if type `income`, add billing figures from invoices in
  range: `Σ grossTotal`, `Σ paid`, `due = gross − paid`,
  split **regular invoices vs `depositType`-marked invoices** (port the split but rename
  the PHP school leftover `$tutionfees/$otherfees` variables: `regularTotal` /
  `depositTotal`).
- **Combined summary** `GET /accounting/reports/summary?from&to`:
  `totalIncome = Σ manual income entries + invoices.paid (regular + deposit)`
  `totalExpense = Σ manual expense entries`
  `balance = totalIncome − totalExpense`.
- Both render with the institute header; empty data → a clear "No data in range" state,
  not an alert popup.

## 5. Expense category tables — status

The PHP `expense`/`expense_category` collections fed only the dashboard expense sum, with
no UI. Decision: drop them and read dashboard expenses from `ledgerEntries` (unified cash
book) — or add a "quick expense" screen that writes ledger entries. Default: unify.

## 6. Data flow

```
sectors → batch income entries / batch expense entries → month list → edit/delete within month
→ type report (print) and summary report (print, includes invoice collections)
dashboard expense numbers come from ledger entries (single ledger after unification)
```
