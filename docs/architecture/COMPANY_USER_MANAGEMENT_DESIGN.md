# Company User Management Design

## Scope

Company User Management extends the unified access-control model with partner
employee invitations, membership administration, and an append-only audit
trail. It does not own authentication credentials or commercial data and does
not implement Slice 3 price redaction.

## Invitation Baseline

The existing `invitations` table already owned company, email, role, inviter,
acceptor, status, expiry, acceptance, and timestamps. It lacked a security
credential, employee name, membership link, revocation metadata, resend state,
idempotency, and intended permission overrides. The table is extended rather
than duplicated.

## Token Contract

- The application generates 32 random bytes with Node `crypto`.
- The URL receives the base64url plaintext once.
- PostgreSQL stores only its lowercase SHA-256 hash.
- Acceptance is authenticated and compares the normalized Auth email.
- Status, expiry, token version, and identity are checked under a row lock.
- Resend replaces the hash and increments the version, invalidating the old URL.
- Acceptance clears the hash and is idempotent for the accepted identity.
- Tokens are forbidden from logs and audit payloads.

## Authorization

All partner operations require the canonical `company_users.manage`
permission for an active company context. Assignable invitation roles are
limited to active partner manager, buyer, accounting, and viewer roles. Owner
appointment is a separate audited transition. Internal admin intervention uses
the existing protected canonical override; no role-name shortcut is introduced.

The employee list is one paginated aggregate RPC. It joins local profiles,
memberships, roles, invitations, and effective price overrides. It never calls
Supabase Auth Admin per row. Last login is intentionally omitted because it is
not safely available in the local identity model.

## Price-Access Intent

Pending invitations store normalized intended overrides. Full access allows
partner and retail price permissions. Retail-only access explicitly denies
`pricing.partner_price.view` and allows `pricing.retail_price.view`. Acceptance
copies those rows into `membership_permission_overrides` atomically. Product
redaction remains Slice 3.

## Atomic Transitions

Security-definer RPCs with fixed search paths own invitation creation,
reissue, revocation, acceptance, membership suspension/restoration, access
updates, and owner appointment. They validate canonical permissions and tenant
scope, lock mutable rows, enforce preconditions, and append bounded audit
events in the same transaction.

Acceptance validates the token, expiry, status, verified Auth email, and local
identity before creating or reactivating one company membership, applying role
and overrides, marking the invitation accepted, and appending the event.

Suspension and role changes lock company memberships and reject any transition
that would remove the final active owner. Auth identities and historical
business references are preserved.

## RLS And Grants

RLS is enabled for intended invitation overrides and audit events. Managers
read only their company through the canonical permission helper; admins use the
existing explicit override. Direct authenticated writes are denied. Narrow RPC
execution grants are the only mutation boundary. Invitation acceptance is the
only RPC that does not require an existing company membership and still
requires an authenticated, email-verified matching identity.

## Email Boundary

The SMTP provider is server-only. Delivery failure does not invalidate the
secure invitation: the owner receives the one-time copyable URL and an honest
delivery state. No active Auth user is provisioned by an owner.

## Performance

The list performs one aggregate database call per page. Mutations use one
bounded transactional RPC and narrowly revalidate company-user routes. No
catalog, order, company-global, or root cache invalidation is allowed.

