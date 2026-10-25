# 01 — Auth, Users, Roles, Permissions, Activity Log

## 1. Login & sessions

- Login endpoint accepts **username + password** (Laravel column `login`, not email).
- Roles are a plain string/enum on the user doc. There is **no role collection**; permissions
  come from a role→permission-key map.
- On success, redirect everyone to the dashboard (web). Mobile: same for staff; patient
  portal is a separate role with reduced scope.
- First-run behavior: when no hospital (`institute`) record exists yet
  - non-admin gets "Institute Information not setup yet! Please contact administrator."
  - admin is force-redirected to institute setup.
- Failed login: generic "Your username/password combination was incorrect" (no user
  enumeration).

### Facade 2FA (optional) — SMTP-as-configured
- Setting `OTP=yes` triggers an SMS 2FA flow after password check:
  1. create a `verificationCodes` doc `{ userId, code: 4-digit, status, ipAddress }`
     (one record per `(userId, ip)` pair),
  2. send SMS via the configured SMS gateway,
  3. user is logged out and shown a code-entry form; correct code → session established.
- **Fix in the rebuild:** enforce **15-minute expiry** and mark code `used` on consumption
  (the PHP code defines both but never checks them). Prefer a single OTP mechanism
  (drop the dead legacy `verify_codes` path).

### Impersonation ("login as")
- Admin-only. `POST /api/v1/auth/impersonate/:userId` → issues a token for the target user
  carrying an `impersonatedBy: <adminId>` claim.
- `POST /api/v1/auth/impersonate/exit` (impersonated token only) → issues a fresh token for
  the original admin. "Logout" while impersonating calls this instead of logging out, so
  the web client returns to the dashboard as the admin.
- Log `impersonate.start` / `impersonate.exit` to the activity log.

## 2. Passwords

- **Registration is closed** — accounts are created by admin only (`POST /users`).
- Create/update user validation (port fields, fix bugs):
  - `firstName`, `lastName`, `email`, `role` (enum), `desc` (about), `login` (username,
    required, unique, max 20), `phone` (make editable — used by 2FA/SMS),
    password rules: **min length (new behaviour)**, bcrypt storage.
  - Duplicate check: unique `email` and unique `login`.
- Change password (self): `currentPassword` **must be verified** (fix: PHP skipped this),
  `newPassword` == `confirm` else "New Password and confirm password did not match!".
- Password forgot/reset via email token (`passwordResetTokens`): `{ email, token, expiresAt }`
  (60 min, throttle 60s per request).
- Response payload never includes password hashes.

## 3. Users API surface (admin only)

| Action | Behaviour |
|---|---|
| list | all users; the web page is list + inline add/edit form |
| create | validate, unique(login/email), bcrypt |
| read | get one |
| update | partial update allowed (password optional — fix) |
| delete | hard delete; forbid deleting own account |
| impersonate | admin only (above) |

## 4. Permissions

- Catalogue: **90 keys**, defined in `backend/src/config/permissions.js` (keys derived from
  labels: `"Patient View"` → `patient_view`; `"Send Sms/Voice"` → `send_sms/voice`).
- Storage: one doc per staff role (`admin`, `doctor`, `nurse`, `pharmacist`,
  `laboratorist`, `accountant`, `receptionist`): `{ role: '...', keys: [...granted keys] }`
  in `rolePermissions`. Admin seeded with the full catalogue; other roles start with none.
  `patient` gets no doc until the patient portal is designed.
- Grid UI (web): rows = catalogue labels (grouped), columns = role filter checkboxes;
  save = **full rewrite per role** (whole array replace, atomic single-doc update).
- Runtime: `requirePermission(key)` middleware → 403 `{ error: 'You do not have permission
  to do that.' }` or redirect to `/no-permission` (web). No allow-by-default; missing grant
  == denied. Sidebar hides ungranted sections.
- Sync command `npm run permissions:sync [--prune]`: add missing catalogue keys (granted to
  admin, denied to others), `--prune` deletes stale keys. Never re-grants a deliberately
  revoked right. Idempotent.

## 5. Activity log

Collection `activityLogs` (port of laravel-logger):

`{ description, details?, userType: 'registered'|'guest'|'crawler', userId?, ip,
  userAgent, locale, referer, method, route, rel?: { model, id }, createdAt, deletedAt? }`

- Middleware `activityLog` records one entry per request: description auto by verb —
  `created/edited/viewed/deleted {path}`.
- Auth events: `login.success`, `login.failed`, `logout`, `impersonate.start/exit`,
  `password.changed`.
- API: paginated list (25/page, filters: description-contains, exact user, method, route,
  ip), single entry + that user's other entries, soft-clear all (trash), view trash,
  restore all, destroy all. **Admin only** — the log holds IPs, user agents and every
  user's actions.

## 6. Data flow

```
login request → verify login+password → [optional OTP] → issue JWT
  → web UI loads /bootstrap (hospitalName, role, grantedPermissionKeys) → dashboard
activityLog middleware → every response
admin manages users/permissions → rolePermissions doc rewritten → next checks reflect it
```
