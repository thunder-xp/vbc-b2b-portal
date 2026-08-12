# Retail Order Domain

## Purpose and Boundary

The Retail domain owns the public customer's shopping state and immutable record of what Novotech sold. It is independent from B2B `PartnerOrder`, Partner Finance, Estimates, installation assignment, provider payment states, and 1C export states.

## Retail Customer and Guest Identity

MVP uses a low-friction guest identity based on governed email/phone verification and high-entropy token-scoped access. Plain access tokens are never persisted; only hashes, scope, expiry, use, and revocation evidence are stored.

`partner_final_customers` is partner-company-scoped and must not be reused. A future Retail customer account may reference or adopt guest orders without changing order ownership or historical snapshots.

## Retail Cart

Retail Cart is mutable working state. It contains canonical product/material references and quantities, calculator provenance where applicable, currency context, expiry, and optimistic revision.

Mutations are token/session scoped, bounded, and version checked. A cart expires safely and becomes immutable when converted. Locking a cart and creating its Retail Order and lines is one transactional, idempotent operation.

## Retail Order

Retail Order owns:

- public order number and source;
- guest/customer reference;
- customer contact and delivery/installation address snapshots;
- currency, VAT/tax, product/material totals, installation charge, and total payable;
- calculator/profile and commercial snapshot versions;
- correlation ID, submission key, request fingerprint, timestamps, and optimistic version;
- immutable canonical equipment/material lines with product identity, SKU/name/unit, quantity, unit price, VAT, and line total snapshots.

Live catalog prices must never reconstruct a historical order. Commercial fields and lines are immutable after lock; only governed lifecycle and operational references may progress.

## State Machine

```text
draft -> awaiting_payment
awaiting_payment -> confirmed | expired | cancelled
confirmed -> processing -> completed
confirmed | processing -> cancellation_pending
cancellation_pending -> cancelled | processing
```

`expired` stores a domain reason such as `payment_window_expired`. Retail Order status does not contain PaymentProvider, assignment, 1C export, or settlement states. Customer-facing status is a composed read projection across those domains.

## Payment Relationship

```text
RetailOrder -> PaymentAttempt -> PaymentProvider adapter
```

An order may have multiple failed or expired attempts but only governed successful payment evidence may confirm it. Payment state is independent:

```text
created -> pending -> paid | failed | expired
paid -> refund_pending | disputed
refund_pending -> partially_refunded | refunded | failed
```

Provider acceptance alone is not proof of payment. Provider-specific references and payloads stay behind the integration boundary.

## Activation Boundary

Future real activation is:

```text
locked order
-> PaymentAttempt
-> verified payment
-> idempotent Retail Order activation
-> Installation Requirement activation
-> Retail-to-1C export enqueue
-> assignment dispatch enqueue
```

The payment transition and activation/outbox records are committed atomically. 1C, dispatch, notifications, and other slow systems execute asynchronously and cannot roll back or delay customer payment confirmation.

Before MAIB exists, only the governed non-production simulator may produce normalized payment-confirmed evidence. Production simulation is forbidden.

## Conceptual Persistence Contract

- `retail_customers`: protected guest/customer identity and consent; no public enumeration.
- `retail_order_access_tokens`: hashed, scoped, expiring, revocable access evidence.
- `retail_carts`: mutable, expiring, revisioned cart; at most one governed active cart per identity/session policy.
- `retail_cart_items`: unique canonical product/configuration within a cart.
- `retail_orders`: immutable commercial/contact snapshot after lock; unique public number and submission key.
- `retail_order_lines`: immutable product/material snapshots.
- `retail_order_events`: append-only transition and audit history.
- `retail_payment_attempts`: immutable amount/currency and provider-neutral state; unique idempotency key.
- `retail_payment_events`: append-only, provider-event-deduplicated evidence.

All customer access is token scoped or authenticated to the owning future Retail account. Server code derives ownership; browser-supplied customer/order IDs never establish access.

## Concurrency and Idempotency

- Checkout uses submission key plus request fingerprint and locks the cart.
- One cart can convert to one order.
- Payment attempts use unique provider/idempotency identities.
- Inbound provider events use unique provider event identities.
- Order activation is unique per order and payment confirmation.
- Optimistic revisions reject stale cart and lifecycle writes.
- Automated events use deterministic keys so retries return prior results.

## History, Retention, and Privacy

Order and payment events are append-only. Corrections create explicit events rather than rewriting evidence. Contact snapshots, token evidence, provider evidence, and logs follow approved legal retention and minimization policies. Logs never contain plaintext access tokens, payment credentials, full callbacks, or unnecessary customer PII.
