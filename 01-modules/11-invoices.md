# 11 — Invoices & Billing

## 1. Model (three layers, port exactly)

The PHP header table is `payment` and the modernised app replaced the legacy "packed
strings" with real child tables. For the rebuild use three collections (or header doc +
two embedded arrays — recommend **separate collections** for `invoicePayments` so payment
append is its own atomic set):

1. **`invoices`** (`payment`): patient/doctor refs + **snapshots** (`patientName`,
   `patientPhone`, `patientAddress`, `doctorName` — the printed record survives patient
   edits later), `date`, `discount`, `vat`, `remarks` (≤ 500), `items[]` embedded,
   derived `amount` (subtotal), `grossTotal`.
2. **`items[]`** (embedded): `{ serviceId?, name (copied from service — overrides typing),
   quantity (≥1), unitPrice (provided, else service.price at charge time, else 0,
   **snapshot**), lineTotal (qty × unit) }`.
3. **`invoicePayments`** (append-only instalments): `{ invoiceId, amount (2 dp), method?
   (≤60), reference? (≤120), paidAt }` — kept, never merged; no edit/delete endpoint.

Derived, never typed:
`paid = Σ payments`; `balance = round(grossTotal − paid, 2)`;
`settlement = paid <= 0 ? 'unpaid' : balance > 0.004 ? 'part paid' : 'paid'`
(0.004 = penny-tolerance). Represent `status` only as a cached mirror where legacy
consumers need it (dashboard sum); **decisions always derive**.

## 2. Create (contract)

`POST /invoices`, one transaction:
- `patientId` req; `doctorId` optional; `date` req.
- validate items: **≥ 1 valid line** ("Add at least one charge…"); a given `serviceId`
  overrides the typed name from the catalogue; drop blank-resolved rows.
- `discount ≤ subtotal` else 422 "The discount is larger than the invoice."
- `grossTotal = round(subtotal − discount + vat, 2)` (discount subtracts, vat adds).
- Insert the invoice + embedded items. New invoice: no payments → unpaid.

## 3. Take payment (contract)

`POST /invoices/:id/pay` — `{ amount (> 0.01, 2 dp), method?, reference? }`:
- **Overpayment refused** with "Only {balance} is outstanding on this invoice."
- Concurrency-safe inside one transaction: recompute the balance inside the tx, compare
  against `amount` (tolerance 0.004), append the payment — refused payments leave
  **zero partial state** (both racing 600-on-1000 requests: exactly one accepted).
- Anything already paid keeps the invoice non-deletable.

## 4. Delete

`DELETE /invoices/:id` — **refused when paid > 0** ("Money has been taken against this
invoice, so it cannot be deleted."); else single write (embedded items cascade).

## 5. Endpoints

| API | Notes |
|---|---|
| `GET /invoices?patient&show=|outstanding|settled|all` | default `outstanding` (balance > 0.004); cap 200; header includes total `owed` |
| `POST /invoices` | create |
| `GET /invoices/:id` | items, totals, payments history (`paidAt/method/reference/amount`), take-payment form availability when balance > 0 |
| `POST /invoices/:id/pay` | part payment |
| `DELETE /invoices/:id` | guarded |

## 6. Consumers

- **Debtors report** (13): groups invoices with balance > 0.001 by patient — aged from the
  **oldest unsettled invoice**; buckets 0–30 / 31–60 / 61–90 / 90+ days.
- **Payment reminder job** (14): patients whose derived balance (Σ `grossTotal` − Σ
  payments over their invoices) exceeds 0.004 → one SMS per patient.
- **Dashboard** (02): income = Σ collected payment amounts.
- **Printing**: browser print in the PHP app (print-media CSS). Rebuild: web client
  implements a print route; a server-side PDF (e.g. Puppeteer) is an improvement, not a port.

## 7. Test behaviours to port verbatim (the PHP suite)

1 charge → paid 200/500 → `part paid` + balance 300; another 300 → `paid`** and the two
payment rows are kept, not merged**; overpay 501 refused; discount 600 vs subtotal 500
refused; empty items refused; free-text charge allowed ("Dressing pack"); price freeze after
catalogue change; racing overpayments; exact instalments settle exactly.
