# Internal Partner Approval Console Design

## Purpose

The Internal Partner Approval Console lets authorized Novotech internal/admin users review partner-submitted access requests and convert approved requests into active portal company access.

This is not partner self-service. Partners cannot approve requests, assign roles, bind 1C references, select contracts, or select price groups.

## Scope

Included:

- List `pending_review` partner access requests.
- Review submitted company name, fiscal code/VAT/IDNO, contact phone, and message.
- Bind approved requests to:
  - 1C partner reference
  - 1C contract reference
  - 1C price type / price group reference
- Create or update portal partner company access record.
- Create active company membership for the requesting user.
- Activate the requester as a partner user.
- Mark request as `approved` or `rejected`.
- Store rejection or approval reason.

Excluded:

- 1C API validation.
- Contract synchronization.
- Price type synchronization.
- Credit-limit or debt visibility changes unless a future finance/access model supports them.
- Service Role usage from UI.
- Partner-facing editing or display of internal 1C references.

## Security Rules

- Only active `internal` or `admin` user profiles may access review actions.
- UI visibility is not a security boundary; every Server Action calls service authorization.
- RLS policies allow review writes only through authenticated internal/admin users.
- Partner users can read only their own request status.
- Partner users cannot insert or update `requested_external_1c_id`.
- Partner users cannot create companies, memberships, roles, price groups, or approval state.

## Data Ownership

- 1C remains source of truth for partner, contract, and price type identities.
- Portal stores only references required to control partner access and read-model visibility.
- Request-submitted fiscal code and phone are workflow input only, not verified commercial truth.

## Approval Flow

1. Partner submits request without ERP references.
2. Request is stored as `pending_review`.
3. Internal/admin user opens approval console.
4. Internal/admin user reviews submitted data.
5. Internal/admin user validates real partner/contract/price type in 1C manually.
6. Internal/admin user searches 1C and selects the existing partner record.
7. The form automatically populates partner, contract, and price type references from the selected 1C result.
8. Service creates or updates the portal partner company binding. This alone must not grant portal access.
9. Service marks the access request `approved` with the company and 1C reference binding.
10. Service creates or reuses one active membership for the requester and approved company.
11. Service activates requester profile as partner.
12. Partner can enter Partner Cabinet only when both conditions are true: the request is `approved` and an active membership exists.

## Approval Ordering And Idempotency

The current implementation does not use a database transaction or RPC. Until that exists, approval must use this strict ordering:

1. Validate internal/admin reviewer.
2. Trim and require 1C partner reference, contract reference, and price type reference.
3. Load a `pending_review` request, or continue an already `approved` request as an idempotent retry.
4. Create or reuse the portal company by 1C partner reference.
5. Mark the request `approved` before creating active access.
6. Create or reuse the active company membership.
7. Activate the requester profile.

Retry rules:

- Repeating approval for the same already approved request must not create duplicate companies.
- Repeating approval for the same already approved request must not create duplicate memberships.
- If company creation succeeds but request approval fails, the company may remain, but no membership or active profile is created.
- If request approval succeeds but membership/profile activation fails, retry resumes from the approved request and completes missing access.
- Partner Cabinet access must check approved request plus active membership, not membership alone.

## Rejection Flow

1. Internal/admin user opens request.
2. Internal/admin user enters rejection reason.
3. Service marks request `rejected`.
4. No company or membership is created.
5. Partner waiting page shows rejected status and safe reason.

## Implementation Boundaries

- Admin pages call Server Actions only.
- Server Actions normalize input, authenticate user, call services, and return safe results.
- Services enforce internal/admin authority and state transitions.
- Repositories persist/query data only and rely on RLS.
- No UI component imports Supabase, repositories, services, or 1C provider code.

## Future Extensions

- Controlled contract picker.
- Controlled price type picker.
- Audit log entries for approvals/rejections.
- Credit-limit and debt visibility assignment after Finance Domain implementation.
