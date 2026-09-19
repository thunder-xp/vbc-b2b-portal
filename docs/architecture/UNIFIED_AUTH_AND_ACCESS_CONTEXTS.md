# Unified Auth and Access Contexts

Status: Slices 1 and 2 implemented. Purchase-triggered Final Customer provisioning is additive; legacy account creation remains available until the separately governed cutover.

## Canonical routes

| Route | Purpose |
| --- | --- |
| `/auth` | Canonical RU/RO public Auth Center with distinct Business credentials and Customer phone entry. |
| `/auth/customer` | Existing Supabase phone OTP component under the explicit Customer flow. |
| `/auth/customer/complete` | Server-only Customer access resolution after OTP verification. |
| `/auth/customer-not-active` | Safe no-account outcome with catalog and Business-login actions. |
| `/auth/customer-access-state` | Governed outcome for a non-active Customer account. |
| `/auth/select-context` | Authenticated Partner/Agent context selector. |
| `/auth/business-access-state` | Governed outcome when no operational Business context exists. |

`/auth/sign-in` remains a compatible Business entry. `/account/sign-in` redirects to the canonical Customer entry while `UNIFIED_AUTH_CENTER_ENABLED` is enabled and retains its previous OTP page when the gate is explicitly disabled. Internal/Admin authentication and guards remain unchanged.

## Login intent

Intent is represented by a bounded route selected by the user:

- `BUSINESS_CREDENTIALS` is `/auth` or the compatibility `/auth/sign-in` path and uses the existing password server action.
- `CUSTOMER_PHONE` is `/auth/customer` and uses the existing `PhoneOtpForm`, Supabase Phone Auth, Send SMS Hook, rate limits and Moldcell transport.

The route controls only which resolver runs after authentication. It is not stored as a role, permission, JWT claim or entitlement. OTP completion uses the fixed code-owned path `/auth/customer/complete`; no caller-supplied `role` or destination controls Customer authorization.

## Resolver contracts

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

One indexed `customer_accounts.auth_user_id` lookup runs with the authenticated Supabase client and existing own-row RLS:

- `ACTIVE` -> `AVAILABLE` -> `/account`;
- no row -> `NOT_ACTIVE` -> `/auth/customer-not-active`;
- `IDENTITY_REVIEW_REQUIRED` or `SUSPENDED` -> `BLOCKED` -> `/auth/customer-access-state`.

The repository contract exposes only a read. It cannot create a `customer_identity`, `customer_account` or event. Existing customer accounts are unchanged.

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

`CustomerAccessResolver` remains read-only. After the transaction, its existing indexed lookup returns `AVAILABLE`; OTP alone still returns `NOT_ACTIVE` through the new resolver. The global legacy `getFinalCustomerContext() -> ensureAccount()` behavior has not been removed, so rollback is `NEW_PURCHASE_PROVISIONING_ENABLED=false` while a later approved slice performs enforcement and legacy-policy cutover.

No synchronous 1C, provider payment, email or reconciliation work occurs in the entitlement transaction. The unresolved 1C Final Customer write contract leaves the durable job in `PENDING` without affecting cabinet access.

`ARCHITECTURE_CHANGE_REQUEST=APPROVED_AND_IMPLEMENTED_FOR_SLICE_2`
