# Unified Admin Control Center

## Slice 1 Boundary

The admin control center is a platform-scoped internal workspace. It does not
reuse partner-company memberships and does not own 1C commercial truth.

## Internal Role Rule

Each active internal user has exactly one active primary internal role:

- `novotech_admin`
- `novotech_sales`
- `novotech_finance`
- `novotech_support`
- `novotech_content_manager`

Revoked assignments remain as immutable history. Role changes are made through
an audited RPC with a mandatory reason. Multiple simultaneous internal roles
are intentionally disallowed in Slice 1 because additive grants could silently
expand access across finance, security, and integration domains.

Active legacy `admin` profiles are migrated to `novotech_admin`. Active legacy
`internal` profiles are migrated to `novotech_sales`, matching the former
internal-manager behavior. After migration, `user_type` alone never authorizes
an admin route.

## Permission Decisions

`novotech_admin` receives every internal or shared permission.

`novotech_sales` receives the dashboard, partner-company and user operations,
access requests, orders, planned shipments, date changes, reservations,
specifications, estimates, and proposals. It receives no finance,
permission-administration, integration-credential, or security-administration
grant.

`novotech_finance` receives the dashboard, company read access, finance
visibility and synchronization, and relevant documents. It receives no user
access management, catalog synchronization management, or partner-price
publication grant.

`novotech_support` receives the dashboard, company/user/invitation/access
inspection, effective-access inspection, integration status, and bounded
diagnostics. It receives no finance amounts, price publication, permission
mutation, or owner-transfer capability.

`novotech_content_manager` receives the dashboard, catalog/content views,
catalog synchronization visibility, and content tools. It receives no partner
price, finance, access-management, or security capability.

Existing domain permissions remain canonical for mutations, including
`access_requests.approve`, `commercial_rates.manage`,
`specifications.review`, `reservations.review`, and
`order_date_changes.review`. Admin-shell permissions add visibility and
workspace capabilities without duplicating those business meanings.

## Trusted Projection

`get_effective_internal_permissions()`:

- derives the user exclusively from `auth.uid()`;
- requires an active internal/admin profile and active internal assignment;
- accepts no browser-supplied user or company ID;
- validates internal role scope;
- returns a safe display name, active role codes, effective permission codes,
  profile status, and platform-admin marker;
- returns no row for partner-only, inactive, or unassigned identities.

`has_internal_permission(text)` is the database helper used by internal RLS and
domain review helpers. Partner-company permission projection remains separate.

## Cache And Privacy

Admin authorization is loaded once per server request and memoized with React
`cache()`. It is never persisted in browser storage or a shared cross-user
cache. Admin routes and actions still enforce their own permission; navigation
visibility is not authorization.
