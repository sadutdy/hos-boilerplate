# 15 — Settings, Institute, Branches

## 1. Hospital (institute) — single-record settings

`GET/PUT /api/v1/institute` — one doc `institute`:

`{ name (required), establishedYear, website, email, phone, address, logoUrl }`

- Displayed on the login page; used as the SMS **sender mask** default and on print headers.
- Force-set at first run: admin login with no institute doc redirects to institute setup
  (module 01).
- Same save semantics: full replace of the singleton.

## 2. App/system settings

`appSettings` singleton (which includes, unlike PHP, everything that used to be a flat
file): `{ title, loginTitle, logoUrl, invoiceLogoUrl, address, phone, email, facebookId?,
currency, language, discountDefault?, vatDefault?, timezone, paymentGateway (key of the
enabled gateway), smsGateway (key), }`

- `GET/PUT /api/v1/settings/app` (admin).
- Replace the `storage/*.txt` feature flags: anything featureish gets a real field here.

## 3. Payment gateway credentials

Collection `gatewayCredentials` (= PHP `paymentGateway`): `{
name (unique), merchantKey?, salt?, apiUsername?, apiPassword?, apiSignature?, status:
'enabled'|'disabled' }`

- **Secrets are write-only**: API responses return `{ configured: true, lastSetAt }`, never
  echo values (fix PHP's accounting-settings view that echoed the password; gateway screen
  got this right).
- Save rule: blank secret field = **keep existing value** (someone fixing the label doesn't
  retype secrets).
- **Exactly one gateway enabled at a time**: enabling one disables all others first
  (single atomic pass).
- Status: stored credentials only; nothing charges a card yet (roadmap for online payments
  and deposits).

Endpoints: `GET /api/v1/gateways`, `POST /api/v1/gateways`, `PUT /api/v1/gateways/:id`,
`DELETE /api/v1/gateways/:id`, `POST /api/v1/gateways/:id/enable`, `.../disable`.

## 4. Password/account settings (self-service)

- `GET/PUT /api/v1/auth/me` — update firstName/lastName/phone (make phone editable — 2FA use).
- `POST /api/v1/auth/me/password` — `{ currentPassword, newPassword, confirm }` with
  current-password **verified** (fix the PHP bug): the current password is accepted
  unchecked there; new = confirm else "New Password and confirm password did not match!".

## 5. Reminder schedule

Built into the notifications settings screen (module 14): store cron expressions/times in
`appSettings` or `scheduleSettings` — never files.

## 6. Branches — cut or keep?

PHP kept a `branches` table (name, remote URL, and **plaintext** remote credentials) —
a multi-install dirty hack. Decision for the rebuild: **drop**; if multi-branch is a real
roadmap feature it deserves a first-class design (per-tenant data scoping), not stored
remote-logins. Documented here so the decision is intentional.

## 7. ICTCore integration credentials

`integrations` singleton-per-channel docs (module 14): `{ channel: 'sms'|'voice',
provider: 'ictcore'|'telenor'|'bizsms', url?, username?, password?, accountId?, mask? }` —
masked on read, full-replace on save (same as PHP's delete-then-insert per type).
