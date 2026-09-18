# MAIB website compliance readiness

Task: `MAIB-WEBSITE-COMPLIANCE-READINESS-V1-20260918`

This document records the website-only compliance scope. It does not assert that MAIB production credentials are active and it does not enable public card payments. `RETAIL_CHECKOUT_ENABLED=false` remains the required production state until separate owner and bank approval.

## Compliance matrix

| MAIB requirement | Implemented route / feature | Evidence | Status |
| --- | --- | --- | --- |
| HTTPS | All public routes | `http://www.nsd.md/` returns 308 to HTTPS; production sends HSTS | PASS |
| Merchant legal identity | Canonical `publicMerchantLegalProfile`; footer and `/contacts` | `NOVOTECH SYSTEMS S.R.L.`, IDNO `1018600013048`, TVA `0209950`, registered address supplied by Owner | PASS |
| Acceptable products/services | Public security-equipment catalog | Active public publication audit found no obvious prohibited product/category keyword | PASS |
| Detailed products | `/catalog`, product detail, `get_public_retail_online_payment_compliance_v1` | 813 visible products remain available for browsing; locale-aware payment eligibility fails closed for incomplete products | PASS for gate / PARTIAL content coverage |
| Service description | `/installation` | Existing factual selection, coordination, installation and configuration process; no invented fixed price/SLA | PASS |
| Terms | `/terms?lang=ru|ro` | Version `2026-09-18`, effective `2026-09-18`, merchant identity, payment, delivery, withdrawal/refund, non-conformity, warranty and contacts | PASS |
| Privacy | `/privacy?lang=ru|ro` | Actual order, Final Customer, OTP, payment boundary, service, communication and technical-data practices | PASS |
| Ordering/payment conditions | `/terms`, checkout, server payment claim | Authoritative order amount; browser return is non-authoritative; public payment remains disabled | PASS |
| Delivery | `/delivery?lang=ru|ro` | Store pickup and coordinated delivery in Moldova; no invented fixed tariff/timing | PASS |
| Returns | `/returns?lang=ru|ro` | Separate RU/RO sections for distance-sale withdrawal, procedure/refund, non-conformity and warranty; statutory 14-day baseline | PASS |
| Contact | `/contacts?lang=ru|ro` | Legal entity, IDNO, TVA, registered address, public phone/email, separate store addresses and hours | PASS |
| Explicit acceptance | Retail checkout | Required checkbox, unchecked by default, links to Terms and Privacy | PASS |
| Versioned acceptance evidence | `public_legal_document_versions`, `retail_legal_acceptances`, `create_public_retail_order_v3` | Exact terms/privacy versions, order/customer, locale, server timestamp; append-only trigger | PASS |
| Server payment gate | `claim_retail_payment_attempt_v2` | Returns `TERMS_NOT_ACCEPTED` or `EMAIL_REQUIRED` before calling the existing mutating claim | PASS |
| Customer email | Checkout + payment claim | Required and bounded at checkout; independently revalidated from authoritative `retail_customers` row before PaymentAttempt creation | PASS |
| Payment confirmation email | Payment Domain + durable Omnichannel | `persist_retail_payment_confirmation_email_v1`; unique intent/delivery identity; authoritative PAID/DUPLICATE only | PASS |
| Payment result page | `/payment/return` | Token-bound order number, amount/currency, confirmed date and items; processing/success/failure states RU/RO | PASS |
| MAIB logo | Shared public footer | Official MAIB merchant package asset | PASS |
| Supported SIP logos | Shared footer | Official MAIB merchant package assets for Visa, Mastercard and American Express | PASS |
| maib liber | Not rendered | Owner decision: Novotech does not participate | NOT_APPLICABLE / NO |
| Bank review with payment disabled | Public routes and checkout pilot surface | Legal pages/footer/catalog are independent of production MAIB credentials | PASS after deployment; checkout acceptance surface remains governed by existing pilot access |

## Merchant legal identity source

The canonical Owner-approved merchant facts are:

- legal company name: `NOVOTECH SYSTEMS S.R.L.`;
- IDNO: `1018600013048`;
- TVA: `0209950`;
- registered address: `MD-2001, mun. Chișinău, str. Mihail Kogălniceanu 9, of. 17`;
- brand/display name: Novotech;
- email: `info@nsd.md`;
- customer phone: `+373 79 313 353`;
- operational stores: Chișinău, str. Lev Tolstoi 4; Bălți, str. Dumitru Caraciobanu 118;
- published working hours.

The registered address and operational store addresses remain visibly distinct. All legal surfaces consume the same server-side `publicMerchantLegalProfile`; values are not duplicated across components.

## Legal version and acceptance evidence

- Terms version: `2026-09-18`.
- Privacy version: `2026-09-18`.
- Stable sources: `/terms` and `/privacy`, locale selected with `?lang=ru|ro`.
- Acceptance is required to create a public Retail order in the current card-payment checkout flow.
- Evidence is append-only and binds the immutable Retail Order, Retail Customer, exact versions, locale and server timestamp.
- The payment service rechecks current evidence and email before any PaymentAttempt/provider checkout can be created.
- The checkout button state is not the authority; the RPC is fail-closed.

## Payment confirmation email

The authoritative `RetailPaymentService` requests the idempotent Omnichannel intent only after `PAID`, including duplicate/reconciliation recovery paths. The email snapshot contains:

- order number;
- `NOVOTECH SYSTEMS S.R.L.` and `www.nsd.md`;
- paid amount and currency;
- authoritative provider-confirmed timestamp;
- purchased SKU/name and quantity.

No PAN, CVV/CVC, access token, provider secret or raw callback payload is included. A mail-delivery failure does not roll back or downgrade an authoritative paid order; durable delivery diagnostics remain in the existing Omnichannel outbox/audit.

## Payment result page

The MAIB success and fail URLs point to:

`https://www.nsd.md/payment/return?provider=maib&paymentAttemptId=<id>`

A separate scoped return token is stored only in an HttpOnly, SameSite cookie and its hash is persisted with the PaymentAttempt. It is not the Retail Order access token and is not included in the MAIB URL. The cookie must match before order or payment details are returned. Browser return never activates the order. Before authoritative confirmation the page says that payment is processing. Confirmed, failed, cancelled and refund states are projected from the Payment Domain.

## Product-content audit

Production active public publication snapshot:

| Metric | Count |
| --- | ---: |
| Publicly purchasable products | 813 |
| Missing RU name | 0 |
| Missing RU description | 0 |
| Missing RO name | 708 |
| Missing RO description | 708 |
| Missing image | 14 |
| Missing/invalid price | 0 |
| Missing structured technical detail | 483 |
| RO online-payment eligible | 105 |
| RU online-payment eligible | 779 |
| RO blocked by missing locale content | 708 |
| RO blocked by insufficient meaningful content | 509 |
| RU blocked by insufficient meaningful content | 22 |
| Obvious prohibited products/categories | 0 |

Counts by reason overlap: all 14 missing-image products are also in the current RO-gap set, and 509 products are both missing acceptable RO coverage and insufficient in RO under the bounded meaningful-content rule. No technical description or translation was fabricated.

The service-role-only `assess_public_retail_online_payment_content_v1` evaluates the current immutable public publication by locale. It requires a locale name, valid positive price/currency, a real product image, a meaningful description of at least 24 characters or at least three approved localized structured facts, and no governed `PROHIBITED_CATEGORY`/`CONTENT_REVIEW` block. `get_public_retail_online_payment_compliance_v1` returns counts plus the complete SKU/name/reason remediation list. The payment claim returns `CONTENT_NOT_ELIGIBLE` before any PaymentAttempt/provider call if any physical order line fails. Public browsing, B2B, Admin and catalog-management visibility are unchanged.

## Official logo assets

Source: official MAIB documentation merchant package linked from the current MAIB integration requirements.

| File | SHA-256 |
| --- | --- |
| `public/payment/official/maib.png` | `05dc435b3560762b239710b1613a6459194d68b74c7883ce646d819bb3544a3f` |
| `public/payment/official/visa.png` | `b105ef5ddc71d8884e2b96594f683e72a26be3e40cd60bcceee5dbec61485fb0` |
| `public/payment/official/mastercard.png` | `92d3b44dd2358d75c513b41ba206aee1fd723bb0b984857c8bb81634e27150f8` |
| `public/payment/official/amex.png` | `b4c363281534b52db57750945a24e6260ada9d161bb12a61782162cd519380bc` |

MAIB, Visa, Mastercard and American Express are rendered from the official MAIB merchant package. maib liber is not rendered (`MAIB_LIBER_APPLICABLE=NO`). Apple Pay, Google Pay and MIA are not advertised as separate Portal payment methods; any contracted capability exposed by MAIB belongs to the hosted MAIB checkout.

## MAIB production-project values

- Domain: `https://www.nsd.md`
- Platform: Next.js App Router on Vercel
- Callback: `https://www.nsd.md/api/payments/maib/callback`
- OK URL: `https://www.nsd.md/payment/return`
- Fail URL: `https://www.nsd.md/payment/return`
- Production credentials: not issued/active for this task; no OAuth retry is permitted.
- Public online payment: disabled.

Hosting/IP detail is provided to MAIB from the governed Vercel project because the hosting address may be platform-managed rather than a permanent single IP.

## Owner inputs still required

None for the MAIB website compliance contract. Product-content remediation remains governed operational work; the payment gate prevents materially incomplete products from reaching MAIB without removing them from public browsing, B2B, Admin or catalog management.

## Bank submission checklist

- [x] Legal company name, IDNO, TVA and registered address supplied and published.
- [x] Distance-sale return/refund rules approved, separated from warranty/non-conformity, reviewed in RU/RO and published.
- [x] Incomplete products fail closed for online payment and have a governed remediation list; ordinary public/B2B/Admin visibility is unchanged.
- [x] MAIB, Visa, Mastercard and American Express official package assets are displayed.
- [ ] Site URL: `https://www.nsd.md`.
- [ ] Terms: `https://www.nsd.md/terms`.
- [ ] Privacy: `https://www.nsd.md/privacy`.
- [ ] Delivery: `https://www.nsd.md/delivery`.
- [ ] Returns: `https://www.nsd.md/returns`.
- [ ] Contacts/legal details: `https://www.nsd.md/contacts`.
- [ ] Callback: `https://www.nsd.md/api/payments/maib/callback`.
- [ ] OK/Fail route: `https://www.nsd.md/payment/return`.
- [x] Official MAIB and SIP logos visible in the shared public footer; maib liber remains absent.
- [ ] Explicit Terms/Privacy checkbox and versioned evidence demonstrated.
- [ ] Authoritative exactly-once payment-confirmation email demonstrated in controlled acceptance.
- [ ] Confirm to MAIB that integration testing is already complete and public payment remains gated until production project activation.

## Owner-ready submission facts

- Website: `https://www.nsd.md`
- Terms: `https://www.nsd.md/terms`
- Privacy: `https://www.nsd.md/privacy`
- Delivery: `https://www.nsd.md/delivery`
- Returns: `https://www.nsd.md/returns`
- Contact/legal: `https://www.nsd.md/contacts`
- Callback: `https://www.nsd.md/api/payments/maib/callback`
- OK: `https://www.nsd.md/payment/return`
- FAIL: `https://www.nsd.md/payment/return`
- Payment logos: MAIB / Visa / Mastercard / American Express, from the official MAIB package
- Production payment: `DISABLED`, pending MAIB production keys and a separate explicit activation decision
