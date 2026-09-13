# Final Customer Cabinet

## Ownership

The Final Customer Cabinet is a third private platform surface at `/account`, separate from Partner (`/cabinet`), Commercial Agent (`/agent`), and Admin. Supabase Auth owns passwordless phone authentication, sessions, JWT refresh, and Authenticator Assurance Level (AAL). A Final Customer principal exists only through `customer_accounts.auth_user_id = auth.uid()`; Partner, Agent, or Admin membership is neither required nor granted.

`customer_identities` remains the canonical correlation root. `customer_accounts` is a lightweight access/profile relation, not another customer master. `retail_customers`, Partner customer records, Agent referrals, and future 1C external references remain context-owned records linked to the shared root.

## First verified login

After Supabase verifies a phone OTP, the protected account layout obtains the authenticated user from Supabase and calls the existing `CustomerIdentityResolutionService` with the phone marked as verified Auth evidence:

- `MATCHED`: link the account to the one deterministic root.
- `NEW`: create one root and verified HMAC phone key through the existing governed service, then link it.
- `AMBIGUOUS` or `CONFLICT`: create the account with `IDENTITY_REVIEW_REQUIRED`, expose no candidate IDs, and hide historical cross-context data. New account actions remain possible.

The raw phone remains in Supabase Auth. Shared Identity stores only the existing versioned keyed-HMAC evidence. Carrier phone reassignment is therefore not treated as perpetual proof for arbitrary historical data; review and future step-up verification remain available.

## Authorization and data access

`customer_accounts`, its audit table, and the Auth SMS rate buckets use `ENABLE RLS` plus `FORCE RLS`. Authenticated browser reads of `customer_accounts` are limited to `auth.uid()`. The browser has no grants on shared identity keys, reconciliation records, account audit events, or rate buckets.

Cabinet repositories resolve `auth_user_id → customer_account → customer_identity_id` server-side. Browser-supplied identity/customer/order IDs are never authorization inputs. Retail order reads are bounded local projection reads: the repository resolves the authorized `retail_customers` contexts, then fetches their orders in one bounded query. Ambiguous/conflicted accounts receive no historical orders.

## Cabinet V1

Only working areas are exposed:

- Overview: known customer name, latest authorized Retail order, and account/security state.
- Orders: existing Retail/B2C orders authorized through Shared Customer Identity; no copies are created.
- Profile: optional cabinet display name/email and read-only verified phone.
- Security: accurate “SMS code login” copy and the actual Supabase session AAL. Phone OTP is not labelled 2FA.

Changing the verified phone is deliberately not a plain profile edit. A future governed flow must reverify the new phone and review identity impact. Future sensitive actions can require `aal2` through an independent TOTP, phone MFA after an independent first factor, or another governed step-up method. V1 does not auto-enrol a second SMS factor.

## Retail and future 1C contexts

Existing anonymous Retail history is not claimed by an unverified matching phone or email. Only deterministic Shared Identity evidence authorizes history. The existing `customer_external_refs(system='1C', entity_type='COUNTERPARTY')` seam is preserved; this task adds no 1C calls or writes.

## Session and recovery

Supabase SSR cookies and the existing platform Supabase clients are reused. Current-session logout is supported. Session diagnostics use Supabase AAL without forging claims. Future recovery or sensitive history linking must use stronger governed verification when phone ownership alone is insufficient.

## Performance and cost

Login loads without 1C. OTP causes one Supabase Auth request, one signed hook request, one bounded privacy-preserving rate reservation, and one Moldcell relay call. Cabinet pages use local database projections with bounded queries and no N+1. No background job, cron, polling, or per-page audit was added.
