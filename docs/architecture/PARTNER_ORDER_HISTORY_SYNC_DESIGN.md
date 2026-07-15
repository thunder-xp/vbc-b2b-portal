# Partner Order History Sync Design

## Purpose

The partner order center is a portal read model of `Document_ЗаказПокупателя`. 1C remains the source of truth for document existence, posting, deletion, business state, dates, lines, totals, and currency. The read model makes complete company history available without calling 1C during page rendering.

## State Boundaries

Portal workflow state, integration state, and 1C document state remain separate. Partner presentation is derived from 1C in this order:

1. `DeletionMark = true`: retain for audit, set `partner_visible = false`, and return safe not-found to partner requests.
2. `Posted = false`: display `Заказ обрабатывается`; keep the raw number internal.
3. `Posted = true`: display the document number and mapped 1C state.

Production evidence shows `СостояниеЗаказа` as a GUID reference to `Catalog_СостоянияЗаказовПокупателей`. The provider resolves the referenced description and maps only `Открыт`, `Предзаказ`, `Тест`, and `Завершен`. Unknown values retain the safe raw reference, emit a diagnostic, and display `Статус уточняется`.

## Synchronization

The provider queries `Document_ЗаказПокупателя` with an exact `Контрагент_Key` boundary, stable `Date, Ref_Key` ordering, `$top/$skip` pagination, and `Ref_Key` identity. The service follows continuation cursors until completion with explicit page-size and maximum-page guards. Persistence uses one service-role RPC per page to atomically upsert documents, replace current 1C lines, and append deduplicated proven events.

The first company run is always full. Later manual runs use the incremental mode contract, but currently scan the complete counterparty history because a reliable 1C change-token field has not been proven. This is intentionally conservative and must be replaced only after production evidence identifies a safe incremental boundary.

Failed or partial synchronization never deletes or replaces previously valid read-model history. Sync state records the last successful full and incremental timestamps, source version, status, safe error, and received/inserted/updated/hidden counters.

## Ownership And Reconciliation

The read model uses 1C `Ref_Key`, never document number, as external identity. Existing portal orders are linked by their confirmed 1C reference; their immutable submission items remain a secondary audit snapshot. Orders from legacy B2B, employees, integrations, or manual entry are stored with neutral `unknown_1c_source` unless reliable origin evidence exists.

## Security

Partner reads require active company access plus `orders.view`. Manual refresh requires `orders.manage`. RLS enforces the company boundary and excludes hidden records. Internal reviewers may inspect audit events. Browser code never receives service-role credentials and never calls 1C. Future internal batch and scheduled triggers must call the same service boundary from authenticated server-only entry points.

## Performance

Normal list and detail routes read Supabase only. Lists use indexed company/date filtering and deterministic 25-row pagination. Sync uses 100-order provider pages and bulk RPC persistence; line loading is batched and never one query per product.

## Remaining Extension

- Prove a reliable 1C modification cursor before implementing a reduced incremental query.
- Add an internal batch/scheduled trigger without duplicating synchronization logic.
- Add operational metrics and retry scheduling around the existing sync-state contract.
