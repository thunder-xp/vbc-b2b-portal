# Access Control Repository Design

## Purpose

This document defines the repository layer design for Access Control in the Novotech Partner Platform.

Access Control repositories are persistence adapters for portal-owned identity, partner company access representation, memberships, roles, permissions, access requests, and invitations. They hide Supabase table details from services while preserving the project rule that services own business logic and access decisions.

This is a design document only. It does not create TypeScript code, services, UI, SQL, migrations, or database changes.

## Repository Responsibility Boundaries

Repositories sit between services and Supabase.

They are responsible for:

- Reading and writing Access Control persistence records.
- Returning typed, explicit repository results.
- Applying simple persistence filters supplied by services.
- Mapping database rows into repository DTOs.
- Preserving database constraints, status values, IDs, and timestamps.
- Keeping table names and Supabase query details out of services.

They are not responsible for:

- Deciding whether a user is allowed to perform an action.
- Deciding whether a partner can see prices, stock, documents, finance, or order history.
- Interpreting 1C commercial truth.
- Calling 1C.
- Building UI view models.
- Bypassing RLS for convenience.

The normal flow is:

```text
Server Action / server loader
  -> Access Control Service
    -> Access Control Repository
      -> Supabase
```

## What Repositories May Do

Access Control repositories may:

- Use the server Supabase client for user-scoped operations that should respect RLS.
- Use a narrow admin/server-only Supabase client only for approved trusted flows, such as system-created profile initialization or manager/admin workflows that cannot be expressed through user-scoped RLS.
- Read `user_profiles`, `partner_companies`, `company_memberships`, `roles`, `permissions`, `role_permissions`, `access_requests`, and `invitations`.
- Insert portal-owned records such as user profiles, memberships, access requests, and invitations when called by services.
- Update portal-owned safe fields when called by services.
- Return `null` or explicit not-found results when records are absent or hidden by RLS.
- Return database error categories in a normalized form for services to interpret.
- Accept already-scoped query inputs such as `userId`, `companyId`, `membershipId`, `roleCode`, or `permissionCode`.
- Use transactions or RPC later only when the operation is purely persistence-oriented and approved by architecture.

## What Repositories Must Never Do

Access Control repositories must never:

- Import UI components or route modules.
- Be imported by Client Components.
- Call 1C or any external commercial API.
- Store prices, stock, debt, invoices, credit limits, contracts, addresses, bank data, or other 1C-owned commercial truth.
- Decide access profile visibility.
- Decide manager approval outcomes.
- Decide partner status transitions.
- Decide whether an order, reservation, document download, or finance view is allowed.
- Trust client-supplied `external_1c_id` as a security boundary.
- Use Supabase Service Role casually or from shared code that can reach the browser.
- Return hidden commercial data in generic objects.
- Catch and hide security failures as successful empty states when services need to know the difference.
- Create cross-domain writes without an owning service workflow.

## Proposed Repositories

### `UserProfileRepository`

Purpose: Encapsulates persistence for portal user profiles connected to Supabase Auth users.

Tables:

- `user_profiles`

Allowed ownership:

- Portal-owned application profile data only.
- No company commercial data.
- No direct permission decisions.

Representative methods:

- `findById(userId)`: returns one profile by auth/user profile ID when visible.
- `findByEmail(email)`: returns a profile for trusted server-side flows that need email matching.
- `createProfile(input)`: creates a portal profile for an authenticated user or trusted onboarding flow.
- `updateOwnProfileFields(userId, input)`: updates safe profile fields such as full name and phone.
- `updateStatus(userId, status, actorUserId)`: persists a service-approved status transition.
- `updateUserType(userId, userType, actorUserId)`: persists a service-approved type change for internal/admin workflows.
- `exists(userId)`: checks whether a profile exists.

Rules:

- Public or client-originated flows must not self-promote `status` or `user_type`.
- Repository methods may persist status changes only when a service has already approved the transition.
- Email lookup must not grant access by itself.

### `PartnerCompanyRepository`

Purpose: Encapsulates persistence for the portal-side access representation of partner companies.

Tables:

- `partner_companies`

Allowed ownership:

- Portal access representation, display label, status, and 1C reference.
- No full 1C counterparty copy.

Representative methods:

- `findById(companyId)`: returns a company by portal ID when visible.
- `findByExternal1CId(external1CId)`: returns the portal company linked to a 1C reference for trusted server-side flows.
- `findActiveById(companyId)`: returns only active company records.
- `createCompany(input)`: creates a minimal portal company access record after service approval.
- `updateDisplayName(companyId, displayName, actorUserId)`: updates portal display label only.
- `updateStatus(companyId, status, actorUserId)`: persists a service-approved status transition.
- `listCompaniesByIds(companyIds)`: reads a bounded list for service-composed responses.

Rules:

- `external_1c_id` is a reference, not a permission.
- Repositories must not expose partner company records without either RLS or a service-approved trusted path.
- Do not add commercial fields to repository DTOs.

### `CompanyMembershipRepository`

Purpose: Encapsulates persistence for user-to-company membership records.

Tables:

- `company_memberships`
- `roles` where role joins are needed for read models

Allowed ownership:

- Portal membership relationship, role assignment, status, approval and revocation metadata.
- No prices, stock, finance, order history, or commercial terms.

Representative methods:

- `findById(membershipId)`: returns one membership when visible.
- `findByUserAndCompany(userId, companyId)`: returns membership for exact user/company pair.
- `listByUser(userId)`: returns memberships for one user.
- `listActiveByUser(userId)`: returns active memberships for company context resolution.
- `listByCompany(companyId)`: returns company memberships for service-approved company user management.
- `createMembership(input)`: creates a pending or active membership after service approval.
- `approveMembership(membershipId, actorUserId, approvedAt)`: persists approved state.
- `suspendMembership(membershipId, actorUserId)`: persists suspended state.
- `revokeMembership(membershipId, actorUserId, revokedAt)`: persists revoked state.
- `assignRole(membershipId, roleId, actorUserId)`: persists a service-approved role change.

Rules:

- MVP services should enforce one active partner company per partner user even if the repository supports future multi-company reads.
- Repositories persist membership state; services decide whether a transition is valid.
- `listByCompany` must only be called from service paths that already checked `company_users.manage` or internal/admin authority.

### `RolePermissionRepository`

Purpose: Encapsulates reads for stable roles, permissions, and role-permission mappings.

Tables:

- `roles`
- `permissions`
- `role_permissions`

Allowed ownership:

- Portal role and permission metadata.
- No partner-specific commercial data.

Representative methods:

- `findRoleById(roleId)`: returns role metadata.
- `findRoleByCode(roleCode)`: returns role metadata by stable code.
- `listRoles(scope?)`: returns roles, optionally filtered by scope.
- `findPermissionByCode(permissionCode)`: returns permission metadata.
- `listPermissions()`: returns stable permissions.
- `listPermissionsForRole(roleId)`: returns permission codes for one role.
- `listPermissionCodesForMembership(membershipId)`: returns permission codes linked to a membership role.
- `roleHasPermission(roleId, permissionCode)`: returns a boolean persistence check.

Rules:

- This repository may return role metadata broadly because the tables are not partner commercial data.
- It must not decide whether role permissions are enough for a business action. Services combine role permissions with profile status, company status, membership status, access profile, resource scope, and domain rules.
- Role and permission mutation methods should wait until admin configuration workflows are explicitly designed.

### `AccessRequestRepository`

Purpose: Encapsulates persistence for partner access request workflow records.

Tables:

- `access_requests`

Allowed ownership:

- Portal request workflow data.
- Submitted company data is unverified input until a manager/service approves it.

Representative methods:

- `findById(requestId)`: returns one request when visible.
- `listByUser(userId)`: returns requests submitted by one user.
- `listPending(limit, cursor)`: returns pending requests for service-approved internal review.
- `createRequest(input)`: inserts a new user-owned access request.
- `cancelPendingRequest(requestId, userId)`: cancels a user's own pending request.
- `markApproved(requestId, actorUserId, reviewedAt)`: persists a service-approved approval result.
- `markRejected(requestId, actorUserId, reviewedAt)`: persists a service-approved rejection result.
- `attachCompany(requestId, companyId)`: links a request to a portal company after service validation.

Rules:

- A request does not grant access.
- `requested_external_1c_id` must not be used as security scope.
- Approval methods must be called only after services validate reviewer authority and company linkage.
- Repository errors should distinguish duplicate/conflict cases from missing or hidden rows.

### `InvitationRepository`

Purpose: Encapsulates persistence for invitation workflow records.

Tables:

- `invitations`

Allowed ownership:

- Portal invitation state and metadata.
- No active access until accepted and converted into membership by a service.

Representative methods:

- `findById(invitationId)`: returns one invitation when visible.
- `findPendingByEmail(email)`: returns pending invitations matching an authenticated user's email.
- `listByCompany(companyId)`: returns company invitations for service-approved company user management.
- `createInvitation(input)`: creates a pending invitation after service approval.
- `markAccepted(invitationId, acceptedByUserId, acceptedAt)`: persists accepted state.
- `markExpired(invitationId)`: persists expired state.
- `revokeInvitation(invitationId, actorUserId)`: persists revoked state.

Rules:

- Email-matched invitation reads are convenience, not proof of company access.
- If token-based invitations are added later, repository methods must not store plaintext tokens.
- Services must create or approve membership after invitation acceptance; the invitation repository must not grant access itself.

## Methods for Each Repository

Repository method design should follow these conventions:

- Inputs are explicit command/query DTOs, not raw request objects.
- Outputs are explicit repository DTOs, not Supabase client responses.
- Methods return either a value, `null`, or a typed repository result with an error category.
- Method names should describe persistence intent, not UI actions.
- Mutating methods should accept actor metadata where the table records approval, revocation, review, or audit-related fields.
- Methods should not accept unvalidated arbitrary filter objects from UI or Server Actions.
- Methods that read by IDs should use bounded query shapes and avoid broad unscoped scans.

Example method categories:

- `find...`: returns one visible record or `null`.
- `list...`: returns a bounded list.
- `create...`: inserts a portal-owned record.
- `update...`: updates simple fields after service validation.
- `mark...`: persists a service-approved workflow state.
- `exists...`: returns a boolean persistence check.

## Query Scoping Rules

Services must prepare scope before calling repositories.

Repository query inputs should include the narrowest safe scope:

- Authenticated user ID for user-owned records.
- Company ID after service-side active membership resolution.
- Membership ID after service-side ownership or management permission resolution.
- Role code or permission code for metadata lookup.
- Request ID plus actor context for request workflow updates.
- Invitation ID plus company or email scope for invitation workflow updates.

Rules:

- Repositories may rely on RLS as a safety net, but services must still pass scoped identifiers.
- Repositories must not accept client-supplied `external_1c_id` as proof of access.
- Repositories should not return rows for "all companies" or "all memberships" unless the service path is explicitly internal/admin and approved.
- Partner-facing repository calls should be company-scoped or user-scoped.
- Internal/admin repository calls should still use bounded filters and explicit service authorization.

## RLS Assumptions

The first access-control migration enables RLS on all Access Control tables.

Repository design assumes:

- User-scoped Supabase clients respect RLS.
- Users can read their own profile.
- Users can update only safe own profile columns through grants and policies.
- Users can read companies only through active membership.
- Users can read their own memberships.
- Authenticated users can read role and permission metadata.
- Users can create and read their own access requests.
- Users can cancel their own pending access requests.
- Users can read narrow pending invitations matching their authenticated email.
- Admin/internal approval policies are deferred until helper functions and service workflows are designed.

Service Role assumptions:

- Service Role bypasses RLS and must be isolated in server-only infrastructure.
- Repository constructors or factories must make elevated access explicit.
- Elevated repository usage must be reviewed and limited to trusted workflows.
- Partner-facing request handling should prefer user-scoped clients unless a trusted service workflow requires otherwise.

RLS is not a replacement for services. It protects the database if a repository query is too broad, but services still decide business permissions and transitions.

## Error Handling Rules

Repositories should normalize persistence errors into safe categories:

- `not_found`: record does not exist or is hidden by RLS.
- `conflict`: unique constraint or stale state conflict.
- `constraint_violation`: status, foreign key, or required field violation.
- `permission_denied`: Supabase/RLS denied operation.
- `validation_error`: repository input is structurally invalid before query.
- `system_error`: unexpected persistence failure.

Rules:

- Do not expose raw Supabase errors to UI.
- Do not include secrets, service role details, or hidden partner data in errors.
- Do not leak whether another company's record exists to partner users.
- Preserve enough diagnostic context for server logs, such as table, operation, and correlation ID where available.
- Services translate repository errors into domain errors and user-safe messages.
- Repositories should not silently convert permission errors into success.

## Service Boundary Rules

Services own business behavior. Repositories persist.

Services must decide:

- Whether a user profile is allowed to become active, suspended, revoked, internal, or admin.
- Whether a partner company can be created, activated, suspended, revoked, or linked to 1C.
- Whether a membership can be approved, suspended, revoked, or assigned a role.
- Whether an access request can be approved, rejected, or cancelled.
- Whether an invitation can be created, accepted, expired, or revoked.
- Whether a role and permission set authorizes a business action.
- Whether partner status and access profile allow catalog, price, stock, document, finance, order, or reservation access.

Repositories may expose methods that persist these changes, but method availability is not permission.

Server Actions and server loaders should call services, not repositories directly.

UI components should never import repositories.

## Anti-Patterns

Avoid:

- Calling Supabase directly from UI components.
- Calling repositories directly from Client Components.
- Passing raw form data directly into repositories.
- Building permission checks inside repositories.
- Adding `isAdmin` or `canSeePrices` convenience booleans to persistence records without service ownership.
- Using `external_1c_id` from a URL or form as access scope.
- Returning `partner_companies` broadly for autocomplete before admin access is designed.
- Listing all memberships for all companies from partner-facing flows.
- Making role and permission mutations before admin workflows and audit rules exist.
- Using Service Role because RLS is inconvenient.
- Sharing repository instances between user-scoped and admin-scoped contexts without explicit naming.
- Returning Supabase rows directly to UI.
- Treating access requests or invitations as active access.

## Implementation Checklist

Before implementing Access Control repositories:

- [ ] Confirm the access-control migration is applied to the target Supabase project.
- [ ] Confirm RLS is enabled and policies match the migration review.
- [ ] Generate or define database types from the applied schema.
- [ ] Decide repository folder location inside the Access Control module.
- [ ] Define repository DTOs for each method boundary.
- [ ] Define repository error categories.
- [ ] Decide how user-scoped and admin-scoped Supabase clients are injected.
- [ ] Ensure Service Role imports remain server-only.
- [ ] Implement read methods before mutation methods.
- [ ] Keep mutation methods narrow and service-driven.
- [ ] Add tests or manual verification for RLS-sensitive queries.
- [ ] Confirm no repository imports UI code, Server Actions, or 1C integration code.
- [ ] Confirm repositories do not store or return commercial truth.
- [ ] Review all methods against `SECURITY_AND_DATABASE_ARCHITECTURE.md`.
- [ ] Review all methods against `REPOSITORY_PATTERN.md`.

## Cross-References

- `docs/architecture/ACCESS_CONTROL_DATABASE_DESIGN.md`
- `docs/architecture/SECURITY_AND_DATABASE_ARCHITECTURE.md`
- `docs/architecture/REPOSITORY_PATTERN.md`
- `docs/architecture/BACKEND_ARCHITECTURE.md`
- `docs/architecture/MODULE_COMMUNICATION.md`
- `docs/domain/ACCESS_CONTROL_DOMAIN.md`
