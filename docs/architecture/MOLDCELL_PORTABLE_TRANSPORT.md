# Moldcell portable SMS transport

## Stable boundary

Business modules create `CommunicationIntent`. The durable worker calls one provider-neutral `SmsChannelAdapter`, which resolves a canonical E.164 destination to an `SmsProvider`. The V1 resolver maps only `+373` to `MoldcellSmsProvider`; any other destination fails with `NO_SMS_PROVIDER_FOR_DESTINATION` before network access.

`MoldcellSmsProvider` owns the verified sender `NSD`, template `NSD_NOTIFICATION`, WSG path/query construction, E.164-to-Moldcell number conversion, single response parse, and result-code normalization. It delegates only network I/O to `MoldcellTransport`.

Two transports implement the same seam:

- `RelayMoldcellTransport` posts the safe five-field relay request and signs it.
- `DirectMoldcellTransport` executes the provider request prepared by the provider.

Switching between them changes only `MOLDCELL_TRANSPORT_MODE` and the corresponding server-only network configuration. Communication intents, the worker, Finance, Orders, Special Offers, and campaigns do not change.

## Current network mode

Production must use `MOLDCELL_TRANSPORT_MODE=relay` while Moldcell allowlists only the current Novotech egress `178.168.8.4`. `MOLDCELL_RELAY_URL` must end in `/internal/omnichannel/v1/sms/moldcell`. The unauthenticated legacy `/notification/moldcell-send/` endpoint is explicitly rejected and remains untouched for old B2B compatibility.

The new relay endpoint is additive. It accepts exactly:

- `deliveryId`
- `recipient`
- `message`
- `idempotencyKey`
- `timestamp`

It rejects caller-controlled sender, template, provider URL, credentials, or any other field. HMAC-SHA256 covers timestamp, nonce, SHA-256 of the exact body, and idempotency key. The default replay window is five minutes. A bounded relay store rejects nonce replay, returns a cached completed response for an identical idempotency key, rejects conflicting reuse, and applies a safety rate limit. Omnichannel remains the owner of business idempotency, retry schedules, and throughput policy; the relay performs one bounded provider attempt.

The included route adapter uses a bounded process-local store and is appropriate only for a single-instance static-egress relay. A multi-instance deployment must inject a shared atomic implementation of `MoldcellRelayReplayStore` before traffic is enabled. This preserves the endpoint and provider contracts while moving replay state to Redis/Postgres or another shared store.

## Server-only configuration

Omnichannel relay caller:

```text
SMS_MODE=SANDBOX
COMMUNICATION_SMS_KILL_SWITCH=OFF
MOLDCELL_TRANSPORT_MODE=relay
MOLDCELL_RELAY_URL=https://<relay-host>/internal/omnichannel/v1/sms/moldcell
MOLDCELL_RELAY_KEY_ID=<rotatable-key-id>
MOLDCELL_RELAY_AUTH_SECRET=<at-least-32-random-characters>
```

Static-egress relay:

```text
MOLDCELL_RELAY_KEY_ID=<same-key-id>
MOLDCELL_RELAY_AUTH_SECRET=<same-secret>
MOLDCELL_RELAY_SINGLE_INSTANCE=CONFIRMED
MOLDCELL_BASE_URL=https://wsg.moldcell.md
MOLDCELL_PROVIDER_ID=<provider-identifier>
MOLDCELL_CUSTOMER_ID=<customer-identifier>
MOLDCELL_GUID=<rotatable-provider-secret>
```

No value above may be exposed to the browser, persisted in delivery payloads, or logged. Credentials can rotate through configuration without code changes. Modern TLS defaults are used; there is no TLS downgrade.

## Status semantics

- `0` → `PROVIDER_ACCEPTED`; never `DELIVERED`.
- `20001` → `INVALID_MSISDN`, permanent failure.
- `20012` → `OUTNET_NOT_ALLOWED`, permanent failure.
- Any other nonzero code → `UNKNOWN_PROVIDER_FAILURE`, permanent until governed evidence proves retryability.
- HTTP 429/5xx, timeout, and network errors remain retryable by the existing Omnichannel worker.

No authoritative public Moldcell WSG v1.03 callback, polling, or DLR contract was found. V1 therefore ends at provider acceptance.

## Moving away from the relay

After the new runtime has provider credentials and a Moldcell-allowlisted stable egress:

1. Set `MOLDCELL_TRANSPORT_MODE=direct`.
2. Configure `MOLDCELL_BASE_URL`, `MOLDCELL_PROVIDER_ID`, `MOLDCELL_CUSTOMER_ID`, and `MOLDCELL_GUID` server-side.
3. Run one allowlisted sandbox acceptance and verify result code `0` plus physical receipt.
4. Remove relay configuration only after the acceptance succeeds.

No business or Omnichannel module changes are required.

## Adding another country/provider

Implement `SmsProvider`, add its server-side configuration/transport, and extend the provider routing configuration with an E.164 prefix such as `+40` or `+49`. Feature modules continue creating the same `CommunicationIntent`; no account or delivery schema redesign is required.
