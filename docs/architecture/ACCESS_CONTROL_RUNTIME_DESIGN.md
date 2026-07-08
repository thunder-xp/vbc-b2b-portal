# Access Control Runtime Design

## Purpose

Access Control is the first runtime design topic because every future business feature depends on it.

Catalog, prices, stock, carts, orders, documents, finance, notifications, and admin operations all expose data that can be partner-specific, commercially sensitive, or internal-only. If Access Control is implemented late or only at the UI level, the platform risks exposing one partner's prices, invoices, stock visibility, or order history to another partner.

This document defines the first implementation-ready design for runtime access decisions. It does not define database schema, SQL policies, services, repositories, routes, or UI.

## Access Control Responsibilities

### Access Control Owns

Access Control owns portal-side decisions about who can use the platform and what they can see or do.

It owns:

- Authenticated user application profile.
- Relationship between users and partner companies.
- Internal Novotech user roles.
- Admin roles.
- Permission evaluation.
- Portal access status.
- Access request concepts.
- Invitation concepts.
- Partner approval concepts.
- Partner company active context for runtime checks.

Access Control is a portal-owned capability. It controls visibility and actions; it does not own commercial truth.

### Access Control Does Not Own

Access Control does not own:

- Product prices.
- Individual prices.
- Stock balances.
- Warehouse stock.
- Credit limits.
- Debt and balance.
- Invoices and accounting documents.
- Order commercial truth after 1C creation.
- 1C-owned company master data.
- Product master data.
- Official contracts or commercial terms.

These are owned by 1C. Access Control decides whether portal users may see or act on this data.

## Core Concepts

### User Identity

Definition: The authenticated identity from Supabase Auth.

Ownership: Supabase Auth owns authentication identity.

Source of truth: Supabase Auth.

Relation to 1C: None directly. 1C does not authenticate portal users.

### User Profile

Definition: The portal application profile connected to a User Identity.

Ownership: Partner Platform.

Source of truth: Portal database.

Relation to 1C: May reference partner company context indirectly through membership, but does not replace 1C partner records.

### Partner Company

Definition: External business organization that works with Novotech.

Ownership: 1C owns official company master data; Partner Platform owns portal access metadata.

Source of truth: 1C for company commercial identity; portal for access status and permissions.

Relation to 1C: Must be linked through 1C external IDs or approved references.

### Company Membership

Definition: Portal relationship between a user profile and a partner company.

Ownership: Partner Platform.

Source of truth: Portal database.

Relation to 1C: Uses the partner company's 1C external ID to connect access context to commercial data.

### Role

Definition: A named runtime responsibility assigned to a user in a company or internal context.

Ownership: Partner Platform.

Source of truth: Portal database or approved configuration.

Relation to 1C: None directly. 1C commercial roles do not automatically grant portal access.

### Permission

Definition: A specific allowed action or visibility capability.

Ownership: Partner Platform.

Source of truth: Portal access configuration.

Relation to 1C: Permissions control portal display or action over 1C-owned data, but do not change 1C data.

### Access Request

Definition: A request for partner access or expanded access that requires review.

Ownership: Partner Platform.

Source of truth: Portal workflow state.

Relation to 1C: May reference 1C partner company data for review.

### Invitation

Definition: A controlled invitation for a user to join a partner company or internal role.

Ownership: Partner Platform.

Source of truth: Portal workflow state.

Relation to 1C: May reference partner company by 1C external ID.

### Access Status

Definition: Runtime state controlling whether a user or membership can use the portal.

Ownership: Partner Platform.

Source of truth: Portal database.

Relation to 1C: Does not replace 1C commercial status.

### Internal User

Definition: Novotech employee or authorized staff user.

Ownership: Partner Platform.

Source of truth: Portal application identity and role assignment.

Relation to 1C: May view or manage workflows involving 1C data through portal permissions.

### Admin User

Definition: Internal user with elevated portal configuration or operational permissions.

Ownership: Partner Platform.

Source of truth: Portal application identity and role assignment.

Relation to 1C: Admin users may trigger approved workflows but must not directly edit 1C-owned truth from the portal.

## User Types

### Public Visitor

No authenticated session.

Can:

- View approved public pages if any exist later.

Cannot:

- View partner data, catalog commercial data, prices, stock, documents, finance, carts, orders, or admin areas.

### Authenticated User Without Company Access

Signed in, but no active approved membership or internal role.

Can:

- View limited account/access-pending information if implemented.
- Submit or monitor access request if approved by future design.

Cannot:

- View partner commercial data.
- Create carts or orders.
- Access internal/admin areas.

### Pending Partner User

Authenticated user attached to a partner access request or pending membership.

Can:

- View pending/access-limited information.

Cannot:

- View prices, stock, documents, finance, order history, or create orders.

### Approved Partner User

Authenticated user with active partner company membership.

Can:

- Use partner portal features allowed by company access profile, membership role, and partner status.

Cannot:

- Access another partner company's data.
- Bypass company access profile.
- Directly query arbitrary 1C partner data.

### Partner Company Admin

Partner-side user with company user-management responsibility.

Can:

- Manage allowed company users or invitations if implemented.
- View company data permitted by company access profile.

Cannot:

- Change Novotech-controlled access profile.
- Grant commercial visibility beyond company permissions.
- Access another partner company.

### Novotech Internal Employee

Internal Novotech user with an approved internal role.

Can:

- Perform role-specific internal work such as partner support, sales review, finance review, or content management.

Cannot:

- Use admin override casually.
- Edit 1C-owned commercial truth through portal state.

### Novotech Admin

Internal admin with elevated portal permissions.

Can:

- Configure portal-owned access, roles, and approval workflows.
- Manage internal portal controls within approved architecture.

Cannot:

- Bypass audit expectations.
- Expose service-role access to the client.
- Turn portal into a direct 1C editor.

### System / Integration Actor

Trusted server-side process.

Can:

- Run approved sync, logging, cache, order creation, and reservation operations.

Cannot:

- Be used from browser code.
- Bypass access design for convenience.
- Perform unapproved writes to 1C.

## Access States

### Anonymous

No session.

Can: only future public pages.

Cannot: access partner or internal data.

### Registered

Authenticated but not approved for company/internal access.

Can: limited account/access workflow if implemented.

Cannot: access commercial data.

### Pending Approval

Access request or invitation is waiting for Novotech or company-admin review.

Can: view pending state if implemented.

Cannot: use partner workflows.

### Active

Membership or internal role is approved and usable.

Can: access features allowed by role, permissions, company context, and partner status.

Cannot: exceed granted permissions.

### Suspended

Access is temporarily blocked.

Can: only view limited blocked-state messaging if implemented.

Cannot: create carts, orders, reservations, view protected commercial data, or download protected documents unless explicitly approved by a future exception design.

### Revoked

Access has been removed.

Can: no business access.

Cannot: use previous membership, stale sessions, links, or cached client state to access protected data.

### Rejected

Access request was denied.

Can: view rejection state if implemented and appropriate.

Cannot: access partner or internal workflows.

## Company Access Model

Rules:

- One company can have multiple users.
- Current MVP may use one active partner company per user, but design must not block future multi-company users.
- One user may belong to multiple companies in the future if approved.
- Active company context should be explicit for every partner-scoped request.
- Email domain must not be used as proof of company access.
- Company commercial data is linked through 1C external IDs.
- Portal controls access, memberships, roles, and permissions.
- 1C controls commercial truth.
- If active company context is missing or ambiguous, use safe denial.

No user should be able to request arbitrary 1C partner data by changing company IDs, external IDs, URLs, form fields, or client state.

## Roles and Permissions

The initial role model should remain practical. Access profile controls company-wide commercial visibility; membership role controls what a user may do inside that company context.

### Partner Roles

#### `partner_owner`

Purpose: Primary partner-side responsible user for a company.

Typical permissions:

- View allowed catalog data.
- Use allowed price/stock visibility.
- Create carts.
- Submit order requests or direct orders if company access allows.
- View order history if enabled.
- Manage company users/invitations if implemented.
- View company notifications.

Must not:

- Change Novotech-controlled access profile.
- Grant finance, price, stock, or document permissions beyond company access profile.
- Access other partner companies unless separately approved.

#### `partner_manager`

Purpose: Operational manager at partner company.

Typical permissions:

- View allowed catalog data.
- Create carts.
- Submit order requests.
- View order history if enabled.
- View operational documents if enabled.

Must not:

- Manage company access profile.
- See finance data unless explicitly allowed.
- Manage all company users unless granted later.

#### `partner_buyer`

Purpose: User focused on purchasing workflows.

Typical permissions:

- Search catalog.
- View allowed prices and stock.
- Create carts.
- Submit order requests or orders if company access allows.
- Request special prices if enabled.

Must not:

- Manage users.
- View finance data by default.
- Override approval requirements.

#### `partner_accounting`

Purpose: User focused on finance and accounting documents.

Typical permissions:

- View invoices/accounting documents if company finance permissions allow.
- View debt, balance, credit days, or credit limit only when explicitly enabled.
- View finance notifications.

Must not:

- Create orders by default.
- View product stock/pricing beyond company profile.
- Manage users unless separately granted.

#### `partner_viewer`

Purpose: Read-only or low-risk partner access.

Typical permissions:

- View basic allowed catalog data.
- View allowed documents if enabled.
- View notifications relevant to role.

Must not:

- Create carts, orders, reservations, or special price requests.
- View finance data by default.
- Manage users.

### Internal Roles

#### `novotech_admin`

Purpose: Full internal portal administration.

Typical permissions:

- Manage portal-owned access profiles and roles.
- Approve partners and users.
- Review integration failures.
- Configure portal-owned settings.

Must not:

- Directly edit 1C-owned truth through portal state.
- Use service role from client-side code.
- Bypass audit requirements.

#### `novotech_sales`

Purpose: Sales and partner relationship operations.

Typical permissions:

- Review partner access context.
- Approve or review order requests if assigned.
- View sales-relevant partner data.
- Request access-profile changes through approved flow.

Must not:

- Change finance visibility without finance/admin approval.
- Edit 1C commercial truth in the portal.

#### `novotech_finance`

Purpose: Finance review and finance visibility governance.

Typical permissions:

- Review finance data visibility.
- View debt, balance, invoices, and credit information for internal workflows.
- Participate in credit-risk or finance approval workflows.

Must not:

- Expose finance data to partners without explicit permission.
- Replace 1C accounting.

#### `novotech_support`

Purpose: Partner support and operational assistance.

Typical permissions:

- View limited partner context.
- Help with access issues, document questions, and order status support.

Must not:

- Grant sensitive finance or individual price visibility.
- Use admin override without approval.

#### `novotech_content_manager`

Purpose: Manage portal-owned content enrichment and document presentation.

Typical permissions:

- Manage portal labels, document grouping, catalog enrichment, and content visibility drafts where approved.

Must not:

- Edit product master truth, prices, stock, finance, or confirmed orders.

## Permission Evaluation Rules

Access evaluation should follow this order:

1. Confirm authenticated user when the action requires authentication.
2. Resolve user profile.
3. Resolve active company membership or internal role.
4. Check access state.
5. Check role.
6. Check requested permission.
7. Check resource ownership and scope.
8. Check company access profile for commercial data visibility.
9. Apply internal override only if explicitly allowed and auditable.
10. Return only access-safe data.

UI visibility is not security. The UI may hide buttons or navigation, but Server Actions, services, repositories, and future RLS must still enforce access.

If any required access context is missing, inconsistent, stale, or ambiguous, the safe result is denial.

## Domain Access Matrix

This matrix is high-level and does not define database policies.

| Capability | Public visitor | Registered no company | Pending partner | Partner viewer | Partner buyer | Partner accounting | Partner manager | Partner owner | Novotech sales | Novotech finance | Novotech support | Novotech admin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Catalog | No | No | No | Allowed basics | Allowed | Limited by role/profile | Allowed | Allowed | Internal review | Internal review | Support view | Admin view |
| Partner prices | No | No | No | No by default | If profile allows | No by default | If profile allows | If profile allows | Internal sales view | Internal finance view | No by default | Admin view |
| Stock visibility | No | No | No | Availability only if profile allows | If profile allows | No by default | If profile allows | If profile allows | Internal view | Limited | Support view if needed | Admin view |
| Cart | No | No | No | No | Yes if profile allows | No by default | Yes if profile allows | Yes if profile allows | No | No | No | No by default |
| Create order | No | No | No | No | If profile allows | No by default | If profile allows | If profile allows | Internal approval only | Finance approval only | No | Admin exception only |
| Order history | No | No | No | If profile allows | If profile allows | Finance/order docs if allowed | If profile allows | If profile allows | Internal view | Finance view | Support view | Admin view |
| Invoices/documents | No | No | No | Product docs if allowed | Product/order docs if allowed | Accounting docs if allowed | If profile allows | If profile allows | Internal view | Finance view | Support view if needed | Admin view |
| Debt/finance information | No | No | No | No | No by default | If profile allows | No by default | If profile allows | No by default | Internal finance view | No by default | Admin view |
| Credit limit information | No | No | No | No | No by default | If profile allows | No by default | If profile allows | Limited if needed | Internal finance view | No by default | Admin view |
| Special price requests | No | No | No | No | If profile allows | No | If profile allows | If profile allows | Review | Review if finance-related | No | Admin view |
| Company user management | No | No | No | No | No | No | Limited if granted | Yes if implemented | No | No | Support assistance | Admin view |
| Notifications | No | Account/access only | Access status only | Role-scoped | Role-scoped | Finance-scoped | Role-scoped | Role-scoped | Internal scoped | Finance scoped | Support scoped | Admin scoped |
| Admin area | No | No | No | No | No | No | No | No | Limited internal area | Limited internal area | Limited internal area | Yes |

Company access profile may further reduce partner-side capabilities. Role permission never expands commercial visibility beyond company access profile.

## Server-Side Enforcement

### Server Actions

Server Actions must:

- Validate authentication.
- Resolve user profile and active company/internal context.
- Validate input shape.
- Call services.
- Return safe errors.

Server Actions must not:

- Contain core access-control business logic.
- Directly call 1C.
- Directly perform unrestricted Supabase writes for business data.

### Services

Services enforce business and security rules.

Access Control service should provide reusable evaluation for:

- User profile state.
- Membership state.
- Role permission.
- Partner status.
- Access profile visibility.
- Active company context.
- Internal role checks.

Domain services should call Access Control before returning sensitive data or performing actions.

### Repositories

Repositories may use scoped query inputs but must not decide business permissions.

Repositories should:

- Access Supabase.
- Return persistence data.
- Support scoped queries.

Repositories should not:

- Decide whether the user is allowed to see partner prices.
- Decide whether finance data is visible.
- Decide whether an order can be submitted.

### RLS

RLS is the final database guard, not the only guard.

Future RLS policies should protect against accidental overfetch, direct browser access, and implementation mistakes. Services still enforce domain rules and return access-safe DTOs.

## Integration With 1C

Access Control does not authenticate users in 1C.

Integration rules:

- Portal user identity is managed by Supabase Auth and portal profiles.
- Partner company context may use 1C external IDs to connect portal membership to commercial data.
- 1C data must be filtered according to portal access before display.
- No user can request arbitrary 1C partner data by changing IDs.
- Integration operations must receive trusted server-side context, not raw client-selected company IDs.
- 1C remains the source of truth for commercial data.
- Access Control remains the source of truth for portal visibility and user/company permissions.

## MVP Scope

MVP Access Control should include:

- User profile.
- Company membership.
- Basic partner roles.
- Internal admin role.
- Access request and approval flow.
- Active company context.
- Partner status checks.
- Server-side permission checks.
- Access-safe error behavior.

MVP should not include:

- Complex ABAC engine.
- Custom permission builder UI.
- Multi-level dealer hierarchy.
- Advanced audit console.
- Cross-company delegated access unless required later.
- Temporary access grants.
- Department-specific permission builder.
- Dynamic rule engine.

## Future Evolution

This design can evolve through:

- Multi-company users.
- More granular permissions.
- Audit logs for sensitive access decisions.
- Approval workflows for access changes.
- Delegated access.
- Temporary access with expiration.
- Internal department-specific roles.
- Access-profile templates.
- Per-document-category permissions.
- Per-product-category permissions.
- Manager-visible access simulation.

Future evolution must preserve the current boundary: 1C owns commercial truth, and Partner Platform owns portal access and visibility.

## Security Risks

| Risk | Prevention |
| --- | --- |
| Partner sees another partner's prices | Resolve active company context server-side; scope price cache by company; enforce access profile before returning data. |
| Partner sees another partner's invoices | Company membership checks, document/finance permissions, download-time access checks, future RLS. |
| Suspended user keeps access | Check access state on every protected Server Action and server-side loader; invalidate or ignore stale client state. |
| UI hides action but API still allows it | Server-side services enforce permissions; UI is not the security boundary. |
| Service-role misuse | Keep service-role server-only, isolated, documented, and unavailable to UI modules. |
| Direct 1C ID enumeration | Never trust client-supplied 1C IDs; resolve allowed 1C external IDs from membership and server context. |
| Hardcoded role checks scattered across UI | Centralize permission evaluation in access services/helpers and return access-safe view DTOs. |

## Implementation Readiness Checklist

Before coding Access Control, complete:

- [ ] Required architecture and domain documents reviewed.
- [ ] Access Control runtime concepts accepted.
- [ ] MVP role model accepted.
- [ ] Database tables designed.
- [ ] RLS strategy designed.
- [ ] Server Action boundaries designed.
- [ ] Service boundaries designed.
- [ ] Repository boundaries designed.
- [ ] Active company context behavior accepted.
- [ ] Access-safe error behavior accepted.
- [ ] Service-role usage policy accepted.

## Cross-References

- `docs/domain/ACCESS_CONTROL_DOMAIN.md` - Business access-control goals, permissions, access profile, partner status, and edge cases.
- `docs/domain/PARTNER_DOMAIN.md` - Partner company, partner user, manager, lifecycle, and 1C/portal ownership.
- `docs/architecture/SECURITY_AND_DATABASE_ARCHITECTURE.md` - Security model, Supabase access rules, RLS principles, identity model, database principles, and implementation gate.
- `docs/architecture/DATA_OWNERSHIP_MATRIX.md` - Ownership boundaries for 1C-owned and portal-owned data.
- `docs/architecture/BACKEND_ARCHITECTURE.md` - Backend layers, Server Actions, services, repositories, integration layer, and dependency rules.
- `docs/architecture/REPOSITORY_PATTERN.md` - Repository/service/DTO/mapping/validation boundaries.
- `docs/architecture/MODULE_COMMUNICATION.md` - Allowed module communication and dependency direction.
- `docs/architecture/INTEGRATION_ARCHITECTURE.md` - 1C integration boundary and read/write rules.
