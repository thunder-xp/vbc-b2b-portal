# MAIB public checkout operations

## Emergency rollback

1. Set the canonical Vercel production variable `RETAIL_CHECKOUT_ENABLED=false` and redeploy the canonical `vbc-b2b-portal` project.
2. Verify that a public cart can no longer initiate a new payment.
3. Keep the MAIB callback route, production credentials, database functions, reconciliation cron, Finance payment projection, and refund actions enabled. In-flight callbacks and local activation recovery do not consult the public initiation gate.
4. Confirm that paid orders, append-only payment evidence, Finance visibility, and governed refunds remain available.

Do not delete payment attempts, change paid state manually, disable the callback route, or rotate MAIB credentials as part of the first rollback action.

## Reconciliation

`/api/cron/retail-payment-reconciliation` runs every five minutes and claims at most three due public MAIB attempts. Claims use a two-minute recoverable lease. A pending checkout is checked no more often than every ten minutes; provider or network errors back off from five minutes to fifteen minutes and then one hour.

Only explicit MAIB aggregate checkout states close an unpaid attempt: `Expired` and `Abandoned` become `expired`, `Cancelled` becomes `cancelled`, and `Failed` becomes `failed`. Active states remain pending. `paid_pending_activation` is retried locally without another provider lookup. The worker never runs from public page rendering and excludes MAIB review/sandbox orders.

## Incident signals

- OAuth and checkout creation failures: safe `failure_code` in Admin → Finance and structured application logs.
- Callback signature rejection: `maib_callback_rejected` log with safe reason.
- Amount/currency/order/payment mismatch: append-only provider-event outcome surfaced in Admin → Finance.
- Stuck pending or reconciliation failure: reconciliation timestamps, next attempt, outcome, and safe error code in Admin → Finance.
- Provider payment executed while activation is pending: `paid_pending_activation` state and `activation_pending` event.
- Confirmation email delivery failure: durable Omnichannel delivery state plus `retail_payment_confirmation_email_queue_failed`; paid state is unchanged.
- Refund failure: refund status and safe failure code in Admin → Finance.

Payment diagnostics store no PAN, CVV, OAuth token, MAIB signature key, or raw provider payload.
