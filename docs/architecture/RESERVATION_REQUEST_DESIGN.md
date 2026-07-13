# Reservation Request Design

## Purpose

Reservation requests convert an approved project specification into a controlled operational request for Novotech staff. They are portal-owned workflow records, not CRM records, shopping carts, ERP orders, or confirmed 1C reservations.

## Ownership And 1C Boundary

- The portal owns reservation request drafts, requested quantities, review status, approved quantities, and partner/manager comments.
- The approved specification remains immutable and is never overwritten.
- Product identity and submitted prices are copied from the approved specification snapshot for auditability.
- Current stock and nearest supplier arrival remain 1C-owned read-model data and are never persisted as reservation truth.
- The integration layer exposes sales-order export but no verified reservation export contract. This sprint performs no 1C write and adds no speculative provider method.

## Schema

`reservation_requests` identifies the partner company, specification root, approved revision, creator, status, requested delivery date, comments, and review audit fields. A partial unique index allows at most one non-rejected/non-cancelled request per approved revision.

`reservation_request_items` stores the product reference, immutable product and price snapshots, approved-specification quantity, requested quantity, and final approved quantity. It does not store current stock, warehouse balances, arrivals, ERP reservation identifiers, or order data.

## State Transitions

- Approved specification -> reservation `draft` through an atomic creation RPC.
- `draft` -> `submitted` through an atomic submission RPC.
- `submitted` -> `under_review` through an atomic review-start RPC.
- `under_review` -> `approved`, `partially_approved`, or `rejected` through an atomic decision RPC.
- Submitted and final requests are immutable for partners.

Full approval requires every approved quantity to equal the requested quantity. Partial approval requires at least one positive approved quantity and at least one reduced quantity. Rejection stores zero approved quantities and requires a manager comment.

## Access Model

- Partner access requires an active profile, membership, company, and `reservations.manage` permission.
- Partners may access only requests owned by their active company.
- Draft quantity cannot exceed the immutable approved specification quantity.
- Internal review requires an active internal/admin profile and `reservations.review`, assigned only to Novotech sales and admin roles.
- Anonymous access is denied. Authenticated table writes are limited to safe draft columns; creation and all transitions use RPCs.

## Boundaries

- Repositories query, persist safe draft fields, and invoke RPCs only.
- Services enforce ownership, permissions, quantity limits, and transition rules, and resolve live availability.
- Server Actions authenticate, validate primitive input, call services, and return safe results.
- React renders DTOs and invokes actions. It does not calculate permissions, quantities, stock, or transitions.

## Routes

- `/cabinet/reservation-requests`
- `/cabinet/reservation-requests/new?specificationId=...`
- `/cabinet/reservation-requests/[id]`
- `/admin/reservation-requests`
- `/admin/reservation-requests/[id]`

## Future Integration

A future sprint may add a neutral reservation provider contract only after the 1C request, response, and idempotency contract is verified. Portal approval must not be represented as a confirmed 1C reservation until 1C accepts it.
