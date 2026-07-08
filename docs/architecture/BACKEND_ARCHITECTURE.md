# Backend Architecture

## Purpose

The backend architecture defines how server-side logic is organized in the Novotech Partner Platform.

The backend must support partner-facing workflows, manager/admin workflows, access control, cached 1C data, order submission, product reservation, logging, and future automation while preserving the rule that 1C is the source of truth for commercial data.

## Technology Stack

- Next.js App Router
- Server Actions
- Supabase
- TypeScript
- Future 1C integration through an isolated integration layer

## Backend Layers

### App Router

The App Router owns routing, layouts, server-rendered entry points, and route-level composition.

Routes should not contain complex business logic. They should load required data through services, pass data to UI components, and trigger Server Actions where appropriate.

### Server Actions

Server Actions are the boundary for user-triggered mutations from the portal.

Server Actions should:

- Validate input shape.
- Resolve authenticated user and partner context.
- Call domain services.
- Return safe results to the UI.
- Avoid direct Supabase table access.
- Avoid direct 1C calls.
- Avoid embedding business rules inline.

### `src/lib`

`src/lib` contains shared infrastructure used across domains.

Examples:

- Supabase clients.
- Environment validation.
- Auth helpers.
- Access-control helpers.
- Integration client foundations.
- Shared error utilities.
- Logging utilities.

Shared code should be genuinely cross-domain. Domain-specific rules belong in modules.

### `src/modules`

`src/modules` contains business domains.

Each module owns its domain workflows, services, repositories, DTOs, mappers, validation, and module-local types where needed.

Expected modules include:

- `catalog`
- `orders`
- `partners`
- `pricing`
- `inventory`
- `documents`
- `admin`
- Future `finance`
- Future `notifications`

### Repositories

Repositories encapsulate Supabase persistence and cache access.

Repositories should:

- Read and write portal-owned data.
- Read cached 1C snapshots from Supabase.
- Return explicit DTOs or domain-friendly records.
- Avoid business decisions.
- Avoid 1C calls.
- Avoid UI concerns.

Repositories should not decide whether a partner may see data. They may accept already-scoped query parameters, but access decisions belong in services or access helpers.

### Services

Services own business workflows and orchestration.

Services should:

- Enforce access profile and partner status rules.
- Coordinate repositories.
- Call integration services when 1C data or writes are needed.
- Validate business transitions.
- Normalize domain errors.
- Emit audit and integration logs where needed.
- Return safe data to Server Actions or server components.

Examples:

- Catalog service applies catalog visibility.
- Pricing service applies price visibility.
- Inventory service applies stock visibility.
- Order service validates cart, creates order request, and coordinates 1C order creation.
- Partner service manages portal partner lifecycle and access assignment.

### Integration Layer

The integration layer is the only backend layer that communicates with 1C.

It should own:

- 1C transport details.
- Request and response mapping.
- Timeouts.
- Retries.
- Error normalization.
- Correlation IDs.
- Integration logging.
- Idempotency strategy for future writes.

Business modules may call integration services, but they must not call low-level 1C clients directly.

### Auth

Auth helpers resolve identity, role, partner company, and internal user context.

Auth does not replace access control. Auth answers who the user is. Access control answers what the user can see or do.

## Module Boundaries

Each module should own its business rules.

Rules:

- Catalog does not calculate prices.
- Pricing does not own product master data.
- Inventory does not own order submission.
- Orders may consume catalog, pricing, inventory, access, and integration services through explicit service interfaces.
- Documents may consume access and partner context.
- Finance must remain display-only and permission-controlled.
- Admin may orchestrate configuration across domains but should not bypass domain services.

Cross-module behavior should happen through services, not through direct repository access.

## Repository Pattern

Repositories are persistence adapters.

They should not:

- Contain business rules.
- Call 1C.
- Know about UI state.
- Decide access visibility.
- Mutate data outside their domain.

They should:

- Encapsulate Supabase access.
- Hide table/cache details from services.
- Provide typed inputs and outputs.
- Be easy to mock in future tests.

## Error Handling

Backend errors should be explicit and safe.

Categories:

- Validation error: input shape or invalid state.
- Permission error: user lacks access.
- Not found: requested data does not exist or is not visible.
- Integration error: 1C timeout, unavailable, rejected, or partial response.
- Conflict error: stale data, changed price, changed stock, duplicate submission.
- System error: unexpected infrastructure failure.

Rules:

- Do not expose raw 1C errors to partners.
- Do not leak hidden prices, stock, finance data, or document names in error messages.
- Log enough context for managers/developers to debug.
- Return user-safe messages from Server Actions.
- Prefer safe failure over silent success.

## Dependency Rules

Allowed dependency direction:

1. App routes and Server Actions call services.
2. Services call repositories, access helpers, auth helpers, and integration services.
3. Repositories call Supabase.
4. Integration services call 1C clients.
5. Shared lib utilities may be used by modules when truly generic.

Forbidden:

- UI components calling repositories directly.
- UI components calling 1C.
- Repositories calling services.
- Repositories calling 1C.
- Integration layer calling UI code.
- Domain modules importing from unrelated modules' internals.
- Client Components importing server-only code.

## Folder Conventions

Recommended future module shape:

```text
src/modules/<domain>/
  services/
  repositories/
  dto/
  mappers/
  validators/
  errors/
  types.ts
```

Recommended shared infrastructure shape:

```text
src/lib/
  supabase/
  onec/
  auth/
  access/
  env.ts
```

Recommended integration shape:

```text
src/lib/onec/
  client.ts
  errors.ts
  mappers/
  operations/
  types.ts
```

These are conventions, not permission to implement files before the architecture calls for them.

## Future Scalability

The backend should remain ready for:

- Background jobs for sync and retries.
- Asynchronous 1C integration.
- Queue-based order creation and reservation.
- More detailed access profiles.
- Finance and document workflows.
- Manager task workflows.
- Audit reporting.
- Module-level tests.
- Multi-environment deployment.

Scalability should be added through clear boundaries, not premature abstraction.
