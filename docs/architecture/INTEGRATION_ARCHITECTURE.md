# Integration Architecture

## Integration Philosophy

The Novotech Partner Platform integrates with 1C as a partner-facing layer, not as a replacement business system.

The core principles are:

- 1C is the single source of truth for commercial, accounting, warehouse, and partner master data.
- The portal never replaces 1C.
- The portal reads data from 1C and may cache it for performance, search, access control, and partner experience.
- The portal writes to 1C only for new order creation and product reservations in the MVP.
- All other data changes must happen in 1C or an approved internal process.
- Portal data that comes from 1C must be treated as a snapshot unless freshly confirmed.
- The portal must remain usable during temporary 1C outages where safe, while blocking actions that require fresh 1C confirmation.
- Integration behavior must be observable, auditable, and understandable for Novotech managers.

The portal should optimize partner experience without weakening 1C ownership of official business truth.

## Synchronized Domains

### Products

Products are read from 1C and cached in the portal for catalog browsing, search, filtering, order preparation, and access-controlled display.

The portal may enrich product presentation, but product identity and official product state belong to 1C.

### Categories

Categories may be read from 1C when available.

The portal may maintain partner-facing category mappings for navigation, but these mappings must not redefine official product ownership or accounting classification in 1C.

### Brands

Brands are read from 1C or another approved master source if 1C delegates brand ownership.

The portal may normalize brand display names for search and filtering.

### Prices

Prices are read from 1C and displayed according to partner access profile.

Partner-specific prices, individual prices, price types, currencies, discounts, and validity rules remain 1C-owned. The portal may cache price snapshots but must revalidate before risky actions such as checkout or order creation.

### Stock

Stock data is read from 1C and displayed according to stock visibility rules.

The portal may show exact stock, warehouse stock, availability ranges, binary availability, or nothing depending on partner access profile. Raw stock truth remains in 1C.

### Warehouses

Warehouse data is read from 1C.

Warehouse-level visibility is sensitive and should only be exposed to partners with explicit access. The portal may cache warehouse metadata and stock snapshots.

### Partners

Official partner company records come from 1C.

The portal may maintain portal-only partner access profiles, partner status for portal access, manager assignment, user membership, and visibility settings.

### Contracts

Contracts and commercial terms come from 1C.

The portal may use contract references to display allowed partner pricing or order context, but it must not become the owner of contract truth.

### Orders

Confirmed orders are owned by 1C after successful creation.

The portal owns carts, order drafts, order requests, approval state, submission attempts, and partner-facing workflow state before 1C creation. After creation, the portal synchronizes and displays the 1C order reference and status.

### Invoices

Invoices are read from 1C and displayed according to partner access profile.

The portal must not create or edit invoices in the MVP.

### Debt

Debt, balance, overdue amount, and payment state are read from 1C and displayed only when finance permissions allow it.

The portal must not calculate official debt independently.

### Credit Limits

Credit limits are read from 1C and displayed only when finance permissions allow it.

Credit-limit checks that affect order acceptance should rely on 1C or approved 1C-derived validation.

## Read Operations

Read operations bring 1C-owned data into the portal for display, search, filtering, access control, and partner workflows.

Read operation principles:

- Reads may be cached when data is safe to cache.
- Reads should record source timestamp or synchronization timestamp where relevant.
- Partner-facing reads must apply access profile rules before data is shown.
- Sensitive reads such as individual prices, debt, balance, and credit limits must be scoped to the correct partner company.
- Search, exports, notifications, and future APIs must apply the same visibility rules as UI screens.
- If required data is unavailable or stale beyond allowed limits, the portal should use safe fallback behavior.

Examples of read operations:

- Import product catalog snapshots.
- Import categories, brands, and product groups.
- Fetch partner-specific prices.
- Fetch stock balances and warehouse availability.
- Fetch partner company and contract references.
- Fetch order status after order creation.
- Fetch invoices, debts, and credit limits for authorized partners.

## Write Operations

In the MVP, write operations to 1C are limited to:

- New order creation.
- Product reservation.

All write operations must be explicit, validated, logged, and traceable.

Write operation principles:

- Validate partner status and access profile before any write.
- Revalidate price and stock before order creation.
- Do not treat a portal request as successful until 1C confirms it.
- Store the 1C reference returned by 1C after a successful write.
- Handle duplicate submissions safely in future implementation.
- Never write product, price, stock, partner, contract, invoice, debt, or credit-limit master data from the portal in the MVP.

If a write to 1C fails, the portal should preserve the portal-side request state and make the failure visible for retry or manager review.

## Sync Strategies

### Realtime

Realtime synchronization means the portal receives or fetches data changes close to the moment they happen in 1C.

Use cases:

- Future order status updates.
- Future stock changes for high-priority products.
- Future price invalidation events.
- Future reservation status changes.

Realtime sync is desirable for sensitive workflows, but it may not be available in the MVP depending on 1C integration capabilities.

### Scheduled

Scheduled synchronization refreshes data at fixed intervals.

Use cases:

- Product catalog cache.
- Categories and brands.
- Standard price snapshots.
- Stock snapshots.
- Partner and contract reference data.
- Invoice, debt, and credit-limit snapshots.

Scheduled sync should define freshness expectations per domain. Stock and partner-specific prices usually need stricter freshness than product descriptions.

### On-Demand

On-demand synchronization refreshes data when the portal needs a current value for a specific workflow.

Use cases:

- Product detail page when cache is stale.
- Cart validation.
- Checkout validation.
- Order submission.
- Reservation request.
- Manager review of order exceptions.
- Viewing sensitive finance data when cache is stale.

On-demand sync is especially important before actions that create financial, legal, or operational commitment.

## Cache Strategy

The portal cache exists for performance, search, partner experience, and controlled access. It does not transfer source-of-truth ownership from 1C.

Cache principles:

- Cache records should include source identity and last synchronization timestamp where relevant.
- Cache freshness rules should be defined per domain.
- Product descriptions and images may tolerate longer freshness windows than stock and prices.
- Individual prices must be scoped to the correct partner company or commercial context.
- Stock cache should be treated as a snapshot.
- Finance data such as debt and credit limit should have strict visibility rules and conservative freshness expectations.
- Stale cache may be shown only where business risk is acceptable and clearly understood.
- Critical actions such as order creation and reservation should use fresh 1C validation.
- Missing cache should degrade gracefully where possible.

Safe cache behavior examples:

- Product catalog can remain searchable during a temporary 1C outage.
- Hidden price should remain hidden even if cached data exists.
- Exact stock should not be shown if the partner only has availability-level access.
- Cart checkout should pause or request refresh when required price or stock data is stale.

## Failure Strategy

### Timeout

Timeouts should be expected and handled explicitly.

Recommended behavior:

- Use clear timeouts for 1C calls.
- Avoid indefinite partner-facing loading states.
- Mark the operation as uncertain, not successful.
- Allow retry where safe.
- Route critical failures to manager review when needed.

### Retry

Retries should be controlled and safe.

Recommended behavior:

- Retry transient read failures where the user experience benefits.
- Retry writes only when duplicate submission risk is controlled.
- Do not create duplicate orders or duplicate reservations.
- Record retry attempts for operational review.
- Use backoff in future asynchronous workflows.

### Partial Failure

Partial failure means part of a synchronization or write operation succeeds while another part fails.

Examples:

- Some products sync successfully, others fail.
- Order creation succeeds but status sync fails.
- Order creation succeeds but reservation fails.
- Reservation is partially accepted.

Recommended behavior:

- Preserve successful parts with their 1C references.
- Mark failed parts clearly.
- Avoid hiding partial failure from managers.
- Do not roll back 1C state from the portal unless 1C provides an approved operation.
- Provide retry or manual resolution path.

### Unavailable 1C

The portal must survive temporary 1C outages.

During 1C outage, the portal may:

- Show cached product catalog if freshness and access rules allow it.
- Show cached documents or read-only historical data if allowed.
- Let partners prepare carts as drafts when safe.
- Show clear messages that final price, stock, order creation, or reservation cannot be confirmed.

During 1C outage, the portal should not:

- Confirm new orders as created.
- Confirm product reservations.
- Invent prices, stock, debt, credit limits, or order statuses.
- Expose data outside access rules.
- Present stale critical data as guaranteed.

## Logging

Integration logging should make every important 1C interaction traceable.

Logs should include:

- Operation type.
- Domain.
- Direction: read or write.
- 1C endpoint or integration action name.
- Portal request ID or correlation ID.
- Partner company context where applicable.
- User or manager context where applicable.
- Start time and finish time.
- Duration.
- Result status.
- Error category if failed.
- Retry count.
- 1C reference returned by successful writes.

Logs must not expose secrets, service keys, full credentials, or unnecessary sensitive commercial payloads.

## Monitoring

Monitoring should help Novotech detect integration problems before partners are seriously affected.

Monitoring should cover:

- 1C availability.
- Integration latency.
- Timeout rate.
- Error rate by domain.
- Failed write operations.
- Failed order creation attempts.
- Failed or partial reservation attempts.
- Cache freshness by domain.
- Last successful synchronization time.
- Queue depth in future asynchronous integration.
- Unresolved manager tasks caused by integration failures.

Operational dashboards should distinguish between read degradation and write failure because write failure has higher business impact.

## Future Asynchronous Integration

Future asynchronous integration may use queues, background workers, scheduled jobs, webhooks, or event streams.

Possible asynchronous patterns:

- 1C change events invalidate or refresh portal cache.
- Portal order creation requests are placed into a durable queue.
- Reservation requests are processed with retry and idempotency controls.
- Order status changes from 1C update portal views asynchronously.
- Product, price, and stock sync jobs run independently with domain-specific freshness rules.
- Failed integration jobs create manager tasks.

Asynchronous integration should provide:

- Idempotency for write operations.
- Dead-letter or failed-job handling.
- Retry with backoff.
- Clear correlation IDs.
- Manager-visible failure state.
- Protection against duplicate orders and duplicate reservations.

The MVP may start simpler, but the architecture should not block migration to asynchronous integration.

## MVP Limitations

The MVP integration should be intentionally narrow.

MVP includes:

- Reading 1C-owned data needed for catalog, partner visibility, pricing, stock, orders, and documents.
- Caching selected data for performance and controlled access.
- Creating new orders in 1C.
- Creating product reservations in 1C if required.
- Syncing basic 1C order status back to the portal.
- Logging integration attempts and failures.
- Safe behavior during temporary 1C outage.

MVP does not include:

- Replacing 1C workflows.
- Editing products in 1C.
- Editing prices in 1C.
- Editing stock or warehouses in 1C.
- Editing partners or contracts in 1C.
- Creating or editing invoices in 1C.
- Updating debt or credit limits from the portal.
- Full bidirectional synchronization.
- Full realtime event integration unless provided and approved.
- Complex integration orchestration or enterprise service bus design.

The MVP should favor correctness, traceability, and conservative failure behavior over broad integration coverage.
