# Supabase Auth email validator incident — psg.md

- Project ref: `psfbmdfezgyruscqbqbn`
- Affected domain: `psg.md`
- Initial signup: `2026-09-24T14:10:59Z`, HTTP 200, one unconfirmed Auth identity created
- Failing resend: `2026-09-24T15:51Z` (approximately), HTTP 400, `email_address_invalid`
- Earlier failing magic-link request: `2026-09-24T14:27:44Z`, request ID `01a0d3d0-aac3-7fea-aaa7-267a8bd364a7`

## Evidence

- The address uses valid email syntax.
- `psg.md` publishes MX `10 mail.arax.md.` and resolves normally through independent DNS resolvers.
- The mailbox received an independently sent ordinary email.
- Exactly one matching Auth identity exists; it remained unconfirmed after the rejected resend.
- The project Send Email Hook was active at `https://www.nsd.md/api/auth/hooks/send-email`.
- The rejected normal resend never produced evidence of a signed hook invocation or provider delivery.
- The public Auth error collapses the internal address-validation subtype; no deeper subtype was exposed in project logs.

## Source-path finding

Supabase Auth's ordinary email delivery path performs additional provider/address validation before custom delivery. The Admin `generate_link` endpoint validates syntax, locates the existing identity, writes a legitimate confirmation token, and returns the action link without invoking ordinary email delivery. The recovery remains service-role-only and preserves Supabase `/verify` as the confirmation authority.

## Governed recovery result

- Admin `generateLink`: passed through the governed service-role-only recovery path
- Identity count before/after: 1 / 1
- Custom provider delivery: accepted exactly once; three redacted audit events recorded
- Supabase verification: pending
- Sign-in/onboarding: pending

No action link, OTP, token hash, service-role secret, SMTP credential, or hook-signing secret belongs in this document.
