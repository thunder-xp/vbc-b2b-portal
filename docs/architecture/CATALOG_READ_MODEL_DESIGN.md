# Catalog Read Model Design

## Purpose

The Catalog Read Model exists to give approved Novotech partner users a fast, searchable, read-only product browsing foundation.

It is a portal cache and display model for catalog discovery. It is not a product master-data system, pricing engine, inventory system, cart, order module, or direct 1C integration.

The read model should support:

- Category browsing.
- Brand browsing.
- Product list browsing.
- Product detail foundation.
- Search and filtering readiness.
- Future access-controlled catalog visibility.
- Future integration with pricing, inventory, documents, and fast order workflows.

The first phase should create a safe catalog structure without introducing commercial-risk data.

## Ownership

1C owns official product commercial truth.

1C owns:

- Product identity.
- Product article numbers and official identifiers.
- Official product names and descriptions maintained in 1C.
- Official product active/inactive state.
- Official brand and category references when maintained in 1C.
- Units of measure and packaging rules when maintained in 1C.
- Product commercial flags maintained in 1C.

The portal may cache and display a catalog read model for performance, search, filtering, and partner experience.

The portal may own limited presentation enrichment:

- Partner-facing category mapping.
- Display labels.
- Search keywords.
- Image ordering.
- Search/filter normalization.
- Visibility metadata controlled by portal access rules.

The portal must not own or store as catalog truth:

- Prices.
- Individual partner prices.
- Stock balances.
- Warehouse quantities.
- Reservations.
- Credit limits.
- Debt or balance.
- Commercial terms.
- Contracts.
- Order commitments.

Catalog records are snapshots or portal presentation metadata. They must not be treated as final 1C truth.

## MVP Scope

Catalog Read Model Phase 1 includes:

- Categories.
- Brands.
- Products.
- Product images and safe product metadata.
- Product status and visibility-ready fields.
- Search and filter readiness.
- Read-only browsing foundation.
- Product detail placeholder data.

Phase 1 explicitly excludes:

- Prices.
- Individual prices.
- Stock.
- Warehouse inventory.
- Reservations.
- Cart.
- Orders.
- Credit limits.
- Partner-specific commercial terms.
- Finance data.
- Checkout validation.
- Direct 1C API calls.

## Proposed Tables Conceptually

This section is conceptual only. It does not define SQL.

### `catalog_categories`

Purpose:

- Store partner-facing catalog category structure for browsing and filtering.
- Support category trees or flat category lists depending on future 1C data shape.
- Allow portal presentation mapping without changing official 1C product ownership.

Source of truth:

- 1C for official category references where available.
- Portal for partner-facing navigation mapping and display enrichment.

Key fields:

- Internal portal id.
- `external_1c_id` when category comes from 1C.
- Parent category id.
- Display name.
- Slug or stable route key.
- Sort order.
- Status such as active, hidden, archived.
- Sync metadata such as source timestamp and last synced timestamp.

Must not contain:

- Prices.
- Stock or availability.
- Partner-specific discounts.
- Warehouse data.
- Commercial terms.
- Finance data.

### `catalog_brands`

Purpose:

- Store brands or manufacturers used for product filtering and product display.
- Normalize display labels and search behavior.

Source of truth:

- 1C or another approved master source if Novotech maintains brands outside 1C.
- Portal may own display enrichment only.

Key fields:

- Internal portal id.
- `external_1c_id` when brand comes from 1C.
- Display name.
- Slug or stable route key.
- Logo/image reference if approved.
- Status such as active, hidden, archived.
- Sync metadata.

Must not contain:

- Brand-specific price rules.
- Discounts.
- Partner-specific terms.
- Stock or warehouse data.
- Contract terms.

### `catalog_products`

Purpose:

- Store the read-only product catalog snapshot needed for browsing, search, filtering, and product detail foundations.
- Preserve 1C references while keeping partner-facing display shape stable.

Source of truth:

- 1C for official product identity and product state.
- Portal for search enrichment, display labels, and visibility-ready metadata.

Key fields:

- Internal portal id.
- `external_1c_id`.
- Article number or SKU.
- Product name.
- Short description or display summary when approved.
- Brand id.
- Category id.
- Unit of measure.
- Product status such as active, inactive, discontinued, hidden, archived.
- Search text or normalized search tokens.
- Basic filter metadata that does not contain commercial data.
- Source timestamp and last synced timestamp.

Must not contain:

- Price values.
- Individual price values.
- Stock quantity.
- Warehouse quantity.
- Availability commitment.
- Reservation state.
- Cart quantity.
- Order quantity.
- Credit limit or finance data.
- Partner-specific contract terms.

### `catalog_product_images`

Purpose:

- Store image references for product cards, product lists, and product detail pages.
- Support main image selection and image ordering.

Source of truth:

- 1C, approved media source, or portal-managed presentation reference.
- Portal may order, hide, or label images for display.

Key fields:

- Internal portal id.
- Product id.
- External media id or source reference.
- Image URL or storage reference.
- Alt text.
- Sort order.
- Main image flag.
- Status such as active, hidden, archived.
- Sync/source metadata.

Must not contain:

- Product identity overrides.
- Price or stock data.
- Partner-specific commercial data.
- Private files that should be handled by Documents Domain.

### `catalog_product_documents`

Product documents are primarily governed by `DOCUMENTS_DOMAIN.md`.

For Catalog Read Model Phase 1, product documents should be treated as references only unless a separate Documents implementation is approved.

Purpose if introduced later:

- Link product detail pages to document metadata that has already passed document-domain access rules.

Source of truth:

- 1C, approved document source, or Documents Domain cache.

Key fields if introduced later:

- Product id.
- Document id or document reference.
- Document type.
- Display label.
- Visibility-ready metadata.

Must not contain:

- Raw document files without document access checks.
- Accounting documents.
- Invoices.
- Price lists unless explicitly approved by Documents and Access Control domains.
- Sensitive documents without permission checks.

## 1C ID Strategy

Every cached 1C-owned catalog entity should store a stable `external_1c_id` when available.

Rules:

- `external_1c_id` links portal cache records to 1C records.
- `external_1c_id` is not a security boundary.
- UI must never trust a user-provided `external_1c_id` as proof of access.
- Portal internal ids should be used for route and repository lookup where possible.
- Sync should be idempotent by `external_1c_id` plus entity type.
- Records should preserve source timestamp or last synced timestamp.
- If 1C changes identifiers, sync logic must preserve history or safely remap records according to an approved integration plan.

The portal should avoid copying raw 1C payloads into UI-facing structures. Integration mapping should convert source data into explicit read-model fields.

## Access Control

Catalog access requires authenticated partner context.

Phase 1 assumptions:

- Public unauthenticated users cannot browse the partner catalog.
- Catalog browsing is available only to approved partner users with active profile, active company, and active membership.
- Suspended, revoked, rejected, or archived users/companies must not receive normal catalog views.
- No prices or stock are shown in this phase.
- Product visibility should be designed for future partner/company-specific rules, even if Phase 1 starts with global active/hidden status.

Future access rules may include:

- Hide product from a specific partner company.
- Hide category or brand from a specific partner company.
- Show only basic product information for limited-access partners.
- Allow documents separately from product visibility.
- Apply different catalog depth by access profile, loyalty level, turnover, or strategic importance.

Visibility rules must be enforced by services and RLS where appropriate. Hidden UI is not security.

## Repository and Service Boundaries

### `CatalogRepository`

Catalog repositories are persistence adapters.

They may:

- Read catalog category cache.
- Read catalog brand cache.
- Read catalog product cache.
- Read catalog image references.
- Apply simple persistence-level filters passed by services, such as status, category id, brand id, search query, pagination, and sort.
- Return typed repository records.

They must not:

- Call 1C.
- Decide final partner visibility.
- Read prices.
- Read stock.
- Read warehouse data.
- Read finance data.
- Read cart or order data.
- Return raw database rows to UI.
- Contain business logic.
- Use service role in partner-facing reads unless explicitly approved for system-only sync operations.

### `CatalogService`

Catalog services own catalog browsing business rules.

They may:

- Validate authenticated user and active company context through Access Control services.
- Apply catalog visibility rules.
- Call `CatalogRepository`.
- Return UI-safe catalog DTOs.
- Decide how to handle missing or hidden products.
- Coordinate with Documents Domain later for product document visibility.
- Coordinate with Pricing and Inventory services later only through explicit service boundaries.

They must not:

- Call low-level 1C clients directly.
- Own prices or stock.
- Calculate partner prices.
- Calculate available stock.
- Create carts or orders.
- Expose hidden products.
- Return commercial fields in Phase 1.

### Integration Boundary

Catalog sync from 1C must go through the Integration Layer when implemented.

Phase 1 design does not implement sync code. Future sync code should:

- Use integration operations for 1C reads.
- Map 1C data into catalog read-model cache fields.
- Log sync attempts and failures.
- Preserve source timestamps.
- Avoid writing product master data back to 1C.

## UI Scope

Phase 1 UI should be read-only and partner-workspace oriented.

Allowed UI:

- Catalog landing page.
- Category list.
- Brand list.
- Product list.
- Product detail placeholder.
- Search input and filter controls if backed by safe read-model fields.
- Empty and unavailable states.

UI must not:

- Show prices.
- Show stock.
- Show warehouse availability.
- Add to cart.
- Create reservations.
- Submit orders.
- Show credit limits, debt, invoices, or commercial terms.
- Call Supabase directly.
- Call repositories directly.
- Call 1C directly.

Product detail placeholder may show:

- Product name.
- Article number.
- Brand.
- Category.
- Description or safe metadata.
- Images.
- Status label.
- Message that pricing, stock, documents, and ordering are future controlled slices.

## Future Evolution

Future catalog evolution may include:

- Pricing display through Pricing Domain and access-controlled price visibility.
- Inventory display through Inventory Domain and stock visibility rules.
- Product documents through Documents Domain permissions.
- Product attributes and advanced filters.
- Product relations, analogs, replacements, and accessories.
- Saved products and favorites.
- Recently viewed products.
- Recently ordered products after Orders Domain exists.
- Fast order lookup by article numbers.
- Bulk paste/search for B2B ordering.
- Partner-specific catalog segmentation.
- Product availability notifications.
- Search ranking and synonym management.

Each future extension must preserve domain ownership and access-control boundaries.

## Risks

| Risk | Why It Matters | Prevention |
| --- | --- | --- |
| Portal becomes a second 1C | Product truth may diverge from official source. | Treat catalog as read model/cache; no editing official product truth. |
| Prices are mixed into catalog tables | Price leakage creates commercial and partner relationship risk. | Keep pricing in Pricing Domain only; catalog DTOs exclude price fields. |
| Stock is mixed into catalog tables | Stock leakage and stale stock can mislead partners. | Keep inventory in Inventory Domain only; no quantity or warehouse fields. |
| UI calls 1C directly | Breaks integration architecture and observability. | All 1C reads go through Integration Layer. |
| UI calls Supabase or repositories directly | Bypasses service visibility rules. | UI uses Server Actions or server loaders that call services. |
| Inactive products are exposed | Partners may request unavailable or hidden products. | Service filters by product status and future visibility rules. |
| `external_1c_id` is treated as access proof | Users could enumerate source ids. | Validate company/user access and product visibility independently. |
| Partner-specific visibility is added too early | Premature complexity may create inconsistent access behavior. | Phase 1 supports visibility-ready structure but starts with simple active/hidden status. |
| Product documents leak through catalog | Some documents may be restricted. | Keep document access in Documents Domain. |

## Implementation Plan

### Phase 1: Design

- Create this architecture document.
- Review ownership boundaries with existing domain documents.
- Confirm that Phase 1 excludes pricing, stock, orders, cart, reservations, and direct 1C calls.

### Phase 2: SQL Migration

- Create catalog read-model tables conceptually defined here.
- Enable RLS table by table.
- Add policies for approved authenticated partner reads.
- Keep service-role usage limited to future system sync if explicitly approved.
- Do not add prices, stock, warehouse, finance, cart, or order fields.

### Phase 3: Domain Types

- Add pure TypeScript types for categories, brands, products, images, and safe statuses.
- No Supabase imports.
- No services.
- No repositories.
- No business logic.

### Phase 4: Repository and Service

- Add repository interfaces first.
- Add Supabase repository implementations that respect RLS.
- Add CatalogService for active partner access validation and visibility filtering.
- Keep repositories persistence-only.
- Keep service output DTOs UI-safe.

### Phase 5: Server Actions

- Add read-only catalog Server Actions.
- Authenticate user.
- Resolve active company context.
- Call CatalogService.
- Return safe result DTOs and safe errors.
- No direct Supabase, no direct 1C, no Service Role.

### Phase 6: UI Shell

- Add catalog navigation entry in Partner Cabinet when approved.
- Add catalog landing page.
- Add category, brand, product list, and product detail placeholder pages.
- Show no prices, stock, warehouse, cart, or order controls.

### Phase 7: Tests

- Add service unit tests for visibility and status filtering.
- Add repository mapper tests where useful.
- Add Server Action orchestration tests.
- Add minimal component tests for read-only catalog UI states.
- Add RLS verification when migration is applied locally or in a safe test environment.

## Cross References

- `docs/domain/CATALOG_DOMAIN.md`
- `docs/domain/PRICING_INVENTORY_DOMAIN.md`
- `docs/architecture/DATA_OWNERSHIP_MATRIX.md`
- `docs/architecture/INTEGRATION_ARCHITECTURE.md`
- `docs/architecture/SECURITY_AND_DATABASE_ARCHITECTURE.md`
- `docs/architecture/BACKEND_ARCHITECTURE.md`
- `docs/architecture/FRONTEND_ARCHITECTURE.md`
- `docs/architecture/REPOSITORY_PATTERN.md`
- `docs/architecture/MODULE_COMMUNICATION.md`
