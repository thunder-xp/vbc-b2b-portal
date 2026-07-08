# Module Communication

## Purpose

This document defines how modules communicate in the Novotech Partner Platform.

The goal is to keep domain ownership clear, prevent accidental coupling, and protect the boundaries between the portal, Supabase, and 1C.

## Dependency Direction

Preferred dependency direction:

```text
UI / Routes
  -> Server Actions
    -> Domain Services
      -> Repositories
        -> Supabase

Domain Services
  -> Integration Layer
    -> 1C

Domain Services
  -> Shared Auth / Access / Logging Utilities
```

Dependencies should point inward toward domain and infrastructure boundaries, not sideways into unrelated internals.

## Modules That May Communicate

### Orders

Orders may communicate with:

- Partners for partner company and user context.
- Access for order permissions.
- Catalog for product identity and visibility.
- Pricing for current price validation.
- Inventory for stock validation and reservation eligibility.
- Documents for future order document visibility.
- Finance for future credit-risk checks.
- Notifications for order events.
- Integration layer for 1C order creation and reservation.

Orders should communicate through services, not repositories from other modules.

### Catalog

Catalog may communicate with:

- Access for product visibility.
- Pricing for price display composition where needed.
- Inventory for availability display composition where needed.
- Documents for product document links.
- Integration layer for catalog sync.

Catalog must not own pricing, stock, or order workflow.

### Pricing

Pricing may communicate with:

- Access for price visibility.
- Partners for partner company context.
- Integration layer for 1C price reads.
- Orders for checkout validation through service calls.

Pricing must not own product master data or order creation.

### Inventory

Inventory may communicate with:

- Access for stock visibility.
- Catalog for product references through service-level contracts.
- Integration layer for 1C stock reads and reservation writes.
- Orders for stock validation and reservation workflow.

Inventory must not own order submission.

### Partners

Partners may communicate with:

- Access for profile assignment.
- Admin for manager workflows.
- Notifications for lifecycle events.
- Integration layer for partner references from 1C.

Partners must not own catalog, finance, or order truth.

### Documents

Documents may communicate with:

- Access for document visibility.
- Catalog for product document context.
- Orders for order document context.
- Finance for accounting document permissions.
- Integration layer for 1C document metadata.
- Notifications for document available events.

Documents must not expose files without access checks.

### Finance

Finance may communicate with:

- Access for finance permissions.
- Partners for partner company context.
- Orders for future credit-limit-aware checkout.
- Documents for invoice/accounting document access.
- Integration layer for 1C finance reads.

Finance must not calculate official accounting truth.

### Notifications

Notifications may receive events from:

- Orders.
- Reservations/inventory.
- Pricing.
- Catalog.
- Documents.
- Partners.
- Admin.
- Integration layer failure reporting.

Notifications must recheck recipient eligibility and avoid leaking restricted data.

### Admin

Admin may coordinate:

- Partner approval.
- Access profile assignment.
- Manager tasks.
- Integration failure review.
- Domain configuration.

Admin should use domain services rather than editing domain repositories directly.

## Modules That Must Never Communicate Directly

Forbidden direct communication:

- UI to repositories.
- UI to 1C.
- Repositories to 1C.
- Repositories to UI.
- Catalog repository to pricing repository.
- Order UI to pricing repository.
- Notifications directly reading sensitive finance data without finance/access service.
- Admin screens directly mutating domain persistence without domain service.
- Client Components importing server-only modules.

When a module needs data from another module, it should call that module's public service interface.

## Event Propagation

Events describe something that happened in the business workflow.

Examples:

- Partner approved.
- Access profile changed.
- Product cache synced.
- Price changed.
- Stock changed.
- Cart submitted.
- Order request created.
- Manager approved request.
- 1C order created.
- Reservation confirmed.
- 1C integration failed.
- Document became available.

Initial implementation may propagate events synchronously through service calls and logs. Future implementation may introduce asynchronous event handling.

Event rules:

- Events should include domain-safe metadata.
- Events should not contain secrets.
- Events should not include restricted data unless the consumer is allowed to receive it.
- Events should be logged where they affect audit, integration, or partner-visible workflow.

## Integration Layer

The integration layer is the only path to 1C.

It provides:

- Product sync.
- Category/brand sync.
- Price reads.
- Stock reads.
- Partner/contract reads.
- Order creation.
- Product reservation.
- Invoice, debt, and credit-limit reads.
- Order status sync.

Domain services call integration operations. Integration operations do not call UI code and do not decide partner-facing visibility.

## Admin Communication

Admin workflows may span multiple domains, but they must respect domain ownership.

Examples:

- Access profile assignment uses access services.
- Partner approval uses partner services.
- Order request approval uses order services.
- Finance visibility changes use access and finance services.
- Integration failure review uses integration logs and relevant domain services.

Admin override should be explicit, audited, and narrow.

## Partner Portal Communication

Partner portal workflows should use composed service responses.

Examples:

- Catalog page receives products already filtered by access profile.
- Product card receives allowed price and stock views only.
- Cart receives item validation state from order service.
- Finance page receives only finance data permitted for the partner company.
- Notifications contain only access-safe content.

The partner portal should never assemble sensitive visibility rules from raw data in the browser.

## Future Asynchronous Communication

Future asynchronous communication may use queues, jobs, or event streams.

Candidate flows:

- 1C sync jobs.
- Order creation retries.
- Reservation retries.
- Notification delivery.
- Manager task creation.
- Cache invalidation.

Asynchronous communication must preserve:

- Idempotency for writes.
- Correlation IDs.
- Audit logs.
- Failure visibility.
- Access-safe payloads.
