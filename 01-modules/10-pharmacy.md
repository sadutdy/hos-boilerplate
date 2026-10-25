# 10 — Pharmacy (Medicine Stock, Sales, Barcode)

## 1. Sales (counter dispensing) — collection `pharmacy_sales` (PHP header `pharmacy_payment`)

A sale is one transaction: header + embedded `items[]` + stock decrements commit or roll
back **together**. A failed sale must leave **no partial record and no stock movement**.

### Header fields

| field | rule |
|---|---|
| `patientId` | **optional** — a counter sale needs no patient |
| `doctorId` | unused in new code — drop |
| `date` | required |
| `amount` | derived: Σ line totals (subtotal), 2 dp |
| `discount`, `vat` | free-form amounts ≥ 0 (not % rates) |
| `grossTotal` | derived `max(0, amount − discount + vat)` |
| `amountReceived` | input or defaults to `grossTotal` |
| `status` | always `paid` on sale |
| `saleUserId` | clerk |

### Item fields (embedded)

| field | rule |
|---|---|
| `medicineId` | optional ref (non-catalogue lines are legal, e.g. "Imported dressing") |
| `name` | snapshot from catalogue or typed |
| `quantity` | int ≥ 1 |
| `unitPrice` | provided, else catalogue **`sellingPrice`**, else 0 — **snapshot at sale time** |
| `lineTotal` | derived `unitPrice × quantity`, 2 dp |

### Stock contract (port exactly)

Inside **one transaction**:
1. Aggregate wanted quantities **per medicine** across duplicate lines first (6 + 6 against
   10 in stock must be refused even though either line alone would pass).
2. For each catalogue line, decrement with a guarded atomic update inside the transaction
   (`updateOne({ _id, quantity: { $gte: wanted } }, { $inc: { quantity: -wanted } })`;
   `matched == 0` → reject whole sale with field error on `items`:
   "Only {N} of {name} left in stock, and the sale asks for {M}.").
3. Insert the sale doc + items. Retain 2-dp money rounding at write time.

**Stock can never go negative**, and there is never a partial commit.

### Reversal (delete) contract

`DELETE /pharmacy-sales/:id`, one transaction: increment stock back by each catalogue
line's quantity, then delete the doc. Free-typed lines (no `medicineId`) have no stock and
are skipped. If a medicine was deleted since the sale, its stock update matches nothing —
acceptable. Message: "Sale reversed and stock returned."

## 2. Sales screen / endpoints

| API | Notes |
|---|---|
| `GET /pharmacy-sales?from&to` | range defaults to 1st of month → today; `date BETWEEN`; 25/page; footer `takings` = Σ gross over range |
| `POST /pharmacy-sales` | sale (transaction). `?prescription=:id` pre-loads a prescription's items into the form before the sale |
| `GET /pharmacy-sales/:id` | receipt (header + items + patient) |
| `DELETE /pharmacy-sales/:id` | reversal (above) |

## 3. Expense bookkeeping tables — status

PHP had dormant `pharmacy_expense/pharmacy_expense_category` tables with no screens. Do not
model them unless an MVP needs a separate pharmacy ledger; accounting (12) is the ledger
that has UI. `pharmacy_payment_category` (with d/h commission split) is likewise unused —
drop.

## 4. Barcode

Standalone label-sheet generator (web only): enter a 10-digit code → renders 3 × 14
sequential Code-128 PNG labels (code +1 each), print-and-cut. No DB writes. Keep as a
server-side generator endpoint `POST /tools/barcode-sheet { code }` returning label data —
or move to a client-side internal package in the React app (recommended: generate the
rendering in the web app, drop the endpoint).

## 5. Data flow

```
catalogue (08) → sale screen (pre-fill from prescription?prescription=:id → or patient)
→ POST sale (txn: items + stock) → receipt
reversal restores stock; drug-usage report (13) matches by item name
```
