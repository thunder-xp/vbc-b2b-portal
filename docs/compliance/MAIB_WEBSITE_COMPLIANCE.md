# MAIB website compliance readiness

Task: `MAIB-WEBSITE-COMPLIANCE-READINESS-V1-20260918`

This document records the website-only compliance scope. It does not assert that MAIB production credentials are active and it does not enable public card payments. `RETAIL_CHECKOUT_ENABLED=false` remains the required production state until separate owner and bank approval.

## Compliance matrix

| MAIB requirement | Implemented route / feature | Evidence | Status |
| --- | --- | --- | --- |
| HTTPS | All public routes | `http://www.nsd.md/` returns 308 to HTTPS; production sends HSTS | PASS |
| Merchant legal identity | Canonical `publicMerchantLegalProfile`; footer and `/contacts` integration point | No authoritative legal name, IDNO, or registered address exists in the repository or governed production projection | OWNER_INPUT_REQUIRED |
| Acceptable products/services | Public security-equipment catalog | Active public publication audit found no obvious prohibited product/category keyword | PASS |
| Detailed products | `/catalog`, product detail | 813 purchasable; all have RU name/description and price; gaps listed below | PARTIAL |
| Service description | `/installation` | Existing factual selection, coordination, installation and configuration process; no invented fixed price/SLA | PASS |
| Terms | `/terms?lang=ru|ro` | Version `2026-09-18`, effective `2026-09-18`, all MAIB-required structural sections | PARTIAL — legal identity and exact return policy pending |
| Privacy | `/privacy?lang=ru|ro` | Actual order, Final Customer, OTP, payment boundary, service, communication and technical-data practices | PASS |
| Ordering/payment conditions | `/terms`, checkout, server payment claim | Authoritative order amount; browser return is non-authoritative; public payment remains disabled | PASS |
| Delivery | `/delivery?lang=ru|ro` | Store pickup and coordinated delivery in Moldova; no invented fixed tariff/timing | PASS |
| Returns | `/returns?lang=ru|ro` | Contact and governed assessment procedure | OWNER_INPUT_REQUIRED — exact window, exclusions and refund method/timing |
| Contact | `/contacts?lang=ru|ro` | Public phone, email, store addresses, hours | PARTIAL — registered address absent |
| Explicit acceptance | Retail checkout | Required checkbox, unchecked by default, links to Terms and Privacy | PASS |
| Versioned acceptance evidence | `public_legal_document_versions`, `retail_legal_acceptances`, `create_public_retail_order_v3` | Exact terms/privacy versions, order/customer, locale, server timestamp; append-only trigger | PASS |
| Server payment gate | `claim_retail_payment_attempt_v2` | Returns `TERMS_NOT_ACCEPTED` or `EMAIL_REQUIRED` before calling the existing mutating claim | PASS |
| Customer email | Checkout + payment claim | Required and bounded at checkout; independently revalidated from authoritative `retail_customers` row before PaymentAttempt creation | PASS |
| Payment confirmation email | Payment Domain + durable Omnichannel | `persist_retail_payment_confirmation_email_v1`; unique intent/delivery identity; authoritative PAID/DUPLICATE only | PASS |
| Payment result page | `/payment/return` | Token-bound order number, amount/currency, confirmed date and items; processing/success/failure states RU/RO | PASS |
| MAIB logo | Shared public footer | Official MAIB merchant package asset | PASS |
| Supported SIP logos | Canonical payment-branding configuration; official assets prepared | Contracted card systems are not proven, so no SIP logo is rendered | OWNER_INPUT_REQUIRED |
| maib liber | Not rendered | Participation is not evidenced | NOT_APPLICABLE / UNKNOWN |
| Bank review with payment disabled | Public routes and checkout pilot surface | Legal pages/footer/catalog are independent of production MAIB credentials | PASS after deployment; checkout acceptance surface remains governed by existing pilot access |

## Merchant legal identity source

The only proven public facts are:

- brand/display name: Novotech;
- email: `info@nsd.md`;
- customer phone: `+373 79 313 353`;
- operational stores: Chișinău, str. Lev Tolstoi 4; Bălți, str. Dumitru Caraciobanu 118;
- published working hours.

The store addresses are not treated as the registered/legal address. The following exact owner-provided facts are still required before bank review:

1. registered legal company name;
2. IDNO;
3. registered/legal address.

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
- Novotech display name and `nsd.md`;
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
| Materially incomplete under the compliance audit rule | 708 |
| Obvious prohibited products/categories | 0 |

No technical description or translation was fabricated. The 708-product RO coverage gap and 14 missing-image products remain content-governance blockers for a claim of full catalog compliance. They do not affect B2B/internal product visibility.

## Official logo assets

Source: official MAIB documentation merchant package linked from the current MAIB integration requirements.

| File | SHA-256 |
| --- | --- |
| `public/payment/official/maib.png` | `05dc435b3560762b239710b1613a6459194d68b74c7883ce646d819bb3544a3f` |
| `public/payment/official/visa.png` | `b105ef5ddc71d8884e2b96594f683e72a26be3e40cd60bcceee5dbec61485fb0` |
| `public/payment/official/mastercard.png` | `92d3b44dd2358d75c513b41ba206aee1fd723bb0b984857c8bb81634e27150f8` |

Visa, Mastercard, AmEx, Apple Pay, Google Pay and maib liber are not advertised because actual merchant acceptance/participation is not proven. The official Visa and Mastercard files are prepared but remain inactive until the merchant agreement is confirmed.

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

1. Legal company name.
2. IDNO.
3. Registered/legal address.
4. Exact return window.
5. Exact eligible/ineligible return categories and exclusions.
6. Exact refund method and governed timing.
7. Confirmation that contracted card acceptance is Visa + Mastercard, and whether AmEx is accepted.
8. Confirmation whether maib liber participation is `YES` or `NO` (currently `UNKNOWN`, therefore hidden).

## Bank submission checklist

- [ ] Legal company name, IDNO and registered address supplied and published.
- [ ] Exact return/refund rules supplied, reviewed in RU/RO and published.
- [ ] RO product-content coverage and the 14 missing product images remediated or reviewed with MAIB.
- [ ] Supported card systems confirmed against the merchant agreement.
- [ ] Site URL: `https://www.nsd.md`.
- [ ] Terms: `https://www.nsd.md/terms`.
- [ ] Privacy: `https://www.nsd.md/privacy`.
- [ ] Delivery: `https://www.nsd.md/delivery`.
- [ ] Returns: `https://www.nsd.md/returns`.
- [ ] Contacts/legal details: `https://www.nsd.md/contacts`.
- [ ] Callback: `https://www.nsd.md/api/payments/maib/callback`.
- [ ] OK/Fail route: `https://www.nsd.md/payment/return`.
- [ ] Official MAIB logo visible; contracted SIP logos confirmed and then activated in the shared public footer.
- [ ] Explicit Terms/Privacy checkbox and versioned evidence demonstrated.
- [ ] Authoritative exactly-once payment-confirmation email demonstrated in controlled acceptance.
- [ ] Confirm to MAIB that integration testing is already complete and public payment remains gated until production project activation.
