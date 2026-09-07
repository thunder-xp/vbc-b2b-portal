# Communication Gateway

## Current classification

`OMNICHANNEL_GATEWAY_STATUS = PARTIAL_FRAGMENTED`

The platform has production-grade delivery primitives, but they are not yet one coherent omnichannel runtime:

- confirmed-order email uses `notification_events` → `notification_deliveries` → leased worker → SMTP adapter;
- proposal email has its own durable delivery record but invokes SMTP synchronously;
- company invitation email invokes SMTP synchronously and records the outcome in its owning workflow;
- Supabase Auth owns registration/confirmation email outside the application gateway;
- partner in-app notifications use their own first-party event/projection tables and authenticated RPCs;
- finance reminders persist reviewable dry-run projections and no live receipt;
- no SMS provider, adapter, credentials, or live delivery path exists.

The order notification outbox is real but order-specific, so `OUTBOX_STATUS = PARTIAL` for the platform as a whole.

## Boundary

The intended dependency direction is:

`business service → CommunicationIntent → CommunicationGatewayService → channel adapter → provider`

The gateway owns recipient safety validation, channel policy enforcement, deterministic template lookup, provider payload projection, delivery identity, adapter selection, and provider acceptance semantics. It does not own finance calculations, reminder cadence, order behavior, CRM, or commercial truth.

In-app remains a separate first-party delivery subsystem that can consume the shared intent contract. It is not treated as an external provider channel.

## Communication intent

The service-layer contract records:

- intent and correlation identities;
- business event and entity references;
- server-governed company and immutable recipient evidence;
- locale;
- template key and version;
- per-channel `DISABLED | DRY_RUN | LIVE` policy;
- structured variables and CTA;
- business date and priority;
- business idempotency identity;
- `PUBLIC | PARTNER_PRIVATE | FINANCIAL_PRIVATE | SECURITY_SENSITIVE` classification.

Channel delivery identity is deterministic over the business identity, channel, governed user, and normalized channel address. A retry reuses the same identity.

## Safety controls

Application-owned external adapters are protected server-side:

- `COMMUNICATION_OUTBOUND_KILL_SWITCH=ON` blocks all external adapters;
- `COMMUNICATION_EMAIL_KILL_SWITCH=ON` blocks email independently;
- `COMMUNICATION_SMS_KILL_SWITCH` defaults to blocked and requires explicit `OFF` before any future SMS adapter can be reached.

The notification worker checks the safety gate before claiming rows, so an emergency stop does not consume attempts. SMTP providers check it again immediately before opening a transport.

The default for approved existing transactional email remains compatible when global/email switches are unset. This is distinct from per-communication-type policy: Finance remains hard-held in `DRY_RUN`, Finance in-app LIVE is false, and SMS is disabled.

`DRY_RUN` validates the recipient, resolves the exact template key/version/locale/channel, renders provider payload, and computes delivery identity. It never calls an adapter and never creates a live receipt.

## Finance integration

`FINANCE_REMINDER_V1` continues to own eligibility, aggregation, cadence, obligation grouping, and suppression. It now creates `finance.payment_reminder` intents classified `FINANCIAL_PRIVATE`. RU/RO email, in-app, and SMS-preview prose lives in the versioned gateway template registry.

Finance projections preserve review evidence in their existing service-only dry-run tables. Their content payload includes intent, business references, channel/mode, template key/version, locale, sensitivity, correlation, delivery identity, and projected state. No finance provider adapter is registered and no live receipt is written.

## Existing delivery semantics

The confirmed-order outbox uses unique event and per-channel delivery identities, `FOR UPDATE SKIP LOCKED`, 90-second leases, bounded batches, three attempts, 2/15-minute retry delays, and append-only audit events. Exhausted/permanent failures enter `dead_letter` and are visible/retryable in Admin → Integrations → Notifications.

The existing database status `sent` means accepted by the SMTP transport and must not be interpreted as delivered or read. A future generalized schema should name this state `ACCEPTED` and add `DELIVERED` only for provider evidence that supports it.

## Logging and operator visibility

Worker logs contain only event/delivery/company/order/correlation identifiers, attempt, duration, and safe error category. Finance amounts, rendered bodies, recipient addresses, provider credentials, and raw provider errors are excluded from generic logs and metric labels.

The existing admin notification diagnostics display queue, processing, accepted-last-24h, retry, dead-letter, safe errors, and operator retry. The additive channel-safety block shows external/email/SMS switches and Finance DRY_RUN state without exposing credentials.

## Deferred before external Finance approval

External Finance communication remains blocked pending all of the following owner-governed work:

1. approve Finance email and/or in-app activation policy;
2. generalize or explicitly adapt the existing durable outbox for `CommunicationIntent` without an order-only foreign key;
3. define durable `PROJECTED/SUPPRESSED/READY/QUEUED/SENDING/ACCEPTED/FAILED_*` persistence and immutable rendered snapshots;
4. approve communication preferences/consent distinctions for finance versus transactional/security/marketing;
5. approve rate limits per recipient/company/type and provider capacity;
6. decide provider sandbox allowlists and test identities;
7. bring Supabase Auth provider-managed email under an equivalent operational stop policy if the emergency switch must cover non-application mail as well;
8. select an SMS provider and approve credentials, sender identity, error/retry contract, and sandbox capability.

Those changes are not needed for safe dry-run readiness and are intentionally not implemented in this task.
