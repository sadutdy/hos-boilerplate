# 09 — Laboratory

## 1. Test catalogue (`labCategories`)

| field | rule |
|---|---|
| `name` (PHP `category`) | required ≤ 100, unique |
| `description` | optional ≤ 100 |
| `referenceValue` | optional ≤ 1000 (e.g. "13.5 to 17.5 g/dL") |
| `procedureId` | optional (ICTCore voice procedure id, dormant) |

- Delete guard: a test that has **ever been requested** stays ("…so technicians can read an
  old result's reference/procedure").
- List shows usage counts.

## 2. Lab request (collection `labs`)

Header created by a clinician; **at least one test** required.

| field | rule |
|---|---|
| `patientId` | required ref |
| `doctorId` | optional ref |
| `date` | required |
| `tests[]` | embedded rows (below) |
| snapshots | `patientName/patientPhone/patientAddress/doctorName` copied at request time |
| `status` | **derived** (below), never typed |
| `reportedAt` | set only when fully `reported` |
| requestUserId | clerk/clinician |

Embedded `tests[]`:

| field | rule |
|---|---|
| `labCategoryId` | ref (optional nullable) |
| `name` | **copied** from catalogue (snapshot — later edits never rewrite) |
| `referenceValue` | **copied** from catalogue (snapshot) |
| `result` | reported value string (≤ 1000), null while pending |
| `status` | `requested` / `reported` per row |
| `reportedAt` | per-row |

## 3. Status derivation (contract)

After any result write:

```
reportedCount = tests with non-blank result
request.status = reportedCount == 0 ? 'requested'
             : reportedCount == tests.length ? 'reported'
             : 'partial'        ← intermediate state
reportedAt (request) = (status == 'reported') ? now : null
```

## 4. Result entry (contract)

`POST /labs/:id/results` with `{ results: { [testId]: value | '' } }`, one transaction:

- Blank input for an **already reported** test → **skip, never wipe** (guards stale page
  submits).
- Value present → set `result`, `status: 'reported'`, `reportedAt: now`.
- Value blank & not reported → stays `requested`.
- Then recompute derived request status.

## 5. Endpoints

| API | Notes |
|---|---|
| `GET /labs?patient&status` | `status`: `pending` (default — request has at least one unreported test, i.e. derived status `requested` or `partial`; the technician work queue), `partial` / `reported` (exact derived status), `all` (no filter). Unknown value → 422. 25/page |
| `POST /labs` | create (transaction adds nothing else) |
| `GET /labs/:id` | header + tests + patient + doctor |
| `POST /labs/:id/results` | per-test save (above) |
| `PUT /labs/:id` | editable (date/doctor); tests via `attach/remove` style update |
| `DELETE /labs/:id` | plain |

## 6. Notes

- Technician linkage does **not** exist (only the requesting user is recorded). Roadmap
  option: `assignedTo` on `labs`.
- "Outstanding lab work" report (13) units are **tests**, not requests — a part-reported
  request still shows its pending culture.
- Keep the historical printed-summary idea only if printers need it; the record is the rows.
