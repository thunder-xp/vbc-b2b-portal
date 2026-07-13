# Architecture Index

This index is the table of contents for the Novotech Partner Platform Architecture Book.

## Recommended Reading Order

1. `docs/architecture/PROJECT_PRINCIPLES.md`
2. `docs/architecture/SYSTEM_CONTEXT.md`
3. `docs/ARCHITECTURE.md`
4. `docs/architecture/DATA_OWNERSHIP_MATRIX.md`
5. `docs/architecture/SECURITY_AND_DATABASE_ARCHITECTURE.md`
6. `docs/architecture/ACCESS_CONTROL_RUNTIME_DESIGN.md`
7. `docs/architecture/ACCESS_CONTROL_DATABASE_DESIGN.md`
8. `docs/architecture/ACCESS_CONTROL_REPOSITORY_DESIGN.md`
9. `docs/architecture/ACCESS_CONTROL_SERVICE_DESIGN.md`
10. `docs/architecture/ONBOARDING_SERVER_ACTIONS_DESIGN.md`
11. `docs/architecture/FIRST_USER_EXPERIENCE_DESIGN.md`
12. `docs/architecture/INTERNAL_PARTNER_APPROVAL_CONSOLE_DESIGN.md`
13. `docs/architecture/CATALOG_READ_MODEL_DESIGN.md`
14. `docs/architecture/PRICING_INVENTORY_READ_MODEL_DESIGN.md`
15. `docs/architecture/INTEGRATION_ARCHITECTURE.md`
16. `docs/architecture/ONE_C_PROVIDER_DESIGN.md`
17. `docs/architecture/ONE_C_PARTNER_SEARCH_BINDING_DESIGN.md`
18. `docs/architecture/SYNC_ENGINE_DESIGN.md`
19. `docs/domain/PARTNER_DOMAIN.md`
20. `docs/domain/ACCESS_CONTROL_DOMAIN.md`
21. `docs/domain/CATALOG_DOMAIN.md`
22. `docs/domain/PRICING_INVENTORY_DOMAIN.md`
23. `docs/domain/ORDERS_DOMAIN.md`
24. `docs/domain/DOCUMENTS_DOMAIN.md`
25. `docs/domain/FINANCE_DOMAIN.md`
26. `docs/domain/NOTIFICATIONS_DOMAIN.md`
27. `docs/architecture/EVENT_FLOWS.md`
28. `docs/architecture/BACKEND_ARCHITECTURE.md`
29. `docs/architecture/FRONTEND_ARCHITECTURE.md`
30. `docs/architecture/MODULE_COMMUNICATION.md`
31. `docs/architecture/REPOSITORY_PATTERN.md`
32. `docs/ROADMAP.md`
33. `docs/DEVELOPMENT_RULES.md`

## Business Domains

- `docs/domain/PARTNER_DOMAIN.md` - Partner companies, users, managers, access profiles, statuses, loyalty, lifecycle, and ownership boundaries.
- `docs/domain/ACCESS_CONTROL_DOMAIN.md` - Access profiles, permissions, visibility depth, order permissions, finance permissions, admin override, and edge cases.
- `docs/domain/CATALOG_DOMAIN.md` - Product catalog, brands, categories, product groups, images, documents, attributes, analogs, search, and fast order readiness.
- `docs/domain/PRICING_INVENTORY_DOMAIN.md` - Prices, individual prices, stock, warehouses, reservations, visibility levels, cache rules, and checkout risk.
- `docs/domain/ORDERS_DOMAIN.md` - Carts, order drafts, order requests, confirmed orders, manager approval, 1C order creation, reservation, and order lifecycle.
- `docs/domain/DOCUMENTS_DOMAIN.md` - Product documents, invoices, fiscal invoices, delivery notes, warranties, certificates, guides, datasheets, marketing materials, and price lists.
- `docs/domain/FINANCE_DOMAIN.md` - Balance, debt, credit limits, credit days, invoices, payment status, financial permissions, refresh, and security.
- `docs/domain/NOTIFICATIONS_DOMAIN.md` - Notification types, channels, lifecycle, read/unread state, preferences, priority, and access-safe delivery.

## Architecture

- `docs/ARCHITECTURE.md` - Initial product architecture, separation from Engineering CRM, 1C source-of-truth principle, domains, MVP scope, and non-goals.
- `docs/architecture/SYSTEM_CONTEXT.md` - Actors, external systems, data directions, and responsibility boundaries.
- `docs/architecture/EVENT_FLOWS.md` - Key business event flows with triggers, actors, steps, systems, data movement, failures, and logging.
- `docs/architecture/DATA_OWNERSHIP_MATRIX.md` - Ownership matrix for every major entity and data type.
- `docs/architecture/SECURITY_AND_DATABASE_ARCHITECTURE.md` - Security model, Supabase access rules, RLS principles, identity model, database design principles, and implementation gate.
- `docs/architecture/ACCESS_CONTROL_RUNTIME_DESIGN.md` - First runtime design for user identity, company membership, roles, permissions, access states, server-side enforcement, and MVP access-control scope.
- `docs/architecture/ACCESS_CONTROL_DATABASE_DESIGN.md` - Conceptual access-control table design, relationships, statuses, roles, permissions, RLS readiness, 1C ID strategy, and migration checklist.
- `docs/architecture/ACCESS_CONTROL_REPOSITORY_DESIGN.md` - Access Control repository boundaries, proposed repositories, methods, query scoping, RLS assumptions, error handling, and service boundaries.
- `docs/architecture/ACCESS_CONTROL_SERVICE_DESIGN.md` - Access Control service responsibilities, proposed services, methods, business rules, permission checks, state transitions, errors, and Server Action boundaries.
- `docs/architecture/ONBOARDING_SERVER_ACTIONS_DESIGN.md` - First onboarding Server Actions slice for profile state, safe profile updates, partner access requests, own memberships, action boundaries, error mapping, and security rules.
- `docs/architecture/FIRST_USER_EXPERIENCE_DESIGN.md` - Public landing, authentication flow, onboarding state machine, Partner Cabinet gating, header identity, adaptive navigation, and empty state rules.
- `docs/architecture/INTERNAL_PARTNER_APPROVAL_CONSOLE_DESIGN.md` - Internal/admin approval console, 1C binding rules, company/membership activation flow, rejection flow, RLS/security rules, and future extensions.
- `docs/architecture/CATALOG_READ_MODEL_DESIGN.md` - Catalog read-model ownership, conceptual tables, 1C ID strategy, access control, repository/service boundaries, UI scope, risks, and phased implementation plan.
- `docs/architecture/PRICING_INVENTORY_READ_MODEL_DESIGN.md` - Pricing and inventory read-model ownership, visibility rules, manual price and stock sync flows, availability mapping, conceptual tables, RLS approach, repository/service/action/UI boundaries, risks, and implementation plan.
- `docs/architecture/ONE_C_PROVIDER_DESIGN.md` - 1C provider adapter boundary, data ownership, supported read/write flows, mapping strategy, security risks, and implementation phases.
- `docs/architecture/ONE_C_PARTNER_SEARCH_BINDING_DESIGN.md` - Internal/admin 1C partner search and approval binding flow, neutral provider contract, UI boundaries, and security rules.
- `docs/architecture/SYNC_ENGINE_DESIGN.md` - Sync Engine responsibilities, read-model update boundaries, implemented manual catalog sync slice, catalog/pricing/inventory/partner/document flows, idempotency, errors, logging, trigger strategy, and implementation phases.
- `docs/architecture/PROJECT_PRINCIPLES.md` - Project constitution and decision rules.
- `docs/architecture/MODULE_COMMUNICATION.md` - Module dependency direction, allowed communication, forbidden communication, event propagation, and admin/partner portal communication.

## Security

- `docs/domain/ACCESS_CONTROL_DOMAIN.md` - Main security and partner visibility model.
- `docs/architecture/ACCESS_CONTROL_RUNTIME_DESIGN.md` - Runtime access-control model, roles, permissions, company context, server-side enforcement, and security risks.
- `docs/architecture/ACCESS_CONTROL_DATABASE_DESIGN.md` - Access-control data model, role and permission storage, membership scoping, status transitions, audit fields, and RLS design notes.
- `docs/architecture/ACCESS_CONTROL_REPOSITORY_DESIGN.md` - Repository-layer safety rules for user profiles, partner companies, memberships, roles, permissions, requests, invitations, RLS, and Service Role boundaries.
- `docs/architecture/ACCESS_CONTROL_SERVICE_DESIGN.md` - Service-layer access enforcement, permission evaluation, state transitions, safe denial, and Server Action boundaries.
- `docs/architecture/ONBOARDING_SERVER_ACTIONS_DESIGN.md` - Authenticated onboarding action rules, safe action result mapping, no Service Role, no admin workflow, no 1C calls, and no commercial data.
- `docs/architecture/FIRST_USER_EXPERIENCE_DESIGN.md` - First-user routing, self-profile creation constraints, company request boundaries, and private workspace state gating.
- `docs/architecture/INTERNAL_PARTNER_APPROVAL_CONSOLE_DESIGN.md` - Internal/admin-only access request approval, 1C reference binding, partner self-approval prevention, and review RLS rules.
- `docs/architecture/CATALOG_READ_MODEL_DESIGN.md` - Catalog-specific security boundaries, no prices/stock/commercial terms, visibility-ready structure, and access-safe read model rules.
- `docs/architecture/PRICING_INVENTORY_READ_MODEL_DESIGN.md` - Price and stock visibility boundaries, company-scoped commercial access, no Service Role, no 1C UI calls, and no order/reservation workflows.
- `docs/architecture/ONE_C_PROVIDER_DESIGN.md` - 1C adapter security boundaries, payload isolation, no direct UI/Supabase use, credential placeholder rules, and provider-specific risks.
- `docs/architecture/ONE_C_PARTNER_SEARCH_BINDING_DESIGN.md` - Partner search authorization, selected-reference binding rules, no partner ERP editing, and no raw 1C payload leakage.
- `docs/architecture/SYNC_ENGINE_DESIGN.md` - Sync security boundaries, no direct provider-to-database writes, no hidden workers, no service role in foundation, and safe logging rules.
- `docs/domain/FINANCE_DOMAIN.md` - Finance visibility and sensitive data rules.
- `docs/domain/DOCUMENTS_DOMAIN.md` - Document permission and download rules.
- `docs/architecture/SECURITY_AND_DATABASE_ARCHITECTURE.md` - Security model, Supabase service-role rules, RLS principles, auth/identity principles, commercial data protection, and implementation gate.
- `docs/architecture/PROJECT_PRINCIPLES.md` - Security principles, service-role restrictions, and secrets policy.
- `docs/architecture/DATA_OWNERSHIP_MATRIX.md` - Ownership and edit/write restrictions that protect source-of-truth data.

## Database

No SQL schema or migration document exists yet.

Related references:

- `docs/architecture/ACCESS_CONTROL_DATABASE_DESIGN.md` - Defines the conceptual access-control database design before SQL, including tables, relationships, statuses, roles, permissions, RLS readiness, audit fields, and migration checklist.
- `docs/architecture/CATALOG_READ_MODEL_DESIGN.md` - Defines the conceptual catalog read-model tables before SQL, including ownership, key fields, excluded commercial fields, RLS expectations, and implementation phases.
- `docs/architecture/PRICING_INVENTORY_READ_MODEL_DESIGN.md` - Defines conceptual product price and stock read-model tables, cache ownership, excluded data, and RLS expectations before SQL.
- `docs/architecture/ACCESS_CONTROL_REPOSITORY_DESIGN.md` - Defines how future Access Control repositories should read and write access-control tables safely.
- `docs/architecture/ACCESS_CONTROL_SERVICE_DESIGN.md` - Defines service-owned state transitions and repository usage rules that protect access-control persistence.
- `docs/architecture/SECURITY_AND_DATABASE_ARCHITECTURE.md` - Defines database security principles, RLS expectations, ownership rules, external IDs, audit fields, soft delete guidance, and schema implementation gate.
- `docs/architecture/DATA_OWNERSHIP_MATRIX.md` - Defines what may eventually be stored in the portal.
- `docs/architecture/REPOSITORY_PATTERN.md` - Defines how future persistence should be accessed.
- `docs/architecture/BACKEND_ARCHITECTURE.md` - Defines repository and service responsibilities.

Future schema documentation should be created before SQL implementation.

## Frontend

- `docs/architecture/FRONTEND_ARCHITECTURE.md` - Pages, layouts, navigation, dashboards, component hierarchy, state management, loading, errors, permissions, and mobile compatibility.
- `docs/architecture/FIRST_USER_EXPERIENCE_DESIGN.md` - Landing, sign-in/register screens, onboarding wizard, Partner Cabinet header, navigation visibility, and professional empty state rules.
- `docs/architecture/CATALOG_READ_MODEL_DESIGN.md` - Defines future read-only catalog landing, category list, brand list, product list, and product detail placeholder scope.
- `docs/architecture/PRICING_INVENTORY_READ_MODEL_DESIGN.md` - Defines safe catalog price and availability display states without cart, order, reservation, or finance UI.
- `docs/architecture/EVENT_FLOWS.md` - User-facing and manager-facing flow expectations.
- `docs/domain/*` - Domain-specific visibility and behavior rules that UI must respect.

## Backend

- `docs/architecture/PROJECT_SPECIFICATION_DESIGN.md` - Company-owned installer BOM schema, immutable submission snapshots, internal review transitions, RLS, and repository/service boundaries.
- `docs/architecture/BACKEND_ARCHITECTURE.md` - Backend layers, module boundaries, services, repositories, integration layer, error handling, dependency rules, folder conventions, and scalability.
- `docs/architecture/SECURITY_AND_DATABASE_ARCHITECTURE.md` - Server Action security rules, Supabase access boundaries, service-role restrictions, and repository/service/integration security boundaries.
- `docs/architecture/ACCESS_CONTROL_RUNTIME_DESIGN.md` - Access-control implementation preparation for Server Actions, services, repositories, future RLS, and active company context.
- `docs/architecture/ACCESS_CONTROL_DATABASE_DESIGN.md` - Access-control persistence design for profiles, companies, memberships, roles, permissions, requests, invitations, and server-side scoping.
- `docs/architecture/ACCESS_CONTROL_REPOSITORY_DESIGN.md` - Access Control repository design for persistence adapters, query scoping, RLS assumptions, errors, and service boundaries.
- `docs/architecture/ACCESS_CONTROL_SERVICE_DESIGN.md` - Access Control service design for identity resolution, company context, permissions, access requests, invitations, state transitions, and safe errors.
- `docs/architecture/ONBOARDING_SERVER_ACTIONS_DESIGN.md` - First onboarding Server Actions design for authenticated profile state, own access requests, own memberships, safe result shapes, and service-only boundaries.
- `docs/architecture/FIRST_USER_EXPERIENCE_DESIGN.md` - Server-side routing rules for onboarding and Partner Cabinet entry states.
- `docs/architecture/CATALOG_READ_MODEL_DESIGN.md` - Catalog repository/service boundary design, DTO safety expectations, access control, and implementation phases.
- `docs/architecture/PRICING_INVENTORY_READ_MODEL_DESIGN.md` - Pricing and inventory repository/service/action boundaries, visibility DTOs, and cache interpretation rules.
- `docs/architecture/REPOSITORY_PATTERN.md` - Repository, service, DTO, mapping, validation, caching, and testing rules.
- `docs/architecture/MODULE_COMMUNICATION.md` - Dependency rules and service communication.

## Integration

- [Catalog Daily Sync Design](./CATALOG_DAILY_SYNC_DESIGN.md)

- `docs/architecture/INTEGRATION_ARCHITECTURE.md` - 1C integration philosophy, synchronized domains, read/write operations, sync strategy, cache strategy, failure handling, logging, monitoring, async future, and MVP limits.
- `docs/architecture/ONE_C_PROVIDER_DESIGN.md` - Provider-specific 1C adapter design that keeps 1C payloads behind neutral integration contracts.
- `docs/architecture/ONE_C_PARTNER_SEARCH_BINDING_DESIGN.md` - 1C partner lookup flow for internal approval, selected reference binding, and provider DTO boundaries.
- `docs/architecture/SYNC_ENGINE_DESIGN.md` - Provider-neutral sync orchestration design for importing ERP data into portal read models without implementing runtime workers.
- `docs/architecture/CATALOG_READ_MODEL_DESIGN.md` - Catalog cache and future 1C sync boundary rules for product, category, brand, and image read models.
- `docs/architecture/PRICING_INVENTORY_READ_MODEL_DESIGN.md` - Price and stock cache boundaries, future 1C refresh rules, and source-of-truth constraints.
- `docs/architecture/DATA_OWNERSHIP_MATRIX.md` - Defines which data can be read, cached, edited, and written to 1C.
- `docs/architecture/EVENT_FLOWS.md` - Defines integration-related flows such as sync, order creation, reservation, status sync, and 1C outage.

## Development

- `docs/DEVELOPMENT_RULES.md` - Commit discipline, domain boundaries, legacy code rules, secrets rules, and project separation.
- `docs/architecture/PROJECT_PRINCIPLES.md` - Broader constitution for implementation and review.
- `docs/ROADMAP.md` - Phased product roadmap.

## Implementation

- `docs/architecture/PROJECT_SPECIFICATION_DESIGN.md` - Implementation reference for partner drafts, submission snapshots, internal review, controlled revisions, actions, routes, and MVP exclusions.
- `docs/architecture/BACKEND_ARCHITECTURE.md` - Backend implementation direction.
- `docs/architecture/FRONTEND_ARCHITECTURE.md` - Frontend implementation direction.
- `docs/architecture/SECURITY_AND_DATABASE_ARCHITECTURE.md` - Security and database implementation gate before schema, RLS, access control, catalog, orders, or 1C integration.
- `docs/architecture/ACCESS_CONTROL_RUNTIME_DESIGN.md` - Access-control implementation preparation before coding user profiles, memberships, roles, permissions, and server-side checks.
- `docs/architecture/ACCESS_CONTROL_DATABASE_DESIGN.md` - Access-control database implementation preparation before SQL migrations, RLS policies, repositories, services, or UI are created.
- `docs/architecture/ACCESS_CONTROL_REPOSITORY_DESIGN.md` - Access Control repository implementation preparation before writing repository classes or methods.
- `docs/architecture/ACCESS_CONTROL_SERVICE_DESIGN.md` - Access Control service implementation preparation before writing service classes, Server Actions, or domain integrations.
- `docs/architecture/ONBOARDING_SERVER_ACTIONS_DESIGN.md` - Onboarding Server Actions implementation preparation before creating partner self-service actions or onboarding UI.
- `docs/architecture/CATALOG_READ_MODEL_DESIGN.md` - Catalog read-model implementation preparation before SQL migrations, types, repositories, services, Server Actions, UI shell, or tests.
- `docs/architecture/PRICING_INVENTORY_READ_MODEL_DESIGN.md` - Pricing and inventory read-model implementation preparation before SQL migration, types, repositories, services, Server Actions, catalog UI integration, or tests.
- `docs/architecture/ONE_C_PROVIDER_DESIGN.md` - 1C provider adapter implementation reference for provider-isolated transport, credentials, mappers, and manual catalog sync.
- `docs/architecture/ONE_C_PARTNER_SEARCH_BINDING_DESIGN.md` - Partner approval search implementation reference for Server Actions, Integration Service, provider search, and UI binding.
- `docs/architecture/SYNC_ENGINE_DESIGN.md` - Sync Engine implementation reference for catalog read-model updates, manual triggers, queues, workers, and scheduled synchronization.
- `docs/architecture/MODULE_COMMUNICATION.md` - Module wiring and dependency rules.
- `docs/architecture/REPOSITORY_PATTERN.md` - Persistence and service implementation pattern.
- `docs/architecture/EVENT_FLOWS.md` - Workflow implementation reference.

## Missing Architecture Documents To Add Later

- Authentication architecture.
- Authorization implementation design.
- Detailed database schema design.
- Testing strategy.
- Observability strategy.
- Deployment and environment strategy.
- 1C API contract documentation.

These should be written before implementation expands into those areas.
