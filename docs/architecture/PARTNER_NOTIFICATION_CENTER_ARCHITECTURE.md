# Partner Notification Center Architecture

## Decision status

This document is the architecture gate for the Partner Notification Center.
It does not authorize broad implementation or production delivery.

The notification center is a recipient-specific projection of canonical domain
events. It is not a replacement for domain state, an audit log, or behavior
analytics. Notification generation must never call 1C and must never infer a
transition by polling a page read model.

## 1. Existing domain-event inventory

| Domain source | Existing canonical source | Event owner | Existing events/state | Notification decision |
| --- | --- | --- | --- | --- |
| Portal order submission | `partner_orders` and atomic submission/reconciliation RPCs | Orders | Status and integration state exist, but no append-only lifecycle event table | Emit governed events inside the existing atomic RPCs |
| 1C order history | `partner_order_history_events` | Order history sync | `imported`, `received_by_one_c`, `posted`, `became_unposted`, `state_changed`, `delivery_date_changed`, `marked_for_deletion`, `sync_restored` | Project only proven partner-facing transitions |
| Planned shipments | `partner_order_history.one_c_delivery_date` plus order-history events | Order history sync | Authoritative date changes exist; deadline events do not | Create scheduled deadline events from the local read model with date-based deduplication |
| Date-change requests | `partner_order_history_events` and `partner_order_date_change_requests` | Orders | Requested, approved, rejected, cancelled, reflected | Project decision events directly |
| Stock | Atomic `publish_exact_stock_snapshot` and `product_stock_totals` | Stock sync | Snapshot state exists; no per-product transition event | Emit safe transition events during successful atomic publication |
| Supplier arrivals | Atomic stock publication and `product_supplier_arrivals` | Stock sync | Published state exists; no per-product transition event | Emit arrival-added/arrived events during successful publication |
| Prices | Atomic `publish_product_price_snapshot` and `product_prices` | Price sync | Published state and effective time exist; no per-product transition event | Emit visibility-neutral price-change events during successful publication |
| Favorites | System Favorites purchasing list and items | Purchasing lists | Subscription state exists; no notification event required for add/remove | Use current membership as a recipient source when a product event occurs |
| Purchasing lists | `purchasing_list_events`, lists, and items | Purchasing lists | Workflow events exist; product membership is current state | Use active list membership as a recipient source |
| Cart | `carts`, `cart_items`, and order conversion state | Orders | Current state exists; no product-change event | Use active cart membership as a recipient source |
| Estimates | `estimate_events` | Estimates | Created, saved, ready, version, response, conversion events | Project only partner-useful lifecycle events |
| Proposal documents | Generated document status and estimate events | Estimates | PDF creation state exists | Add/emit a canonical ready/failed event at the document state mutation boundary if not already represented |
| Proposal email | `estimate_proposal_deliveries` and delivery attempts | Estimates | Queued/sending/sent/delivered/failed/revoked/responded | Project delivery result without exposing recipient or SMTP details |
| Finance | `partner_finance_sync_events`, sync state, contract balance snapshots | Finance sync | Sync telemetry exists; balance transitions do not | Emit amount-free balance transition events during successful publication |
| Invitations and memberships | `company_user_events` | Access control | Invitation accepted/expired, suspension, restoration, role and price-access changes | Project existing events with target/manager recipient rules |
| Behavior analytics | `partner_behavior_events` | Behavior analytics | UI behavior only | Never use as an operational notification source |

Existing events remain owned by their domains. A notification projector records
the source table and source event ID; it does not copy or mutate the source
audit event.

## 2. Governed notification event catalog

The event catalog is a typed server-side registry. Each entry fixes the domain,
severity, allowed entity type, action route builder, recipient resolver,
preference group, mandatory flag, renderer, and commercial-data policy.

| Group | Event codes | Source | Severity | Deep-link family |
| --- | --- | --- | --- | --- |
| Orders | `order_submitted`, `order_confirmed`, `order_requires_attention`, `order_posted`, `order_cancelled`, `order_readback_failed`, `order_reconciliation_required` | Portal order RPC or order-history event | info/high/critical | `/cabinet/orders/{id}` |
| Orders, blocked | `order_shipped` | No proven canonical shipped state | n/a | Not enabled until a source mapping is approved |
| Shipments | `shipment_due_in_3_days`, `shipment_due_today`, `shipment_overdue`, `shipment_date_changed` | Local order history and deadline scheduler | normal/high | `/cabinet/orders/{id}` |
| Date changes | `date_change_approved`, `date_change_rejected`, `date_change_cancelled` | Existing order-history event | normal/high | `/cabinet/orders/{id}` |
| Products | `watched_product_back_in_stock`, `watched_product_expected_arrival_added`, `watched_product_arrived`, `watched_product_price_changed`, `cart_product_price_changed`, `cart_product_availability_changed` | Atomic price/stock publication events | normal | `/cabinet/catalog/{slug}` or `/cabinet/cart` |
| Estimates | `estimate_updated`, `proposal_version_ready`, `proposal_pdf_ready`, `proposal_email_sent`, `proposal_email_failed`, `proposal_status_changed` | Estimate events, document state, delivery attempts | info/normal/high | `/cabinet/estimates/{id}` |
| Finance | `finance_snapshot_updated`, `finance_debt_appeared`, `finance_debt_changed`, `finance_advance_changed`, `finance_data_stale` | Finance publication event or deadline scheduler | info/high | `/cabinet/finance` |
| Company access | `invitation_expiring`, `invitation_accepted`, `employee_suspended`, `role_changed`, `price_access_changed` | Company user event or deadline scheduler | normal/critical | `/cabinet/company/users` |

Unknown 1C order states do not produce partner notifications. Deleted 1C orders
remain an internal audit concern unless a separately approved partner-facing
cancellation mapping is proven.

## 3. Recipient-resolution matrix

Recipient resolution always starts from active company memberships and effective
permissions. A role name alone is insufficient.

| Event family | Direct recipient | Additional recipients | Required effective access |
| --- | --- | --- | --- |
| Portal order | Submitter | Active owners and users allowed to manage/view company orders | `orders.manage` or the canonical company order-view permission |
| 1C order/shipment | Portal submitter when linked | Active owners, managers, and buyers with order access | Order access |
| Date-change decision | Requester | Active owners/managers with order access | Order access |
| Watched product | User whose Favorites, active list, or active cart contains the product | None | `catalog.view` plus price/stock permission required by the message |
| Estimate/proposal | Estimate creator or delivery initiator | Users with access to that estimate where the event needs company visibility | `estimates.view` |
| Finance | None by default | Active owners/accounting users with `finance.view_company` | `finance.view_company` |
| Invitation | Invite creator for expiry; accepted user for acceptance where active | Active users with `company_users.manage` | `company_users.manage` |
| Membership/access change | Target user when still active and allowed | Active owners/managers with `company_users.manage` | Relevant effective permission |

Retail-only recipients never receive partner-price existence, amount, margin, or
finance information. Product price events are rendered after recipient
permission resolution, not before it.

## 4. Data and deduplication model

Three focused tables are required:

1. `partner_notification_events`: append-only canonical notification outbox with
   source domain, source table, source event ID/version, company, event code,
   entity identity, occurred time, safe payload, and event fingerprint.
2. `partner_notifications`: one recipient projection with rendered safe title,
   message, action label/URL, severity, delivery timestamps, read/dismiss state,
   expiry, and email state.
3. `partner_notification_preferences`: one user-owned preference per governed
   event group.

Email retry attempts should use a fourth append-only table,
`partner_notification_email_attempts`, because retry history does not belong in
the recipient projection.

The source fingerprint is deterministic:

`event_code + company_id + entity_type + entity_id + source_event_id_or_version`

The recipient uniqueness boundary is:

`unique(recipient_user_id, deduplication_key)`

Deadline keys include the business date and deadline class. Product transition
keys include product ID, transition, and successful source sync/effective time.
The event outbox and source mutation are committed in the same transaction.
Projector retries therefore create no duplicate recipient rows.

Safe payloads are event-specific, size-bounded JSON objects. They cannot contain
HTML, email addresses, tokens, raw 1C payloads, partner-price amounts, finance
amounts, or arbitrary URLs.

## 5. Preference model

Preferences are keyed by `company_id`, `user_id`, and governed `event_group`.
They contain:

- `in_app_enabled`;
- `email_enabled`;
- `digest_mode` in `immediate`, `daily`, or `off`;
- `updated_at`.

The service derives user/company context and rejects changes for another user.
Defaults live in the event catalog. There is no preference row per event until
the user changes a default.

Daily digest is a valid stored preference but is not delivered in the first
implementation. The UI must label it unavailable until a digest worker is
approved.

## 6. Mandatory versus optional events

Mandatory in-app events cannot be disabled or dismissed before expiry:

- `order_reconciliation_required`;
- `order_readback_failed`;
- `shipment_overdue`;
- `employee_suspended`;
- `role_changed`;
- `price_access_changed`.

Email remains optional unless a later policy explicitly mandates it. Routine
order progress, product watches, estimate updates, finance snapshot updates, and
invitation reminders are optional. Mandatory does not bypass authorization:
users who lose active access cannot read the notification center.

## 7. In-app UX

The partner header receives a button with an accessible name, unread badge, and
a bounded latest-notifications popover. The popover loads one recipient-scoped
projection: unread count plus at most eight latest rows.

`/cabinet/notifications` provides server-side pagination and filters for all,
orders, shipments, products, finance, estimates/proposals, company access, and
unread. It supports mark read, mark all read, and dismissal when the catalog
permits dismissal.

`/cabinet/notifications/settings` edits only the authenticated user's
preferences and explains mandatory events. All pages are private/no-store.
Relative time is presentation only; title, message, severity, and action are
prepared server-side.

Read-on-click is performed by a server action before returning a validated
internal route. A failed action does not block navigation. Merely opening the
popover does not mark rows read.

## 8. Email-delivery design

In-app projection succeeds independently of SMTP. The current proposal email
provider and SMTP configuration are reused; no second provider abstraction is
introduced.

The existing proposal-delivery orchestration performs SMTP synchronously, so it
cannot be called from originating business workflows for notifications. A
server-only worker must claim pending notification email rows, call the existing
SMTP transport, and record success/failure attempts. The worker uses the
existing `CRON_SECRET`, sync-lock pattern, bounded batches, and retry/backoff
rules.

When SMTP is not configured, in-app delivery remains successful and email rows
are suppressed with a safe configuration category. No SMTP diagnostics are
partner-readable.

Daily digest delivery is deferred. Its future contract groups already projected
notifications by recipient, locale, and date; it never re-queries domain data.

## 9. Dashboard integration

The dashboard remains a hybrid projection:

- canonical urgent unread notifications are shown first;
- direct state remains authoritative for current overdue shipments, stale
  finance, and incomplete commercial configuration;
- the dashboard deduplicates by entity and event family so one condition cannot
  appear with conflicting wording;
- informational notifications remain in the notification center;
- dashboard navigation uses the same mark-read action as the center.

Notifications do not replace order, shipment, finance, or company aggregates.

## 10. Product-watch transition design

The stock and price publication RPCs compare the previous published row with
the successfully staged replacement before publication completes. They emit
only:

- unavailable to available;
- no confirmed arrival to confirmed arrival;
- expected arrival to received/available;
- permitted current price changed.

After publication, the projector resolves interested users from the system
Favorites list, active purchasing lists, and active cart. A user receives one
notification even when the product appears in several sources. Cart-specific
events deep-link to the cart; otherwise the product route is used.

The source event contains no commercial amount. Rendering may include an exact
price only after checking the recipient's effective price permission. A
retail-only recipient can receive only a RETAIL transition.

## 11. Privacy and security model

- Direct browser inserts/updates/deletes on event and delivery tables are
  revoked.
- Mutations are exposed only through narrow security-definer RPCs with fixed
  search paths and server actions.
- Recipient SELECT policy requires `recipient_user_id = auth.uid()`, matching
  company, active membership, and active company.
- Preferences require `user_id = auth.uid()` and active company membership.
- Event origin and email attempts are service-role/internal diagnostic only.
- Action URLs are created by catalog route builders and checked against an
  allowlist; callers never submit a URL.
- Opening a deep link rechecks the target domain permission.
- Finance, partner pricing, margin, recipient email, tokens, and raw external
  payloads are absent from generic notification storage and logs.
- Suspended users cannot use stale notifications to retain company access.

## 12. Query and performance plan

- Shell: one RPC returning unread count and at most eight prepared rows.
- Full page: one keyset-paginated RPC with a bounded page size; no offset scan
  for deep history.
- Preferences: one bounded group projection.
- Creation: batched recipient resolution from the canonical effective-access
  projection; no per-recipient permission query.
- Product events: one batched subscriber query per changed product set, not per
  product/source pair.
- No notification query performs entity joins at render time.
- No live 1C, no broad cabinet invalidation, no polling, and no analytics in the
  delivery transaction.

Indexes are required on recipient/unread ordering, company/event occurrence,
source fingerprint, email claim state, and preference owner/group. The shell
query is request-memoized inside one render; it is not globally cached across
users.

## 13. Delivery slices

1. Architecture and in-app foundation: migrations, catalog, projector contract,
   RLS, shell button, list page, preferences schema, tests.
2. Orders and shipments: portal-order event emission, order-history projection,
   deadline scheduler, date-change events, dashboard integration.
3. Product watches: publication-time stock/arrival/price events and batched
   recipient resolution.
4. Finance, estimates, and company access: publication/access-event projection
   with confidentiality tests.
5. Email, settings, and diagnostics: worker, retries, SMTP reuse, settings UI,
   aggregate internal health page.
6. Production hardening: load tests, accessibility/mobile, analytics,
   observability, authenticated role acceptance.

Each slice requires a separate migration and focused commit. Event emitters are
released before their projector consumers where backward compatibility requires
it.

### Slice 3 consistency contract

Successful stock, arrival, and price publication appends only partner-visible
state transitions to `partner_product_transition_events`. The outbox stores
state names and value fingerprints, never prices, quantities, or raw 1C
payloads.

`process_partner_product_transitions` runs as a bounded post-publication step.
It resolves active Favorites, purchasing-list, and active-cart ownership in
set-based queries. A cart watch takes precedence over optional list watches for
the same user/product transition. Projection is retryable and is not part of
the commercial publication transaction, so projection failure cannot roll back
an authoritative commercial snapshot.

Full-commercial users are matched only to their company's assigned price type.
Retail-only users are matched only to the canonical RETAIL price type.

## 14. Unknowns and blockers

1. No proven 1C field currently defines `order_shipped`; keep it disabled.
2. Finance change thresholds and stale duration require business approval.
3. Whether exact prices may appear in email requires privacy approval; the safe
   default is no amount.
4. Notification retention, dismissal expiry, and email retry limits require an
   operational policy.
5. User locale is currently public/auth focused; authenticated notification
   email locale needs a canonical profile/company rule.
6. Proposal SMTP sending is synchronous today. Notification email must wait for
   the queue worker and must not reuse that orchestration inline.
7. Vercel Cron can run the worker with existing infrastructure, but cadence and
   production limits must be approved before registration.
8. Existing placeholder copy at `/cabinet/notifications` is English and should
   be replaced only in Slice 1.
9. Role acceptance requires active production users for owner, manager, buyer,
   accounting, viewer, and retail-only permission combinations.
