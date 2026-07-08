# Security and Database Architecture

## Purpose

This document defines the security and database architecture principles for the Novotech Partner Platform.

It exists to prevent early implementation mistakes that would be difficult or risky to undo later:

- Exposing partner-specific commercial data to the wrong company.
- Treating the portal as a second 1C.
- Letting UI-level checks become the only protection.
- Allowing Supabase service-role access to reach client-side code.
- Creating database tables before ownership and access rules are clear.
- Mixing CRM assumptions into the Partner Platform.
- Adding direct 1C access outside the Integration Layer.

This is an architecture guardrail document. It does not define SQL tables, RLS policies, routes, services, repositories, or UI.

## Security Model Overview

### Public Unauthenticated Users

Public unauthenticated users are visitors without an active session.

They should have no access to partner data, commercial data, catalog pricing, stock, documents, orders, invoices, debt, credit limits, carts, or partner-specific content.

Public access may be limited to future login, registration request, legal, or support pages if approved.

### Authenticated Users

Authenticated users have a valid identity through Supabase Auth.

Authentication alone does not grant business access. After authentication, the application must resolve the user's application profile, partner membership or internal role, and allowed permissions.

### Partner Users

Partner users are authenticated users who act on behalf of a partner company.

Partner users may access only the data allowed for their partner company, partner status, role, and access profile. Partner users must never see another partner company's commercial data.

### Novotech Internal Users

Novotech internal users are employees or authorized staff who manage partners, orders, access, documents, finance visibility, or operational workflows.

Internal access must be explicit and role-based. Being authenticated is not enough to receive internal access.

### Admin Users

Admin users are internal users with broader configuration and operational permissions.

Admin access must still follow audit, source-of-truth, and service-layer rules. Admins may manage portal-owned configuration, but they must not turn the portal into a direct editor for 1C-owned commercial truth.

### System / Integration Operations

System and integration operations perform server-side work such as synchronization, cache refresh, order creation, reservation requests, logging, and future background jobs.

These operations may require elevated server-side access. Elevated access must be isolated, documented, audited where appropriate, and never exposed to browsers.

## Data Ownership Principles

The project must respect `DATA_OWNERSHIP_MATRIX.md`.

### Data Owned by 1C

1C owns commercial, accounting, warehouse, and official master data, including:

- Products, brands, categories, product identifiers, and official product state.
- Prices, individual prices, price types, currencies, and commercial terms.
- Stock balances, warehouses, and accepted reservations.
- Official partner company master data and contracts.
- Confirmed orders after creation.
- Invoices, fiscal invoices, accounting documents, delivery notes, debt, balance, and credit limits.

The portal may read, cache, display, or reference this data, but it must not become the owner.

### Data Cached in Partner Platform

The portal may cache 1C data for:

- Performance.
- Search and filtering.
- Access-controlled display.
- Partner workflow convenience.
- Temporary resilience during 1C outages.
- Manager review and operational context.

Cached data is a snapshot. Sensitive data such as prices, stock, debt, credit limits, and order status must be refreshed or revalidated when used for financial, legal, or operational commitment.

### Data Owned by Partner Platform

The portal owns application and workflow data, including:

- Partner users and application profiles.
- Partner memberships and future internal roles.
- Access profiles, portal partner status, and loyalty level.
- Carts, cart items, order drafts, and order requests before 1C creation.
- Manager approval state.
- Notifications.
- Audit logs and integration logs.
- Cache metadata and sync status.
- User settings.

### Data Never Edited Directly in the Portal

The portal must not directly edit:

- Official product master data.
- Official prices or individual prices.
- Official stock balances or warehouse quantities.
- 1C partner company master data.
- Contracts and official commercial terms.
- Confirmed 1C orders.
- Invoices, fiscal invoices, accounting documents, debt, balance, or credit limits.

In the MVP, the only writes to 1C are new order creation and product reservation.

## Supabase Access Rules

### Browser Client Usage

The browser Supabase client may use only public environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Browser client usage is allowed for authenticated user session flows and future client-safe operations that are protected by RLS and application rules.

Browser code must never receive service-role credentials or use server-only helpers.

### Server Client Usage

The server Supabase client uses the anonymous key with request cookies and server context.

Server client usage is appropriate for:

- Server Components.
- Server Actions.
- Route handlers if added later.
- Server-side loaders.
- User-scoped reads and writes that should respect RLS.

Server-side use still must call services for business rules. Server-side execution does not automatically mean bypassing domain security.

### Admin / Service-Role Client Usage

The Supabase service-role client is server-only and bypasses RLS.

Allowed service-role usage:

- Controlled system operations that cannot be performed with user-scoped access.
- Integration synchronization jobs.
- Admin maintenance tasks explicitly approved by architecture.
- Audit or integration logging where user-scoped writes are not appropriate.
- Future background workers running trusted system workflows.

Every service-role use should be narrow, isolated, and easy to review.

### Forbidden Usage Patterns

Forbidden:

- Importing service-role helpers into Client Components.
- Exposing service-role keys through API responses, logs, browser bundles, or error messages.
- Using service role in UI-triggered flows when user-scoped access is sufficient.
- Letting repositories choose service role casually.
- Bypassing RLS because policy design is incomplete.
- Using service role to hide missing access-control implementation.
- Calling Supabase directly from UI components for business data.

### Where Service Role Is Strictly Forbidden

Service role is strictly forbidden in:

- Browser code.
- Client Components.
- Shared utilities imported by browser code.
- UI components.
- Public route responses.
- Error payloads sent to users.
- Documentation examples that could be copied into client code.

## RLS Principles

Actual SQL policies are not defined in this document.

General principles:

- RLS must be enabled on future business tables.
- Partner users must only access data permitted for their partner company membership and role.
- Internal users require explicit role-based access.
- Admin access must be explicit and auditable.
- Service-role bypass must be rare, isolated, and documented.
- UI-level access control must never be the only protection.
- RLS should protect against accidental overfetch, direct browser access, and future API mistakes.
- Policies should be simple enough to audit and test.
- Sensitive domains such as finance, documents, prices, stock, and orders require extra caution.

If a table contains partner-owned, partner-visible, or sensitive business data, it should be treated as requiring RLS unless explicitly documented otherwise.

## Auth and Identity Principles

Supabase Auth is the identity provider.

Authentication answers: who is signed in?

Application identity answers:

- Is this user a partner user, internal user, manager, or admin?
- Which partner company membership applies?
- What role does the user have?
- What access profile controls visibility?
- What actions are allowed?

User profile data is an application-level identity extension. It should not be confused with Supabase Auth identity itself.

Company and partner relationships must be modeled separately from auth identity. A user account alone must not imply partner access.

Roles and permissions are application concepts. They must not be hardcoded only as UI checks.

## Multi-Company / Partner Access Model

Current business docs describe one user belonging to one partner company. The security architecture should not block a future controlled expansion to multi-company membership.

Principles:

- One company may have multiple users.
- A user may belong to one or more partner companies in the future if approved.
- Access must be based on explicit membership and role, not email domain.
- Company commercial data comes from 1C.
- Portal access permissions are managed inside Partner Platform.
- Partner access should be evaluated using partner company, user membership, role, partner status, and access profile.
- If future multi-company membership is implemented, every request must resolve the active company context explicitly.

Email domain matching may help onboarding review, but it must not grant access by itself.

## Commercial Data Protection

Commercial data must never be globally visible.

Protected data includes:

- Prices.
- Individual prices.
- Stock and warehouse availability.
- Credit limits.
- Debt, balance, and overdue amounts.
- Documents.
- Invoices and fiscal invoices.
- Order history.
- Partner-specific terms.
- Contracts.
- Promotions targeted to specific partners.

Rules:

- Partner-visible commercial data must be scoped to the authenticated user's permitted partner company.
- Access profile controls what commercial depth is visible.
- Hidden prices must not appear in pages, exports, notifications, logs, or client state.
- Hidden stock must not appear as exact stock through alternate paths.
- Finance data is hidden by default.
- Documents must be permission-checked before listing and before download.
- Order history must be limited to the partner company and permission level.
- Search results must apply the same access rules as detail pages.

## Database Design Principles

Future database design must follow ownership boundaries.

Principles:

- Every table or data type must have a clear owner.
- Do not duplicate 1C truth as editable portal truth.
- Store external IDs or references for 1C entities.
- Store cache timestamps and source metadata for cached 1C data.
- Include audit fields where ownership, access, or workflow changes matter.
- Use soft delete or archive states where historical understanding is required.
- Use status fields for workflow state, but control transitions through services.
- Avoid business calculations inside UI.
- Avoid storing derived sensitive values unless there is a clear reason.
- Keep partner company scope explicit on partner-visible records.
- Design for RLS from the beginning.

Example only: a future cached product record may store a 1C product external ID and cache timestamp, while official product editing remains in 1C.

## Server Actions Security Rules

Server Actions are not a place to hide business logic.

Rules:

- Server Actions must validate the authenticated user.
- Server Actions must resolve application identity and partner/internal context.
- Server Actions must validate input shape.
- Server Actions must call services for business rules.
- Server Actions must not contain core business logic.
- Server Actions must not directly call 1C.
- Server Actions must not directly bypass repositories for business data access.
- Server Actions must not expose sensitive raw errors.
- Server Actions must return safe, minimal responses to the UI.
- Mutating Server Actions must be auditable when they affect access, orders, reservations, documents, finance visibility, or integration state.

## Repository / Service / Integration Security Boundaries

### Repositories

Repositories access Supabase.

Repositories:

- Encapsulate persistence and cache reads/writes.
- Do not contain business logic.
- Do not decide partner visibility.
- Do not call 1C.
- Do not import UI code.

### Services

Services enforce business and security rules.

Services:

- Resolve access profile rules.
- Enforce partner status.
- Validate workflow transitions.
- Decide whether cached data is safe to use.
- Coordinate repositories and integration operations.
- Return access-safe data to server entry points.

### Integration Layer

The Integration Layer communicates with 1C.

Integration code:

- Owns 1C request/response mapping.
- Handles timeouts, retries, and error normalization.
- Logs integration attempts.
- Does not decide partner-facing visibility by itself.
- Is the only allowed path to 1C.

### UI

UI calls Server Actions or server-side loaders only.

UI:

- Displays service-shaped data.
- May hide or disable controls for usability.
- Must not be the only access-control layer.
- Must not call repositories, Supabase service-role helpers, or 1C directly.

## Initial Security Risks

| Risk | Prevention |
| --- | --- |
| Partner sees another company's data | Explicit membership model, RLS, service-level access checks, partner company scoping. |
| Service role leaks to browser | `server-only` helpers, import discipline, no service-role usage in client modules. |
| UI-only permissions | RLS plus service checks; UI only mirrors allowed actions. |
| Portal becomes second 1C | Data Ownership Matrix, read-only cache design, no direct editing of 1C-owned truth. |
| Cached price or stock treated as guaranteed | Cache freshness metadata and service-level revalidation before checkout/order/reservation. |
| Direct 1C calls from modules or UI | Mandatory Integration Layer boundary. |
| Finance data exposed too broadly | Finance hidden by default, explicit permissions, RLS and service checks. |
| Documents downloadable through stale links | Access check at listing and download time; future signed or expiring links. |
| Server Actions accumulate business logic | Server Actions call services; services own business rules. |
| Database schema created before access design | Implementation Gate in this document. |

## Implementation Gate

No business database schema, RLS policy, access-control implementation, catalog implementation, order implementation, or 1C integration implementation should start until this document is reviewed and accepted.

This gate is intentional. The project handles sensitive partner and commercial data, so security and ownership rules must be agreed before implementation starts.

## Cross-References

- `docs/architecture/DATA_OWNERSHIP_MATRIX.md` - Defines ownership, cache, edit, and 1C write boundaries.
- `docs/architecture/INTEGRATION_ARCHITECTURE.md` - Defines 1C integration rules, read/write constraints, cache strategy, and failure strategy.
- `docs/architecture/BACKEND_ARCHITECTURE.md` - Defines backend layers, services, repositories, integration layer, and dependency rules.
- `docs/architecture/REPOSITORY_PATTERN.md` - Defines repository/service responsibilities, DTOs, mapping, validation, caching, and testing direction.
- `docs/domain/ACCESS_CONTROL_DOMAIN.md` - Defines partner access profiles, visibility permissions, order permissions, finance permissions, and admin override concepts.
- `docs/domain/PRICING_INVENTORY_DOMAIN.md` - Defines protection and refresh rules for prices, individual prices, stock, warehouses, and reservations.
- `docs/domain/ORDERS_DOMAIN.md` - Defines cart, order draft, order request, 1C order creation, reservation, approval, and order status boundaries.
- `docs/domain/FINANCE_DOMAIN.md` - Defines finance as display-only portal behavior with 1C ownership and strict visibility controls.
- `docs/domain/DOCUMENTS_DOMAIN.md` - Defines document permissions, document ownership, downloads, versioning, and search.
