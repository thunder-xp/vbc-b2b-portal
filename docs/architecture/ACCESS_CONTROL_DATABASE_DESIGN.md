# Access Control Database Design

## Purpose

This document defines the conceptual database design for access control in the Novotech Partner Platform.

It exists before SQL, RLS policies, repositories, services, or UI are implemented so the team can agree on ownership, relationships, status transitions, and security boundaries first. The goal is to make the future database schema predictable, RLS-ready, and aligned with the Architecture Book without prematurely creating tables.

This is a design document only. It does not define migrations, SQL, RLS policies, TypeScript types, repositories, services, or UI behavior.

## Design Principles

- 1C remains the source of truth for commercial company data.
- The portal owns application identity, portal membership, portal roles, approval workflow, access state, and visibility permissions.
- The portal stores external 1C IDs only where needed to connect portal access decisions to 1C-owned commercial data.
- The portal must not duplicate commercial truth such as legal counterparty data, contracts, prices, debts, credit limits, invoices, stock, or confirmed order state.
- Business tables must be designed so RLS can be added cleanly later.
- Supabase Service Role usage must remain server-only and isolated to trusted backend operations.
- The schema should support the MVP one-company-per-user rule while not making future multi-company access impossible.
- Database structure should help services enforce business rules, but it must not move business workflows into persistence.
- Repositories persist and read data. Services control transitions, permissions, and validation.
- UI components display service-shaped data and must not make access-control decisions from raw database rows.

## Proposed Tables

The tables below are conceptual. Field names are intentionally descriptive, not final SQL.

### `user_profiles`

Purpose: Stores the portal-owned profile connected to a Supabase Auth user.

Ownership: Portal.

Source of truth: Portal for application profile data; Supabase Auth for authentication identity.

Key fields:

- `id`: portal profile identifier.
- `auth_user_id`: reference to Supabase `auth.users`.
- `email`: normalized email used for display and invitation matching.
- `full_name`: user-facing name.
- `phone`: optional contact data.
- `status`: profile lifecycle state.
- `is_internal`: whether the user is Novotech staff.
- `default_company_id`: future-ready pointer to preferred active company context.
- `last_active_company_id`: future-ready pointer for company switching.
- `created_at`, `updated_at`.

Constraints:

- One profile should map to one `auth.users` record.
- Email must not be used as the only security boundary.
- Internal staff and partner users must be distinguishable without relying on UI routes.

Relation to 1C:

- No direct 1C ownership.
- A profile may be linked to a partner company that has a 1C external ID, but the user profile itself is portal-owned.

MVP and future readiness:

- MVP supports one partner company per partner user through approved membership.
- Future design may allow multiple memberships without changing the identity table.

### `partner_companies`

Purpose: Represents the portal access container for a partner company.

Ownership: Portal for access metadata; 1C for commercial company truth.

Source of truth: Portal owns portal status and access metadata. 1C owns official counterparty data.

Key fields:

- `id`: portal company identifier.
- `external_1c_id`: reference to the matching 1C counterparty or partner record.
- `display_name`: portal display label, preferably sourced or approved from 1C.
- `status`: portal access status.
- `loyalty_level`: portal business segmentation value.
- `access_profile_id`: future-ready reference if access profiles become separate configured records.
- `manager_user_id`: assigned Novotech manager profile where needed.
- `created_at`, `updated_at`.

Constraints:

- `external_1c_id` must be unique when present.
- A company can exist before 1C matching only during controlled registration or approval workflow.
- Portal company status must not silently override official 1C commercial status.

Relation to 1C:

- `external_1c_id` is a reference, not a security credential.
- The portal uses the company record to scope access to 1C-owned data after membership and permission checks pass.

MVP and future readiness:

- MVP should keep the company record minimal.
- Future versions may add portal-only access metadata, manager assignment, segmentation, and workflow notes.

### `company_memberships`

Purpose: Connects users to partner companies or internal access contexts.

Ownership: Portal.

Source of truth: Portal.

Key fields:

- `id`: membership identifier.
- `user_profile_id`: member profile.
- `partner_company_id`: company context for partner memberships.
- `role_id`: assigned role.
- `status`: membership state.
- `invited_by_user_id`: inviter where applicable.
- `approved_by_user_id`: approver where applicable.
- `approved_at`: approval timestamp.
- `revoked_by_user_id`: revoker where applicable.
- `revoked_at`: revocation timestamp.
- `created_at`, `updated_at`.

Constraints:

- MVP partner users should have only one active approved partner company membership.
- A suspended or revoked membership must not grant access.
- Membership must not store prices, stock, debt, credit limits, or commercial terms.
- Internal users should be modeled clearly so internal privileges are not confused with partner company access.

Relation to 1C:

- Membership references a portal company, which may reference 1C.
- Membership itself has no 1C identity.

MVP and future readiness:

- MVP supports simple approved membership.
- Future versions can support multiple company memberships, temporary access, delegated access, or company switching.

### `access_requests`

Purpose: Captures partner registration, access upgrade, or approval requests before access is granted.

Ownership: Portal.

Source of truth: Portal for request workflow; 1C for official company verification data.

Key fields:

- `id`: request identifier.
- `request_type`: registration, company access, access upgrade, reactivation, or other controlled type.
- `requester_profile_id`: user who submitted the request, when available.
- `partner_company_id`: related portal company, when known.
- `submitted_company_name`: company name supplied by requester.
- `submitted_tax_id`: optional submitted identifier for manager review, depending on local business rules.
- `submitted_email`: requester contact email.
- `status`: request lifecycle state.
- `assigned_manager_id`: manager responsible for review.
- `decision_reason`: manager-facing decision note.
- `created_at`, `updated_at`, `approved_by`, `approved_at`, `rejected_by`, `rejected_at`.

Constraints:

- Request data is not a trusted source for commercial truth.
- Approval must create or update portal-owned access state through services.
- Sensitive submitted data must be visible only to authorized internal users.

Relation to 1C:

- Managers may use request data to find or validate a 1C partner record.
- Request approval may attach a portal company to an `external_1c_id`.

MVP and future readiness:

- MVP may use access requests only if registration or approval is implemented early.
- Future versions can support special price requests or access upgrade workflows as separate request types or tables.

### `invitations`

Purpose: Supports controlled invitation of partner users or internal staff.

Ownership: Portal.

Source of truth: Portal.

Key fields:

- `id`: invitation identifier.
- `email`: invited email.
- `partner_company_id`: target company for partner invitations.
- `role_id`: proposed role.
- `invited_by_user_id`: inviter.
- `accepted_by_user_id`: user who accepted.
- `status`: invitation lifecycle state.
- `expires_at`: expiration timestamp.
- `created_at`, `updated_at`, `accepted_at`, `revoked_at`.

Constraints:

- Invitations must not grant access until accepted and converted into approved membership.
- Invitation tokens must not be stored in plaintext if token-based invitations are implemented.
- Expired or revoked invitations must not be usable.

Relation to 1C:

- Invitations do not write to 1C.
- The target company may reference 1C through `partner_companies.external_1c_id`.

MVP and future readiness:

- Invitations can wait if MVP uses manager-created users or manual membership assignment.
- The schema concept should preserve the future path for partner owners inviting additional users.

### `roles`

Purpose: Defines practical access roles used by services and admin workflows.

Ownership: Portal.

Source of truth: Portal.

Key fields:

- `id`: role identifier.
- `key`: stable role key.
- `name`: manager-readable name.
- `scope`: partner, internal, or system.
- `description`: purpose of the role.
- `is_system`: whether the role is protected from casual editing.
- `created_at`, `updated_at`.

Constraints:

- Roles should describe responsibility, not UI navigation.
- Roles should remain few and understandable.
- Role keys should be stable because services and audit logs may reference them.

Relation to 1C:

- No direct 1C relation.
- Roles decide what portal users may request or view from 1C-backed data after services validate context.

MVP and future readiness:

- MVP should start with a small fixed set of roles.
- Future admin controls may allow controlled role assignment and limited permission configuration.

### `permissions`

Purpose: Defines atomic capabilities used by services for access checks.

Ownership: Portal.

Source of truth: Portal.

Key fields:

- `id`: permission identifier.
- `key`: stable permission key.
- `domain`: catalog, pricing, inventory, orders, documents, finance, partners, admin, content, or system.
- `description`: business meaning.
- `risk_level`: low, medium, high, or critical.
- `created_at`, `updated_at`.

Constraints:

- Permissions should be practical and business-readable.
- Avoid hundreds of tiny permissions in MVP.
- Permissions must not store row-level commercial data.

Relation to 1C:

- No direct 1C relation.
- Permissions determine whether services may expose, request, or write 1C-owned data through approved paths.

MVP and future readiness:

- MVP should define only permissions needed for access, catalog, prices, stock, orders, documents, finance display, user management, and admin.
- Future versions may add finer-grained permissions after usage patterns are known.

### `role_permissions`

Purpose: Maps roles to permissions.

Ownership: Portal.

Source of truth: Portal.

Key fields:

- `role_id`: role reference.
- `permission_id`: permission reference.
- `created_at`, `created_by`.

Constraints:

- The role and permission pair should be unique.
- Changes should be controlled and audited.
- Role-permission mapping should not be modified from partner-facing UI.

Relation to 1C:

- No direct 1C relation.

MVP and future readiness:

- MVP can start with seeded role-permission mappings.
- Future versions may allow admin-controlled changes with approval, audit, and rollback.

## Table Responsibility Boundaries

`partner_companies` must not become a full 1C counterparty copy. It should store only portal access metadata, display-safe labels, status, manager assignment, and 1C reference IDs needed to connect access checks to 1C-owned data.

`user_profiles` must not contain commercial rights directly. Rights come from memberships, roles, permissions, access profiles, and services.

`company_memberships` must not store prices, debt, credit limits, stock, contracts, or commercial terms. It represents the user's relationship to a company in the portal.

`roles` must not contain UI-only navigation logic. UI navigation can be derived from service-approved capabilities, but roles exist to express business permissions.

`permissions` must not become a dumping ground for feature flags. Feature flags and product rollout controls should be modeled separately if needed.

`access_requests` must not be treated as verified partner master data. It is workflow input until a manager approves and links it to portal and 1C references.

`invitations` must not be treated as active access. Access begins only after acceptance and approved membership creation.

## Relationships

- Supabase `auth.users` maps to `user_profiles` through `auth_user_id`.
- `user_profiles` connects to `company_memberships`.
- `partner_companies` connects to `company_memberships`.
- `company_memberships` connects a user, company context, membership status, and role.
- `access_requests` may reference `user_profiles` and `partner_companies` when known.
- `invitations` references inviter, invitee after acceptance, company, and proposed role.
- `roles` connect to `permissions` through `role_permissions`.
- Approved memberships grant roles within a company context.
- Active company context is resolved server-side from authenticated user, approved membership, and requested company.

MVP rule: one partner user belongs to one partner company. The database design should enforce this through service rules and later constraints while preserving a future path to multiple company memberships.

## Status Fields

Status fields are required because access control is a lifecycle, not a boolean.

User profile status examples:

- `pending`
- `active`
- `suspended`
- `archived`

Company status examples:

- `pending_review`
- `approved`
- `active`
- `suspended`
- `archived`

Membership status examples:

- `invited`
- `pending_approval`
- `approved`
- `suspended`
- `revoked`
- `archived`

Access request status examples:

- `submitted`
- `in_review`
- `approved`
- `rejected`
- `cancelled`
- `expired`

Invitation status examples:

- `pending`
- `accepted`
- `expired`
- `revoked`

Services control status transitions. Repositories persist the requested state changes. UI displays available actions only after services decide what is allowed.

## Role and Permission Model

Roles should remain practical and business-readable.

Partner role examples:

- `partner_owner`: manages company users and sees broad company information allowed by the access profile.
- `partner_manager`: manages carts, orders, and operational workflows for the company.
- `partner_buyer`: creates carts and order requests or direct orders where allowed.
- `partner_accounting`: views allowed invoices, accounting documents, balances, and payment status.
- `partner_viewer`: views permitted catalog and company information without mutation rights.

Internal role examples:

- `novotech_admin`: manages platform settings, access controls, and high-risk overrides.
- `novotech_sales`: manages partner approval, access assignment, and commercial workflows.
- `novotech_finance`: views and controls finance-related portal visibility.
- `novotech_support`: assists partner users within limited support boundaries.
- `novotech_content_manager`: manages portal-owned content and document presentation metadata.

System role example:

- `system_integration`: used only for trusted backend integration jobs and controlled automation.

Permission examples:

- `catalog.view`
- `prices.view`
- `prices.view_individual`
- `stock.view`
- `stock.view_exact`
- `cart.manage`
- `orders.create`
- `orders.submit_request`
- `orders.view_company`
- `reservations.create`
- `documents.view_company`
- `finance.view_company`
- `company_users.manage`
- `access_requests.approve`
- `admin.access`
- `content.manage`

The MVP should use a small permission set. Additional permissions should be added only when they protect a real business boundary.

## RLS Design Notes

No RLS policies are defined in this document.

Future RLS should support these principles:

- Users can read their own profile.
- Users can read memberships they belong to.
- Partner users are scoped through active approved membership.
- Partner company data is visible only through valid membership or internal authorization.
- Internal users require internal role checks, not just email domain assumptions.
- Service Role is reserved for trusted server-side operations, integration jobs, administrative workflows, and controlled maintenance.
- RLS is a database safety layer, not a replacement for service-level business rules.
- RLS should prevent accidental broad reads even if a repository query is written too loosely.

RLS should be designed after the conceptual table design is approved and before production data is stored.

## Server-Side Query Scoping

Every server-side access-controlled query should be scoped from verified context:

1. Authenticated user ID from Supabase Auth.
2. Portal `user_profiles` record.
3. Requested or default active company ID.
4. Approved active membership for that company.
5. Role and permissions attached to that membership.
6. Partner company status and relevant access profile.
7. 1C external company ID only after membership and permission validation.

Services should build this context before calling repositories for partner-scoped data.

Repositories may accept scoped identifiers, but they must not decide whether a user deserves access. That decision belongs in services and shared access helpers.

## 1C ID Strategy

`external_1c_id` connects portal records to 1C-owned data.

Rules:

- Store 1C IDs only where a portal record must reference 1C-owned data.
- Treat `external_1c_id` as a reference, not a permission.
- Never accept arbitrary 1C IDs from client input as access scope.
- Resolve 1C IDs only after portal membership and permissions are validated.
- Keep 1C IDs server-side unless the UI has a clear business need to display an external reference.
- Use portal company IDs for portal routing and access decisions.

`partner_companies.external_1c_id` is the bridge from portal access control to 1C commercial data. It does not make the portal the owner of the underlying commercial company data.

## Audit Fields

Auditability is part of access control.

Recommended common fields:

- `created_at`
- `updated_at`
- `created_by`
- `updated_by`
- `approved_by`
- `approved_at`
- `revoked_by`
- `revoked_at`

MVP should include enough fields to trace who created, approved, suspended, or revoked access. A full append-only audit log can be added later, but access-changing tables should still preserve key actor and timestamp fields from the beginning.

High-risk future changes should also write to an audit log:

- Role changes.
- Permission changes.
- Company suspension and reactivation.
- Membership approval and revocation.
- Finance visibility changes.
- Admin override.
- Service Role driven maintenance actions.

## Soft Delete and Suspension

Access-control records should prefer status transitions over hard deletes.

Rules:

- Suspend companies or memberships instead of deleting them when access must stop.
- Revoke membership when a user's relationship with a company ends.
- Archive old profiles, companies, requests, or invitations when they should no longer appear in active workflows.
- Preserve membership, request, approval, and revocation history for auditability.
- Do not delete records that explain why access was granted or removed.

Hard deletion should be reserved for privacy, legal, or cleanup cases with explicit approval and audit considerations.

## MVP Scope

First access-control database design should include:

- `user_profiles`
- `partner_companies` with minimal portal-owned access representation
- `company_memberships`
- `roles`
- `permissions`
- `role_permissions`
- `access_requests` if registration or approval workflow is required in the first implementation slice

Wait until needed:

- `invitations`
- Complex audit logs
- Delegated access
- Temporary access
- Multi-company UI switching
- Custom permission editor
- Access profile versioning
- Detailed manager task automation

MVP should prove safe partner identity, company membership, role assignment, and server-side permission checks before catalog, pricing, stock, orders, documents, or finance are exposed.

## Migration Readiness Checklist

Before writing SQL migrations, confirm:

- This design document is accepted.
- The table list is accepted.
- Status values are accepted.
- Role and permission keys are accepted.
- MVP versus later scope is accepted.
- RLS strategy is accepted at the principle level.
- Service, repository, and integration boundaries are accepted.
- Service Role usage is accepted as server-only and narrow.
- 1C ID strategy is accepted.
- Rollback and seed-data strategy are considered.
- Audit fields for access-changing records are agreed.

SQL implementation should not begin until these points are reviewed.

## Risks and Prevention

| Risk | Why It Matters | Prevention |
| --- | --- | --- |
| Duplicating 1C counterparty data | The portal could become a second 1C and create conflicting commercial truth. | Keep `partner_companies` minimal and store only access metadata plus `external_1c_id`. |
| Storing commercial data in access tables | Sensitive prices, stock, debt, and credit limits could leak through membership queries. | Keep commercial data in 1C-owned caches or integration responses with separate visibility rules. |
| Relying on UI-only permissions | Hidden buttons do not protect data or actions. | Enforce permissions in services and later RLS. |
| Hardcoding roles in components | Role changes become risky and inconsistent. | Components consume service-shaped capabilities, not raw role logic. |
| Using `external_1c_id` as security | A guessed or supplied 1C ID could expose another partner's data. | Resolve 1C IDs only after approved portal membership checks. |
| Overengineering permissions too early | Hundreds of permissions slow implementation and confuse managers. | Start with practical domain permissions and add detail only for real risk boundaries. |
| Making multi-company impossible later | Future partner structures may require delegated or group access. | Model membership separately from profile and company even if MVP allows one active company. |
| Service Role leakage | Client-side access to Service Role can bypass all protections. | Keep Service Role in server-only modules and never import admin clients into client code. |
| Deleting access history | The team may lose traceability for approvals and revocations. | Use status transitions, audit fields, and future append-only audit logs. |

## Cross-References

- `docs/architecture/SECURITY_AND_DATABASE_ARCHITECTURE.md`
- `docs/architecture/ACCESS_CONTROL_RUNTIME_DESIGN.md`
- `docs/domain/ACCESS_CONTROL_DOMAIN.md`
- `docs/domain/PARTNER_DOMAIN.md`
- `docs/architecture/DATA_OWNERSHIP_MATRIX.md`
- `docs/architecture/BACKEND_ARCHITECTURE.md`
- `docs/architecture/REPOSITORY_PATTERN.md`
- `docs/architecture/MODULE_COMMUNICATION.md`
