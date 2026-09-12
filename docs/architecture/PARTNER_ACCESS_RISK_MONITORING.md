# Partner Access Risk Monitoring V1

## Purpose and boundaries

The Risk Radar is an Admin-only, advisory view of unusual partner access patterns. It is not an authorization engine. A snapshot never blocks commerce, revokes a session, changes a role, requires MFA, or calls 1C. Partner-facing pages do not receive risk state.

The implementation has two explicit modes:

- `NORMAL` (default for every active company): compact hourly counters and irreversible 256-bit cardinality masks only. There is no new raw clickstream.
- `ENHANCED`: an Admin with `admin.security.manage` may activate bounded pseudonymous detail for 7, 14, or 30 days. It auto-expires and can be stopped early. Each detailed row is deleted no later than 30 days after it occurred.

`admin.security.view` permits overview/detail reads. `admin.security.manage` permits mode changes and is granted only to the platform Admin role by this migration. Tables are private, use RLS plus FORCE RLS, and expose no direct `anon` or `authenticated` grants. Browser code never receives the Service Role.

## Data ownership and flow

The canonical `partner_behavior_events` table remains the owner of product/catalog/commercial behavior events. The hourly worker projects those existing events into `access_risk_hourly_aggregates`; it does not create a second NORMAL raw stream. Existing Auth JWT `session_id`, active memberships, user profiles, companies, and existing behavior events are reused.

The existing behavior event wrapper also queues a detached first-party signal. It flushes after 3 seconds, at page hide, or at 20 events. The request uses `keepalive`/`sendBeacon`, is never awaited by navigation or interaction, and is fail-open. It contributes only session/device/network cardinality masks in NORMAL mode. In ENHANCED mode the same request may also persist the bounded event detail.

Identity and company are resolved on the server from verified Auth claims and active membership. Browser-supplied company, role, permission, user, or session identity is not accepted.

The hourly `/api/cron/access-risk` worker uses the shared authenticated cron boundary. It:

1. expires Enhanced profiles;
2. enforces retention;
3. backfills 32 days once, then idempotently refreshes only the latest three hours of canonical behavior counters;
4. evaluates user snapshots;
5. aggregates the highest user state into a company snapshot;
6. records success/failure diagnostics.

The worker is asynchronous. Failure leaves Catalog, PDP, Cart, Estimates, and Orders available. Admin UI shows a freshness warning after two hours.

## Privacy model

The first-party `novotech_access_device` cookie contains a random UUID plus a server HMAC. It is `HttpOnly`, `SameSite=Lax`, secure in production, and has a one-year maximum lifetime. Only the HMAC-derived identifier can appear in Enhanced telemetry.

The server normalizes an incoming IPv4 address to `/24` or IPv6 to `/64` before keyed HMAC. Raw IP is never passed to Postgres, logged, or returned to UI. Country/region come only from trusted hosting headers. ASN is deliberately absent because there is no governed first-party source and external IP intelligence is out of scope.

NORMAL masks are one-way 256-bit membership aggregates. They cannot be resolved back to a device, network, session, SKU, or category. Stable aggregate buckets preserve baseline continuity through HMAC rotations; detailed hashes carry a version prefix.

Preferred production configuration:

```text
ACCESS_RISK_HMAC_VERSION=v1
ACCESS_RISK_HMAC_SECRET=<server-only random value, at least 32 characters>
```

For a rotation, deploy the new version/secret and retain the prior pair during a bounded grace period:

```text
ACCESS_RISK_HMAC_VERSION=v2
ACCESS_RISK_HMAC_SECRET=<new server-only value>
ACCESS_RISK_HMAC_PREVIOUS_VERSION=v1
ACCESS_RISK_HMAC_SECRET_PREVIOUS=<previous server-only value>
```

Existing signed device cookies are verified with either version and silently re-signed with the current key. Remove the prior pair after the cookie migration window. If the dedicated key is absent, the server-only Service Role key is a safe availability fallback, but a dedicated secret is preferred to decouple rotations.

## Retention and initial availability

| Data | Retention / lifecycle |
| --- | --- |
| NORMAL hourly aggregates | rolling 32 days |
| Current user/company snapshot | overwritten in place |
| Enhanced event detail | min(profile expiry, event + 30 days) |
| Ingestion idempotency receipt | 48 hours |
| Evaluation run diagnostics | 90 days |
| Monitoring mode audit | 13 months |
| Existing canonical behavior events | unchanged existing policy |

Before this feature, reliable device and network-prefix history did not exist. Those signals therefore begin in `LEARNING`. Existing behavior and session history can calibrate browse/SKU/category/session baselines immediately. Multi-user company membership is normal; company state is the maximum explainable user state and never treats user count itself as sharing.

## Deterministic V1 signals

Production calibration on 2026-09-12 covered 32,118 events / 60 days and 489 user-days. Observed p95 values were 62 browse events/day, 23/hour, 13 unique SKUs/day, 8 categories/day, and 4 sessions/hour. V1 thresholds intentionally sit above this observed normal range:

| Signal | Activation | Weight |
| --- | --- | ---: |
| `NEW_DEVICE_SURGE` | at least 3 previously unseen device buckets / 24h | 2 |
| `CONCURRENT_SESSION_ANOMALY` | at least 5 session buckets in the same hourly window | 4 |
| `NETWORK_CHURN` | at least 4 network-prefix buckets / 24h | 3 |
| `HIGH_VELOCITY_BROWSING` | at least 150 browse events / 24h or 3× learned hourly volume with floor 80 | 2 |
| `BROWSE_VOLUME_ANOMALY` | at least 100 browse events / 24h | 2 |
| `UNIQUE_SKU_SURGE` | at least 30 SKU buckets / 24h | 2 |
| `CATEGORY_BREADTH_ANOMALY` | at least 15 category buckets / 24h | 1 |
| `COMMERCIAL_DEAD_END` | at least 30 product views with no cart/estimate/order intent / 24h | 1 |

State rules:

- `HIGH`: score ≥7, concurrent-session anomaly present, and at least one of new-device, network-churn, or high-velocity signals present.
- `ELEVATED`: score ≥4.
- `LEARNING`: fewer than 7 baseline days and no stronger rule matched.
- `LOW`: calibrated and no stronger rule matched.

Thus a new device by itself scores 2 and can never create `HIGH`. Browse volume alone is supporting evidence. All reasons include observed and threshold values in the Admin detail.

## Capacity projection

A NORMAL active user creates at most one aggregate row per active hour. Conservatively budgeting 1 KiB/row and 10 active hours/day gives:

| Active users/day | Rows/day | Approx. NORMAL storage/day | 32-day rolling ceiling |
| ---: | ---: | ---: | ---: |
| 100 | 1,000 | ~1 MiB | ~32 MiB |
| 500 | 5,000 | ~5 MiB | ~160 MiB |
| 1,000 | 10,000 | ~10 MiB | ~320 MiB |

Enhanced storage depends only on selected companies. At a conservative 400 bytes/event and 100 events/user/day, one Enhanced user contributes ~39 KiB/day or ~1.2 MiB at the 30-day maximum. Batch receipts add one compact row per request and expire after 48 hours.

## Operations

- Admin overview: `/admin/security/access-risk`
- Company detail: `/admin/security/access-risk/[companyId]`
- Existing access controls: `/admin/security`
- Worker: `GET /api/cron/access-risk`, shared `CRON_SECRET`
- Telemetry: `POST /api/internal/access-risk/telemetry`, authenticated cookie session only, max 20 events / 24 KiB

An Admin investigates the reasons and may open existing security controls. There is intentionally no automatic or one-click block/revoke action in Risk Radar V1.
