# Unified Access Control Design

## Scope

This document records Slice 1 of Company User Management. It defines the
shared authorization foundation only. Employee UI, invitation mutations,
membership transitions, price redaction across product surfaces, and internal
administration UI belong to later slices.

## Evidence Audit

The existing model already provides one Supabase Auth identity, `user_profiles`,
`partner_companies`, `company_memberships`, stable `roles`, `permissions`,
`role_permissions`, and an `invitations` table. Partner onboarding creates an
active owner membership through the internal approval workflow. Company access
services validate active profile, membership, and company state.

Existing partner roles are `partner_owner`, `partner_manager`,
`partner_buyer`, `partner_accounting`, and `partner_viewer`. Existing internal
role definitions are `novotech_admin`, `novotech_sales`, `novotech_finance`,
`novotech_support`, and `novotech_content_manager`.

The existing invitation repository can read a pending email-matched invitation,
but create and status mutations intentionally throw. The table has company,
email, role, inviter, expiry, and status, but no secure token hash, revoked
timestamp, immutable override snapshot, acceptance transaction, or Auth
invitation adapter. No plaintext password flow exists, which must remain true.

Before this slice, `PermissionService` resolved an active company context and
then loaded role permissions. The repository fallback used up to four queries
per permission. There was no membership override. Internal workflows commonly
used `user_profiles.user_type` instead of assigned internal roles. Seeded
internal roles therefore exist as policy metadata but are not a complete
internal assignment model.

Price visibility used one `prices.view` permission for partner price, retail
price, and derived margin. This cannot represent retail-only access and is not
a sufficient confidential-data boundary.

## Canonical Chain

The canonical partner authorization chain is:

`auth.uid()` -> active profile -> active company -> active membership ->
partner-scoped role -> role permissions -> membership allows -> membership
denies -> effective permissions.

The database function `get_effective_company_permissions(company_id)` returns
one tenant-bound projection for the current authenticated user. The server
repository verifies that the returned user and company match its requested
context. `PermissionService` request-memoizes this projection and all permission
checks consume its effective code set.

An active `admin` profile is the only protected super-admin rule in Slice 1.
It receives an internal override projection without company membership.
Ordinary `internal` profiles retain existing specialized authorization until
internal role assignment is migrated. This avoids silently turning every
employee into a cross-company administrator.

## Effective Permission Algorithm

1. Reject missing authentication.
2. Require an active profile and active target company.
3. For protected Novotech admin, return the full permission catalog.
4. Otherwise require one active membership in the target company.
5. Require a partner-scoped assigned role.
6. Load partner/both-scoped role grants.
7. Union explicit partner/both-scoped membership allows.
8. Subtract explicit membership denies.
9. Return one deterministic sorted projection.

Explicit deny wins over both role grants and membership allows. Missing or
inconsistent state returns no context and fails closed.

## Permission Metadata And Delegation

Permissions carry:

- `scope`: `partner`, `internal`, or `both`;
- `delegable_by_partner_owner`;
- `sensitive`;
- `category`.

Defaults are conservative: internal, non-delegable, and sensitive. Existing
scope is classified from current role grants. Delegability is an explicit
allowlist, never inferred from scope or a UI selection.

A partner owner may eventually assign only approved non-owner partner roles and
change only permissions marked delegable. The owner cannot grant an internal
role, internal permission, `admin.access`, integration/sync permission,
security-audit access, company management itself, or a permission the owner
does not effectively possess. Role and override inputs are resolved and
validated server-side within the owner's active company.

Ownership transfer is a separate audited transition. No future transition may
suspend, revoke, or demote the final active owner. Novotech admin may intervene
through the same service boundary.

## Membership Overrides

`membership_permission_overrides` is normalized by membership and permission.
Its effect is `allow` or `deny`, with one row per pair. `created_by` is audit
metadata, never an authorization grant. Direct authenticated writes are denied.
Slice 2 will add narrow transition RPCs with company isolation, delegability,
final-owner protection, and audit events.

No boolean permission columns are added to memberships or profiles.

## Pricing Permissions

Two explicit capabilities are introduced:

- `pricing.partner_price.view`: confidential acquisition price and every value
  derived from it;
- `pricing.retail_price.view`: retail reference price.

Roles that already have legacy `prices.view` receive both capabilities so this
foundation does not remove existing access. `prices.view` remains temporarily
for compatibility and is not delegable. Slice 3 must replace every legacy check
with explicit server-side projections before the legacy permission is retired.

## Retail-Only UX Decision

A retail-only employee may browse products, compare products, create purchasing
lists, and build a cart or purchase request using products and quantities. The
UI shows retail reference price, clearly labeled as such, and never presents it
as the company's purchase price.

Partner acquisition price, partner totals, gross profit, markup, price
differences, and historical partner-price snapshots are omitted at the
repository/service DTO boundary. They are not sent as hidden HTML, RSC payload,
client state, action result, CSV, PDF, or download metadata.

Checkout and 1C order submission continue to resolve authoritative company
pricing server-side. The retail-only user cannot submit a price. The checkout
UI states that the final company purchase price is determined by the company's
commercial terms. Estimates and proposals may use retail/selling values only;
acquisition and margin fields are omitted. Immutable historical snapshots stay
stored but are returned through permission-aware redacted projections.

Slice 1 defines this contract but does not yet change commercial projections.
Until Slice 3 is complete, membership price restrictions must not be offered in
the UI.

## RLS And Security

The effective projection is bound to `auth.uid()` and accepts only a company
UUID. The client cannot request another user. Active profile, company,
membership, role scope, and overrides are evaluated in one security-definer
function with a fixed search path.

Authenticated users may select their own override rows. A company user manager
may select override rows in their active company through canonical
`has_permission`; active admins may inspect all overrides. No authenticated
insert, update, or delete privilege is granted.

Future company-user writes must use narrow RPCs. RLS remains defense in depth;
UI visibility is never authorization. Service Role remains server-only and is
not used by the effective permission repository.

## Performance

The effective permission graph is one RPC result and is memoized by
`userId + companyId` for the request. Multiple service checks reuse the same
projection. Workspace navigation consumes this projection rather than loading
role and permissions separately.

There is no public or cross-request permission cache, so permission changes
take effect on the next request without global invalidation. No catalog-card,
membership, price, or 1C N+1 is introduced. Employee list aggregation and
commercial projection work remain in later slices.

## Deferred Work

Slice 2 adds invitation token hashing, immutable invitation role/override
binding, acceptance, company employee transitions, final-owner protection, and
`company_user_events`.

Slice 3 enforces explicit pricing permissions across catalog, detail,
comparison, cart, checkout, order history, reorder, purchasing lists,
estimates, proposals, PDFs, finance, dashboard, APIs, and exports.

Slice 4 migrates internal role assignment into the unified model and adds
cross-company admin inspection and audited override transitions.
