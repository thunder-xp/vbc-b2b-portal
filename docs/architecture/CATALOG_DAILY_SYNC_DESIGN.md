# Catalog Daily Sync Design

## Purpose

The catalog sync imports the `SECURITYPARK DISTRIBUTION` nomenclature subtree from 1C into the portal catalog read model once every 24 hours. Partner browsing always uses cached portal tables and never calls 1C.

## Confirmed OData Contract

Resource: `Catalog_Номенклатура`.

Confirmed fields from production metadata: `Ref_Key`, `Parent_Key`, `IsFolder`, `DeletionMark`, `DataVersion`, `ДатаИзменения`, `Code`, `Артикул`, `Description`, `НаименованиеПолное`, `PS_ВидНоменклатурыБУ`, and `ЭтоНабор`.

`PS_ВидНоменклатурыБУ` is an OData string backed by the confirmed `PS_ВидыНоменклатуры` values, including `Товар` and `Услуга`.

## Scope and Eligibility

The provider discovers the exact active folder named `SECURITYPARK DISTRIBUTION`. Its GUID is runtime data and must never be hardcoded. Only descendants of that folder are eligible.

Folders become catalog categories. Products must be non-folder, non-deleted, have valid GUID and non-empty name, have accounting type `Товар`, and must not have `ЭтоНабор = true`. Unrelated, malformed, service, deleted, and set rows are excluded.

## Full Sync

1. Read bounded OData pages.
2. Parse rows independently and build the hierarchy in memory.
3. Discover the exact root and resolve all descendants.
4. Upsert category levels parent-first in batches.
5. Upsert products in batches with resolved category IDs.
6. Mark every row with the current sync ID and source root.
7. Atomically deactivate unseen rows only after all batches succeed.
8. Persist the safe run summary and release the lock.

Failed runs never deactivate rows. A stale lock expires after two hours. Concurrent runs are skipped.

## Ownership

Catalog sync owns identity, hierarchy, SKU/article, official name/description, governed source image, technical attributes, active state, source version, and source modification time. Separate synchronized projections own prices, stock, reserve, and expected arrivals. Catalog sync does not invent datasheets, marketing text, brand enrichment, or portal visibility overrides.

## Unified B2B and Public Retail Publication

Catalog, price, and stock synchronization each finish their canonical B2B read-model publication before invoking `CatalogSynchronizationOrchestrator`. The same server-only orchestrator is used by manual actions and scheduled workers. It records the source run and trigger, claims one global projection lease, builds the existing versioned Public Retail candidate, validates and atomically publishes it, and then revalidates only Public Retail catalog, product, and SEO caches.

The orchestration ledger is idempotent by source domain and source sync ID. One publication can run at a time. Overlapping completions remain queued for the existing minute watchdog, failed projections use at most three bounded attempts, and a stale 30-minute projection lease is safely recovered. B2B source success is retained if Public Retail projection fails; the overall result is `partial_success`, never a generic success.

Public Retail remains a public-safe snapshot. It consumes only global RETAIL pricing, governed public media and descriptions, visible resolved specifications, public categories, and derived availability. It never receives company pricing, contracts, exact warehouse balances, arrival quantities/dates, or partner context. No source synchronization or projection work runs from a public or partner page request.

## Schedule and Security

Vercel invokes `GET /api/internal/catalog-sync` at `0 2 * * *` once daily. The endpoint requires a bearer `CATALOG_SYNC_SECRET` or Vercel `CRON_SECRET`. Service-role access is isolated to the server-only snapshot writer.

## Portal Presentation

The technical root is not stored as a selectable category. Its children have no portal parent and become top-level navigation entries. Deeper hierarchy remains stored; partner navigation renders at most three levels.
