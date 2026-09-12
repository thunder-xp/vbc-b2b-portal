# Communication Gateway

## Current classification

`OMNICHANNEL_GATEWAY_STATUS = PORTABLE_MOLDCELL_SMS_SANDBOX_IMPLEMENTED_STATIC_EGRESS_DEPLOYMENT_BLOCKED`

The platform has one shared durable intent/delivery core, while external activation remains deliberately narrow:

- confirmed-order email uses the shared `notification_events` → `notification_deliveries` → leased worker → SMTP adapter runtime;
- Finance reminders atomically persist reviewable dry-run projections into the shared core and create no live receipt;
- proposal and company-invitation email retain their synchronous SMTP behavior and emergency kill-switch checks;
- Supabase Auth owns registration/confirmation email outside the application gateway;
- partner in-app notifications retain their existing first-party projection model;
- SMS has a provider-neutral channel/resolver, Moldcell is the first server-only provider, and a tightly permissioned `SUPPORT/SANDBOX` diagnostic path is the only active SMS path; normal, Finance, Marketing, bulk, and partner SMS remain disabled.

The existing order outbox tables, lease worker, scheduler, retry policy, SMTP adapter, and diagnostics were generalized in place. No second queue, worker framework, scheduler, or event bus exists. `OUTBOX_STATUS = SHARED_DURABLE_CORE`.

## Boundary

The dependency direction is:

`business service → CommunicationIntent → gateway projection → durable delivery → lease worker → SMS channel → provider resolver → provider → transport → provider acceptance`

The gateway owns recipient safety validation, channel policy enforcement, deterministic template lookup, provider payload projection, delivery identity, transport state, adapter selection, and provider-acceptance semantics. It does not own Finance calculations, reminder cadence, Orders, Estimates, CRM, or commercial truth.

In-app is represented by an independent durable channel delivery, but its first-party adapter remains unactivated. It never waits behind SMTP while in `DRY_RUN` and does not create a partner notification.

## Communication intent and identity

The service-layer contract records intent and correlation identities, business event/entity references, server-governed company and recipient evidence, locale, template key/version, per-channel `DISABLED | DRY_RUN | LIVE` policy, structured variables/CTA, business date/priority, business idempotency identity, and sensitivity.

Channel delivery identity is deterministic over business identity, channel, governed user, and normalized channel address. A retry reuses the same identity. Database uniqueness uses `(delivery_identity, channel_mode)`, so DRY_RUN, SANDBOX, and LIVE remain distinct durable identities.

## Purpose and activation governance

Every application-owned flow is classified independently from its channel and mode. Current mappings are: confirmed order, proposal delivery, and company invitation = `TRANSACTIONAL`; Finance payment reminder = `FINANCE`; `security.*`, `support.*`, and `marketing.*`/`commercial.*` map to `SECURITY`, `SUPPORT`, and `MARKETING`. Unknown or mismatched mappings fail closed.

The explicit production activation matrix is purpose + channel scoped. `TRANSACTIONAL.EMAIL` retains approved `LIVE` compatibility; `FINANCE.EMAIL` and `FINANCE.IN_APP` remain `DRY_RUN`. When and only when `SMS_MODE=SANDBOX`, `SUPPORT.SMS` becomes `SANDBOX`; every other SMS entry remains `DISABLED`. There is no switch that can make all purposes live.

The central server policy evaluator applies deterministic precedence across channel/mode activation, kill switches, recipient/company/capability evidence, technical preference outcome, durable rate-limit outcome, duplicate identity, sandbox allowlist, and provider availability. Business eligibility such as settled Finance obligations remains outside the gateway.

Existing stored preferences remain company + user + event-group scoped. Production currently stores only a single `products` preference; the governed UI exposes orders, shipments, company access, products, documents, and service, while support/installation/finance groups are schema-only and email remains reserved/disabled. Product projections honor `products`; several first-party projection functions honor their matching group; confirmed-order/proposal/invitation SMTP and Finance email do not treat the reserved email flag as consent. Finance in-app governance recognizes an explicit `finance` preference when present and otherwise preserves the existing enabled default. Transactional and Security compatibility are explicitly `NOT_APPLICABLE`, rather than borrowing Marketing settings. These are technical controls, not legal-consent assertions.

## Durable burst protection

Provider-bound LIVE/SANDBOX claims reserve an idempotent PostgreSQL rate-limit row before transport. Transaction-scoped advisory locks serialize a fixed recipient-then-company lock order across parallel workers and deployments. A delivery has one reservation, so retries do not multiply usage. Default limits remain 10 accepted reservations per recipient/channel/hour and 100 per company/purpose/channel/hour. A private provider policy overrides Moldcell SMS sandbox to 1 per recipient/hour and 5 per company/hour. The existing worker remains 20 by default and 50 maximum. Finance cadence is unchanged; a transport burst suppression is recorded distinctly as `RATE_LIMITED`.

## Sandbox

`SANDBOX` is implemented inside the same durable mode identity and adapter boundary. Email behavior is unchanged. Moldcell SMS accepts only strict E.164 numbers from the server-only `SMS_SANDBOX_ALLOWED_RECIPIENTS` (`COMMUNICATION_SANDBOX_SMS_ALLOWLIST` remains a compatibility fallback); Admin receives masked values plus SHA-256 selection tokens and cannot type an arbitrary number. The diagnostic creates a governed `support.sms_sandbox_test` Communication Intent, persists it through the common outbox, and targets the common leased worker at that delivery. Missing mode, kill-switch, identity, recipient, or provider configuration fails closed.

The known legacy browser-facing `POST https://api.novotech.systems/notification/moldcell-send/` endpoint accepted an unauthenticated malformed request without an authorization challenge and exposes Express through Cloudflare. CORS is not authentication, so it is classified `LEGACY_ENDPOINT_AUTH=UNAUTHENTICATED` and is explicitly rejected as a relay URL. No legacy source was available locally to prove an upstream middleware control. Moldcell historically required source-IP allowlisting; the Cloudflare-fronted legacy origin/egress and any Vercel allowlisting could not be proven. The current safe classification is `MOLDCELL_NETWORK_PATH=LEGACY_RELAY_REQUIRED`: the old network location may be retained only behind a new authenticated transport endpoint with HMAC-SHA256 signing, timestamp, nonce, body hash, idempotency key, strict schema validation, replay prevention, rate limiting, and correlation audit. Business rules, retries, templates, and recipient selection remain here in Omnichannel.

Direct WSG transport is also implemented for an independently proven static allowlisted egress. The provider maps the established contract (`guid`, fixed `from=NSD`, fixed `template=NSD_NOTIFICATION`, `to` without the internal E.164 `+`, and `customText`) and does not add unproven provider parameters. The relay and direct transports implement one network-only seam and are mutually exclusive server-side configurations. Historical credentials are not reused or documented and should be rotated before activation.

Moldcell `resultCode="0"` maps to `PROVIDER_ACCEPTED`, never `DELIVERED`; `20001` maps to permanent `INVALID_MSISDN`, `20012` to permanent `OUTNET_NOT_ALLOWED`, and other nonzero codes to permanent `UNKNOWN_PROVIDER_FAILURE`. Double-encoded legacy responses are normalized at the boundary but never propagated. HTTP 429/5xx, network failures, and timeouts are retryable through the existing three-attempt/2-and-15-minute durable policy. The provider timeout defaults to 10 seconds and is bounded to 1–30 seconds.

Official current GSM-7/UCS-2, concatenation, callback/polling DLR documentation was not available during implementation. The fail-safe default is therefore one nonempty message of at most 70 Unicode code points, no control characters, no truncation, and no delivery claim beyond provider acceptance. Sender and template are fixed provider policy, never caller input.

## Durable entity and state mapping

`notification_events` carries intent identity, business references, business identity, communication correlation, company, and sensitivity. `notification_deliveries` carries channel mode, deterministic delivery identity, normalized recipient/fingerprint, locale, template key/revision, immutable render snapshot, suppression, lease/retry state, and adapter identity.

The durable state contract is `PROJECTED | SUPPRESSED | READY | QUEUED | PROCESSING | ACCEPTED | FAILED_RETRYABLE | FAILED_FINAL | CANCELLED`. Legacy order status maps as follows:

| Legacy | Durable |
| --- | --- |
| `queued` | `QUEUED` |
| `processing` | `PROCESSING` |
| `sent` | `ACCEPTED` |
| `failed` | `FAILED_RETRYABLE` |
| `dead_letter` | `FAILED_FINAL` |

SMTP `ACCEPTED` means provider acceptance only. It does not mean delivered or read.

Every claim creates a service-only attempt row with a monotonic sequence, lease identity, channel, adapter, start/completion timestamps, duration, and safe classification. Bounded Moldcell code/message/timestamp metadata is recorded on the attempt and immutable provider-acceptance receipt; credentials and full recipient are excluded. Successful LIVE or SANDBOX completion inserts one immutable receipt with delivery identity, provider reference, accepted timestamp, template revision, and recipient fingerprint. Manual retry resets the bounded three-attempt window while preserving the historical attempt sequence.

## Safety controls

Application-owned external adapters are protected server-side:

- `COMMUNICATION_OUTBOUND_KILL_SWITCH=ON` blocks all external adapters;
- `COMMUNICATION_EMAIL_KILL_SWITCH=ON` blocks email independently;
- `COMMUNICATION_SMS_KILL_SWITCH` defaults to blocked and requires explicit `OFF` before the Moldcell sandbox adapter can be reached.

The worker checks safety before claim and again after claim immediately before provider invocation, closing the configuration-race window. SMTP behavior remains unchanged. Unset global/email switches preserve current approved order, proposal, and invitation behavior. Moldcell additionally requires `SMS_MODE=SANDBOX`; there is no SMS `LIVE` activation path.

`DRY_RUN` may persist an exact internal render snapshot. Claims and completion accept only `LIVE` or `SANDBOX`; the only constructed SMS sandbox event is the permission-gated SUPPORT diagnostic. Finance SMS remains `DISABLED/SUPPRESSED` and cannot be claimed as Moldcell sandbox.

## Finance integration

`FINANCE_REMINDER_V1` retains ownership of eligibility, aggregation, cadence, obligation grouping, and business suppression. It creates one `finance.payment_reminder` intent classified `FINANCIAL_PRIVATE` per governed company/recipient/business identity.

The existing Finance dry-run publish transaction also calls the generic `persist_communication_intent` boundary. One intent owns independent email `DRY_RUN`, in-app `DRY_RUN`, and SMS `DISABLED/SUPPRESSED` deliveries. Exact rendered evidence is service-only; generic diagnostics redact FINANCIAL_PRIVATE recipients and never include bodies or amounts. No Finance adapter is invoked, no first-party partner notification is created, and no LIVE receipt is written.

Gateway suppression (`CHANNEL_DISABLED`, invalid recipient, kill switch, duplicate, provider failure) remains distinct from Finance eligibility suppression (`SETTLED`, `NON_RECONCILING`, reminder-window, rollout rules, and related reasons).

## Existing order compatibility

Confirmed-order email uses `COMPATIBILITY_BRIDGE`. Its atomic business-completion append and payload remain unchanged; insert preparation supplies generic intent fields, and the same claim/completion functions operate on shared durable state.

The runtime retains `FOR UPDATE SKIP LOCKED`, 90-second leases, bounded batches, three attempts, 2/15-minute retry delays, and append-only lifecycle evidence. Expired leases recover through the same claim query. Exhausted/permanent failures enter `FAILED_FINAL`/legacy `dead_letter` and remain visible/retryable in Admin → Integrations → Notifications.

## Logging and operations

Worker logs contain only event/delivery/company/order/correlation identifiers, attempt, duration, and safe error category. Finance amounts, render bodies, recipient addresses, provider credentials, and raw provider errors are excluded from generic logs and metric labels.

Existing admin diagnostics show all durable state counts, event-type/channel aggregates, mode, channel, state, attempts, safe errors, timestamps, and operator retry for LIVE failures. FINANCIAL_PRIVATE recipient addresses are replaced by a short fingerprint.

## Compatibility and deferred migrations

Proposal and invitation email remain synchronous. Both can later adopt the generic persistence boundary and existing worker adapter without domain changes, but that migration is outside this task.

Supabase-managed Auth email remains outside application-owned delivery and therefore outside the application emergency stop. Closing that provider-managed gap requires a separate Auth operating-policy decision.

External Finance activation remains blocked pending owner-governed decisions for:

1. Finance email and/or in-app activation policy;
2. communication preference/consent distinctions;
3. per-recipient/company/type rate limits and provider capacity;
4. provider sandbox allowlists and test identities;
5. the Supabase Auth emergency-stop gap, if required;
6. current Moldcell credentials, approved sender/template, secure fixed-egress relay deployment, and documented provider error/segment/DLR contract.

Supabase Auth email remains provider-managed outside this gateway. `AUTH_EMAIL_EMERGENCY_STOP_STATUS = PROVIDER_MANAGED_NO_APPLICATION_KILL_SWITCH`; the remaining risk is that application kill switches cannot stop Auth-generated mail. No Auth setting is changed without separate owner authorization.
