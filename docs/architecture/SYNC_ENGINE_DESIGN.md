# Sync Engine Design

## Purpose

The Sync Engine defines how ERP-owned data will be imported into Partner Platform read models in a controlled, observable, and source-of-truth-safe way.

This began as a foundation design. The first implemented runtime slice is manual catalog import only. It does not implement cron jobs, queues, background workers, delta sync, deletes, pricing sync, inventory sync, document sync, orders, reservations, finance, or partner/company sync.

## Implemented Manual Catalog Sync Slice

The first implemented sync slice imports catalog identity data only:

- Categories.
- Brands.
- Products.

The runtime direction is:

1. Internal admin opens the manual catalog sync page.
2. Admin Server Action authenticates the user and requires an active `internal` or `admin` profile.
3. Server Action creates the configured ERP provider.
4. Server Action creates the catalog read-model updater.
5. Sync Engine calls the provider catalog contract.
6. Provider returns neutral catalog DTOs.
7. Sync Engine passes DTOs to the catalog updater.
8. Catalog updater persists through `CatalogRepository`.
9. Supabase RLS allows insert/update only for active internal/admin users.
10. Server Action returns a structured sync report to the admin UI.

The implemented slice is intentionally manual and narrow.

## Sync Engine Responsibility

The Sync Engine is responsible for coordinating future import flows between neutral ERP provider contracts and portal read-model update boundaries.

It should eventually:

- Select a sync target.
- Select a sync strategy.
- Call neutral provider contracts through the Integration Platform.
- Receive neutral DTOs.
- Hand DTOs to approved domain read-model update services.
- Record sync results, warnings, failures, and correlation IDs.
- Support future manual and scheduled triggering.

The Sync Engine is orchestration. It is not the source of truth.

## What Sync Engine Must Not Do

The Sync Engine must not:

- Call 1C-specific code directly from UI or domain modules.
- Call HTTP APIs directly.
- Own ERP provider credentials.
- Start cron jobs or background workers by itself.
- Implement a real queue.
- Use Supabase service role in application code.
- Write directly to read-model tables without approved domain persistence boundaries.
- Decide partner visibility or access-control rules.
- Duplicate catalog, pricing, inventory, document, partner, order, or finance business logic.
- Create orders, carts, reservation workflows, finance calculations, or UI behavior.

## Read-Model Update Boundaries

Read-model updates must go through future domain-owned update boundaries.

Examples:

- Catalog sync writes through a catalog read-model update service or repository approved for system sync.
- Pricing sync writes through pricing read-model update boundaries.
- Inventory sync writes through inventory read-model update boundaries.
- Partner/company sync writes only source-owned partner references, not portal memberships or access profiles.
- Documents sync writes document metadata only, while permissions remain portal-controlled.

The provider returns neutral DTOs. The Sync Engine coordinates. Domain update boundaries own persistence decisions.

## Catalog Sync Flow

Manual catalog sync flow:

1. A manual or scheduled trigger creates a catalog sync job.
2. Sync Engine resolves the configured ERP provider.
3. Sync Engine calls neutral catalog provider methods for categories, brands, and products.
4. Provider returns `CatalogCategoryDTO`, `CatalogBrandDTO`, and `CatalogProductDTO`.
5. Sync Engine passes DTOs to catalog read-model update boundary.
6. Catalog boundary upserts cache records idempotently by source reference.
7. Sync result records counts, warnings, failures, and correlation ID.

Catalog sync must not import prices, stock, finance data, cart data, order data, or partner-specific commercial terms into catalog tables.

The current implementation upserts by external ERP reference. Empty provider responses never delete portal rows. Product import failure after category/brand import returns a partial result and does not roll back already imported category or brand cache rows.

## Manual Trigger Contract

The manual catalog sync action returns a structured result with:

- `provider`
- `target`
- `status`
- `startedAt`
- `finishedAt`
- `durationMs`
- `categoriesReceived`
- `categoriesCreated`
- `categoriesUpdated`
- `brandsReceived`
- `brandsCreated`
- `brandsUpdated`
- `productsReceived`
- `productsCreated`
- `productsUpdated`
- `failed`
- `errors`

The UI must display this report. It must not infer success from console logs or hidden side effects.

## Pricing Sync Flow

Manual pricing sync flow:

1. Internal admin opens the manual integration sync page.
2. Admin Server Action authenticates the user and requires an active `internal` or `admin` profile.
3. Server Action creates the configured ERP provider.
4. Server Action creates the pricing read-model updater.
5. Sync Engine calls the neutral pricing provider and follows `nextCursor` until all pages are read.
6. Provider returns `ProductPriceDTO` values.
7. Sync Engine passes DTOs to the pricing updater.
8. Pricing updater resolves catalog products by external 1C product id or SKU and resolves partner company scope by external 1C company id when present.
9. Pricing repository upserts cached rows into `product_prices`.
10. Partner visibility remains enforced by pricing services and Supabase RLS.

Pricing sync must not decide who may see prices and must not treat cached prices as order commitment.

If product or partner company matching fails, the updater skips the price and returns a warning. Empty provider responses do not delete existing cached prices.

Manual price sync returns `provider`, `target`, `status`, `startedAt`, `finishedAt`, `durationMs`, `pricesReceived`, `pricesCreated`, `pricesUpdated`, `pricesSkipped`, `failed`, `errors`, and `warnings`.

## Inventory Sync Flow

Manual inventory sync flow:

1. Internal admin opens the manual integration sync page.
2. Admin Server Action authenticates the user and requires an active `internal` or `admin` profile.
3. Server Action creates the configured ERP provider.
4. Server Action creates the inventory read-model updater.
5. Sync Engine calls the neutral inventory provider and follows `nextCursor` until all pages are read.
6. Provider returns `StockBalanceDTO` values.
7. Sync Engine passes DTOs to the inventory updater.
8. Inventory updater resolves catalog products by external 1C product id or SKU.
9. Inventory repository upserts cached rows into `product_stock_balances`.
10. Partner-facing pricing/inventory service translates snapshots into permitted stock status, quantity, expected quantity, warehouse count, and freshness DTOs.

Inventory sync must not create reservations, warehouse management workflows, or fulfillment promises.

If product matching fails, the updater skips the stock row and returns a warning. Empty provider responses do not delete existing cached stock.

Manual stock sync returns `provider`, `target`, `status`, `startedAt`, `finishedAt`, `durationMs`, `stockReceived`, `stockCreated`, `stockUpdated`, `stockSkipped`, `failed`, `errors`, and `warnings`.

## Partner and Company Sync Flow

Future partner/company sync flow:

1. Trigger creates partner sync job.
2. Sync Engine resolves ERP provider.
3. Sync Engine calls partner provider.
4. Provider returns `PartnerCompanyDTO` values.
5. Sync Engine passes DTOs to partner read-model update boundary.
6. Portal keeps official 1C references separate from portal-owned access status, memberships, roles, and access profiles.

Partner sync must not approve users, create memberships, or assign portal access.

## Documents Sync Flow

Future document sync flow:

1. Trigger creates documents sync job.
2. Sync Engine resolves ERP provider.
3. Sync Engine calls document provider.
4. Provider returns `DocumentDTO` values.
5. Sync Engine passes metadata to document read-model update boundary.
6. Document services enforce visibility and download rules.

Documents sync must not expose restricted files directly or bypass document permissions.

## Idempotency Strategy

Every future sync operation must be idempotent.

Rules:

- Use provider code plus source reference as the stable external key.
- Preserve source update timestamps where available.
- Upsert cache records instead of blindly inserting duplicates.
- Store correlation IDs for each sync attempt.
- Record partial success without replaying already successful items unsafely.
- Never use `external_1c_id` as a partner access security boundary.

Write operations to ERP, such as future order export or reservation request, require separate idempotency rules and are outside read-model import scope.

## Error and Retry Strategy

The Sync Engine should normalize failures into sync errors and results.

Expected categories:

- Provider unavailable.
- Provider operation not implemented.
- Mapping failure.
- Validation failure.
- Read-model update unavailable.
- Partial failure.
- Retry limit reached.

Retry behavior must be explicit:

- No hidden infinite retry loops.
- Read retries may be allowed for transient provider failures.
- Partial failures must preserve successful item counts and failed item details.
- Failed sync jobs should be visible for manual review.

## Audit and Logging Strategy

Every future sync run should be logged with:

- Sync target.
- Provider code.
- Trigger type.
- Correlation ID.
- Start and finish timestamps.
- Status.
- Attempt count.
- Item counts.
- Warning count.
- Error category.
- Safe error message.

Logs must not include credentials, service-role keys, raw sensitive payloads, or unnecessary commercial detail.

## Manual Trigger Strategy

Manual sync triggers are future admin/internal operations.

Manual triggers should:

- Require explicit internal/admin permission.
- Select a sync target and strategy.
- Generate a correlation ID.
- Return an immediate safe job/run result.
- Avoid blocking UI on long-running work once real queues/workers exist.

The current foundation defines contracts only. It does not add admin UI or server actions.

## Future Scheduled Sync

Scheduled sync is a future runtime concern.

Rules:

- Scheduling must be configured outside provider adapters.
- Scheduler must create sync jobs rather than running hidden logic inside providers.
- Each scheduled target needs freshness expectations.
- Scheduled jobs must be observable and retryable.
- Queue/worker implementation requires separate approval.

## Security Risks

| Risk | Why It Matters | Prevention |
| --- | --- | --- |
| Sync writes bypass domain rules | Read models may become inconsistent or unsafe. | Use domain-owned update boundaries. |
| Provider payload leaks into UI | Raw ERP data may expose sensitive fields. | Convert to neutral DTOs before leaving provider layer. |
| Service role used casually | RLS and review boundaries can be bypassed. | No service role in this foundation; future system writes require explicit architecture. |
| Access control mixed into sync | Partner visibility decisions may become inconsistent. | Sync imports source data only; services enforce visibility. |
| Duplicate cache records | Repeated imports can corrupt read models. | Idempotent upsert by provider and source reference. |
| Hidden cron behavior | Failures become invisible. | Scheduled sync must create observable jobs/runs. |
| Stale data presented as truth | Partners may act on unsafe commercial data. | Preserve source timestamps and apply domain freshness rules. |

## Implementation Phases

1. Create Sync Engine design and passive TypeScript contracts.
2. Define read-model update service contracts per domain.
3. Add static mapper tests for provider payload to neutral DTO mapping.
4. Add manual trigger design for internal/admin use.
5. Implement a catalog sync dry-run using static test doubles.
6. Implement catalog read-model update boundary.
7. Implement pricing and inventory read-model update boundaries.
8. Add integration logging persistence with approved server-side access.
9. Add real provider transport after credential/configuration design.
10. Add queue/worker runtime after separate approval.
11. Add scheduled sync after observability and retry design are in place.

## Cross References

- `docs/architecture/INTEGRATION_ARCHITECTURE.md`
- `docs/architecture/ONE_C_PROVIDER_DESIGN.md`
- `docs/architecture/CATALOG_READ_MODEL_DESIGN.md`
- `docs/architecture/PRICING_INVENTORY_READ_MODEL_DESIGN.md`
- `docs/architecture/DATA_OWNERSHIP_MATRIX.md`
- `docs/architecture/SECURITY_AND_DATABASE_ARCHITECTURE.md`
