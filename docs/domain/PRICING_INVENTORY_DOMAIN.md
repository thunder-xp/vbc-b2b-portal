# Pricing and Inventory Domain

## Business Goals

The pricing and inventory domain defines how Novotech Systems exposes price and stock information to partner companies in the B2B Partner Platform.

The main business goals are:

- Keep 1C as the source of truth for prices, individual prices, stock, warehouses, reservations, and commercial terms.
- Let the portal control what each partner company can see based on access profile.
- Support different prices for different partners.
- Support different stock visibility depth for different partners.
- Allow partners to make faster buying decisions without exposing sensitive commercial data unnecessarily.
- Avoid financial, legal, and relationship risk caused by stale prices, wrong stock quantities, or unclear availability.
- Treat portal pricing and inventory data as a partner-facing snapshot unless confirmed by 1C.
- Prepare for reliable order creation and reservation workflows in the MVP.

The portal may cache pricing and inventory data for performance, but it must not become the owner of commercial truth.

## Core Entities

### Price

A price is a commercial value for a product under a specific pricing context.

It may represent a recommended price, list price, standard partner price, or another price type maintained in 1C. A price should always be interpreted with its currency, validity, partner context, and source timestamp.

### Individual Price

An individual price is a partner-specific or contract-specific price.

It may depend on partner company, contract, agreement, price list, discount rules, quantity, currency, or other commercial conditions in 1C. Individual prices are sensitive and should only be visible to partners with explicit permission.

### Price Type

A price type describes the commercial category of a price.

Examples may include recommended price, dealer price, wholesale price, special price, contract price, or promotional price. Price types come from 1C or are mapped from 1C commercial rules.

### Currency

Currency defines the monetary unit for a price.

Currency affects display, comparison, ordering, and validation. Currency values and conversion rules should come from 1C or approved finance sources, not from ad hoc portal logic.

### Stock Balance

Stock balance is the available quantity or availability source data for a product.

Raw stock balance belongs to 1C. The portal may display exact quantity, simplified availability, or no stock information depending on access profile.

### Warehouse

A warehouse is a stock location maintained in 1C.

Warehouse-level visibility is sensitive. Some partners may see total availability only, while trusted or strategic partners may see availability by warehouse if approved.

### Reservation

A reservation is a temporary hold or allocation of product quantity for a partner or order.

In the MVP, product reservations may be written to 1C if the business process requires it. The portal may initiate a reservation request, but the reservation is only authoritative after 1C accepts it.

### Stock Visibility Rule

A stock visibility rule controls how much inventory information a partner company can see.

It may hide stock completely, show availability only, show ranges, show exact quantity, or show warehouse-level stock. It is controlled by the partner company's access profile.

### Price Visibility Rule

A price visibility rule controls which price information a partner company can see.

It may hide prices, show recommended prices, show partner prices, or show individual contract prices. It is controlled by the partner company's access profile and should be evaluated before any price is displayed, exported, or used in partner-facing communication.

## Data From 1C

1C owns official pricing and inventory data, including:

- Product prices.
- Individual partner prices.
- Price types and price lists.
- Discounts and commercial terms.
- Currency and currency rules.
- Tax or VAT-related commercial rules when applicable.
- Stock balances.
- Warehouse data.
- Product availability source data.
- Reservations after acceptance by 1C.
- Order availability validation.
- Credit limits and finance constraints that affect order acceptance.
- Price validity periods.
- Promotions if maintained in 1C.

The portal may cache or display this data only according to partner access rules.

## Data Owned Only by the Portal

The portal owns visibility and workflow data, including:

- Price visibility rules.
- Stock visibility rules.
- Partner access-profile decisions.
- Partner-facing stock labels such as available, limited, or unavailable.
- Cache timestamps and synchronization state.
- Snapshot metadata shown to managers or used for safety checks.
- Reservation request state before 1C confirms the reservation.
- Partner-facing warnings about stale or changed data.
- Audit history for sensitive visibility changes.

The portal may decide what is visible, but it must not invent official prices, stock balances, warehouse quantities, or financial terms.

## Price Visibility Levels

### Hidden

The partner cannot see prices.

Use when the partner is new, unapproved for pricing, suspended, or restricted. Products may still be visible without prices if catalog access allows it.

### Recommended Price

The partner can see a recommended, list, or public-facing business reference price.

This level does not imply that the shown price is the partner's final commercial price. The portal should label this clearly where needed.

### Partner Price

The partner can see a price calculated or assigned for that partner company or partner group.

This may reflect partner category, loyalty level, standard discount, turnover, or commercial agreement maintained in 1C.

### Individual Contract Price

The partner can see a contract-specific or individual price.

This is the most sensitive price visibility level. It should require explicit access permission and should be revalidated with 1C before order submission.

## Stock Visibility Levels

### Hidden

The partner cannot see stock information.

Use when inventory visibility is not approved or when showing stock would create commercial risk.

### Available / Not Available

The partner can see a simple availability state.

This is useful when Novotech wants to provide buying guidance without exposing exact quantities.

### Low / Medium / High

The partner can see a range-based availability level.

This gives more signal than a binary state while still protecting exact stock quantities. Thresholds should be defined by Novotech and should not reveal sensitive operational details.

### Exact Quantity

The partner can see exact available quantity.

This level should be reserved for trusted or strategic partners and should clearly depend on cache freshness and 1C confirmation.

### By Warehouse

The partner can see availability split by warehouse.

This is the deepest stock visibility level. It may be useful for logistics planning but can expose sensitive operational data, so it should require explicit permission.

## Reservation Logic

Reservation is a controlled workflow for holding product quantity before or during order creation.

Rules:

- Reservation permission is separate from stock visibility.
- Order creation permission does not automatically grant reservation permission.
- Reservation requests should be validated against partner status and access profile.
- Suspended or archived partners must not create reservations.
- Portal cache is not enough to guarantee a reservation.
- 1C must confirm the reservation before it is treated as active.
- If 1C rejects a reservation, the portal should show a clear operational reason when available.
- Reservation duration, expiration, and release rules should come from Novotech business policy and 1C capabilities.
- Reservation should be linked to a partner company and, when applicable, an order or order draft.
- Partial reservation should be handled explicitly: accepted, rejected, partially accepted, or requires manager review.

The portal may track reservation request state, but accepted reservations belong to 1C.

## Cache Strategy

Pricing and inventory cache should improve performance without misleading partners.

Principles:

- Cached price and stock values are snapshots.
- Snapshot timestamp should be stored and available for operational review.
- Sensitive actions should revalidate with 1C before commitment.
- Cache freshness requirements may differ by data type.
- Prices may tolerate a different refresh interval than stock, depending on business policy.
- Exact stock visibility requires stricter freshness than availability-only visibility.
- Partner-specific prices require careful cache scoping by partner company or commercial context.
- The portal must never reuse one partner's individual price for another partner.
- If cache data is missing or stale beyond allowed limits, the portal should use safer behavior and avoid risky commitments.

Cache display should be designed so partners understand that final price and availability may be confirmed at order submission when required by policy.

## When to Refresh From 1C

The portal should refresh pricing and inventory data from 1C in these situations:

- Scheduled background synchronization.
- Product catalog synchronization.
- Partner opens a product detail page and cache is stale.
- Partner adds a product to cart and current snapshot is stale.
- Partner changes quantity in cart.
- Partner starts checkout or order submission.
- Partner requests a reservation.
- Partner requests special pricing.
- Manager changes access profile affecting price or stock visibility.
- 1C sends or exposes a change event in future integration.
- Previous 1C response failed or was incomplete.

For MVP safety, order submission and reservation should rely on fresh 1C validation rather than old cached values.

## Edge Cases

### Price Changed During Checkout

If price changes during checkout, the portal should stop silent submission and show that the price changed.

The partner should be asked to review the updated price, or the order should be routed to manager review depending on Novotech policy.

### Stock Changed During Checkout

If stock changes during checkout, the portal should revalidate availability before order creation or reservation.

If requested quantity is no longer available, the portal should allow quantity adjustment, backorder handling, analog selection, or manager review depending on future business rules.

### Product Unavailable After Adding to Cart

If a product becomes unavailable after it was added to cart, the cart should clearly mark the line as unavailable.

The portal should not submit unavailable items as if they were confirmed unless 1C or manager workflow explicitly supports backorders.

### Different Currency

If a product or partner price is in a different currency, the portal should show currency clearly and avoid unsafe conversion assumptions.

Currency conversion should come from 1C or an approved finance source. The portal should not invent exchange rates.

### Partner Suspended

If a partner is suspended, pricing, inventory, reservation, and order actions should be blocked according to suspension policy.

Existing cart lines or cached views should not allow the partner to continue normal checkout.

### Missing 1C Response

If 1C does not respond or returns incomplete data, the portal should avoid confirming price, stock, order, or reservation state.

The portal may show a temporary unavailable state, ask the partner to retry, or route the case to Novotech manager review. It should not fabricate commercial data.

## MVP Scope

The MVP should include:

- Clear separation between 1C-owned price and stock data and portal-owned visibility controls.
- Partner access-profile-based price visibility.
- Partner access-profile-based stock visibility.
- Cached pricing and inventory snapshots where needed for performance.
- Snapshot timestamps and safe stale-data behavior.
- Revalidation with 1C before order creation.
- Revalidation with 1C before reservation when reservation is enabled.
- Handling for hidden prices and hidden stock.
- Handling for availability-only stock display.
- Handling for price or stock changes during cart or checkout.

The MVP should prefer safe, conservative behavior over convenience when price or stock truth is uncertain.

## Non-Goals for MVP

The MVP should not include:

- Portal ownership of official prices.
- Portal ownership of official stock balances.
- Editing prices in the portal.
- Editing warehouse quantities in the portal.
- Full pricing engine replacement.
- Full inventory management system.
- Complex currency conversion engine.
- Automated contract negotiation.
- Advanced promotional pricing engine.
- Multi-step approval workflow for every price difference.
- Public retail-style price display.
- Warehouse management features.

## Future Extensions

Possible future extensions include:

- Real-time 1C price and stock validation where integration performance allows it.
- 1C event-driven cache invalidation.
- Partner-specific price history.
- Manager review workflow for price changes during checkout.
- Backorder support.
- Partial fulfillment logic.
- Reservation expiration and automatic release visibility.
- Warehouse-level fulfillment preferences.
- Lead-time calculation.
- Quantity-based price tiers.
- Promotional price visibility by partner segment.
- Special price request workflow.
- Credit-limit-aware checkout.
- Finance approval workflow for risky orders.
- Audit reports for price and stock visibility.
- Partner notifications for price changes, stock replenishment, and reservation expiration.

Future automation must preserve the boundary: 1C owns commercial truth, and the portal controls partner-specific visibility and workflow experience.
