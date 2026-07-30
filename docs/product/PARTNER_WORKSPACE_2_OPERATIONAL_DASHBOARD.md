# Partner Workspace 2.0: Operational Dashboard

## Evidence Audit

The current `/cabinet` page renders:

- a large welcome card with company, role, 1C company code, and partner status;
- four commercial freshness tiles;
- navigation-derived quick actions;
- generic process cards for orders, shipments, finance, and company access.

The process cards contain no order, shipment, finance, cart, estimate, or
employee data. They are navigation copy rather than operational projections.
The page does not surface exceptions, unfinished work, repeat purchases, or
current merchandising offers.

## Reliable Local Sources

The dashboard may use only:

- `partner_order_history`, `partner_orders`, and immutable order items;
- `partner_order_date_change_requests`;
- active `carts` and `cart_items`;
- `estimates` and `purchasing_lists`;
- `partner_contract_balances` and `partner_finance_sync_state`;
- `company_memberships`, `invitations`, and permission overrides;
- published catalog, stock, arrival, price, and merchandising read models;
- commercial and order synchronization timestamps.

No dashboard request may call 1C, SMTP, the Auth Admin API, or any other live
integration.

## Current Read Shape

The shell and page share a request-cached workspace context, but the context
itself resolves profile, membership, company, effective permissions, and the
partner price type through several repository calls. The page then performs a
separate freshness aggregate read. It does not currently perform operational
reads.

Workspace 2.0 adds one tenant-bound dashboard aggregate RPC and one combined,
bounded commercial enrichment for reorder and merchandising products. It does
not add one query per widget or one query per product.

## Role Visibility

- Owner/manager: operational sections plus employee and invitation summary.
- Buyer: catalog, cart, estimates, orders, shipments, and repeat purchases.
- Accounting: finance and orders; no confidential product suggestions unless
  catalog access is independently granted.
- Retail-only employee: no partner price, finance, or company-management data.

The UI derives visibility from the canonical server-side capability context.
The RPC independently enforces membership and permissions.

## Deterministic Reorder Ranking

Eligible products must be active, visible, mapped, and present in company order
history. Ranking is:

1. distinct purchase count descending;
2. latest purchase date descending;
3. posted/completed purchase count descending;
4. current sellability;
5. current availability;
6. product ID as a stable tie-breaker.

The projection is capped at eight products. It is labeled as prior purchasing,
never as AI or compatibility advice.

## Proven Gaps Addressed

- actionable order, shipment, date-change, finance, and invitation exceptions;
- immediate portal-order visibility before full history synchronization;
- active cart, draft estimate, and saved-list continuation;
- bounded repeat-purchase candidates;
- one bounded TOP/NEW/HOT offer projection;
- role-aware finance and company summaries;
- compact positive attention state when no exception exists.

## Deferred Because Evidence Is Insufficient

- cart price/availability drift alerts: the current cart does not own an
  immutable comparison snapshot;
- proposal-delivery alerts: partner-facing ownership and remediation semantics
  require a separate reviewed projection;
- compatibility or solution recommendations from unreliable 1C attributes;
- CRM-style customer, lead, pipeline, or activity metrics.

## Performance And Security Boundaries

- one read-only dashboard RPC, page-bounded product candidates;
- one combined product commercial enrichment;
- no N+1 reads;
- no live 1C, SMTP, or Auth Admin calls;
- no financial values in analytics metadata;
- no raw 1C references or internal IDs in the rendered dashboard;
- retail-only redaction occurs before serialization.
