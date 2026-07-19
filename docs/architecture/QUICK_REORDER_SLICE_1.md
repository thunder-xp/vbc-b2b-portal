# Quick Reorder - Slice 1

## Existing baseline

- `partner_order_history` and `partner_order_history_items` are immutable 1C read-model snapshots.
- The order list reads summary rows and synchronization state only. It does not load order lines.
- Order detail loads one order, one bounded line collection, timeline events, and an optional portal submission snapshot.
- Historical item `product_id` is the stable portal identity. SKU is display data and is not an order-repeat lookup key.
- Current catalog products are resolved in bulk and are restricted to active, visible rows for ordinary partner reads.
- Current partner prices, stock totals, and supplier arrivals are loaded by one commercial service call for a bounded product-id set.
- Estimate-to-cart conversion already proves the required pattern: service validation followed by one idempotent transactional RPC.
- The current workspace action named `repeat_order` is a disabled placeholder. No order-history reorder action, preview, line selection, or historical/current price comparison exists.

## Slice boundaries

Slice 1 adds a lazy reorder route and does not change immutable order history, catalog ownership, pricing formulas, stock synchronization, checkout freshness rules, or 1C order submission.

The service owns:

- source-order and selected-line validation;
- current product and 1C-reference validation;
- current commercial-data resolution;
- Decimal-based price comparison;
- product-state classification;
- duplicate-product aggregation;
- conversion summary creation.

The repository owns bounded read-model access and one transactional cart mutation. React owns selection and quantity input state only.

## Performance contract

| Surface | Baseline | Slice 1 budget |
| --- | --- | --- |
| Order list | 1 summary query + 1 sync-state query; 0 line queries | unchanged |
| Order detail | 1 order query + bounded detail reads | no automatic reorder preview |
| Reorder preview | not implemented | 1 scoped source read + 1 bulk commercial service call |
| Cart conversion | estimate conversion uses 1 transactional RPC | 1 transactional reorder RPC |
| Cart page | bounded cart/items, catalog, and commercial reads | no regression from reorder |

All normal-page and conversion paths make zero 1C calls. Revalidation is limited to the active cart surfaces and source order detail.

## Security contract

- Preview requires active-company `orders.view` and `cart.manage` permissions.
- Conversion additionally requires the existing order-management permission enforced by the cart RPC.
- The source order must be visible, not deleted, and belong to the active company.
- Selected line IDs must belong to that source order.
- Client product IDs, company IDs, prices, state labels, and summary counters are never trusted.
- A request key identifies one conversion attempt. Reusing it returns the prior result without changing quantities again; a deliberate new reorder uses a new key.

