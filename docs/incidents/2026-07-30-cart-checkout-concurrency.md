# Cart checkout concurrency incident

## Production evidence

- Affected partner: ALERT-SS SRL.
- Active cart: `b9b6b68a-8fd2-4623-8d61-f91f13dac8df`.
- Two successful quantity mutations were recorded 1.58 seconds apart.
- The cart parent `updated_at` remained unchanged from cart creation while the
  line timestamps changed.
- No `partner_orders` row exists for the active cart.
- No local order or 1C identity was partially persisted for this attempt.

## Proven failure path

1. Direct quantity input was persisted only on blur.
2. The checkout form had no shared awareness of pending line mutations.
3. Checkout submitted no cart ID or expected intent version.
4. `begin_partner_order_submission` locked the cart but did not compare a
   canonical product/quantity snapshot or intent version.
5. Every repository failure from submission acquisition was converted to
   `ORDER_CART_VERSION_CONFLICT`, regardless of PostgreSQL code or message.

The production message therefore did not prove a database version mismatch.
It combined a real client mutation race with inaccurate server error
classification.

## Repair contract

- Cart-line changes increment a dedicated `carts.intent_version`.
- Price, stock, arrival, analytics, and shipment-date changes do not increment
  that version.
- Quantity mutation, removal, and checkout acquire the cart lock before
  changing or validating lines.
- Checkout compares both the expected intent version and the exact canonical
  product/quantity set before creating a local order.
- The browser flushes direct input and waits for acknowledged mutations before
  requesting the current intent version.
- Only PostgreSQL marker `CART_INTENT_VERSION_CONFLICT` maps to the cross-tab
  cart message. Other persistence failures remain retryable technical errors.
- Existing submission-key and 1C reconciliation behavior remains unchanged.

## Checkout friction release gate

- A qualified active partner completes a healthy checkout in one submit action.
- Recoverable local projection or price freshness is retried at most once before
  durable submission ownership is acquired.
- Current server qualification wins over stale browser presentation state.
- Settlement currency is validated independently from the aligned
  authoritative/published price currency.
- A genuine contract, permission, product, or prior-submission ambiguity remains
  fail-closed and produces no export side effect.
- One submission key and request fingerprint produce at most one portal order
  and one 1C export.
- Normal page rendering performs no live 1C request.
