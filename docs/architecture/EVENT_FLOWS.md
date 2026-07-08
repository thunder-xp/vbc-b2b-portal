# Event Flows

This document describes key business event flows for the Novotech Partner Platform. Each flow identifies the trigger, actor, systems involved, data movement, failures, and audit or logging requirements.

## Partner Registration

### Trigger

A new partner company needs portal access.

### Actor

Novotech manager, admin, or future controlled partner request process.

### Steps

1. Partner company is identified for portal onboarding.
2. Basic partner information is checked against 1C partner records.
3. Portal registration workflow creates or prepares portal-side onboarding state.
4. Partner remains pending until Novotech approval.

### Systems Involved

Portal, Supabase, 1C.

### Data Read

Partner company reference data from 1C.

### Data Written

Portal onboarding state, pending partner status, audit log.

### Failure Cases

- Partner company not found in 1C.
- Duplicate partner record.
- Missing required contact details.
- 1C unavailable during verification.

### Audit / Logging Requirements

Log who initiated registration, partner reference used, source checks, duplicate warnings, and failure reason.

## Partner Approval

### Trigger

A pending partner is ready for Novotech review.

### Actor

Novotech manager or admin.

### Steps

1. Manager reviews partner company context.
2. Manager confirms that the partner may access the portal.
3. Portal status changes from pending to approved or active.
4. Access assignment may follow immediately or as a separate event.

### Systems Involved

Portal, Supabase, 1C.

### Data Read

Partner master data and commercial context from 1C if needed.

### Data Written

Portal partner status, audit log, optional manager task completion.

### Failure Cases

- Partner data in 1C is unclear.
- Manager lacks permission.
- Partner is already archived or suspended.

### Audit / Logging Requirements

Log approver, previous status, new status, timestamp, and notes.

## User Login

### Trigger

A partner user, manager, or admin signs in.

### Actor

Portal user.

### Steps

1. User authenticates through portal auth.
2. Portal loads user context.
3. Portal resolves partner company or internal role.
4. Portal applies partner status and access profile for partner users.

### Systems Involved

Portal, Supabase, future auth provider.

### Data Read

User record, partner membership, access profile, partner status, role.

### Data Written

Login audit, session-related metadata where applicable.

### Failure Cases

- Invalid credentials.
- User has no partner company.
- Partner company is suspended or archived.
- User role is missing or inconsistent.

### Audit / Logging Requirements

Log successful and failed login attempts according to security policy without storing secrets.

## Access Profile Assignment

### Trigger

Novotech decides what a partner company can see and do.

### Actor

Novotech manager or admin.

### Steps

1. Manager reviews partner status, loyalty level, turnover, and strategic importance.
2. Manager selects or updates access profile.
3. Portal saves visibility and order permissions.
4. Permissions apply to all users of the partner company.

### Systems Involved

Portal, Supabase, optional 1C read context.

### Data Read

Partner profile, loyalty level, commercial context from 1C if needed.

### Data Written

Access profile, permission switches, audit log.

### Failure Cases

- Manager lacks permission.
- Partner is archived.
- Invalid permission combination.
- Sensitive finance permissions enabled without required review.

### Audit / Logging Requirements

Log old profile, new profile, changed permissions, actor, timestamp, and business note.

## Catalog Sync From 1C

### Trigger

Scheduled sync, manual sync, or future 1C change event.

### Actor

System.

### Steps

1. Portal integration layer requests product data from 1C.
2. Portal receives products, categories, brands, attributes, analogs, and document references.
3. Portal updates catalog cache and sync metadata.
4. Catalog search uses updated cache.

### Systems Involved

1C, portal integration layer, Supabase.

### Data Read

Product and catalog data from 1C.

### Data Written

Catalog cache, sync timestamps, integration log.

### Failure Cases

- 1C timeout.
- Partial product sync.
- Invalid product data.
- Category or brand mismatch.

### Audit / Logging Requirements

Log sync start/end, counts, failures, duration, source timestamp, and partial sync details.

## Price Sync From 1C

### Trigger

Scheduled sync, on-demand validation, manager request, checkout validation, or future 1C event.

### Actor

System or manager-triggered operation.

### Steps

1. Portal requests relevant price data from 1C.
2. 1C returns price, individual price, currency, price type, and validity data.
3. Portal stores scoped price snapshot.
4. Portal applies price visibility rules before display.

### Systems Involved

1C, portal integration layer, Supabase.

### Data Read

Prices and commercial terms from 1C.

### Data Written

Price cache, sync metadata, integration log.

### Failure Cases

- 1C unavailable.
- Partner-specific price missing.
- Currency mismatch.
- Price changed during checkout.

### Audit / Logging Requirements

Log partner scope, product scope, result status, timestamp, and failures without leaking sensitive prices broadly.

## Stock Sync From 1C

### Trigger

Scheduled sync, product view, cart validation, reservation request, checkout validation, or future 1C event.

### Actor

System.

### Steps

1. Portal requests stock data from 1C.
2. 1C returns stock balance and warehouse data where allowed.
3. Portal stores stock snapshot.
4. Portal converts raw stock into partner-visible availability based on access profile.

### Systems Involved

1C, portal integration layer, Supabase.

### Data Read

Stock balances and warehouse data from 1C.

### Data Written

Stock cache, availability view, sync metadata, integration log.

### Failure Cases

- 1C timeout.
- Stock changed during checkout.
- Warehouse data incomplete.
- Exact stock unavailable.

### Audit / Logging Requirements

Log sync scope, freshness, result, failures, and partial updates.

## Product Search

### Trigger

Partner user searches the catalog.

### Actor

Partner user.

### Steps

1. User enters product name, article, brand, category, attribute, or analog.
2. Portal searches cached catalog data.
3. Portal applies partner visibility rules.
4. Portal returns only allowed results with allowed price and stock depth.

### Systems Involved

Portal, Supabase.

### Data Read

Catalog cache, access profile, partner status, price/stock snapshots if shown.

### Data Written

Optional search analytics or audit for sensitive searches.

### Failure Cases

- Cache unavailable.
- Product hidden by access profile.
- Stale price or stock snapshot.

### Audit / Logging Requirements

Log sensitive access or unusual failures in future implementation. Do not log unnecessary personal search content unless approved.

## Add to Cart

### Trigger

Partner user adds a product to cart.

### Actor

Partner user.

### Steps

1. Portal verifies partner status and cart permission.
2. Portal verifies product is visible and orderable for partner.
3. Portal adds cart item with requested quantity and current display snapshot.
4. Cart remains non-official until validated and submitted.

### Systems Involved

Portal, Supabase, optional 1C on-demand read.

### Data Read

Product visibility, access profile, current price/stock snapshot.

### Data Written

Cart item, validation state, audit log where needed.

### Failure Cases

- Product hidden or inactive.
- Partner suspended.
- Quantity invalid.
- Price or stock unavailable.

### Audit / Logging Requirements

Log cart mutation and blocked attempts where security or access rules are involved.

## Checkout Validation

### Trigger

Partner starts checkout or submits cart.

### Actor

Partner user.

### Steps

1. Portal reloads partner status and access profile.
2. Portal validates product visibility and order permissions.
3. Portal revalidates prices and stock with 1C or sufficiently fresh approved snapshots.
4. Portal identifies changed prices, changed stock, invalid quantities, and missing data.
5. Portal allows submission, requests partner confirmation, or routes to manager approval.

### Systems Involved

Portal, Supabase, 1C.

### Data Read

Cart, cart items, access profile, partner status, current prices, current stock.

### Data Written

Validation results, cart item status, integration log.

### Failure Cases

- 1C unavailable.
- Price changed.
- Stock changed.
- Partner suspended.
- Product no longer visible.

### Audit / Logging Requirements

Log validation result, changed values by category, 1C calls, failures, and decision path.

## Order Request Submission

### Trigger

Partner submits an order that requires manager approval.

### Actor

Partner user.

### Steps

1. Portal validates cart and permissions.
2. Portal creates order request.
3. Portal creates manager task.
4. Portal notifies partner that request is submitted.

### Systems Involved

Portal, Supabase, optional 1C validation.

### Data Read

Cart, cart items, partner access profile, validation results.

### Data Written

Order request, manager task, notification, audit log.

### Failure Cases

- Validation fails.
- Partner lacks request permission.
- Manager task creation fails.

### Audit / Logging Requirements

Log submitter, request content summary, validation state, and manager task creation.

## Direct Order Creation

### Trigger

Partner with direct order permission submits a validated cart.

### Actor

Partner user.

### Steps

1. Portal validates direct order permission.
2. Portal performs final price and stock validation.
3. Portal sends order creation request to 1C.
4. Portal stores 1C order reference after success.
5. Portal updates cart/order state and notifies partner.

### Systems Involved

Portal, Supabase, 1C.

### Data Read

Cart, access profile, current prices, current stock, partner/company references.

### Data Written

1C order, portal integration log, 1C order reference, portal order status.

### Failure Cases

- 1C rejects order.
- 1C timeout.
- Duplicate submission risk.
- Price or stock changed.

### Audit / Logging Requirements

Log final validation, 1C request/response metadata, order reference, failure reason, and retry state.

## Manager Approval

### Trigger

Order request or exception requires review.

### Actor

Novotech manager or admin.

### Steps

1. Manager opens task.
2. Portal shows request, validation state, and relevant partner context.
3. Manager approves, rejects, requests changes, or escalates.
4. Approved request proceeds to final validation before 1C order creation.

### Systems Involved

Portal, Supabase, optional 1C validation.

### Data Read

Order request, partner profile, cart lines, price/stock state, access profile.

### Data Written

Approval decision, comments, task state, audit log.

### Failure Cases

- Manager lacks permission.
- Request became stale.
- Partner suspended before approval.
- Price/stock changed after review.

### Audit / Logging Requirements

Log decision, manager, timestamp, notes, old state, new state, and whether final validation is required.

## 1C Order Creation

### Trigger

Approved request or direct order is ready for official creation.

### Actor

System.

### Steps

1. Portal prepares 1C order payload.
2. Portal sends request through integration layer.
3. 1C validates and creates official order.
4. 1C returns order reference.
5. Portal stores reference and marks order as confirmed by 1C.

### Systems Involved

Portal integration layer, 1C, Supabase.

### Data Read

Validated order data, partner reference, product references, prices, quantities.

### Data Written

Official 1C order, 1C order reference, integration log.

### Failure Cases

- 1C validation error.
- Timeout.
- Partial response.
- Duplicate retry.

### Audit / Logging Requirements

Log correlation ID, operation type, payload summary, response status, 1C reference, and errors.

## Product Reservation

### Trigger

Reservation is required or requested for allowed partner/order.

### Actor

Partner user, manager, or system depending on workflow.

### Steps

1. Portal validates reservation permission.
2. Portal validates current stock with 1C.
3. Portal sends reservation request to 1C.
4. 1C accepts, rejects, or partially accepts.
5. Portal stores reservation reference and status.

### Systems Involved

Portal, Supabase, 1C.

### Data Read

Partner status, reservation permission, stock, product, order context.

### Data Written

1C reservation if accepted, portal reservation request state, integration log.

### Failure Cases

- Partner lacks reservation permission.
- Stock unavailable.
- 1C rejects reservation.
- Partial reservation.
- Reservation expires.

### Audit / Logging Requirements

Log requester, product, quantity, partner, 1C result, expiration if available, and failures.

## Order Status Sync

### Trigger

Scheduled sync, partner opens order, manager opens order, or future 1C event.

### Actor

System.

### Steps

1. Portal requests order status from 1C.
2. Portal updates cached order status.
3. Portal displays status according to partner permissions.
4. Portal creates notification if status changed and notification rules allow it.

### Systems Involved

1C, portal integration layer, Supabase.

### Data Read

1C order status and order reference data.

### Data Written

Order status cache, sync timestamp, notification, integration log.

### Failure Cases

- 1C unavailable.
- Unknown 1C order reference.
- Status mapping missing.

### Audit / Logging Requirements

Log sync attempt, changed status, failures, and mapping issues.

## Partner Suspension

### Trigger

Novotech decides partner access must be restricted or blocked.

### Actor

Novotech manager or admin.

### Steps

1. Manager reviews suspension reason.
2. Portal partner status changes to suspended.
3. Portal blocks normal order, reservation, price, stock, and document access according to policy.
4. Existing carts and requests are marked blocked or requiring review.

### Systems Involved

Portal, Supabase, optional 1C read context.

### Data Read

Partner profile, open carts, open requests, access profile.

### Data Written

Partner status, audit log, manager notes, task updates.

### Failure Cases

- Manager lacks permission.
- Open direct order submission is in progress.
- Partner has unresolved 1C references.

### Audit / Logging Requirements

Log actor, reason, previous status, new status, affected workflow counts, and timestamp.

## 1C Outage During Checkout

### Trigger

Partner attempts checkout while 1C is unavailable or timing out.

### Actor

Partner user and system.

### Steps

1. Portal starts checkout validation.
2. Portal attempts required 1C validation for price, stock, order, or reservation.
3. 1C does not respond or returns unavailable state.
4. Portal blocks direct confirmation.
5. Portal may save draft, create manager-review request, or ask partner to retry depending on policy.

### Systems Involved

Portal, Supabase, 1C.

### Data Read

Cart, access profile, cached price/stock snapshots, 1C validation attempt.

### Data Written

Validation failure state, optional order request, manager task, integration log.

### Failure Cases

- Cached data is stale.
- Partner expects direct order but confirmation is impossible.
- Retry creates duplicate risk if not controlled.

### Audit / Logging Requirements

Log outage signal, failed operation, checkout state, partner impact, retry decision, and manager task if created.
