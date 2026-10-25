# 03 — Patients & Medical History

## 1. Patients

Design stance (from the PHP code): **only `name` is required** — a 2 a.m. walk-in with no
paperwork must be registerable; and **age is always derived from `dateOfBirth`** at write
time, never typed.

### 1.1 Screens & endpoints

| Screen | API |
|---|---|
| list + search (single box; name/patient-id/phone/email LIKE) | `GET /patients?q&limit` — sort newest first, 25/page; columns: patientId, name, age, sex, phone, doctor, registered date |
| registration form | `POST /patients` → redirect to profile |
| profile (detail) | `GET /patients/:id` |
| edit | `PUT /patients/:id` |
| delete | `DELETE /patients/:id` |

### 1.2 Fields (collection `patients`)

| field | rule |
|---|---|
| `patientId` | **generated**, zero-padded 6-digit string `000123`, unique. Allocated via `counters` (highest ever issued +1 → deleted patients never cause reuse; concurrency-safe) |
| `name` | required, max 100 |
| `fatherName` | optional (guardian) |
| `phone`, `email`, `address` | optional; email max 190 format-checked |
| `sex` | enum `male/female/other` or empty |
| `dateOfBirth` | optional date, `<= today` |
| `age` | **derived** from DOB at write time (store number; empty if no DOB) |
| `bloodGroup` | enum `A+,A-,B+,B-,AB+,AB-,O+,O-` or empty |
| `doctorName` | **free-text** of a doctor name (not FK — historical placement, chosen at registration). Asymmetry: renaming a doctor does not change this; renaming departments does cascade (see 05) |
| `imgUrl` | photo path (image ≤ 2 MB) |
| `howAdded` | always `'front desk'` in this product |
| `addDate`, `registrationTime` | stamped at create |

### 1.3 Rules & flows

- **Delete has no cascade and no referential guard** (a patient with appointments or
  invoices can be deleted and leaves orphan references rendered as "Unknown patient").
  Recommend keeping the same behaviour but rendering orphans gracefully.
- Photo file is not deleted with the record (port or fix deliberately).
- Related modules keyed by patient: appointments, prescriptions, lab requests, invoices,
  admissions, deposits. Profile screen links to **medical history** (see below).

## 2. Medical history

Free-form clinical entries (allergies, past operations, chronic conditions) — **no typed
category column**; the `title` carries semantics ("Penicillin allergy").

| field | rule |
|---|---|
| `patientId` | required, patient ref |
| `title` | required, max 100 |
| `description` | required, max 10 000 |
| `date` | optional; defaults to today |
| `imgUrl` | attachment (image/scan, ≤ 4 MB) |
| `patientName`, `patientAddress`, `patientPhone` | **snapshot** of patient at write time (history must read correctly after the patient moves/changes number) |
| `registrationTime` | stamped |

- Screens: list with patient filter + `q` (title/description/patient_name), sort date desc
  (then newest), 25/page; add/edit/delete.
- Permission: **one key** (`patient_medical_history`) covers all history actions.
- Delete: plain; stays filtered on the patient.

## 3. Data flows

```
register → POST /patients (counter -> patientId) → profile
  → add history entries (snapshot fields)
  → book appointment (04) → visit → consultation → prescription (08)/lab request (09)
  → invoice (11) / admissions (06)
deep-link: patients/create?patientId=... ; history?patient=...
```
