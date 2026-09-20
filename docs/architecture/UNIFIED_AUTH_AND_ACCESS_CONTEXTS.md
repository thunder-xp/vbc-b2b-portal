# Unified Auth and Access Contexts

Status: Purchase-backed Final Customer access is enforced. Phone-first Quick Auth supports Customer access and rolling, explicitly verified Business phone enrollment on the same Supabase Auth user.

## Canonical routes

| Route | Purpose |
| --- | --- |
| `/auth` | Compatibility entry that preserves locale and redirects directly to `/auth/customer`. |
| `/auth/customer` | Canonical RU/RO phone-first Quick Auth flow. |
| `/auth/customer/complete` | Server-only Customer access resolution after OTP verification. |
| `/auth/business-phone-enrollment` | Authenticated same-user phone enrollment/change using Supabase `phone_change` OTP. |
| `/auth/select-access` | Authenticated neutral Customer/Business workspace-family choice. |
| `/auth/customer-not-active` | Safe no-account outcome with catalog and Business-login actions. |
| `/auth/customer-access-state` | Governed outcome for a non-active Customer account. |
| `/auth/select-context` | Authenticated Partner/Agent context selector. |
| `/auth/business-access-state` | Governed outcome when no operational Business context exists. |

`/auth/sign-in` remains the classic Business email/password entry. `/account/sign-in` redirects to the canonical Customer entry while `UNIFIED_AUTH_CENTER_ENABLED` is enabled and retains its previous OTP page when the gate is explicitly disabled. Internal/Admin authentication and guards remain unchanged.

## Login intent

Intent is represented by a bounded route selected by the user:

- `CUSTOMER_PHONE` is the default public intent at `/auth/customer` and uses `QuickAuthResolver`, Supabase Phone Auth, Send SMS Hook, rate limits and Moldcell transport.
- `BUSINESS_CREDENTIALS` is the explicit `/auth/sign-in` fallback and uses the existing password server action.

The route controls only which resolver runs after authentication. It is not stored as a role, permission, JWT claim or entitlement. OTP completion resolves current Customer and Business access server-side; no caller-supplied `role`, user ID or destination controls authorization.

## Resolver contracts

### QuickAuthResolver

The public account icon opens `/auth/customer?lang=ru|ro` directly. The same compact card owns PHONE, Business EMAIL when required, OTP, safe blocked and not-registered presentation states. It inherits the Public Retail locale and has no independent language selector. `/auth/sign-in` remains available from every state.

Phone normalization is repeated server-side using the canonical Moldovan E.164 helper. One service-role RPC resolves only existing, confirmed `auth.users.phone` identities. For a matching Auth subject it delegates Customer eligibility to `resolve_customer_access_entitlement_v1()` and inspects only the same Auth user's current active Partner membership/company or `commercial_agents.status = ACTIVE`. It never reads public/1C contact data and performs no live 1C request.

The database challenge is an expiring, server-only record containing keyed phone and requester HMACs, an optional internal Auth subject, resolution, bounded counters and timestamps. It stores no raw phone, email, OTP, session or provider response. Direct `anon` and `authenticated` table/function access is revoked; only the server Service Role can start/read/advance a challenge. Send reservations are limited to three with a 60-second server cooldown, verification to six attempts, resolver lookup to five attempts per phone and twenty per requester in fifteen minutes. Supabase/provider limits remain additional controls.

Customer and Business OTP call `signInWithOtp({ shouldCreateUser: false })`; successful verification is accepted only when Supabase returns the exact Auth user bound to the challenge. Customer access continues through the read-only Customer resolver and Business access through `BusinessAccessResolver`. Quick Auth contains no customer-account or Auth-user writer.

The approved not-registered result necessarily discloses limited cabinet availability. The bounded HMAC-keyed rate limits, generic copy, lack of role/name/email/company disclosure, provider limits and security-only challenge state constrain probing. Suspended or unverified identities remain neutral and never expose Business taxonomy.

### Business Phone Enrollment

Business phone passwordless access is adopted per user. After a successful classic email/password login, an eligible Partner/Agent user without a confirmed Auth phone receives an optional compact prompt. Choosing **Later** never blocks normal access. The same governed control is linked from existing Partner and Agent profile screens.

Enrollment derives the target exclusively from the authenticated user's saved Profile phone. A service-only preflight revalidates that exact Auth user against an operational Business context, reserves the HMAC phone fingerprint, and rejects a confirmed or pending phone held by any other Auth user. Initial enrollment of an existing unconfirmed Auth phone uses `signInWithOtp({ shouldCreateUser: false })` and `verifyOtp({ type: "sms" })`; an actual change from an already confirmed phone uses `auth.updateUser({ phone })` and `verifyOtp({ type: "phone_change" })`. Completion succeeds only when the refreshed Auth user ID is unchanged and the exact phone is confirmed.

`auth.users.phone_change` is not unique in Supabase. The enrollment reservation prevents concurrent claims inside this flow. Before a new claim, the service also removes only expired `phone_change` state that is provably tied to an expired enrollment challenge for that same phone fingerprint. It never clears unrelated pending changes or administratively confirms a phone.

Enrollment and change attempts are bounded to three sends with a 60-second cooldown, six verification attempts, and ten-minute challenges. Durable delivery diagnostics add a deterministic correlation ID, masked recipient suffix, provider/transport, bounded attempt count, safe provider result and verification outcome. Audit records contain only Auth user ID, challenge ID, event type and keyed phone proof; OTP, full phone, Auth tokens, provider credentials, raw payload and SMS content are excluded.

Profile/company contact phones remain separate business contact data. They are neither copied nor synchronized into Auth, and Auth enrollment never overwrites profile contact values.

For Business-only Quick Auth, a confirmed Auth phone resolves to a neutral EMAIL step. The normalized email must match the same challenge-bound Auth user and that user must still own an operational Business context. Only then is SMS OTP sent. Customer-only phones skip EMAIL. A future Auth user with both available families is authenticated first and then sees the neutral `/auth/select-access` choice: **Личный кабинет / Рабочий кабинет**; Business routing beneath that choice remains owned by `BusinessAccessResolver`.

### BusinessAccessResolver

One authenticated RPC, `resolve_own_business_access_contexts()`, returns a logical DTO built from:

- `auth.uid() -> user_profiles -> company_memberships -> partner_companies`; and
- `auth.uid() -> commercial_agents`.

`user_profiles.user_type` is not authorization truth. A Partner context is `AVAILABLE` only when profile, membership and company are active. An Agent context is `AVAILABLE` only when the Agent lifecycle is `ACTIVE`. Pending and blocked relationships are returned as governed state but never count as usable routing contexts. The RPC also revalidates the last-used preference in the same bounded read.

The original Agent foundation enforced Partner/Agent principal exclusivity. Slice 1 removes that cross-domain exclusivity because the approved model permits both relationships on one active external principal. The replacement trigger still requires an Agent principal to be an active external user; Partner and Agent authorization remain independently governed by their own relationships and lifecycle states.

Post-password routing is deterministic:

1. zero available contexts -> `/auth/business-access-state`;
2. one available context -> its existing guarded route;
3. multiple contexts with a still-available preference -> preferred guarded route;
4. multiple contexts without a valid preference -> `/auth/select-context`.

There is no Partner-over-Agent priority.

### CustomerAccessResolver

One bounded server-only projection resolves `customer_accounts.auth_user_id` plus immutable purchase/legacy evidence after `auth.getUser()` establishes the principal:

- `ACTIVE` plus purchase evidence -> `AVAILABLE` (`PURCHASE_BACKED`) -> `/account`;
- `ACTIVE` plus the closed cutover cohort -> `AVAILABLE` (`LEGACY_COMPATIBILITY`) -> `/account`;
- no row -> `NOT_ACTIVE` -> `/auth/customer-not-active`;
- `IDENTITY_REVIEW_REQUIRED` or `SUSPENDED` -> `BLOCKED` -> `/auth/customer-access-state`.

The repository contract exposes only a read. It cannot create a `customer_identity`, `customer_account` or event. OTP-only users remain authenticated but route to the safe not-active state.

## Preference and context switching

The implementation evolves the existing `user_company_context_preferences` record instead of adding a parallel preference table. It adds:

- `active_context_type`: `PARTNER | AGENT`;
- nullable `active_agent_id`; and
- a target-shape constraint.

Existing rows default to `PARTNER` and retain their selected membership. The preference is not an entitlement.

`select_own_business_context(contextType, contextId)` is an authenticated, `SECURITY DEFINER`, fixed-`search_path` RPC. For Partner it rechecks the caller's active profile, membership and company. For Agent it rechecks `commercial_agents.user_id = auth.uid()` and `status = ACTIVE`. Only then does it update the last-used preference. A forged, revoked, stale or cross-user target returns `42501`. Direct `/cabinet` and `/agent` guards remain authoritative after redirect.

## Security and RLS

- Business authentication keeps generic credential errors.
- Customer phone initiation keeps the existing generic response and rate limits.
- Redirects accept only bounded same-origin relative paths; cross-origin and backslash-normalized targets are rejected.
- Resolver and switch RPCs accept no user ID, derive identity from `auth.uid()`, revoke default/anon execution, and grant only `authenticated` execution.
- `user_company_context_preferences` keeps server-only table grants and now has forced RLS.
- Customer resolution uses existing `customer_accounts_select_own` RLS; no Service Role is exposed to the browser.
- Partner, Agent and Customer direct-route guards remain in place. The selector never substitutes for them.
- No login or selector path calls 1C.

## Session finding

Server authorization paths use `auth.getUser()`. The shared `@supabase/ssr` cookie client supports cookie writes in Server Actions. `proxy.ts` does not currently refresh Supabase auth cookies. The new password and OTP flows do not require a proxy change to establish or validate their sessions, so Slice 1 does not broaden scope into proxy/session middleware. This remains an operational follow-up if real expiry/refresh evidence shows a correctness defect.

## Performance

- Business login: one Supabase authentication request plus one bounded resolver RPC.
- Customer completion: one Supabase authentication validation plus one indexed Customer-account lookup.
- Preference validation is folded into the Business RPC.
- No browser role fanout, N+1, polling, cron or live 1C request was added.

## Compatibility gates and rollback

All gates are enabled unless explicitly set to `false`:

| Gate | Disabled behavior |
| --- | --- |
| `UNIFIED_AUTH_CENTER_ENABLED` | `/auth` returns to `/auth/sign-in`; `/account/sign-in` renders the legacy OTP page. |
| `UNIFIED_BUSINESS_ROUTING_ENABLED` | Password login retains the legacy `next ?? /cabinet` behavior; selector returns to `/cabinet`. |
| `CUSTOMER_ACCESS_RESOLVER_ENABLED` | OTP completion returns to the existing `/account` path. |
| `CUSTOMER_PURCHASE_ENTITLEMENT_ENFORCED` | Existing ACTIVE accounts may pass by rollback compatibility; no account is created and the purchase provisioning authority is unchanged. |
| `PHONE_FIRST_QUICK_AUTH_ENABLED` | `/auth/customer` returns to the prior `/account/sign-in` compatibility entry. |
| `BUSINESS_PHONE_OTP_ENABLED` | Business enrollment prompts and Business phone/email OTP are disabled; classic email/password remains available. Per-user eligibility still requires a confirmed Auth phone when enabled. |

The migration is additive and may safely remain deployed when a consuming gate is disabled.

## Deliberate Slice 1 boundary

The existing `getFinalCustomerContext() -> ensureAccount()` compatibility behavior is intentionally retained for current production flows. This slice proves the new post-OTP read-only resolver but does not yet enforce purchase-only provisioning on every direct legacy path.

Not implemented here:

- `FIRST_PURCHASE_CONFIRMED`;
- `FinalCustomerProvisioningService`;
- purchase entitlement/evidence tables;
- 1C Customer provisioning;
- Customer in the Business context selector;
- MAIB, Marketplace or Agent commission changes.

The later provisioning slice must establish purchase activation before removing the legacy compatibility creation path.

`ARCHITECTURE_CHANGE_REQUEST=APPROVED_AND_IMPLEMENTED_FOR_SLICE_1`

## Slice 2: first-purchase provisioning

Authenticated Retail checkout now performs a read-only Auth/account lookup and no longer invokes `ensureAccount()` merely to prepare an order. The Server Action resolves the principal through `auth.getUser()` and invokes a service-only fixed-boundary RPC which rechecks confirmed Auth phone state, normalized order contact and keyed-HMAC evidence. Guest checkout remains compatible but cannot grant a cabinet through this path.

The provider-neutral `activate_paid_retail_order` boundary emits one durable `FIRST_PURCHASE_CONFIRMED` event only after local paid activation succeeds. The existing two-minute order-reconciliation cron also performs one bounded, fast-no-op customer-provisioning claim; no extra scheduled invocation was introduced. `FinalCustomerProvisioningService` calls an atomic service-only RPC that creates or reuses `customer_identity` and `customer_account`, links the confirmed purchase, appends safe audit evidence and queues asynchronous 1C work.

`CustomerAccessResolver` remains read-only. After the transaction, its bounded evidence projection returns `AVAILABLE`; OTP alone returns `NOT_ACTIVE`. Slice 3 removes the global `ensureAccount()` create-on-read behavior and preserves only the explicit closed legacy cohort.

No synchronous 1C, provider payment, email or reconciliation work occurs in the entitlement transaction. The unresolved 1C Final Customer write contract leaves the durable job in `PENDING` without affecting cabinet access.

`ARCHITECTURE_CHANGE_REQUEST=APPROVED_AND_IMPLEMENTED_FOR_SLICE_2`

## Slice 3: purchase-entitlement enforcement cutover

`getFinalCustomerContext()` validates the Supabase user and verified phone, resolves purchase/legacy entitlement, then reads an existing account. It performs no identity, account or audit insert. Generic service-role INSERT on `customer_accounts` is revoked; the approved purchase provisioning function remains the single creation authority through its fixed, privileged database boundary.

The cutover migration snapshots every pre-existing account exactly once into `customer_account_legacy_entitlements`. The cohort is immutable, service-readable and has no runtime writer. New accounts must have `customer_account_purchase_entitlements` evidence. Partner and Agent access resolution is unchanged, and no Auth/access render path calls 1C.

`ARCHITECTURE_CHANGE_REQUEST=APPROVED_AND_IMPLEMENTED_FOR_SLICE_3`

## Phone-first production identity audit (2026-09-20)

The read-only production audit used the canonical active Partner relationship (`user_profiles -> company_memberships -> partner_companies`) and active `commercial_agents`, then compared those users to Supabase Auth. Aggregate result, with no PII:

| Measure | Count |
| --- | ---: |
| Eligible Business Auth users | 48 |
| Eligible Business Auth users with `auth.users.phone` | 0 |
| Eligible Business Auth users with confirmed `auth.users.phone` | 0 |
| Eligible Partner users | 48 |
| Eligible Agent users | 0 |
| Partner + Agent on the same Auth user | 0 |
| Customer + Business on the same Auth user | 0 |
| Partner profile contact phone present | 47 |
| Partner profile phone equal to Auth phone | 0 |

The initial state was `SAFE_FOR_PHONE_OTP=NO`: profile/Agent phones are contact data and cannot be promoted to authentication factors. The approved rolling enrollment architecture preserves that conclusion and makes each user eligible only after explicit same-user `phone_change` verification. At the time of implementation, confirmed Business Auth-phone coverage remains `0/48`; email/password continues to serve every Business user.

The approved remediation is now implemented: normal email/password authentication can enter governed self-service enrollment on the same Supabase Auth user; preflight uniqueness, `auth.updateUser({ phone })`, `phone_change` verification and pseudonymous audit are enforced. No profile phone migration, administrative confirmation or replacement Auth user exists. Business EMAIL/OTP remains conditional per confirmed Auth user and routes through `BusinessAccessResolver` with no Partner/Agent priority.

`ARCHITECTURE_CHANGE_REQUEST=APPROVED_AND_IMPLEMENTED` for rolling Business phone enrollment.
