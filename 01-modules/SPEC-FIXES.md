# Spec reconciliation — contradictions and recommended picks

**Status: all 15 applied on 2026-10-25** (spec docs and code). Each item lists the conflicting statements, what the current code in `backend/` and
`web/` already does, the recommended resolution, and which documents or code must change.
Where the code already matches one side and that side is sound, the recommendation is to
keep the code and fix the spec.

Status key: **spec-only** = edit docs only · **code** = code change needed too.

---

## 1. Broken cross-references in README — spec-only

- README lists `02-database-schema.md` and `03-api-spec.md` at the root; the files are
  `01-modules/database-schema.md` and `01-modules/api-spec.md`.
- README §1.1 and 01 §4 point to "`02-database-schema.md` §14" for the permission
  catalogue; it is §3 (§14 is medicines).

**Pick:** update README table and both references to the real paths and `§3`.

## 2. Permission collection name — spec-only

- 01 §4: `rolePermissions`. Schema §3: `permissions`.
- Code: model `RolePermission` (`backend/src/models/auth.js:69`) → collection
  `rolepermissions`.

**Pick:** `rolePermissions`. Rename schema §3 heading. It matches the code and avoids
confusion with the in-code catalogue (`config/permissions.js`).

## 3. Roles without a permission group — spec-only (decision)

- 8 user roles, but only 4 permission groups (`admin, doctor, nurse, accountant`).
  Pharmacist, laboratorist, receptionist and patient have no `rolePermissions` doc, so
  under "missing grant == denied" they can open nothing beyond auth-only screens.
- Code: `PERMISSION_ROLES` has 4 entries, `USER_ROLES` has 8
  (`config/permissions.js:13-14`) — same gap.

**Pick:** allow a permission doc for every staff role (`PERMISSION_ROLES = USER_ROLES`
minus `patient`), seeded empty except admin. This keeps PHP's role-scoped model and lets an
admin grant a pharmacist `pharmacy_sale` without logging in as someone else. Keep
`patient` out until the patient portal (mobile) is designed. Update 01 §4, README §1.1,
schema §3 and the permissions grid. **code** follow-up: widen `PERMISSION_ROLES`.

## 4. Vitals temperature field name — spec-only

- 04 §3: API field `temp` ("fix the PHP `temprature` typo"). Schema §7: `temperature`.
- Code: `temperature` in model, types and form (`models/ward.js:15`,
  `web/src/types/index.ts:83`).

**Pick:** `temperature`. It fixes the typo without a cryptic abbreviation. Edit 04 §3.

## 5. Double-discharge status code and message — code

- 06 §3: 400 "That admission was already discharged on …". API spec: 409 with
  "…discharged on {date}." Schema follows the C&S rule only.
- Code: 409 via `conflict()`, message without the date (`routes/ward.js:189`).

**Pick:** 409 `CONFLICT` with the date in the message. It is a state conflict, not bad
input. Edit 06 §3 to 409. **code:** after `matched == 0`, read the admission's `dTime`
and include it: "That admission was already discharged on {date}."

## 6. Impersonation path — code

- 01 §1: `POST /api/v1/admin/impersonate/:userId`. API spec: `/auth/impersonate/:userId`.
- Code (before the fix): served at `/api/v1/impersonate/:userId` — the router defines it
  without the `/auth` prefix — with an admin check in the handler. No exit endpoint.

**Pick:** `/auth/impersonate/:userId`. Edit 01 §1. Also specify the exit call (01 says
logout returns to admin, but no endpoint is listed): add `POST /auth/impersonate/exit`.
**Applied:** route moved under `/auth`; exit endpoint added (declared before `/:userId`).

## 7. Self-service profile paths — code

- 15 §4: `GET/PUT /api/v1/me`, `POST /api/v1/me/password`. API spec: `/auth/me…`.
- Code (before the fix): served at `/api/v1/me` and `/api/v1/me/password` (no `/auth`
  prefix). The web app called neither.

**Pick:** `/auth/me`, `/auth/me/password`. Edit 15 §4. **Applied:** routes moved.

## 8. Lab list status filter values — code

- 09 §5: `pending` (any test without result, default) and `reported`. API spec:
  `pending | partial | reported`.
- Code: default `pending`; contains a dead `'pending2'` branch
  (`routes/clinical-records.js:170-171`).

**Pick:** `pending | partial | reported | all`, defined as:
- `pending` = request has at least one unreported test (status `requested` or `partial`)
  — the technician work queue, default;
- `partial` / `reported` = exact derived request status;
- `all` = no filter.

Edit 09 §5 and the API spec. **code:** implement `partial`/`reported`/`all` and
reject unknown values with 422; remove the `pending2` branch.

## 9. Service name field — spec-only

- 05 §3: `category` (PHP name). Schema §10: `name` (PHP `category`).
- Code: `name` (`models/billing.js`).

**Pick:** `name`. Edit 05 §3 field table; keep "PHP `category`" as a migration note.
Length: 05 says max 100, and the `Service` model already uses 100 (`models/clinic.js`), so
no code change. (The `maxlength: 200` in `models/billing.js` is the invoice line name.)

## 10. Activity-log access — spec-only

- 01 §5: "staff role required". API spec: admin.
- Code: `requireRole(['admin'])` on every `/activity` route (`routes/auth.js:201+`).

**Pick:** admin only. The log holds IPs, user agents and every user's actions. Edit 01 §5.

## 11. Dashboard expenses source — spec-only

- 02 §1: expenses = Σ `expenses.amount`. 12 §5: drop `expenses`, read from
  `ledgerEntries` (unified cash book).
- Code: `LedgerEntry` with `type: 'expense'` (`routes/dashboard.js:34`).

**Pick:** `ledgerEntries` (type `expense`). Edit 02 §1.

## 12. Bed cache update on discharge — spec-only

- 06 §3: free the bed "after success; skip silently if the bed was deleted". Schema §12:
  free the bed "inside the same transaction".
- Code: inside the same transaction (`routes/ward.js:175-185`).

**Pick:** same transaction; `Bed.updateOne` with no match (bed deleted) is a no-op, which
already satisfies "skip silently". Edit 06 §3. Note the cache is display-only, so either
would be safe — the transaction just keeps it consistent.

## 13. Pharmacy reversal wording — spec-only

- 10 §1: "full restoration, including free-typed lines are skipped" — self-contradictory.
- Code: restores stock only for lines with `medicineId`; free-typed lines have no stock to
  restore (`routes/pharmacy.js:239-243`).

**Pick:** "Restore stock for every catalogue line; free-typed lines (no `medicineId`) have
no stock and are skipped." Also: if the medicine was deleted since the sale, the
`updateOne` matches nothing — state that this is acceptable. **code (minor):** return the
documented message "Sale reversed and stock returned." instead of `{ ok: true }`.

## 14. Payment-reminder target — spec-only

- 11 §6 / 14 §4: invoices with `grossTotal > amountPaid`, excluding status `paid/cancelled`.
  Invoices have no `amountPaid` or `status` field, and there is no cancelled state.
- Code: derives balance from `invoicePayments`, includes balance > 0.004, sums per patient
  (`routes/comms.js:142-150`).

**Pick:** "Up to 200 patients whose derived invoice balance (Σ `grossTotal` − Σ payments)
exceeds 0.004 — one message per patient, not per invoice." Edit 11 §6 and 14 §4.
**code (efficiency, later):** replace the per-invoice `find` loop with one `$lookup`
aggregation.

## 15. Message-template permission — code

- API spec §15: `/message-templates` and `/notification-types` use `send_notification`.
- Code: `send_sms/voice` (`routes/comms.js:13-43`).

**Pick:** `send_notification` for template and notification-type management,
`send_sms/voice` for broadcasting only. Listing templates accepts either key, because the
broadcast screen needs the list to pick one — this is what the API spec says and it separates
"configure" from "send". **code:** change the four template routes.

---

## Summary

| # | Topic | Pick | Change |
|---|---|---|---|
| 1 | README references | real paths, §3 | spec |
| 2 | Permission collection | `rolePermissions` | spec |
| 3 | Roles without groups | permission doc per staff role | spec + code |
| 4 | Temperature field | `temperature` | spec |
| 5 | Double discharge | 409 with date | spec + code |
| 6 | Impersonation path | `/auth/impersonate/:userId` + exit endpoint | spec + code |
| 7 | Profile paths | `/auth/me` | spec + code |
| 8 | Lab status filter | `pending\|partial\|reported\|all` | spec + code |
| 9 | Service field | `name`, max 100 | spec |
| 10 | Activity log | admin only | spec |
| 11 | Dashboard expenses | `ledgerEntries` | spec |
| 12 | Bed cache on discharge | same transaction | spec |
| 13 | Reversal wording | catalogue lines only | spec + minor code |
| 14 | Payment reminder | derived balance, per patient | spec |
| 15 | Template permission | `send_notification` | code |
