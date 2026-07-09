# Access Control Service Design

## Purpose

This document defines the service layer design for Access Control in the Novotech Partner Platform.

Access Control services own the business rules that decide who can use the portal, which company context applies, which role and permissions are active, and which access lifecycle transitions are allowed. Services coordinate repositories, authentication context, and future audit/logging utilities while keeping UI, Server Actions, repositories, and 1C integration inside their proper boundaries.

This is a design document only. It does not create TypeScript code, services, UI, SQL, migrations, repositories, or database changes.

## Service Layer Responsibilities

Access Control services are responsible for:

- Resolving authenticated user application identity.
- Resolving active partner company context.
- Checking user profile status.
- Checking partner company status.
- Checking membership status.
- Checking role and permission grants.
- Enforcing business rules.
- Enforcing permission rules.
- Enforcing access request and invitation lifecycle rules.
- Deciding whether a state transition is allowed.
- Calling repositories with scoped, validated inputs.
- Coordinating repositories without leaking persistence details to callers.
- Protecting partner and commercial access boundaries before other domains expose data.
- Returning service-shaped results to Server Actions and server loaders.
- Producing safe domain errors for UI-facing entry points.
- Preparing future audit/logging events for sensitive access changes.

Services must make safe-denial decisions when identity, membership, company, role, permission, or request state is missing, ambiguous, inconsistent, suspended, revoked, or stale.

## What Services Own

Access Control services own portal-side access behavior.

They own:

- User profile activation, suspension, revocation, rejection, and internal/admin classification workflows.
- Partner company portal access status decisions.
- Company membership approval, suspension, revocation, and role assignment workflows.
- Active company context resolution.
- Permission evaluation for portal actions.
- Access request submission, cancellation, review, approval, and rejection rules.
- Invitation creation, acceptance, expiration, and revocation rules.
- Safe response shaping for access-control data.
- Translation of repository errors into domain errors.
- Enforcement of "authentication is not authorization."

Services do not own commercial truth. They may decide whether a user may see or act on commercial data, but 1C remains the source of truth for products, prices, stock, orders after creation, invoices, debts, credit limits, contracts, warehouses, and official partner company master data.

## What Services Must Never Do

Access Control services must never:

- Render UI.
- Call 1C directly.
- Replace the Integration Layer.
- Run raw SQL outside repositories or approved persistence helpers.
- Store or calculate prices, stock, debt, invoices, credit limits, or other commercial truth.
- Own commercial data.
- Duplicate 1C business logic or 1C source-of-truth rules.
- Use `external_1c_id` as proof of access.
- Trust client-selected company IDs without membership validation.
- Trust email domain as proof of company access.
- Bypass repositories for normal Supabase persistence.
- Put business rules in UI components or Server Actions.
- Return raw Supabase rows to UI.
- Return raw 1C payloads to UI.
- Use Supabase Service Role unless explicitly approved for a narrow trusted server-side workflow.
- Expose Supabase Service Role credentials or service-role errors.
- Use Service Role to hide missing RLS or missing service checks.
- Let partner users approve their own access unless an explicit future business rule allows it.
- Treat access requests or invitations as active access.
- Grant commercial visibility beyond company access profile and domain-specific service checks.

## Proposed Services

### `UserProfileService`

Purpose: Owns application profile lifecycle and user identity readiness.

Coordinates:

- `UserProfileRepository`
- Authentication context helper
- Future audit/logging utility

Main methods:

- `getCurrentProfile(authUserId)`: returns the authenticated user's portal profile or an access-safe missing-profile result.
- `ensureProfileForAuthUser(authUser)`: creates or returns the profile for an authenticated user after validating identity input.
- `createProfileAfterSignup(authUser)`: explicit signup-oriented method for creating the profile after Supabase Auth identity exists.
- `updateOwnProfile(authUserId, input)`: updates safe self-service fields such as full name and phone.
- `activateUser(actorContext, userId)`: activates a user after internal/admin approval.
- `suspendUser(actorContext, userId, reason)`: suspends portal access for a user.
- `revokeUser(actorContext, userId, reason)`: revokes user access.
- `setUserType(actorContext, userId, userType)`: changes user type only from authorized internal/admin workflows.
- `getUserAccessReadiness(authUserId)`: returns whether the user can proceed to company-scoped portal features.

Input expectations:

- Authenticated user ID comes from trusted server auth context, not form input.
- Profile update input includes only safe self-service fields.
- Status and user type changes include actor context and reason where appropriate.

Output expectations:

- Returns service DTOs such as profile summary, access readiness, or safe denial.
- Does not return raw `user_profiles` rows to UI.
- Does not expose hidden internal classification fields unless caller is authorized.

Rules:

- Users may not self-promote `status` or `user_type`.
- Registered users without active membership cannot access protected partner workflows.
- Suspended, revoked, or rejected users must receive safe denial.
- Internal/admin classification must be explicit and auditable.

Forbidden behavior:

- Self-service profile update must not mutate `status` or `user_type`.
- The service must not grant membership or company access by creating a profile.
- The service must not infer internal/admin status from email domain alone.

### `CompanyAccessService`

Purpose: Owns partner company context, membership state, and company-level access readiness.

Coordinates:

- `UserProfileRepository`
- `PartnerCompanyRepository`
- `CompanyMembershipRepository`
- `RolePermissionRepository`
- Future audit/logging utility

Main methods:

- `resolveActiveCompanyContext(authUserId, requestedCompanyId?)`: resolves the active company context for a user.
- `getMembershipContext(authUserId, companyId)`: returns profile, company, membership, role, and permission context.
- `getOwnMemberships(authUserId)`: returns the authenticated user's visible memberships.
- `listUserCompanies(authUserId)`: returns companies where the user has visible membership.
- `validateCompanyAccess(authUserId, companyId)`: confirms that user, company, and membership are all usable.
- `checkApprovedMembership(authUserId, companyId)`: verifies approved/active membership before company-scoped work proceeds.
- `createPartnerCompany(actorContext, input)`: creates minimal portal access representation after approval.
- `activateCompany(actorContext, companyId)`: activates a partner company in the portal.
- `suspendCompany(actorContext, companyId, reason)`: suspends a partner company in the portal.
- `revokeCompany(actorContext, companyId, reason)`: revokes partner company portal access.
- `createMembership(actorContext, input)`: creates a pending or approved membership after service checks.
- `approveMembership(actorContext, membershipId)`: approves a membership.
- `suspendMembership(actorContext, membershipId, reason)`: suspends a membership.
- `revokeMembership(actorContext, membershipId, reason)`: revokes a membership.
- `assignRole(actorContext, membershipId, roleCode)`: assigns a role after authority checks.
- `listCompanyMembers(actorContext, companyId)`: returns company members when `company_users.manage` or internal authority is valid.

Input expectations:

- Company IDs are portal IDs and must be validated against membership or internal authority.
- `external_1c_id` may appear only in trusted company creation/linking workflows after manager/admin review.
- Role changes require actor context and target membership.

Output expectations:

- Returns active company context, membership summaries, or access-safe company summaries.
- Does not return full 1C counterparty data.
- Does not expose another company's existence through partner-facing errors.

Rules:

- A user account alone never grants company access.
- Active company context requires active user, active company, active membership, and valid role.
- MVP may enforce one active partner company per partner user even if future schema supports more.
- Partner users may not change Novotech-controlled access status or role assignment unless explicitly designed later.
- Partner company records must remain minimal and must not become a 1C counterparty copy.
- Future multi-company support should reuse explicit active company context rather than adding implicit company selection.

Forbidden behavior:

- The service must not query or trust arbitrary `external_1c_id` from client input.
- The service must not allow company lookup by 1C ID for partner-facing flows.
- The service must not grant access from invitation or access request state alone.

### `PermissionService`

Purpose: Owns runtime permission evaluation and access-safe capability shaping.

Coordinates:

- `UserProfileRepository`
- `PartnerCompanyRepository`
- `CompanyMembershipRepository`
- `RolePermissionRepository`
- Future access profile source when implemented

Main methods:

- `getPermissionContext(authUserId, companyId?)`: returns profile, membership, role, permission codes, and company status.
- `getRolePermissions(roleCode)`: returns permission codes for a role.
- `hasPermission(authUserId, companyId, permissionCode)`: returns whether the user has the requested permission in company context.
- `requirePermission(authUserId, companyId, permissionCode)`: returns context or throws/returns a permission error.
- `hasInternalRole(authUserId, roleCode)`: evaluates explicit internal role state.
- `hasPartnerRole(authUserId, companyId, roleCode)`: evaluates explicit partner role state within company context.
- `canManageCompanyUsers(authUserId, companyId)`: evaluates company user management access.
- `canApproveAccessRequests(actorContext)`: evaluates internal/admin approval authority.
- `canCreateInvitation(actorContext, companyId, roleCode)`: evaluates invitation creation authority.
- `getPartnerCapabilities(authUserId, companyId)`: returns service-shaped capabilities for UI/server loaders.
- `assertActiveUserAndCompanyContext(authUserId, companyId)`: validates active user/company/membership preconditions.

Input expectations:

- Permission codes are stable backend constants or validated strings.
- Company-scoped checks include company ID and authenticated user ID.
- Internal checks include authenticated user ID and expected internal role or permission.

Output expectations:

- Returns boolean decisions, permission context, or shaped capability DTOs.
- Capability DTOs are for display and convenience, not a replacement for server-side enforcement.
- Does not return raw role-permission rows as UI security logic.

Rules:

- Permission checks combine user status, company status, membership status, role, permission code, resource scope, and later access profile.
- Role permission alone does not override company status or access profile.
- UI may display returned capabilities, but UI is never the enforcement layer.
- If permission context is missing or ambiguous, deny.
- Other domain services should call `PermissionService` or `CompanyAccessService` rather than duplicating role checks.

Forbidden behavior:

- The service must not encourage hardcoded UI permission logic.
- The service must not expose a broad "admin can do anything" shortcut.
- The service must not let role metadata alone bypass company, membership, or access profile checks.

### `AccessRequestService`

Purpose: Owns access request workflow behavior.

Coordinates:

- `UserProfileRepository`
- `PartnerCompanyRepository`
- `CompanyMembershipRepository`
- `AccessRequestRepository`
- `PermissionService`
- Future notification/audit utilities

Main methods:

- `submitAccessRequest(authUserId, input)`: creates a `pending_review` access request for the authenticated user.
- `listOwnAccessRequests(authUserId)`: returns the user's own requests.
- `cancelOwnPendingRequest(authUserId, requestId)`: cancels a user's own pending request.
- `preventDuplicatePendingRequest(authUserId, requestedCompanyReference)`: checks duplicate pending request conditions before insert.
- `listPendingRequests(actorContext, query)`: returns pending requests for authorized internal review.
- `reviewRequest(actorContext, requestId)`: loads review context for authorized internal users.
- `approveAccessRequest(actorContext, requestId, decisionInput)`: approves a request and coordinates company/membership changes.
- `rejectAccessRequest(actorContext, requestId, reason)`: rejects a request.
- `attachRequestToCompany(actorContext, requestId, companyId)`: links a request to a portal company after validation.

Input expectations:

- Submitted company name, fiscal code/VAT/IDNO, contact phone, and message are untrusted user input.
- 1C reference is internal-only and must be assigned later by manager/admin approval workflow.
- Review and approval calls require internal/admin actor context.
- Cancellation requires authenticated owner context.

Output expectations:

- Returns request summaries and safe workflow status.
- Does not expose internal review details to ordinary partner users.
- Does not return verified commercial company data based only on submitted request fields.

Rules:

- Request submission does not grant access.
- Submitted company data is untrusted until reviewed.
- Partner-facing services must not accept requested 1C IDs.
- Only authorized internal/admin workflows may approve or reject requests.
- Only authorized internal/admin workflows may bind the request or company to a 1C partner reference.
- Approval should create or update portal-owned access records; it must not edit 1C commercial truth.
- Duplicate pending requests should be handled as conflicts or clear user-safe messages.
- Admin/internal review can be designed later, but partner self-service request submission and cancellation must stay owner-scoped.

Forbidden behavior:

- The service must not create active membership without approval rules.
- The service must not let users approve their own request.
- The service must not let partners submit or bind `requested_external_1c_id`.
- The service must not let partners choose role, access profile, price group, or approval state.

### `InvitationService`

Purpose: Owns invitation workflow behavior.

Coordinates:

- `UserProfileRepository`
- `PartnerCompanyRepository`
- `CompanyMembershipRepository`
- `RolePermissionRepository`
- `InvitationRepository`
- `PermissionService`
- Future notification/audit utilities

Main methods:

- `createInvitation(actorContext, companyId, input)`: creates an invitation after company user management checks.
- `listCompanyInvitations(actorContext, companyId)`: lists invitations for authorized company or internal users.
- `listOwnPendingInvitations(authUserId)`: returns invitations matching the authenticated user's verified email.
- `lookupPendingInvitation(authUserId, invitationIdOrToken)`: future-safe lookup entry for pending invitation acceptance.
- `acceptInvitation(authUserId, invitationId)`: accepts invitation and coordinates membership creation or update.
- `expireInvitation(actorContext, invitationId)`: marks invitation expired.
- `revokeInvitation(actorContext, invitationId, reason)`: revokes invitation before acceptance.
- `resendInvitation(actorContext, invitationId)`: future method for notification-only resend after checks.

Input expectations:

- Invitation creation requires inviter actor context, target company ID, email, and role.
- Invitation acceptance requires authenticated user context.
- Future token acceptance should use a hashed/token-safe lookup design, not plaintext token storage.

Output expectations:

- Returns invitation status and safe company display context only when permitted.
- Does not expose broad company invitation lists to unauthorized users.
- Does not expose membership access until membership creation/approval completes.

Rules:

- Invitations do not grant access until accepted and converted into membership.
- Email matching is not proof of company access by itself.
- Future token-based invitation design must avoid plaintext token storage.
- Accepted, expired, or revoked invitations must not be reusable.
- Role assignment through invitation must be constrained by the inviter's authority.
- Email-only matching is acceptable only as a narrow MVP convenience because email addresses can change and invitation acceptance should eventually depend on verified identity plus a secure token.

Forbidden behavior:

- The service must not grant active access from an invitation row alone.
- The service must not rely on email-only matching as the long-term security model.
- The service must not allow an inviter to assign roles beyond their authority.

## Main Service Methods

The first implementation slice should prioritize methods that unblock safe access context:

1. `UserProfileService.getCurrentProfile`
2. `UserProfileService.ensureProfileForAuthUser`
3. `CompanyAccessService.resolveActiveCompanyContext`
4. `CompanyAccessService.getMembershipContext`
5. `PermissionService.getPermissionContext`
6. `PermissionService.hasPermission`
7. `PermissionService.requirePermission`
8. `AccessRequestService.submitAccessRequest`
9. `AccessRequestService.listOwnAccessRequests`
10. `AccessRequestService.cancelOwnPendingRequest`

Admin and invitation methods should wait until their Server Action, audit, and RLS behavior is explicitly accepted.

Method design rules:

- Accept explicit command/query DTOs, not raw request objects.
- Return service DTOs, not database rows.
- Include actor context for privileged operations.
- Return capabilities and safe denials that UI can display without exposing hidden data.
- Keep all state-changing methods auditable in future.

## Business Rules

General access rules:

- Authentication is required for every non-public access-control operation.
- Authentication alone does not grant partner access.
- A user must have an application profile before protected workflows proceed.
- Suspended, revoked, or rejected profiles must be denied protected actions.
- Partner company access requires active company status.
- Partner actions require active membership.
- Membership role determines user responsibility inside company context.
- Company access profile and domain services may further reduce commercial visibility.
- Missing or inconsistent access data results in denial.

Company context rules:

- Client-selected company IDs are hints only.
- Services must verify requested company IDs against active membership.
- If no active company can be resolved, partner workflows must not proceed.
- External 1C IDs are resolved from trusted portal company records after membership validation.

Internal/admin rules:

- Internal access must be explicit through user type, role, and permissions.
- Admin override must be narrow, audited later, and service-controlled.
- Internal users may review access workflows only through approved service methods.

## Permission Checks

Permission evaluation order:

1. Confirm authenticated user.
2. Load user profile.
3. Check profile status.
4. Resolve requested or default company context when company-scoped.
5. Check company status.
6. Check membership status.
7. Load role and permission codes.
8. Check requested permission code.
9. Check resource scope.
10. Apply company access profile or domain-specific visibility rules when available.
11. Return allowed result or safe denial.

Permissions should be checked in services before repositories return sensitive company-scoped data to callers.

Permission examples:

- `company_users.manage` for listing company members or creating invitations.
- `access_requests.approve` for approving/rejecting access requests.
- `admin.access` for admin configuration workflows.
- `catalog.view`, `prices.view`, `stock.view`, `documents.view_company`, and `finance.view_company` for domain service checks before those domains expose data.

Role permissions are necessary but not always sufficient. A suspended company, suspended membership, missing access profile, or domain-specific restriction can still deny access.

## State Transitions

State transitions are service-owned. Repositories only persist approved transitions.

User profile transitions:

- `registered` -> `pending_approval`
- `registered` or `pending_approval` -> `active`
- `active` -> `suspended`
- `suspended` -> `active`
- `registered` or `pending_approval` -> `rejected`
- Any active or pending state -> `revoked`

Partner company transitions:

- `pending_approval` -> `active`
- `pending_approval` -> `rejected`
- `active` -> `suspended`
- `suspended` -> `active`
- Any active or pending state -> `revoked`

Membership transitions:

- `pending_approval` -> `active`
- `pending_approval` -> `rejected`
- `active` -> `suspended`
- `suspended` -> `active`
- Any active or pending state -> `revoked`

Access request transitions:

- `pending` -> `approved`
- `pending` -> `rejected`
- `pending` -> `cancelled`

Invitation transitions:

- `pending` -> `accepted`
- `pending` -> `expired`
- `pending` -> `revoked`

Transition rules:

- Terminal states should not be silently reopened.
- Actor identity should be captured for approval, review, revocation, and future audit.
- Services should reject invalid transitions explicitly.
- Services should avoid hard deletes for access-control history.

## Error Handling

Services should return or throw normalized domain errors:

- `unauthenticated`: no authenticated user.
- `authentication_required`: alias for unauthenticated where framework naming prefers it.
- `forbidden`: authenticated user cannot perform the action.
- `profile_missing`: authenticated user has no portal profile.
- `profile_inactive`: profile is suspended, revoked, or rejected.
- `company_not_found`: company does not exist or is hidden.
- `company_inactive`: company is suspended, revoked, rejected, or pending.
- `membership_missing`: user has no valid membership for requested company.
- `membership_required`: action requires valid company membership.
- `membership_inactive`: membership is suspended, revoked, rejected, or pending.
- `permission_required`: action requires a missing permission.
- `permission_denied`: role/permission/resource scope does not allow action.
- `not_found`: requested resource does not exist or is intentionally hidden.
- `invalid_transition`: requested state change is not allowed.
- `invalid_state`: requested operation is not valid for the current state.
- `conflict`: duplicate request, duplicate membership, stale state, or unique constraint conflict.
- `duplicate_request`: equivalent to a specific access request conflict.
- `validation_error`: invalid service input.
- `system_error`: unexpected persistence or infrastructure failure.

Rules:

- Do not expose raw Supabase errors to UI.
- Do not leak whether another company's data exists.
- Do not expose hidden partner data in error messages.
- Preserve diagnostic context for server logs.
- Prefer safe denial over permissive fallback.
- Server Actions should translate service errors into user-safe responses.

## Repository Usage Rules

Services may call repositories, but repositories must remain persistence adapters.

Rules:

- Services prepare validated and scoped repository inputs.
- Services decide permissions before calling broad or sensitive repository methods.
- Services combine repository results into access context.
- Services interpret repository `not_found`, `permission_denied`, `conflict`, and `constraint_violation` results.
- Services call mutation repository methods only after validating transitions.
- Services do not pass raw UI form data to repositories.
- Services do not let repositories decide business permissions.
- Services avoid Service Role except through explicitly named trusted workflows.

Recommended dependency shape:

```text
Access Control Service
  -> Access Control Repositories
  -> Shared auth/context helpers
  -> Future audit/logging utility
```

Access Control services may be consumed by other domain services. Other domains should not reach into Access Control repositories directly.

## Server Action Boundaries

Server Actions are entry points, not the home of access-control logic.

Server Actions should:

- Validate authentication.
- Parse and validate input shape.
- Create actor context.
- Call Access Control services.
- Return safe service results.
- Convert domain errors into user-safe messages.

Server Actions must not:

- Query Supabase tables directly for access-control business data.
- Call Access Control repositories directly.
- Implement permission evaluation inline.
- Implement state transition rules inline.
- Call 1C.
- Import Service Role clients into client-reachable code.
- Return raw database rows or hidden access metadata.

Server Components and server loaders follow the same rule: call services for access-controlled data.

## Anti-Patterns

Avoid:

- Putting `if role === "admin"` checks throughout UI or Server Actions.
- Treating `auth.uid()` as enough to access partner data.
- Trusting company ID, membership ID, or external 1C ID from the browser.
- Creating one generic `canAccessEverything` helper.
- Allowing services to call 1C directly.
- Letting repositories approve requests or memberships.
- Returning all permissions to UI as raw security state without shaping capabilities.
- Using Service Role for partner-facing self-service flows.
- Swallowing RLS denial and continuing with unscoped fallback queries.
- Adding commercial fields to Access Control service DTOs.
- Treating invitation acceptance as access without membership creation and approval.
- Treating access request approval as 1C company master-data editing.
- Adding service methods that mix Access Control with catalog, pricing, inventory, finance, or order business logic.

## Security Risks

| Risk | Prevention |
| --- | --- |
| Self-promotion | Self-service methods update only safe fields; status, user type, role, and membership changes require authorized actor context. |
| Access to another partner company | Every company-scoped method validates active membership and company status before returning data or action capability. |
| `external_1c_id` enumeration | Services never trust client-supplied 1C IDs as access scope; 1C references are resolved from validated portal company records. |
| UI-only protection | Server Actions call services; services enforce permissions and state transitions regardless of UI visibility. |
| Broad Service Role usage | Service Role is allowed only in explicit, approved, server-only workflows and never as a shortcut around RLS. |
| Duplicated permission logic | Other modules call Access Control services instead of hardcoding role checks in UI, Server Actions, or repositories. |
| Invitation abuse | Invitations remain pending workflow records until service-approved acceptance creates or updates membership. |
| Duplicate access requests | Services check existing pending requests and return conflict errors instead of creating repeated review work. |

## Implementation Checklist

Before implementing Access Control services:

- [ ] Confirm the migration is applied and RLS is verified in the target Supabase project.
- [ ] Confirm repository interfaces are accepted.
- [ ] Confirm service boundaries are accepted by architecture.
- [ ] Define service DTOs and domain error types.
- [ ] Define actor context shape.
- [ ] Define active company context shape.
- [ ] Define permission context shape.
- [ ] Define input validation schemas for service commands.
- [ ] Decide how service methods receive user-scoped versus trusted server clients.
- [ ] Ensure Service Role usage is explicit, server-only, and narrow.
- [ ] Implement read/context resolution methods before mutation methods.
- [ ] Implement permission checks before any domain service exposes commercial data.
- [ ] Implement duplicate access request prevention before public request submission.
- [ ] Decide which admin/internal review methods are MVP and which are deferred.
- [ ] Decide invitation token strategy before relying on invitations for production onboarding.
- [ ] Add tests for safe denial cases.
- [ ] Add tests for status transition rules.
- [ ] Add tests for permission checks and company scoping.
- [ ] Add tests for repository error translation.
- [ ] Review Server Actions to ensure they call services and do not contain core rules.
- [ ] Confirm no service calls 1C directly.
- [ ] Confirm no service returns raw repository rows to UI.
- [ ] Confirm no Access Control service stores commercial truth.

## Cross-References

- `docs/architecture/ACCESS_CONTROL_RUNTIME_DESIGN.md`
- `docs/architecture/ACCESS_CONTROL_DATABASE_DESIGN.md`
- `docs/architecture/ACCESS_CONTROL_REPOSITORY_DESIGN.md`
- `docs/architecture/SECURITY_AND_DATABASE_ARCHITECTURE.md`
- `docs/architecture/BACKEND_ARCHITECTURE.md`
- `docs/architecture/MODULE_COMMUNICATION.md`
- `docs/architecture/REPOSITORY_PATTERN.md`
- `docs/domain/ACCESS_CONTROL_DOMAIN.md`
- `docs/domain/PARTNER_DOMAIN.md`
