# Onboarding Server Actions Design

This document designs the first onboarding Server Actions vertical slice for the Novotech Partner Platform.

It is a design document only. It does not create code, UI, database schema, API routes, or Server Actions.

## Purpose

The first onboarding Server Actions provide the narrow partner self-service entry point after authentication.

They should let an authenticated user:

- Resolve their current portal profile.
- Update safe personal profile fields.
- Submit a partner access request.
- View their own access requests.
- Cancel their own pending request.
- View their own company memberships.

Server Actions are not the access-control engine. They are thin authenticated entry points that normalize input, call Access Control services, and return safe results to the UI.

## Onboarding Flow

### 1. Authenticated user opens portal

The user has already completed the authentication flow through Supabase Auth or a future approved auth mechanism.

The portal must not treat authentication alone as business access. The system must resolve the user's portal profile and access state before showing company-scoped features.

### 2. System checks current profile

The server-side onboarding entry point calls `getCurrentProfileAction`.

The action:

- Resolves the authenticated user ID from trusted server auth context.
- Calls `UserProfileService.getCurrentProfile`.
- Returns a safe onboarding state.

### 3. Profile states

#### Profile missing

The authenticated user does not yet have a portal profile.

Expected response:

- Return a safe `profile_missing` state.
- Do not create company access.
- Do not infer partner access from email, domain, or 1C references.
- If future automatic profile creation is used, it must go through `UserProfileService.createProfileAfterSignup` and respect RLS/service availability.

#### Profile active

The user has an active portal profile.

Expected response:

- Return a safe profile summary.
- Check memberships separately before company-scoped features are available.
- If the user has active membership in an active company, the UI may proceed to partner portal entry points.
- If the user has no active membership, the UI should guide the user to access request status or request submission.

#### Profile pending

The user profile exists but the user's portal access is not fully active.

Expected response:

- Return a waiting or limited onboarding state.
- Allow only safe self-service actions approved by service rules.
- Do not expose commercial data.
- Do not allow order, catalog price, stock, finance, or document access.

#### Profile suspended, revoked, or rejected

The user exists but must not proceed.

Expected response:

- Return a safe blocked state.
- Do not reveal internal review details.
- Do not allow access request submission unless a future policy explicitly permits it.
- Do not expose company, membership, commercial, document, finance, or order data.

### 4. User submits partner access request

The user submits an access request through `submitAccessRequestAction`.

The action:

- Resolves authenticated user ID from server auth context.
- Parses and normalizes request input.
- Calls `AccessRequestService.submitAccessRequest`.
- Does not approve the request.
- Does not create a partner company.
- Does not create company membership.
- Does not call 1C.
- Does not accept partner-entered 1C references.

### 5. User sees waiting-for-approval state

After submission, the portal should show a waiting-for-approval state based on `getOwnAccessRequestsAction`.

The state is partner-facing only:

- `pending_review` request exists.
- Novotech review is required.
- No approval details are exposed.
- No admin workflow is available in this slice.

## Proposed Server Actions

### `getCurrentProfileAction`

Purpose:

- Return the authenticated user's current portal profile state.

Input:

- No user ID from the client.
- Authenticated user ID must come from trusted server auth context.

Service dependency:

- `UserProfileService.getCurrentProfile`.

Safe output:

- Profile summary when found.
- `profile_missing` state when no profile exists.
- Safe error result for unauthenticated or blocked access states.

Must not:

- Query Supabase directly.
- Create profile implicitly unless explicitly approved in a later implementation step.
- Return membership, price, stock, finance, order, or document data.

### `updateOwnProfileAction`

Purpose:

- Allow the authenticated user to update safe self-service profile fields.

Input:

- Safe profile fields only, such as full name and phone.
- User ID must not be accepted from form input.

Service dependency:

- `UserProfileService.updateOwnProfile`.

Safe output:

- Updated safe profile summary.

Must not:

- Update `status`.
- Update `userType`.
- Assign role, permission, company, membership, or loyalty.
- Allow self-promotion.

### `submitAccessRequestAction`

Purpose:

- Create a pending partner access request for the authenticated user.

Input:

- Optional portal company ID when the user is requesting access to a known company.
- Requested company name.
- Fiscal code, VAT number, or IDNO when available.
- Contact phone.
- Optional message.

Service dependency:

- `AccessRequestService.submitAccessRequest`.

Safe output:

- Created `pending_review` access request summary.

Must not:

- Approve or reject requests.
- Create partner companies.
- Create memberships.
- Call 1C.
- Accept a partner-entered 1C reference.
- Let the partner assign company role, access profile, price group, or approval state.
- Reveal whether a 1C company or another partner company exists.

### `getOwnAccessRequestsAction`

Purpose:

- Return the authenticated user's own access requests.

Input:

- No user ID from the client.

Service dependency:

- `AccessRequestService.getOwnAccessRequests`.

Safe output:

- List of the user's own request summaries.

Must not:

- List all requests.
- List requests for another user.
- Expose admin review fields beyond partner-safe status information.

### `cancelOwnAccessRequestAction`

Purpose:

- Cancel the authenticated user's own pending access request.

Input:

- Request ID.
- User ID must come from trusted server auth context.

Service dependency:

- `AccessRequestService.cancelOwnPendingRequest`.

Safe output:

- Updated request summary.

Must not:

- Cancel another user's request.
- Approve or reject requests.
- Change non-pending requests.
- Perform admin review.

### `getOwnMembershipsAction`

Purpose:

- Return memberships visible to the authenticated user.

Input:

- No user ID from the client.

Service dependency:

- `CompanyAccessService.getOwnMemberships`.

Safe output:

- Safe membership summaries.

Must not:

- Return commercial terms.
- Return prices, stock, debt, credit limits, invoices, contracts, or order data.
- Trust `external1cId` as an access boundary.

## Boundaries

### Server Actions May Do

Server Actions may:

- Validate that a user is authenticated.
- Resolve authenticated user ID from server auth context.
- Parse and normalize input.
- Call Access Control services.
- Convert service results into safe action results.
- Convert domain errors into safe action errors.
- Trigger future audit logging when approved for access-affecting mutations.

### Server Actions Must Never Do

Server Actions must never:

- Contain core business logic.
- Query Supabase directly for access-control data.
- Import or use Supabase Service Role.
- Import or use admin Supabase clients.
- Call 1C directly.
- Create or modify database rows outside service/repository flow.
- Expose raw Supabase, repository, service, or infrastructure errors.
- Implement admin approval or rejection in this onboarding slice.
- Return commercial data.
- Mix Engineering CRM logic into the Partner Platform.

## Error Mapping

Server Actions should map service domain errors to stable, user-safe action errors.

| Service error | Action error code | Safe meaning |
| --- | --- | --- |
| `UnauthenticatedError` | `AUTH_REQUIRED` | The user must sign in. |
| `ForbiddenError` | `FORBIDDEN` | The user cannot perform this action. |
| `NotFoundError` | `NOT_FOUND` | The requested resource is not available. |
| `InvalidStateError` | `INVALID_STATE` | The action is not valid for the current state. |
| `DuplicateRequestError` | `DUPLICATE_REQUEST` | A pending request already exists. |
| `MembershipRequiredError` | `MEMBERSHIP_REQUIRED` | Active company membership is required. |
| `PermissionRequiredError` | `PERMISSION_REQUIRED` | Required permission is missing. |
| `OperationNotAvailableError` | `OPERATION_NOT_AVAILABLE` | The operation is not available yet. |
| Other `AccessControlError` | `ACCESS_CONTROL_ERROR` | We could not submit your request. Please check your profile or contact Novotech support. |
| Unknown error | `SYSTEM_ERROR` | Unexpected system failure. |

Error responses must:

- Avoid raw exception messages.
- Avoid table, policy, SQL, Supabase, or infrastructure details.
- Avoid confirming the existence of another company, user, request, or 1C record.
- Avoid leaking internal review decisions.

## Security Rules

The onboarding Server Actions must follow these rules:

- Authentication is required for every action.
- Authenticated user ID comes only from trusted server auth context.
- Client-provided user IDs are ignored or rejected.
- Partner-facing onboarding never accepts 1C references; manager/admin approval may bind the 1C reference later.
- Partners cannot self-assign company role, access profile, price group, or approval state.
- No approval workflow exists in this slice.
- No admin actions exist in this slice.
- No commercial data is returned.
- No prices, stock, debt, credit limits, invoices, accounting documents, contracts, or order history are returned.
- No direct 1C calls are allowed.
- No Service Role usage is allowed.
- RLS remains a database safety layer, but service rules remain mandatory.
- UI visibility must mirror service results, not replace service checks.

## Result Shape

Server Actions should return one stable result shape.

Conceptual shape:

```ts
type ActionResult<TData> =
  | {
      ok: true;
      data: TData;
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        fieldErrors?: Record<string, string[]>;
      };
    };
```

This shape is conceptual. It should be implemented later in a shared server-action utility only after the action implementation step is approved.

### Safe Data Shapes

The first onboarding slice should return safe DTOs only:

- Profile state: profile exists or is missing, plus safe profile fields.
- Access request summary: request ID, status, requested company display fields, timestamps, and partner-safe message fields.
- Membership summary: company ID, membership status, role ID or role code when safe, and non-commercial company display fields.

These DTOs must not expose:

- Raw database rows.
- Snake case database fields.
- Supabase errors.
- 1C payloads.
- Commercial or accounting data.

## Implementation Checklist

Before creating onboarding Server Actions:

- [ ] Confirm `UserProfileService`, `AccessRequestService`, and `CompanyAccessService` implementations are available for the exact methods used.
- [ ] Confirm no `InvitationService` or admin review workflow is required for this slice.
- [ ] Define a shared safe `ActionResult` helper or equivalent pattern.
- [ ] Resolve authenticated user ID server-side only.
- [ ] Parse and normalize all form input before calling services.
- [ ] Pass only service-approved input fields.
- [ ] Call services, not repositories.
- [ ] Do not import Supabase repository implementations directly into UI or client code.
- [ ] Do not use Supabase Service Role.
- [ ] Do not call 1C.
- [ ] Map all service domain errors to safe action error codes.
- [ ] Add tests for missing profile, active profile, pending request, duplicate request, suspended user, non-owner cancellation, and non-pending cancellation.
- [ ] Verify returned DTOs contain no commercial data.
- [ ] Verify no CRM concepts are introduced.
- [ ] Run TypeScript and lint checks after implementation.

## Cross References

- `docs/architecture/ACCESS_CONTROL_SERVICE_DESIGN.md`
- `docs/architecture/BACKEND_ARCHITECTURE.md`
- `docs/architecture/SECURITY_AND_DATABASE_ARCHITECTURE.md`
- `docs/architecture/MODULE_COMMUNICATION.md`
- `docs/domain/ACCESS_CONTROL_DOMAIN.md`
- `docs/domain/PARTNER_DOMAIN.md`
