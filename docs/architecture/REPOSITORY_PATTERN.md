# Repository Pattern

## Goals

The repository pattern separates persistence details from business workflows.

Goals:

- Keep Supabase access out of UI components.
- Keep business logic out of persistence adapters.
- Make domain services easier to read and test.
- Encapsulate cache and portal-owned data storage.
- Provide clear DTOs and mapping boundaries.
- Prevent accidental direct access to 1C outside the integration layer.

## Repositories

Repositories are responsible for data access.

They may:

- Read portal-owned data from Supabase.
- Write portal-owned data to Supabase.
- Read cached 1C snapshots from Supabase.
- Store sync metadata and workflow state.
- Return typed persistence results.

They must not:

- Apply complex business rules.
- Decide partner visibility.
- Call 1C.
- Import UI components.
- Return secrets.
- Mutate another domain's data without a clear service-level workflow.

## Services

Services are responsible for business workflows.

They may:

- Call repositories.
- Call integration layer operations.
- Apply access-control rules.
- Validate domain transitions.
- Coordinate multiple modules through public service interfaces.
- Produce user-safe results for Server Actions or pages.
- Emit audit, notification, and integration events.

Services should be the normal entry point for backend domain behavior.

## DTOs

DTOs define data crossing boundaries.

Common DTO boundaries:

- Server Action input DTO.
- Service command DTO.
- Repository input DTO.
- Repository result DTO.
- Integration request DTO.
- Integration response DTO.
- UI view DTO.

DTO rules:

- Keep them explicit.
- Do not expose database internals to UI.
- Do not expose 1C raw payloads to UI.
- Do not include hidden fields unless the recipient is authorized.
- Prefer separate DTOs for different contexts instead of one oversized shape.

## Mapping

Mapping converts data between layers.

Examples:

- Supabase row to domain record.
- Domain record to UI view model.
- 1C response to integration DTO.
- Cart item to 1C order line request.
- Cached stock quantity to partner-facing availability view.

Mapping rules:

- Keep source ownership clear.
- Preserve source references and timestamps where relevant.
- Do not silently drop important validation state.
- Do not map hidden data into partner-facing DTOs.

## Validation

Validation happens at multiple levels.

Input validation:

- Shape.
- Required fields.
- Basic type and range checks.

Domain validation:

- Partner status.
- Access profile.
- Price visibility.
- Stock visibility.
- Order permission.
- Reservation permission.
- Stale data rules.

Integration validation:

- Required 1C references.
- Response shape.
- Accepted/rejected state.
- Partial failure state.

Repositories may validate persistence-level constraints, but domain validation belongs in services.

## Caching

Repositories may read and write cached 1C snapshots.

Cache rules:

- Cached data is not source-of-truth data.
- Cache records should preserve source reference and freshness metadata.
- Services decide whether cache is fresh enough for a workflow.
- Sensitive workflows should refresh or revalidate with 1C.
- Partner-specific cached data must be scoped safely.

Repositories store cache. Services interpret cache.

## No Business Logic Inside Repositories

Repositories should not decide:

- Whether a partner may see price.
- Whether exact stock can be shown.
- Whether an order requires manager approval.
- Whether stale data can be used for checkout.
- Whether finance data may be displayed.
- Whether a document is downloadable.

Those decisions belong to domain services and access-control helpers.

## No Database Access From UI

UI components, layouts, and pages should not query Supabase directly.

Instead:

1. UI calls page-level server loaders or Server Actions.
2. Server entry points call services.
3. Services call repositories.
4. Repositories call Supabase.

This keeps permission checks and data shaping centralized.

## No Direct 1C Access Outside Integration Layer

Only the integration layer may communicate with 1C.

Forbidden:

- Server Actions calling 1C directly.
- UI calling 1C directly.
- Repositories calling 1C directly.
- Domain services using low-level transport clients directly.

Allowed:

- Domain services calling integration operations such as `createOrder`, `reserveStock`, or `syncPrices` once those operations exist.

## Future Testing Strategy

The repository pattern should support testing at several levels.

Repository tests:

- Verify query behavior.
- Verify mapping from persistence rows.
- Verify cache metadata handling.

Service tests:

- Verify business rules.
- Verify access-control outcomes.
- Verify order lifecycle transitions.
- Verify stale price and stock behavior.
- Verify failure handling.

Integration tests:

- Verify 1C request/response mapping with test doubles.
- Verify timeout and retry behavior.
- Verify partial failure handling.

UI tests:

- Verify that pages render service-provided states.
- Verify blocked actions are presented correctly.
- Verify loading and error states.

Testing should focus first on high-risk domains: access control, pricing, stock, order submission, reservations, finance visibility, and document permissions.

## Implementation Guidance

When adding a feature:

1. Define the domain behavior.
2. Define DTOs.
3. Add service workflow.
4. Add repository methods for persistence only.
5. Add integration operation only if 1C is involved.
6. Add UI that consumes service-shaped data.
7. Add tests according to risk.

Do not start by making UI components talk directly to storage or integration APIs.
