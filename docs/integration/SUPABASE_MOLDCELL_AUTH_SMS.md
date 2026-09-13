# Supabase Auth OTP through Moldcell

## Flow

```text
browser → Supabase Auth signInWithOtp
        → signed Send SMS Hook /api/auth/hooks/send-sms
        → FinalCustomerAuthSmsService (purpose AUTH_OTP)
        → existing MoldcellSmsProvider
        → existing HMAC relay transport
        → nsd-sms-relay → Moldcell
browser → Supabase Auth verifyOtp → authenticated session → /account
```

Supabase generates and verifies the six-digit OTP. Portal only handles the OTP transiently inside the synchronous signed hook request and provider call. HTTP 200 is returned only after the existing provider reports acceptance.

## Hook verification

The endpoint accepts only JSON `POST` bodies up to 64 KiB. `standardwebhooks` verifies `webhook-id`, `webhook-timestamp`, and `webhook-signature` before strict validation of `user.id`, `user.phone`, and `sms.otp`. Unsigned/stale/invalid requests are rejected. The dedicated server-only configuration is:

```text
SUPABASE_SEND_SMS_HOOK_SECRET=v1,whsec_<secret>
```

Rotation is supported as a bounded `|`-separated set (`new|old`). This secret is never reused for relay HMAC, Shared Identity HMAC, service role, or any other subsystem.

Supabase hosted configuration must enable Phone Auth and configure the Send SMS Hook URL as `https://www.nsd.md/api/auth/hooks/send-sms` with the matching secret. OTP auto-confirm must remain off.

## Isolated Auth SMS policy

```text
AUTH_SMS_ENABLED=true
AUTH_SMS_MODE=SANDBOX
SMS_SANDBOX_ALLOWED_RECIPIENTS=<approved +373 E.164 recipient>
```

Allowed modes are `DISABLED`, `SANDBOX`, and `PRODUCTION`; every unknown/missing value fails closed to `DISABLED`. `SANDBOX` accepts only the existing exact server-side allowlist. `AUTH_SMS_*` does not inherit `SMS_MODE` and does not change Finance, marketing, campaigns, or durable CommunicationIntent policy.

The provider/relay variables remain the existing Moldcell transport configuration. No second Moldcell client exists. A stable hash of the Standard Webhooks message ID becomes the relay idempotency key and deterministic correlation UUID, so a Supabase hook retry cannot cause a second provider send.

## Privacy

Hard invariant: OTP plaintext and SMS body are never stored in CommunicationIntent, outbox, delivery receipt, database, audit, analytics, Sentry, or application logs. The dedicated path does not invoke the durable message lifecycle. The relay continues to log only masked recipient, correlation, provider code, and latency; it does not log message bodies.

The application rate limiter stores only the existing versioned Shared Customer Identity HMAC of the phone, minute bucket, count, and expiry. It stores neither raw phone nor OTP. It permits at most five hook deliveries per phone in ten minutes, in addition to Supabase Auth and relay limits.

## Failure contract

Invalid signatures return 401, invalid schemas 400, rate limits 429, and disabled/provider failures 503. UI receives only the generic localized message that the code could not be sent; provider codes, topology, and credentials are not exposed.

## Abuse and CAPTCHA decision

Current official Supabase guidance recommends configured Auth rate limits and CAPTCHA for production phone sign-in. V1 remains `SANDBOX`, restricted to one approved recipient, with Supabase per-IP/per-user limits, a 60-second resend UI cooldown, the five-per-ten-minute HMAC bucket, and the relay limiter. CAPTCHA is intentionally not imposed on this single-recipient acceptance path.

Before `AUTH_SMS_MODE=PRODUCTION`, enable a supported Supabase CAPTCHA provider and pass its challenge token to `signInWithOtp`, verify project SMS/OTP/verify limits, and complete an abuse review. Production mode must not be approved without that gate. This preserves a low-friction sandbox while avoiding an unprotected public SMS endpoint.

## Acceptance without secret disclosure

Acceptance may report signature validation, purpose, masked recipient, correlation ID, relay/provider acceptance, physical receipt, successful `verifyOtp`, session/AAL, account link, and cross-user isolation. It must never report the OTP or secret values.
