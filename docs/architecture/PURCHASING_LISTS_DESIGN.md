# Saved Purchasing Lists

## Existing collection baseline

- Catalog favorites are private user bookmarks and contain no quantities, ordering, company visibility, or conversion workflow.
- Product comparison is browser-scoped selection and is not a persisted business aggregate.
- Carts are mutable purchase intent and cannot be reused without changing their order-submission semantics.
- Estimates own commercial drafts and customer-facing calculations, not recurring product selections.
- Quick Reorder owns an order-history preview and current-commercial classification. Its product resolution and idempotent cart conversion patterns are reusable, but its source identity remains an immutable historical order.

## Reuse decision

Purchasing lists are a focused portal-owned aggregate. They reuse active-company authorization, bulk catalog reads, the pricing/inventory commercial projection, Quick Reorder status concepts, the cart merge pattern, and estimate product snapshots. They do not introduce a generic collection framework or duplicate 1C-owned commercial truth.

## Ownership and storage

`purchasing_lists` stores company scope, private/company visibility, metadata, creator/updater identity, archive state, and revision. `purchasing_list_items` stores one product identity per list, desired integer quantity, stable position, note, source type/reference, and optional historical creation price context. Current price, stock, arrival, reservation, and ERP document state are never stored on list lines.

Meaningful aggregate events and conversion request records support audit and idempotency without recording commercial amounts.

## Access model

- `purchasing_lists.view` permits company-list reads for active company members.
- Private lists additionally require `created_by = auth.uid()`.
- `purchasing_lists.manage` permits mutation, subject to the same visibility rule.
- Archived lists are immutable except for restore and duplication.
- React never supplies or selects a company identity. Services derive it from the authenticated active membership.
- Direct authenticated table writes are denied. Narrow RPCs repeat ownership, membership, visibility, archive, and product validation.

## Boundaries and performance

- Repository: bounded data access and RPC invocation only.
- Service: access resolution, validation, product classification, commercial projection, source conversion, and summaries.
- Server Actions: authentication, service calls, and narrow path revalidation.
- UI: rendering, explicit selection, and bounded form state only.

The index uses one aggregate page read and one bulk commercial projection for distinct products on that page. Detail uses one bounded aggregate read and one bulk commercial projection. List conversion performs no render-time 1C calls, no per-line commercial reads, and one transactional cart or estimate mutation.
