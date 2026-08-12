# Retail and Installation Marketplace Architecture

## Status

This document is the authoritative architecture baseline for the Novotech Retail and Installation Marketplace. It defines boundaries and implementation constraints; it does not authorize real payment processing or unresolved 1C mappings.

**The real MAIB integration is intentionally deferred to the final functional phase.** The Payment domain is designed now so downstream domains remain provider-neutral, but provider-specific implementation comes later.

## Product Purpose

The CCTV-only MVP lets a retail customer calculate a system, buy equipment, materials, installation, and commissioning from Novotech in one commercial order, and have the installation fulfilled by an approved partner or a Novotech internal team. Novotech remains the customer-facing seller and controls the financial flow.

The Retail Marketplace is not CRM, a partner bidding system, an accounting system, or a replacement for the existing B2B Partner Platform.

## Bounded Contexts

```text
nsd.md public routes
  -> Public Retail Experience
  -> Retail Cart and Checkout
  -> Retail Order
       -> Payment boundary -> PaymentProvider adapter -> MAIB later
       -> Retail-to-1C export -> 1C adapter later
       -> Installation Requirement
            -> Assignment Engine
                 -> Partner Provider -> authenticated Partner cabinet
                 -> Internal Team -> authenticated Internal operations
            -> Installation Execution
            -> Settlement projection -> 1C accounting later

Shared inward dependencies:
  Published Catalog Read Model
  Pure deterministic CCTV Calculation Engine
  Governed Retail Installation Tariffs
```

The application remains one modular Next.js application. Public Retail, authenticated Partner control-plane, and Internal operations use separate route layouts, services, DTOs, authorization rules, and cache scopes.

## Ownership and Boundaries

- 1C owns canonical products and materials, authoritative RETAIL source prices, official ERP order/accounting identity, and accounting or payout truth.
- Retail owns guest identity, cart, immutable customer/commercial order snapshots, secure order access, and the relationship to payment and installation.
- Installation Marketplace owns tariffs, provider eligibility, requirements, assignment attempts, execution, and operational settlement projections.
- Payment integration owns provider messages, verification evidence, refunds, and reconciliation. Provider DTOs do not enter Retail entities.
- Existing Partner access control owns who may act for a partner company. Marketplace eligibility independently decides whether that company can receive work.

`PartnerOrder`, B2B contracts, partner procurement prices, B2B Finance, `partner_final_customers`, Estimates, and Service Center are not Retail Marketplace entities. They must not be extended with Retail flags.

## Runtime Surfaces

### Public Retail

Likely routes are `/`, `/catalog`, `/products/[slug]`, `/calculator/cctv`, `/cart`, `/checkout`, and a token-scoped order route. Exact route names may follow existing conventions during implementation. Anonymous pages use only the public Retail projection and never initialize Partner Shell context.

### Partner Cabinet

Installation work appears as a separate future domain such as `Заказы на монтаж`, not inside B2B procurement orders. Partner users require an active company membership, effective additive capability, and an eligible provider relationship. Initial views are offers, active work, and completed work.

### Internal Operations

Internal operations governs paid Retail orders, assignment failures, manual reassignment, internal-team work, execution issues, and settlement readiness. This is an operational console, not CRM or project-management software.

## Shared Catalog and CCTV Calculation

There is one deterministic CCTV calculation engine. It contains only technical rules such as camera counts, NVR/HDD/PoE compatibility, cable and governed work quantities.

The B2B Proposal Generator and Public Retail Calculator supply different commercial resolvers and output mappers:

- B2B keeps active-company permissions, Estimates, partner services, and existing behavior.
- Retail uses published RETAIL product facts and published installation tariffs.

Retail must not depend on active company, Partner permissions, Estimates, partner final customers, or partner pricing. Calculator logic must not be forked.

## Retail Order and Payment

A locked Retail Order is an immutable customer and commercial snapshot. It contains canonical product/material lines, contact and address snapshots, currency/VAT, totals, calculation and commercial versions, and correlation/idempotency identities.

Retail Order state is deliberately coarse:

```text
draft -> awaiting_payment -> confirmed | expired | cancelled
confirmed -> processing -> completed
confirmed | processing -> cancellation_pending -> cancelled | processing
```

`expired` may carry a reason such as `payment_window_expired`; payment-provider state is not copied into the order status.

Payment has a separate aggregate and lifecycle. Partner refusal, 1C failure, installation reassignment, or settlement state never changes payment state.

Activation after verified payment is idempotent and enqueues installation activation, Retail-to-1C export, and assignment dispatch. Slow downstream systems do not block customer confirmation.

## Installation Marketplace

Novotech publishes fixed, versioned customer-facing tariffs. Installers neither bid nor define the retail price. A paid-order-derived Installation Requirement snapshots the detailed work, geography, requested period, tariff version, selection mode, and customer installation charge.

An Installation Provider is either `partner_company` or `internal_team`. Both use the same assignment and execution contracts. An internal team is never modeled as a fake partner company.

Every offer is an immutable Assignment Attempt. Decline or timeout creates a new attempt for the next eligible provider. If no partner is eligible, dispatch falls back to an internal team; if none is available, an internal incident is raised. The paid customer order remains valid throughout.

## Selection and Assignment Engine

Hard eligibility filters are active status, Marketplace approval, CCTV competency, geographic coverage, capacity, and no suspension. MVP ranking is deterministic: geography specificity, lowest governed workload ratio, oldest last-offered timestamp, then stable provider ID. Quality signals may be introduced only after sufficient governed evidence exists.

Customer-selected providers are revalidated at activation. Selection and automatic dispatch serialize on the Installation Requirement so they cannot create competing active offers.

## Privacy Transition

Before acceptance, a candidate provider sees only approximate locality, system/work scope, requested period, expected provider compensation, and response deadline. After acceptance, explicit authorization unlocks the minimum customer name, phone, exact address, and instructions required to perform the work.

Other providers have zero visibility. Public and partner DTOs never expose Novotech margin, another provider's compensation, partner commercial conditions, raw payment-provider evidence, raw 1C identifiers, or unrelated customer history.

## Execution and Settlement

Execution progresses through scheduling, scheduled, in progress, provider completion, customer confirmation pending, and customer confirmed, with governed issue/dispute branches. Customer-confirmation timeout is configurable and cannot be hard-coded before business approval.

Portal settlement is an operational projection:

```text
customer installation charge
- governed versioned Novotech commission
= provider payable
```

Commission rules may be percentage- or fixed-amount based. Settlement eligibility requires completion, customer confirmation or an approved timeout policy, and no active dispute. 1C remains accounting and payment truth.

## Integration Boundaries

Retail communicates with provider-neutral Payment and Retail-to-1C ports. Provider payloads remain in integration adapters. Future 1C export contains canonical equipment/material lines and one aggregate service, `Instalarea sistemului`; detailed installation work remains Portal-owned.

No ERP value may be guessed. Retail 1C implementation remains blocked on the retail counterparty, contract, organization, price type, currency, VAT, service GUID, tabular section, payment representation, and read-back semantics.

## Performance Invariants

- No live 1C or MAIB call during rendering.
- No Partner Shell bootstrap on public routes.
- No direct Supabase queries from UI.
- No N+1 queries, installer fan-out, or ranking in React.
- Public pages use bounded, local, versioned projections and cached/server rendering.
- Projection publication is atomic; failed refresh preserves the prior valid projection.
- Checkout and token-scoped order reads are dynamic but bounded.
- External integrations, dispatch, deadlines, export, and settlement run asynchronously and idempotently.
- Public Retail is designed for lower latency than the authenticated Partner cabinet.

## Feature and Release Governance

Rollout controls are separate from permissions and distinguish disabled, internal/staging, controlled pilot, public calculation, checkout enabled, and payment enabled. A non-production payment simulator may run only server-side, in an explicitly allowed non-production environment, under internal permission, with reason, idempotency, and immutable audit evidence.

Production must never simulate payment. Before approved payment integration, production may expose calculation or controlled review but must not activate orders as financially paid.

## Failure and Recovery

- Duplicate checkout returns the existing order for the same fingerprint.
- Payment callback replay is deduplicated by provider event identity.
- Failed or unknown 1C export enters reconciliation without changing payment.
- Partner decline/timeout reassigns installation without changing order or payment.
- Failed projection refresh leaves the prior public snapshot active.
- Worker overlap is prevented with row claims, unique constraints, and narrowly justified locks.
- Every automated transition carries a deterministic idempotency key and correlation ID.

## Explicit Non-Goals

MVP excludes CRM, leads, bidding, partner-defined retail prices, AI selection, marketplace chat, subscriptions, partner payment collection, automated payouts, multi-installer jobs, full project management, non-CCTV calculators, loyalty redesign, and early MAIB implementation.

## Approved Implementation Sequence

1. Architecture baseline.
2. Shared CCTV calculation boundary.
3. Public Retail projection.
4. Public CCTV calculator.
5. Guest identity and secure customer access.
6. Retail cart.
7. Checkout and locked unpaid Retail Order.
8. Non-production payment simulator.
9. Installation tariffs and provider registry.
10. Installer selection and assignment engine.
11. Partner installation orders.
12. Internal Marketplace operations.
13. Execution lifecycle.
14. Customer status and confirmation.
15. Settlement projection.
16. Retail-to-1C export after ERP contract approval.
17. MAIB Payment Layer.
18. Refund, reconciliation, and fiscal hardening.
19. Controlled production pilot.
