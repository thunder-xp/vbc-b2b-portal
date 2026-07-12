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

Catalog sync owns identity, hierarchy, SKU/article, official name/description, active state, source version, and source modification time. It does not write prices, stock, reserve, expected arrivals, images, datasheets, marketing text, brand enrichment, or portal visibility overrides.

## Schedule and Security

Vercel invokes `GET /api/internal/catalog-sync` at `0 2 * * *` once daily. The endpoint requires a bearer `CATALOG_SYNC_SECRET` or Vercel `CRON_SECRET`. Service-role access is isolated to the server-only snapshot writer.

## Portal Presentation

The technical root is not stored as a selectable category. Its children have no portal parent and become top-level navigation entries. Deeper hierarchy remains stored; partner navigation renders at most three levels.
