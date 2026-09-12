# NSD Moldcell relay

Standalone, provider-specific static-egress transport for Novotech Omnichannel SMS. It has no Next.js, Supabase, browser-session, or legacy `nsd-api` dependency. The process accepts one authenticated relay request, performs at most one fixed Moldcell `sendSMS` request, stores the bounded result for idempotent replay, and never schedules retries.

## Runtime and endpoints

- Supported runtime: Node.js 24 LTS, version 24.2.0 or newer within major 24.
- Bind address: fixed in code to `127.0.0.1`; it cannot be changed by environment.
- Default port: `8091`.
- Health: `GET http://127.0.0.1:8091/health`.
- Relay: `POST /internal/omnichannel/v1/sms/moldcell`.
- Persistence: local SQLite database, default `/var/lib/nsd-sms-relay/relay.sqlite`.

`/health` reports process liveness, version, authentication readiness, and provider readiness. It never contacts Moldcell and never returns credentials.

## Request and HMAC contract

The body is the exact UTF-8 JSON emitted by the B2B `RelayMoldcellTransport`, in this order:

```json
{"deliveryId":"uuid","recipient":"+373XXXXXXXX","message":"text","idempotencyKey":"key","timestamp":1789243200}
```

Required headers are `Idempotency-Key`, `X-Correlation-Id`, `X-NSD-Key-Id`, `X-NSD-Timestamp`, `X-NSD-Nonce`, and `X-NSD-Signature`.

```text
bodyHash = SHA256(exact UTF-8 request body)
canonical = timestamp + "\n" + nonce + "\n" + bodyHash + "\n" + idempotencyKey
signature = HMAC-SHA256(RELAY_AUTH_SECRET, canonical)
X-NSD-Signature = "sha256=" + lowercase_hex(signature)
```

The relay uses constant-time comparison, permits a timestamp skew of 300 seconds by default, and stores hashed nonces separately from delivery idempotency. It returns deterministic `AUTH_MISSING`, `AUTH_EXPIRED`, `AUTH_INVALID_SIGNATURE`, and `AUTH_REPLAYED` results without exposing an expected signature.

## Input and provider boundary

Only canonical E.164 is accepted. Moldcell V1 accepts exactly `+373` plus eight digits and removes only the leading `+` at the provider boundary. Local numbers, spaces, empty strings, and malformed values are rejected. Valid non-Moldcell destinations return `NO_SMS_PROVIDER_FOR_DESTINATION` and never call the provider.

The caller cannot supply a URL, HTTP method, provider/customer ID, GUID, sender, or template. The relay only builds `https://wsg.moldcell.md/rest/{provider}/{customer}/sendSMS` with `URL` and `URLSearchParams`, fixed method `sendSMS`, fixed sender `NSD`, and fixed template `NSD_NOTIFICATION`. Modern Node TLS defaults are unchanged.

The SMS body is limited to 70 Unicode code points and the complete HTTP body to 2,048 bytes. Nothing is truncated silently.

## Result mapping

| Moldcell/transport result | Relay status | HTTP | Accepted |
|---|---|---:|---:|
| `0` | `PROVIDER_ACCEPTED` | 200 | yes |
| `20001` | `INVALID_MSISDN` | 200 | no |
| `20012` | `OUTNET_NOT_ALLOWED` | 200 | no |
| other nonzero | `UNKNOWN_PROVIDER_FAILURE` | 200 | no |
| provider HTTP 429 | `RETRYABLE_FAILURE` | 429 | no |
| provider HTTP 5xx/network | `RETRYABLE_FAILURE` | 503 | no |
| provider timeout | `RETRYABLE_FAILURE` | 504 | no |

`PROVIDER_ACCEPTED` never means delivered. Responses include the bounded typed fields and the compatibility aliases `resultCode`, `resultDate`, `resultMessage`, and `providerRequestId` required by the existing B2B client.

## Persistence, retention, and retry ownership

The SQLite store uses WAL, `synchronous=FULL`, and an immediate transaction for nonce, delivery/idempotency, and rate-limit claims. Raw phone numbers, message bodies, idempotency keys, nonces, and secrets are not stored. Idempotency keys and nonces are SHA-256 hashed; the delivery UUID and bounded safe result remain available for operations.

- same idempotency key or delivery ID + same canonical delivery: stored result, no second Moldcell call;
- same key or delivery ID + different recipient/message: `IDEMPOTENCY_CONFLICT`;
- concurrent or crash-left `PENDING` claim: `REQUEST_IN_PROGRESS`, no unsafe resubmission;
- idempotency TTL: 604,800 seconds (7 days), configurable from 1 to 30 days;
- nonce TTL: replay window, 300 seconds by default;
- rate limit: 30 new provider attempts per key per minute, configurable from 1 to 300.

Expired rows are deleted transactionally when a new authenticated delivery is claimed. SQLite reuses freed pages; no cron is required. Omnichannel remains the only retry scheduler. Back up the store before a server move with SQLite's online backup command, or stop this one PM2 process and copy the database plus its WAL/SHM files together. Restoring this store preserves duplicate-send protection.

## Logs and security boundary

Each provider attempt writes one JSON line containing only timestamp, delivery ID, provider, masked recipient, provider code, status, and latency. It never logs full recipient, SMS text, GUID, customer/provider IDs, secret, signature, or full provider URL. PM2 writes only this service to `/var/log/nsd-sms-relay`; the supplied logrotate policy bounds retained files.

There is no production mock mode. Tests inject a fake `fetch` dependency. The service is not a generic HTTP proxy: destination host, path shape, method, credentials, sender, and template are server-owned and validated. See [DEPLOYMENT.md](./DEPLOYMENT.md) for installation and no-send acceptance.

## Security review

- Secret exposure: relay and provider secrets are environment-only, absent from health/results/logs, and the example file contains no usable placeholder secret.
- Signature: the exact raw body is SHA-256 hashed and the HMAC is compared at a fixed length in constant time.
- Replay: signed timestamps are bounded and hashed nonces are claimed transactionally before provider access.
- Idempotency: a separate durable delivery/key claim prevents duplicate submission across concurrent requests and restarts.
- Request limits: exact JSON keys, 2,048-byte body, 70-code-point text, UUID/key formats, and control characters are validated.
- Logging: only the documented safe fields are emitted; full phone, text, credentials, signature, and URL are excluded.
- Provider SSRF: the configured URL must be exactly the HTTPS `wsg.moldcell.md` origin with no credentials, port, query, fragment, or alternate path.
- Method/URL injection: the application owns the only Moldcell path shape and the fixed `sendSMS` method; neither can come from the caller.
- Header injection: key ID, nonce, correlation ID, timestamp, signature, and idempotency key use bounded strict formats.
- Phone injection: canonical E.164 and the exact `+373` Moldcell prefix/length are required before URL construction.
