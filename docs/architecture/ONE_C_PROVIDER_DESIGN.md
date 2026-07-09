# 1C Provider Design

## Purpose

This document defines the adapter boundary for connecting the Novotech Partner Platform Integration Platform to 1C in a future implementation.

The goal is to design the provider shape before writing real integration logic. The first implementation adds a controlled provider transport path for manual catalog import only. This document still does not approve scheduled jobs, queues, broad synchronization execution, direct database writes from the provider, or direct 1C usage from business modules.

## 1C as Provider Implementation

1C is a provider implementation behind the neutral Integration Platform.

The platform owns:

- Neutral contracts.
- Neutral DTOs.
- Integration events.
- Job and queue contracts.
- Logging contracts.
- Provider orchestration boundaries.

The 1C provider owns only:

- 1C-specific payload shapes.
- 1C-specific mapping into neutral DTOs.
- 1C transport implementation behind provider methods.
- 1C error normalization.
- 1C authentication handling.

Catalog, pricing, inventory, orders, finance, documents, and partner modules must depend on neutral integration contracts or domain services, not on 1C-specific payloads.

## 1C Data Ownership

1C remains the source of truth for:

- Products, brands, categories, and official product state.
- Prices, individual prices, currencies, validity, contracts, discounts, and commercial terms.
- Stock balances, warehouses, and accepted reservations.
- Official partner company master data and contracts.
- Confirmed orders after successful export.
- Invoices, accounting documents, balance, debt, credit limit, and payment status.

The portal may cache selected data as read models, but cache ownership does not move commercial truth out of 1C.

## Supported Read Flows

### Partners

The provider may later read partner company master references from 1C and map them to `PartnerCompanyDTO`.

The provider must not create portal memberships, roles, access profiles, or portal partner status. Those remain portal-owned access-control data.

### Catalog

The provider may later read products, categories, and brands from 1C and map them to `CatalogProductDTO`, `CatalogCategoryDTO`, and `CatalogBrandDTO`.

The provider must not decide partner product visibility. Visibility is enforced by portal access rules, catalog services, and database RLS where applicable.

### Pricing

The provider may later read product prices, price types, currencies, validity windows, and company-specific price references from 1C and map them to `ProductPriceDTO`.

The provider must not decide whether a partner may see a price. Price visibility belongs to portal access-control and pricing services.

### Inventory

The provider may later read stock balances and warehouse references from 1C and map them to `StockBalanceDTO`.

The provider must not decide whether a partner sees exact quantity, availability-only status, or warehouse-level detail. Stock visibility belongs to portal access-control and inventory/pricing services.

### Documents

The provider may later read document metadata and file references from 1C and map them to `DocumentDTO`.

The provider must not expose files directly to UI or decide document permissions. Document listing and download access remain portal-controlled.

### Finance

The provider may later read invoices, balance, debt, credit limits, credit days, and payment status from 1C and map them to `InvoiceDTO` and `FinanceSnapshotDTO`.

The provider must not calculate accounting values or decide finance visibility.

## Supported Write Flows

### Order Export

The provider may later export approved portal order requests to 1C as neutral `SalesOrderDTO` input and return `SalesOrderExportResultDTO`.

The provider must not create portal order approvals, skip validation, or mark orders confirmed before 1C accepts them.

### Reservation Request

The provider may later support product reservation requests if the neutral Integration Platform and Orders/Inventory architecture approve a reservation contract.

The current neutral contracts do not yet include a reservation provider method. That is intentional: reservation flow requires separate design for idempotency, partial reservation, expiration, and failure handling before code is added.

## What the 1C Provider Must Never Do

The 1C provider must never:

- Render UI or contain UI logic.
- Import pages, components, or Server Actions.
- Write directly to Supabase or any database.
- Decide access-control permissions.
- Decide partner/company visibility.
- Be called directly from pages or components.
- Own portal read-model tables.
- Own catalog, pricing, orders, finance, documents, or partner business logic.
- Store credentials in code.
- Read environment variables directly until an approved runtime config pattern exists.
- Trigger cron jobs, queues, or synchronization execution by itself.

## Authentication Strategy Placeholder

Authentication is implemented only as server-resolved provider configuration for the manual catalog sync slice.

Provider configuration supports:

- Static API token stored only in server-side environment variables.
- Basic authentication values stored only in server-side environment variables.
- Per-environment endpoint paths for catalog categories, brands, and products.
- Mock catalog mode for local validation when no 1C endpoint is configured.

Provider code receives already-resolved configuration from a trusted server-side factory. Provider code must not import `.env` helpers directly.

Current server-only environment names:

- `ONEC_BASE_URL`
- `ONEC_API_TOKEN`
- `ONEC_USERNAME`
- `ONEC_PASSWORD`
- `ONEC_CATALOG_CATEGORIES_PATH`
- `ONEC_CATALOG_BRANDS_PATH`
- `ONEC_CATALOG_PRODUCTS_PATH`
- `ONEC_USE_MOCK_CATALOG`

If no `ONEC_BASE_URL` is configured, catalog provider mock mode is enabled by default so the manual sync path can be validated without calling 1C. Mock mode imports only safe non-commercial catalog identity data and must be disabled for real production synchronization.

## Error Handling Strategy

Future 1C errors must be normalized into integration errors:

- Provider unavailable.
- Timeout.
- Mapping failure.
- Validation failure.
- Unsupported operation.
- Partial failure.

Partner-facing modules must not receive raw 1C transport errors or raw 1C payloads. Logs may include correlation-safe context, but must not include credentials or unnecessary sensitive commercial payloads.

## Retry and Idempotency Expectations

Retries must be controlled outside the provider method body unless explicitly designed otherwise.

Read retries may be used for transient failures when safe.

Write retries require idempotency design before implementation:

- Order export must avoid duplicate 1C orders.
- Reservation requests must avoid duplicate holds.
- Correlation IDs must be preserved.
- Partial failures must be visible for manager review.
- The portal must not mark write operations successful until 1C confirms them.

## Mapping Strategy Into Neutral DTOs

All 1C payloads must stay inside `src/modules/integration/providers/one-c/`.

Mapping rules:

- 1C product payloads map to catalog DTOs.
- 1C price payloads map to pricing DTOs.
- 1C stock payloads map to inventory DTOs.
- 1C partner payloads map to partner DTOs.
- 1C order payloads map to order DTOs.
- 1C document payloads map to document DTOs.
- 1C finance payloads map to finance DTOs.

Neutral DTOs must be the only data shape crossing from the provider adapter into the Integration Platform.

## Future Sync Job Boundaries

Future sync jobs may call the neutral IntegrationCoordinator or provider contracts, but jobs must not live inside the provider adapter as hidden execution logic.

Boundaries:

- Job contracts live in the Integration Platform.
- Queue contracts live in the Integration Platform.
- Provider adapter performs provider-specific reads/writes only when called.
- Persistence into portal read models happens through approved domain repositories/services, not directly from the provider.
- Scheduling belongs to a future approved runtime layer.

## Security Risks

| Risk | Prevention |
| --- | --- |
| Raw 1C payload leaks into UI | Keep payload types isolated in provider folder and map to neutral DTOs. |
| Provider bypasses access control | Provider returns source data only; portal services decide visibility. |
| Provider writes directly to Supabase | Forbidden; persistence belongs to domain repositories/services. |
| Credentials leak into code | No credentials or env access in provider skeleton; future config must be server-only. |
| Duplicate orders | Require idempotency design before order export implementation. |
| Duplicate reservations | Require separate reservation design before implementation. |
| Stale data treated as truth | Cache consumers must preserve source timestamps and revalidate risky workflows. |
| Provider becomes business layer | Keep provider limited to transport, payload mapping, and normalized provider errors. |

## Implementation Phases

1. Create this design document and provider skeleton.
2. Define 1C authentication/configuration design.
3. Define concrete 1C API contract documents outside runtime code.
4. Implement mapper tests using static sample payloads.
5. Implement provider transport behind interfaces.
6. Implement read-only catalog import in a controlled integration slice.
7. Implement pricing and inventory import with freshness metadata.
8. Implement documents and finance read flows with strict permission boundaries.
9. Design and implement order export with idempotency.
10. Design reservation request contract before adding reservation provider methods.
11. Add sync jobs and queue runtime only after separate approval.

## Cross References

- `docs/architecture/INTEGRATION_ARCHITECTURE.md`
- `docs/architecture/DATA_OWNERSHIP_MATRIX.md`
- `docs/architecture/CATALOG_READ_MODEL_DESIGN.md`
- `docs/architecture/PRICING_INVENTORY_READ_MODEL_DESIGN.md`
- `docs/architecture/SECURITY_AND_DATABASE_ARCHITECTURE.md`
- `docs/architecture/BACKEND_ARCHITECTURE.md`
- `docs/architecture/MODULE_COMMUNICATION.md`
