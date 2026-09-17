# Final Customer Payments

## Ownership and lifecycle

The provider-neutral Payment Domain owns payment attempts, provider evidence, reconciliation, refunds, and the effective payment projection. `RetailOrder` owns the commercial order lifecycle. A confirmed order may therefore remain `confirmed` after a full refund while its effective payment state is `REFUNDED`.

Historical attempts are append-only: a successfully paid attempt remains historically `paid`. Confirmed refund evidence is stored separately. `retail_payment_current_states_v1` projects the customer/admin state and, after a full accepted refund, returns `payment_state=REFUNDED` and `remaining_refundable=0.00`.

Customer states are `UNPAID`, `PAYMENT_PENDING`, `PAID`, `REFUND_PENDING`, `REFUNDED`, `FAILED`, and `CANCELLED`, with RU/RO presentation. Repayment of a fully refunded order is not enabled; a future business decision is required before such a flow may exist.

## Security boundary

- Payable amount and MDL currency come only from the immutable server-side Retail Order snapshot.
- Browser return URLs are not payment evidence. MAIB GET/status evidence is verified against attempt, order reference, amount, and currency before activation.
- Public/customer clients cannot read or mutate payment tables. The current-state view is service-role-only and uses the existing customer-owned order boundary before projection is attached.
- Refund mutation requires `admin.payments.refund`.
- Concurrent/double-click initiation reuses the governed active attempt. Ambiguous provider POST results are reconciled by GET and are never blindly repeated.
- The Portal never collects or stores PAN, CVV/CVC, or full card credentials. Card entry is owned by MAIB hosted checkout.

## Operations and failure tolerance

`MAIB_PAYMENT_MODE=DISABLED` independently disables the provider. `RETAIL_CHECKOUT_ENABLED=false` keeps unrestricted public checkout gated. Existing orders, catalog, cart, and customer cabinet remain readable when MAIB is unavailable. Disabling payment does not alter payment/refund history.

1C payment/refund accounting remains paused. A future handoff may consume normalized verified payment/refund events; it must not reinterpret browser returns or provider transport payloads as accounting truth.
