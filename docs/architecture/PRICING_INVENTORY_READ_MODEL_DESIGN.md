# Pricing and Inventory Read Model Design

## Purpose

The Pricing and Inventory Read Model gives approved partner users controlled visibility into product price and stock availability inside the catalog.

This read model is a partner-facing cache and display layer. It is not a pricing engine, inventory management system, warehouse system, reservation system, cart, order module, finance module, or direct 1C integration.

## 1C Ownership

1C remains the source of truth for:

- Product prices.
- Individual and company-specific prices.
- Price types and price lists.
- Currency and official commercial rules.
- Stock balances.
- Warehouse data.
- Reservations accepted by 1C.
- Commercial terms, contracts, credit limits, debts, and order commitments.

The portal may cache selected price and stock snapshots for performance and partner experience. Cached values must never be treated as final commercial truth for checkout, order creation, reservation, finance, or legal commitment.

## Portal Cache and Read Model

The portal may store read-model records for:

- Product price snapshots.
- Product stock balance snapshots.
- Price validity windows.
- Currency code.
- Source/reference identifiers needed for future sync.
- Stock freshness timestamps from 1C.

The portal controls:

- Whether the current partner company may see any price.
- Whether the current partner company may see any stock availability.
- How raw cached stock is translated into safe partner-facing labels.
- Safe fallback behavior when cached data is missing.

## Implemented Manual Price Sync

The first implemented pricing sync slice imports product price snapshots only.

Flow:

1. Internal/admin user triggers manual price sync from the admin integrations page.
2. Server Action validates authentication and active `internal`/`admin` profile.
3. Sync Engine calls the neutral pricing provider.
4. 1C provider maps 1C price payloads to neutral `ProductPriceDTO`.
5. Pricing updater resolves products by external 1C product id or SKU.
6. Pricing updater resolves optional partner company scope by external 1C company id.
7. Pricing repository upserts `product_prices`.
8. Partner catalog/product UI reads prices only through existing pricing service and RLS.

The updater must not delete existing prices when the provider returns an empty page. If a product or partner company cannot be matched, the row is skipped and returned as a warning.

## Implemented Manual Stock Sync

The first implemented inventory sync slice imports product stock snapshots only.

Flow:

1. Internal/admin user triggers manual stock sync from the admin integrations page.
2. Server Action validates authentication and active `internal`/`admin` profile.
3. Sync Engine calls the neutral inventory provider.
4. 1C provider maps 1C stock payloads to neutral `StockBalanceDTO`.
5. Inventory updater resolves products by external 1C product id or SKU.
6. Inventory repository upserts `product_stock_balances`.
7. Partner catalog/product UI reads stock only through existing pricing/inventory service and RLS.

The updater must not delete existing stock when the provider returns an empty page. If a product cannot be matched, the row is skipped and returned as a warning.

## Availability Mapping

Availability status belongs in the pricing/inventory service, not React components.

Current service-owned mapping:

- `availableQuantity > low stock threshold` -> `In Stock`.
- `availableQuantity > 0` -> `Low Stock`.
- `availableQuantity = 0` and expected quantity exists -> `Expected`.
- `availableQuantity = 0` and no expected quantity -> `Out of Stock`.

React components may style the returned status but must not recalculate it.

## Partner and Company Scoped Visibility

Pricing and stock visibility must be scoped by authenticated user, active user profile, active company membership, active partner company, and explicit permission.

Rules:

- Authentication alone is not enough.
- A partner user must have an active membership in the company context.
- Company-specific prices may only be selected by users with active membership in that same company.
- Generic product prices may be shown only to users whose active company context has pricing permission.
- Stock availability may be shown only to users whose active company context has stock visibility permission.
- `external_1c_id` and other 1C identifiers are sync references only and must never be treated as access proof.

## Price Visibility Rules

Phase 1 supports a conservative price display:

- If the user has `prices.view`, show the currently valid cached price when available.
- Prefer company-specific price over generic price when both are present.
- If the user does not have permission or no current price exists, show a safe fallback such as `Price available on request`.
- Do not expose price types, contracts, discounts, margin, taxes, or hidden commercial terms.
- Do not use cached price as order commitment.

Future visibility levels may distinguish recommended price, partner price, and individual contract price. That should be added only after explicit access-profile design.

## Stock Visibility Rules

Phase 1 supports availability-only stock display:

- If the user has `stock.view`, show a safe availability label derived by the service.
- Do not show exact quantity in the UI in this phase.
- Do not show warehouse-level breakdown in the UI in this phase.
- If the user does not have permission or no current stock snapshot exists, show `Check availability`.

The read model may store cached quantity fields because they come from 1C, but service DTOs should expose only availability labels for MVP catalog display.

## Data The Portal Must Not Own

The portal must not own or edit:

- Official prices.
- Individual contract terms.
- Discounts.
- Tax or finance calculations.
- Official stock balances.
- Warehouse master data.
- Reservation state or reservation confirmation.
- Cart or order quantities.
- Credit limits, debt, balance, invoices, or accounting documents.
- Any commercial commitment.

## Proposed Tables

This section is conceptual for the read-model migration.

### `product_prices`

Purpose:

- Store cached price snapshots for catalog display.
- Support future company-specific price visibility without making the portal a pricing engine.

Source of truth:

- 1C.

Key fields:

- Internal id.
- Product id.
- Optional partner company id for future company-specific price.
- Optional 1C price type reference.
- Currency.
- Price amount.
- Validity window.
- Active flag.
- Created and updated timestamps.

Must not contain:

- Discount logic.
- Tax rules.
- Contract terms.
- Margin.
- Cart or order data.
- Credit limit or finance data.

### `product_stock_balances`

Purpose:

- Store cached stock snapshots for product availability display.
- Support safe partner-facing availability labels.

Source of truth:

- 1C.

Key fields:

- Internal id.
- Product id.
- Warehouse display name or source warehouse label.
- Available quantity snapshot.
- Optional reserved quantity snapshot from source.
- Optional expected quantity snapshot from source.
- Optional expected arrival timestamp from source.
- Timestamp of source refresh from 1C.
- Active flag.
- Created and updated timestamps.

Must not contain:

- Reservation workflow state.
- Order commitments.
- Fulfillment promises.
- Credit or finance data.
- Partner-specific commercial terms.

## RLS Approach

RLS must be enabled on every pricing and stock read-model table.

Policy direction:

- No anonymous access.
- Authenticated users may select only when their active profile, active company membership, active partner company, and permission allow it.
- Company-specific price rows must be scoped to the same active partner company.
- Generic price rows require at least one active company context with pricing permission.
- Stock rows require active company context with stock permission.
- Ordinary authenticated partner users must not insert, update, or delete read-model cache rows.
- Manual price sync adds insert/update only for active `internal`/`admin` users through `public.can_sync_pricing_read_model()`.
- Manual stock sync adds insert/update only for active `internal`/`admin` users through `public.can_sync_inventory_read_model()`.
- No delete policy is added for pricing sync.
- No delete policy is added for inventory sync.

Small read-only helper functions may be used to keep policies auditable. Helpers must not expose data and must not use `external_1c_id` for security.

## Repository, Service, Action, and UI Boundaries

### Repository

The PricingInventoryRepository may:

- Read cached price rows.
- Read cached stock rows.
- Apply persistence filters such as product ids, active rows, company scope, and validity.
- Return typed domain records.

It must not:

- Decide final partner visibility.
- Call 1C.
- Use service role.
- Write prices or stock in partner-facing flows.
- Return raw Supabase rows to UI.

### Service

The PricingInventoryService may:

- Validate active company context through Access Control.
- Check pricing and stock permissions through Access Control.
- Interpret cached rows into safe partner-facing DTOs.
- Prefer company-specific price over generic price.
- Convert quantity snapshots into availability labels.
- Return safe fallbacks when data or permission is missing.

It must not:

- Call 1C directly.
- Create orders, carts, or reservations.
- Treat cached data as final commitment.
- Expose exact stock quantity in Phase 1 UI DTOs.

### Server Actions

Server Actions may:

- Authenticate the user.
- Normalize product id input.
- Instantiate services.
- Call the PricingInventoryService.
- Return safe ActionResult values.

They must not:

- Query Supabase directly.
- Call repositories directly.
- Call 1C.
- Use service role.
- Contain pricing, inventory, or permission business logic.

### UI

UI may:

- Show price if the service provides one.
- Show `Price available on request` when price is unavailable.
- Show availability label if the service provides one.
- Show `Check availability` when stock availability is unavailable.

UI must not:

- Calculate price visibility.
- Calculate permission rules.
- Show exact quantities in Phase 1.
- Add buy buttons, cart actions, orders, reservations, or finance.
- Call Supabase, repositories, or 1C.

## Future Evolution

Future phases may add:

- Price visibility levels by access profile.
- Individual contract price display.
- Warehouse-level stock visibility.
- Exact stock visibility for trusted partners.
- Cache freshness warnings.
- 1C on-demand refresh through the Integration Layer.
- Checkout revalidation before order creation.
- Product reservation through approved Orders/Inventory workflows.
- Promotion and special price request flows.

Every future extension must keep 1C as commercial source of truth and keep partner-facing visibility controlled by Access Control.

## Risks

| Risk | Why It Matters | Prevention |
| --- | --- | --- |
| Portal becomes second 1C | Commercial truth can diverge from official source. | Store only cache/read-model records and keep writes out of partner UI. |
| Price leakage across partners | Company-specific prices are sensitive. | RLS plus service-level active company and permission checks. |
| Exact stock leakage | Warehouse quantities can reveal sensitive operations. | Phase 1 exposes availability labels only. |
| Cached data treated as commitment | Stale prices or stock create financial/legal risk. | No cart/order/reservation in this slice; revalidate in future order flow. |
| Direct 1C calls from UI | Breaks integration architecture and observability. | UI calls Server Actions; services use repositories; future 1C goes through Integration Layer. |
| `external_1c_id` used as security | Source ids can be guessed or enumerated. | Security is based on portal ids, membership, company status, and permissions. |

## Implementation Plan

1. Add this design document.
2. Add read-model SQL migration with RLS.
3. Add Pricing and Inventory domain types.
4. Add read-only repository interface and Supabase repository implementation.
5. Add PricingInventoryService with access-safe DTOs.
6. Add Server Actions for product commercial views.
7. Update catalog product card and detail display.
8. Add safe demo fallback for existing demo catalog records only.
9. Run TypeScript and tests.

## Cross References

- `docs/domain/PRICING_INVENTORY_DOMAIN.md`
- `docs/domain/CATALOG_DOMAIN.md`
- `docs/architecture/DATA_OWNERSHIP_MATRIX.md`
- `docs/architecture/INTEGRATION_ARCHITECTURE.md`
- `docs/architecture/SECURITY_AND_DATABASE_ARCHITECTURE.md`
- `docs/architecture/CATALOG_READ_MODEL_DESIGN.md`
- `docs/architecture/REPOSITORY_PATTERN.md`
- `docs/architecture/BACKEND_ARCHITECTURE.md`
