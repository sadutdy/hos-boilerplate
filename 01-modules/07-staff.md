# 07 — Staff (Nurse, Pharmacist, Laboratorist, Receptionist, Accountant)

## 1. Concept

One controller/config-driven CRUD over **five collection shapes** that are effectively
identical. doctors are NOT here (module 05 — they have departments, qualifications and a
patient-facing workflow). In the rebuild all five live in a single `staff` collection with
a `type` field:

`type: 'nurse' | 'pharmacist' | 'laboratorist' | 'receptionist' | 'accountant'`

- Unknown type in a URL → **404, never fallback** (avoid injection-style table-name bugs).
- **No login accounts are created for staff**; `users` is a separate register. Do not
  invent portal flows for staff in the rebuild.
- Permissions: `nurse_*` has its own family; the other four share `staff_view/add/update/
  delete`. Consequence to port: a role with `nurse_view` opens the nurse list but is
  denied the same screen for accountant.

## 2. Fields (collection `staff`)

| field | rule |
|---|---|
| `type` | enum above |
| `name` | required, max 100 — **only required field** ("someone starting on Monday has a name and nothing else") |
| `email` | optional, format-checked, **unique within the same `type`** (excluding self). Same email may exist under two types |
| `phone`, `address` | optional, max 100 |
| `imgUrl` | photo ≤ 2 MB |

Upload rule: writing a new photo replaces the stored path; **edit without an upload never
clears an existing photo**.

## 3. Endpoints

| API | Notes |
|---|---|
| `GET /staff/:type?q` | search `name/phone/email`, sort name asc, 25/page |
| `POST /staff/:type` | create |
| `GET /staff/:type/:id` | read |
| `PUT /staff/:type/:id` | update (photo rule above) |
| `DELETE /staff/:type/:id` | hard delete; safe — nothing references staff rows |

## 4. Drop with documentation

- Legacy filler columns `x/y/z`, `ion_user_id` — gone; the only linkage is `type`.
- Mobile consideration: staff CRUD is web-only in practice; include in admin API anyway.

## 5. Data flow

```
sidebar (Nurse + "Other Staff" dropdown) → /staff/:type list → add/edit/delete
staff.name may appear in display contexts but no clinical table references staff rows
```
