# MAIB E-commerce Integration

## Environments

The server-only adapter accepts an explicit mode:

- `DISABLED`: default/fail-safe; no provider commands.
- `SANDBOX`: API origin `https://sandbox.maibmerchants.md`, hosted checkout `https://checkout-sandbox.maib.md`.
- `PRODUCTION`: API origin `https://api.maibmerchants.md`, hosted checkout `https://checkout.maib.md`, public origin exactly `https://www.nsd.md`.

Required server-only configuration is `MAIB_PAYMENT_MODE`, `MAIB_CLIENT_ID`, `MAIB_CLIENT_SECRET`, `MAIB_SIGNATURE_KEY`, `MAIB_API_BASE_URL`, and `PUBLIC_APP_URL`. No value is exposed through `NEXT_PUBLIC_*`, diagnostics, or logs. Admin diagnostics expose only mode, origins, callback/return URLs, a one-way client-ID fingerprint, safe error category, and OAuth latency.

Production endpoints:

- callback: `https://www.nsd.md/api/payments/maib/callback`
- success/fail return: `https://www.nsd.md/payment/return`
- currency: MDL

OAuth connectivity is the first production gate and performs no checkout, payment, or refund command. Public checkout stays gated by `RETAIL_CHECKOUT_ENABLED=false` until owner approval.

## Payment and refund commands

Checkout creation uses the authoritative Retail Order amount/currency and an idempotent local claim. Provider success is accepted only after authoritative provider lookup and exact identity/amount/currency checks. A browser return never marks an order paid.

Full refund uses the governed refund ledger and `admin.payments.refund`. Exactly one provider POST is allowed for a claimed refund. Network/ambiguous responses remain pending and are resolved through provider refund/payment GET endpoints. The original paid attempt is retained; the effective state becomes `REFUNDED` only after accepted provider evidence, with zero remaining refundable amount.

## Hosted payment methods

Official Checkout V2 material documents card entry and may expose Apple Pay and MIA from MAIB hosted checkout when enabled for the production merchant. No Portal branch is required when MAIB exposes them on the hosted page. Current production merchant enablement must be verified on the real hosted checkout/merchant account. Google Pay enablement is not proven by the available Checkout V2 contract and requires explicit MAIB confirmation. The Portal must not claim any wallet READY until that evidence exists.

## Activation and rollback checklist

1. Keep `RETAIL_CHECKOUT_ENABLED=false`.
2. Configure production mode and production credentials server-side.
3. Run OAuth-only diagnostics and verify production host/fingerprint.
4. Deploy and verify callback/return reachability plus RLS/grants.
5. Obtain explicit owner approval for one low-value live payment.
6. Reconcile to `PAID`, verify customer/admin projections, and re-prove duplicate initiation safety.
7. Obtain separate explicit owner approval for one full refund.
8. Reconcile to `REFUNDED`, verify remaining refundable `0.00`, and re-prove duplicate refund safety.

Emergency rollback is `MAIB_PAYMENT_MODE=DISABLED`; retaining `RETAIL_CHECKOUT_ENABLED=false` also prevents unrestricted public initiation. Neither rollback deletes or rewrites financial history.

## Future 1C seam

No 1C write occurs in this integration. A later governed accounting adapter may consume normalized, reconciled payment/refund facts using immutable Portal identifiers and idempotency keys. That adapter remains outside the customer render and provider callback paths.
