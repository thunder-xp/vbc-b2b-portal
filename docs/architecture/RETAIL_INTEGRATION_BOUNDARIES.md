# Retail Integration Boundaries

## Status

This document defines future integration ports. It does not approve provider implementation or authoritative external values.

## PaymentProvider Boundary

**MAIB implementation is deferred to the final functional Marketplace phase.** The Retail domain speaks only in normalized internal payment concepts.

A future provider adapter may support these capabilities after provider documentation is approved:

- create an external payment attempt;
- query normalized status;
- verify inbound callback/webhook evidence;
- request full or partial refund;
- reconcile provider and Portal records.

Exact method shapes, callback fields, signatures, and state mappings must follow confirmed MAIB contracts. MAIB DTOs, credentials, raw callbacks, error bodies, and provider-specific statuses remain inside the integration/payment module and do not leak into Retail Order.

Provider acceptance means handoff only. Only verified normalized evidence may transition a Payment Attempt to `paid`.

## Governed Non-Production Simulator

Marketplace development may use a simulated transition from `pending` to `paid`, but only when all conditions hold:

- runtime environment is explicitly non-production;
- an explicit simulator feature gate is enabled;
- actor has a dedicated internal permission;
- invocation is server-only and not exposed to anonymous traffic;
- order, attempt, amount, reason, actor, environment, correlation, and idempotency are audited;
- evidence is visibly marked `simulated`;
- the simulator emits the same normalized payment-confirmed command used by real adapters.

Production rejects simulated payment unconditionally, including for anonymous users, pilot users, and internal operators. Production acceptance before MAIB stops at unpaid order or uses a non-production environment.

## Payment Activation Contract

Verified payment processing atomically records the deduplicated payment event and an idempotent Retail activation/outbox command. Downstream installation activation, 1C export, assignment, and notifications are asynchronous. Their failure does not undo verified payment.

Callbacks are authenticated by the future adapter, deduplicated by provider event identity, checked against expected order/attempt/amount/currency, and safe against replay or out-of-order delivery.

## Retail-to-1C Boundary

Retail uses a neutral `RetailOrderExportPort`. Its input is a locked, activated Retail commercial snapshot; its output is normalized submission, external identity, read-back, or reconciliation evidence.

Future 1C export contains:

- canonical equipment/material inventory lines;
- one aggregate installation service, `Instalarea sistemului`.

Detailed work lines, assignment, provider compensation, commission, and execution remain Portal-owned and are not expanded into the customer order.

The existing B2B order adapter's idempotency, unknown-outcome reconciliation, and read-back patterns are reusable. Its partner counterparty, contract, price-type, company, and product-only assumptions are not Retail contracts and must not be reused blindly.

## Unresolved 1C Contracts

Implementation remains blocked until authoritative evidence confirms:

- retail counterparty strategy;
- customer contract;
- organization;
- price type;
- currency and exchange-rate rules;
- VAT and fiscal treatment;
- `Instalarea sistemului` service GUID and unit;
- correct tabular section and service-line shape;
- payment representation;
- order posting responsibility;
- read-back and reconciliation semantics;
- cancellation/refund representation.

No GUID, enum, contract, or payload field may be guessed or inferred from names.

## Public Projection Boundary

The public Retail projection is local, versioned, and atomically published from approved catalog and commercial read models. It may expose published product identity, slug/name, public description, approved images, RETAIL snapshot, safe availability, selected specifications, category/brand, and calculator eligibility.

It must not expose partner/procurement prices, contracts, debts, margins, company-scoped data, raw 1C references, sync diagnostics, or integration payloads. Failed publication preserves the prior valid projection. Public rendering makes no live 1C or payment-provider call.

The canonical implementation lives in `src/modules/public-retail`. Anonymous consumers use only its strict DTOs and bounded read service for categories, product pages/details, category facets, structured facet filters, and search. Reads use a cookie-free anonymous client and never resolve Partner identity or company context. A Service Role publisher builds an immutable candidate snapshot, validates its checksum and counts, and switches the current publication atomically; publication credentials and source identities are not part of the public runtime.

## Operational Reliability

- External commands use idempotency keys and request fingerprints.
- Provider events and export results have unique external identities.
- Unknown outcomes enter reconciliation rather than blind retry.
- Outbox workers use bounded claims, stale-claim recovery, and failure isolation.
- Logs use correlation IDs and safe classifications without credentials, tokens, PII, or raw payloads.
- Integration health is internal-only and never blocks public catalog rendering.
