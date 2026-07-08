# Orders Domain

## Business Goals

The orders domain defines how partner companies prepare, submit, approve, and track orders through the Novotech Systems B2B Partner Platform.

The main business goals are:

- Give partners a controlled self-service way to prepare orders.
- Support both direct order creation and manager-approved order requests.
- Keep 1C as the source of truth for confirmed orders after creation.
- Allow the portal to write to 1C only for new order creation and product reservation in the MVP.
- Validate price, stock, partner status, and access permissions before order submission.
- Reduce manual communication for routine partner orders.
- Avoid financial and operational risk from stale prices, stale stock, or unauthorized order creation.
- Give Novotech managers clear tasks when partner orders require approval.
- Keep portal order drafts separate from official 1C orders.

The portal owns the partner-facing order preparation workflow. 1C owns official order records after they are created.

## Core Entities

### Cart

A cart is a partner-facing working area where a partner user collects products before creating an order draft or order request.

The cart belongs to a partner company and may be edited by an authorized partner user. It is not an official order and does not guarantee price or stock.

### Cart Item

A cart item is a product line inside a cart.

It includes product identity, requested quantity, visible price snapshot if allowed, visible stock snapshot if allowed, and validation state. Cart item data should be revalidated before submission.

### Order Draft

An order draft is a structured pre-submission version of an order prepared in the portal.

It may include cart items, delivery preferences, contact details, comments, and validation results. It is still portal-owned and is not an official 1C order.

### Order Request

An order request is a partner-submitted request that requires Novotech manager review before it becomes an official order.

Order requests are used when the partner is not allowed to create direct orders, when price or stock changed, when special approval is required, or when access profile requires manager approval.

### Confirmed Order

A confirmed order is an order that has been successfully created in 1C.

After creation, 1C becomes the source of truth for order status, official order number, item state, fulfillment, documents, and commercial processing.

### Order Item

An order item is a product line in an order draft, order request, or confirmed order.

Before 1C creation, the portal owns the draft or request line. After 1C creation, the official order item belongs to 1C and the portal displays synchronized state.

### Reservation

A reservation is a temporary hold or allocation of product quantity.

In the MVP, the portal may request product reservation in 1C. A reservation is only authoritative after 1C confirms it.

### Order Status

Order status describes the current state of a portal order draft, order request, or confirmed 1C order.

Portal-owned statuses may include draft, validation required, submitted for approval, approved, rejected, sent to 1C, 1C creation failed, and archived draft. 1C-owned statuses should be synchronized and displayed after official order creation.

### Manager Approval

Manager approval is an internal Novotech review step required before some partner orders are sent to 1C.

Approval may be required by access profile, partner status, price changes, stock exceptions, finance conditions, special price requests, or operational policy.

### 1C Order Reference

A 1C order reference connects a portal order request or confirmed order view to the official order created in 1C.

It may include 1C order ID, order number, creation timestamp, sync status, and last synchronization timestamp. The reference does not transfer ownership of official order truth to the portal.

## Order Lifecycle

### Add to Cart

A partner user adds visible and orderable products to the cart.

The portal should check basic access rules before allowing a product to be added. Hidden products, restricted products, or products unavailable to the partner should not be added as normal cart lines.

### Validate Prices and Stock

Before checkout or submission, the portal validates cart items against current partner permissions, price visibility, stock visibility, and 1C source data.

Validation should confirm:

- Partner status allows order activity.
- Partner access profile allows cart or order actions.
- Products are still available for the partner.
- Requested quantities are valid.
- Price information is current enough for the workflow.
- Stock information is current enough for the workflow.
- Reservation can be requested if needed and allowed.

### Submit Order

The partner submits the cart as either a direct order or an order request, depending on permissions.

If the partner can create direct orders and all validation passes, the portal may proceed to 1C order creation. If manager approval is required, the portal creates an order request for internal review.

### Manager Approval if Required

A Novotech manager reviews the order request.

The manager may approve, reject, request changes, adjust operational comments, or escalate the case. Approval should not bypass required final validation before writing to 1C.

### Create Order in 1C

When an order is approved and eligible for direct creation, the portal sends the order creation request to 1C.

The official order exists only after 1C accepts it and returns an order reference. If 1C rejects the order or is unavailable, the portal should not mark the order as confirmed.

### Reserve Stock

If reservation is enabled and required, the portal requests reservation in 1C.

Reservation may happen before order creation, during order creation, or immediately after order creation depending on the final 1C process. The portal should clearly track whether reservation is pending, confirmed, rejected, partial, or expired.

### Sync 1C Order Status Back to Portal

After order creation, the portal displays order status based on 1C data.

The portal may cache status for performance, but 1C remains the source of truth for official order processing, fulfillment, shipment, invoice, and cancellation states.

## Permissions

### Can Create Cart

Allows a partner user to create and edit a cart.

This permission is useful even for partners that cannot create direct orders, because they may still prepare order requests.

### Can Submit Order Request

Allows a partner user to submit an order request for manager review.

This permission supports controlled partner workflows where Novotech wants manager approval before official order creation.

### Can Create Direct Order

Allows a partner user to submit an order that can be sent to 1C without manual approval when validation passes.

This should be reserved for partners with appropriate access profile, active status, and approved commercial relationship.

### Can Reserve Stock

Allows a partner user or approved workflow to request product reservation.

Reservation permission is separate from order creation. A partner may be allowed to request orders without being allowed to reserve stock.

### Requires Manager Approval

Forces submitted orders to become order requests first.

This rule may apply to new partners, risky partners, special price cases, finance exceptions, unusual quantities, changed prices, changed stock, or any partner profile that Novotech wants to review manually.

## Price and Stock Validation Before Checkout

Before checkout, the portal should revalidate price and stock information with 1C or a sufficiently fresh trusted snapshot, depending on policy.

Validation should check:

- Product still exists and is active.
- Product is still visible to the partner.
- Partner still has order permission.
- Current price is available and allowed to be shown or used.
- Currency is clear and valid.
- Requested quantity is allowed.
- Stock or availability is sufficient for the requested workflow.
- Reservation is possible if requested.
- Partner status has not changed to suspended or archived.

For MVP safety, direct order creation and reservation should rely on fresh 1C validation rather than stale cart snapshots.

## Price Changes Before Submission

If the price changes before submission, the portal should not silently submit using outdated values.

Possible outcomes:

- Show the updated price and ask the partner to confirm.
- Convert the direct order into a manager approval request.
- Block submission until the partner refreshes the cart.
- Route special price differences to manager review.

The chosen behavior should depend on partner access profile and Novotech commercial policy.

## Stock Changes Before Submission

If stock changes before submission, the portal should revalidate and update the cart or order draft.

Possible outcomes:

- Allow the partner to reduce quantity.
- Mark the item as unavailable.
- Offer visible analogs if allowed.
- Create an order request for manager review.
- Allow backorder only if business rules support it.
- Block reservation if 1C cannot confirm stock.

The portal should not confirm unavailable stock unless 1C accepts the order or reservation according to official rules.

## Notifications and Manager Tasks

The orders domain should support future notifications and manager tasks for operational clarity.

Partner-facing notifications may include:

- Order request submitted.
- Order request approved or rejected.
- Price changed before submission.
- Stock changed before submission.
- Order created in 1C.
- Reservation confirmed, rejected, partial, or expired.
- Order status changed in 1C.

Manager tasks may include:

- Review new order request.
- Review changed price.
- Review changed stock or unavailable item.
- Approve special price request.
- Resolve failed 1C order creation.
- Resolve failed or partial reservation.
- Contact partner for clarification.

Notifications should not expose hidden prices, hidden stock, or sensitive finance details to partners without permission.

## Data From 1C

1C owns official order and commercial data, including:

- Confirmed orders after creation.
- Official order numbers and identifiers.
- Official order statuses.
- Official order items after creation.
- Accepted reservations.
- Product availability used for final order processing.
- Prices used for official order processing.
- Currency and commercial terms.
- Warehouse and fulfillment data.
- Invoices and shipment documents.
- Cancellation, fulfillment, and accounting states.

The portal may display synchronized 1C data according to access rules, but it must not redefine official order truth.

## Data Owned Only by the Portal

The portal owns pre-1C workflow data, including:

- Carts.
- Cart items.
- Order drafts.
- Order requests before 1C creation.
- Manager approval state.
- Partner-facing submission comments.
- Portal validation results.
- Price and stock snapshots used for partner display.
- 1C submission attempts and integration status.
- Portal notification state.
- Manager task state.
- Partner-facing audit history for draft and request workflows.

Portal-owned order data becomes historical workflow context after 1C creates the official order.

## MVP Scope

The orders MVP should include:

- Partner cart concept.
- Cart item validation.
- Order draft or order request concept.
- Permission separation between cart creation, order request, direct order creation, reservation, and manager approval.
- Price and stock validation before submission.
- Handling for price changes before submission.
- Handling for stock changes before submission.
- New order creation request to 1C.
- Product reservation request to 1C if enabled.
- 1C order reference after successful order creation.
- Basic synchronization of 1C order status back to the portal.
- Clear failure state when 1C order creation fails.

The MVP should prioritize correctness, traceability, and safe handoff to 1C over advanced convenience.

## Non-Goals for MVP

The MVP should not include:

- Portal ownership of official orders after creation.
- Editing official 1C orders directly from the portal.
- Full order management replacement for 1C.
- Complex fulfillment management.
- Warehouse picking, packing, or shipping operations.
- Full backorder automation unless explicitly approved.
- Automatic credit approval workflows.
- Complex quote negotiation engine.
- Retail checkout patterns for anonymous buyers.
- Payment processing inside the portal.
- Invoice generation inside the portal.
- Advanced promotion stacking or price simulation.

## Edge Cases

- Partner is suspended after adding items to cart.
- Partner access profile changes while a cart is active.
- Product becomes hidden after being added to cart.
- Product becomes inactive or discontinued before submission.
- Price changes after partner reviews cart but before 1C creation.
- Stock changes after partner reviews cart but before reservation.
- 1C accepts order creation but reservation fails.
- 1C accepts partial reservation.
- 1C rejects order creation with a business validation error.
- 1C is unavailable during submission.
- Duplicate submission happens because of retry or browser refresh.
- Manager approves an order request after prices or stock have changed.
- Partner submits a cart with mixed currencies.
- Partner requests quantity below minimum pack or above allowed quantity.
- Partner tries to submit hidden prices or stock through copied data or stale browser state.
- Cart contains items from old snapshots with different access permissions.
- 1C order reference is created, but portal sync fails afterward.

Edge cases should use safe defaults: avoid confirming orders, prices, reservations, or stock unless 1C has accepted the relevant action.

## Future Extensions

Possible future extensions include:

- Saved carts and reusable order templates.
- Bulk cart import from spreadsheets.
- Fast order table integration.
- Approval workflow with comments and change requests.
- Special price request workflow.
- Backorder support.
- Partial shipment visibility.
- Order cancellation request workflow.
- Order change request workflow.
- Partner-specific order limits.
- Finance approval integration.
- Credit-limit-aware checkout.
- Manager dashboards for order exceptions.
- Partner notifications for status changes.
- Integration event log for 1C order creation and reservation.
- Duplicate submission protection with idempotency rules.
- Order analytics by partner, brand, category, and manager.

Future extensions should preserve the same boundary: the portal manages partner-facing workflow, and 1C remains the source of truth for official orders.
