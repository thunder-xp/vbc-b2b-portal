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

Routine synchronization queries `Document_ЗаказПокупателя` with an exact `Контрагент_Key` boundary, `Date >= watermark - 72 hours`, stable `Date asc, Ref_Key asc` ordering, and bounded `$top/$skip` pagination. `DataVersion` is a per-object change detector, never a global cursor. Headers are compared with local `Ref_Key + DataVersion`; lines and enrichment are fetched only for new, changed, or locally damaged documents. Persistence receives delta rows only and replaces items only for those rows.

The first company run is always full. Later manual and scheduled runs are incremental and include one exact-reference verification batch of at most 25 known records. Exact verification classifies `exists`, `deletion_marked`, `absent`, and `unknown`; timeout, server error, or an incomplete response preserves visibility. A hidden record that reappears is restored automatically with an immutable `restored_from_1c` event.

Date discovery cannot guarantee an arbitrarily backdated newly-created 1C document. The 72-hour overlap covers ordinary date corrections and weekend posting, exact verification protects already-known identities, and a separate admin-enqueued two-pass full audit protects set completeness. At current production volume, run the full audit monthly and after any integrity warning, migration, or provider behavior change. Reassess that cadence if a company exceeds 10,000 history rows or if backdated-order evidence appears.

The full audit is asynchronous. Both header-only passes use `Ref_Key asc`, bounded pages, page fingerprints, duplicate/conflicting-version detection, and count/set/version hash equality. No unseen local reference is hidden unless both complete passes agree. Mismatch marks integrity as requiring review and performs zero absence hiding.

Failed or partial synchronization never advances the Date watermark and never deletes or replaces previously valid read-model history. Append-only run metrics record cursor bounds, header/delta counts, line and existence requests, 1C duration, database writes, and total duration.

## Ownership And Reconciliation

The read model uses 1C `Ref_Key`, never document number, as external identity. Existing portal orders are linked by their confirmed 1C reference; their immutable submission items remain a secondary audit snapshot. Orders from legacy B2B, employees, integrations, or manual entry are stored with neutral `unknown_1c_source` unless reliable origin evidence exists.

## Security

Partner reads require active company access plus `orders.view`. Manual refresh requires `orders.manage`. RLS enforces the company boundary and excludes hidden records. Internal reviewers may inspect audit events. Browser code never receives service-role credentials and never calls 1C. Future internal batch and scheduled triggers must call the same service boundary from authenticated server-only entry points.

## Performance

Normal list and detail routes read Supabase only. Lists use indexed company/date filtering and deterministic 25-row pagination. Sync uses 100-order provider pages and bulk RPC persistence; line loading is batched and never one query per product.

## Cross-Domain Roadmap (Not Implemented Here)

Prioritize future delta conversion by current 1C load, business criticality, and source safety: catalog, prices, counterparties/contracts, product relations, documents, then stock only after a safe stock delta mechanism is proven. Each domain requires its own authoritative cursor and deletion contract; this order-history design must not be copied blindly.
