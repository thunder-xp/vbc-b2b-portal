# Special Offers Wave 1B governed pricing

Task: `VBC-SPECIAL-OFFERS-2-WAVE1B-GOVERNED-PRICING-20261004`.
Baseline: `7bb40d1897762bea1b51a5498c916f232b4c787a`.

## Existing flow established before implementation

1. Catalog obtains synchronized `product_prices` through PricingInventoryService (catalog page aggregates use the same governed projection semantics).
2. Partner price follows the company's governed contract profile; current company-specific rows take precedence over global rows.
3. Cart stores product and quantity, not selling price. CartService projects prices dynamically through PricingInventoryService.
4. Quantity mutations send item/quantity only. The existing action revalidates `/cabinet/cart`, recalculating line sums and totals on the server.
5. Quote Builder uses context-free prices to initialize independently persisted estimate/version lines, purchase prices, selling prices and proposal settings. It has no campaign quantity/publication context.
6. Checkout resolves cash/cashless contract and source-price currency independently from MDL document settlement currency.
7. Checkout checks authoritative source-price freshness; existing targeted stale-price recovery is scoped to the contract profile. FX freshness and optimistic cart intent checks already exist.
8. Checkout obtains source prices, projects USD through the existing 113 or 999 rate path, and persists both source and MDL settlement/FX evidence.
9. `begin_partner_order_submission_v5` locks/validates cart quantities, governed header mappings and exact FX/payload consistency before writing the order. Before Wave 1B it did not compare submitted source amounts with synchronized product-price rows.
10. Order persistence retains source amount/currency and MDL amount, rate identity, purpose, source, effective/published timestamps and payload snapshot.
11. OneCOrderProvider sends both the governed contract's document `ВидЦен_Key` and explicit per-line `Цена`, `Сумма`, `Всего`. Readback compares the explicit unit price with the exported value.
12. Browser actions do not take numeric prices as authority. However, the DB submission RPC also needs independent synchronized-price validation because authenticated clients can invoke RPCs directly.
13. Existing campaign metadata represented attribution/display; `legacy_promo` did not override cart/order numeric prices. That semantic remains unchanged.

## Single effective-price authority

`resolve_partner_cart_prices_internal_v1` is the shared batch authority for cart review, checkout preflight and v5 mutation validation. It resolves the actor-owned cart/company itself, uses the normal synchronized base price, and calls Wave 1A `resolve_commercial_campaign_item_eligibility_v1` for quantity benefits. It does not calculate a discount.

An eligible line uses the exact published, active, resolved USD PROMO row and exact profile identity (PROMO / UU-000021 / b9f5d585-dab1-11e9-8a58-000c29cf9dd4). Wave 1A eligibility also verifies that the current mechanic matches its immutable publication, exact price-row identity, minimum and company quantity limit. Lifecycle, audience, threshold and publication rules are not replicated in UI, CartService or export.

The authenticated review adapter requires partner-price visibility. The order adapter is service-role-only and receives the actor resolved from the authenticated server session; it preserves hidden-price employee checkout without exposing a new price-read RPC. Both call the same internal authority. Base/retail/stock/rates remain in parallel batches; effective source prices reuse existing MDL conversion code.

## Review/conflict and concurrency

Private `partner_cart_price_reviews` retains only the last server-resolved price evidence. Quantity changes delete that acknowledgement, so explicit 5 → 4 reprices normally. Campaign pause/expiry/audience/publication/price loss does not erase it. Checkout compares the current result against previously shown PROMO and raises existing `ORDER_PRICE_CHANGED` instead of submitting at a higher base price. A cart review displays and acknowledges the new result.

Unchanged review does not write cart rows, enqueue opportunity projections or generate engagement/audit events. Private acknowledgements update only on a changed result. Cart ownership/authorization, company advisory lock and row locks serialize pricing/submission. Campaign-add uses the same company-before-cart lock order. Selected campaign/item/profile/price rows are locked for submission validation. v5 revalidates after preflight in its own transaction; the existing submission-key/fingerprint idempotency remains intact.

Existing targeted recovery refreshes the contract profile. A stale selected PROMO fails closed with existing `ORDER_PRICE_STALE`; it does not refresh another profile or introduce live ERP calls on cart/render/mutation.

## Persistence and security

Order-item `effective_price_evidence` stores source PARTNER/CAMPAIGN_PROMO, synchronized price row ID, profile reference, source amount/currency and, for PROMO, campaign/item IDs, publication version, mechanic and threshold. Existing settlement/FX columns retain converted MDL and authoritative rate evidence. A DB trigger copies validated private evidence and prevents provenance changes.

v5 compares source amount/currency and any supplied provenance against the resolver. Base source currency must still match the governed contract; eligible PROMO proves its own USD profile. Existing MDL settlement and 113/999 FX validation remain mandatory. Forged amounts/campaigns/versions/eligibility cannot set persisted truth. Old submission RPCs 1–4 are revoked from public/anon/authenticated because they lack current source-price validation; the production portal calls v5.

PROMO attribution uses persisted publication evidence, including carts added outside the Offers page. Existing non-price/legacy attribution is retained. Historical publications and old order rows are not rewritten/backfilled.

## Collision policy

Quantity-PROMO publication rejects overlapping product + included company + time scopes atomically. No priority/minimum-price selection or stacking is invented. The resolver also fails closed if multiple current benefits become applicable (including a later lifecycle/audience change).

## ERP and Quote Builder boundaries

ERP receives the same explicit MDL line amount that is persisted in VBC, derived only by the existing authorized FX conversion from the selected synchronized source row. The header remains the contract price type; no integration protocol or return-url/payment authority is changed. Existing readback validates explicit line prices.

Quote Builder shares base-price loading, but its persisted purchase/selling price/version architecture is independent of cart-context transaction resolution (`estimate.service.ts`, `lifecycle.service.ts`). It remains unchanged. A separate integration must define how quantity edits and proposal-version purchase-price acknowledgements consume this resolver without changing independent proposal selling-price/markup semantics. Estimate-to-cart continues to merge product/quantity intent; cart then resolves its actual transactional price centrally.

## Performance and release

One cart-scoped RPC replaces the base-price read; stock, reference prices and FX remain batched. Product/campaign discovery has `(product_id, campaign_id)` indexing and bounded current audience/period filtering. There are no new background jobs, polling, browser service-role exposure, render success logs or ERP calls. Unchanged acknowledgement has no write. Local fixture measurements and browser/release evidence are recorded in the task acceptance report; production scale performance must not be inferred from a one-product fixture.

## Isolated acceptance

Normal password sign-in through local Supabase Auth established the test Partner browser session. The browser displayed 1,657 MDL from 92 USD at quantities 1 and 4, and 1,513 MDL from 84 USD at quantity 5 (999 rate 18.0105). Both quantity transitions were verified. Pausing the campaign after displaying PROMO produced the existing commercial-conflict message and no order/export. After reviewing the restored campaign, one successful order persisted 84 USD, 1,513 MDL per unit, 7,565 MDL total, campaign item and immutable publication version 1. The browser reached the accepted-order page.

The unchanged production OneCOrderProvider was exercised against an isolated loopback OData fixture: exactly one POST, explicit MDL price 1,513, quantity 5, total 7,565; subsequent readback matched. This proves the export contract and implementation, not a purchase in production ERP. No production test campaign, order, payment or ERP document was created.

Final validation on updated main `8da1f7fc33a3434501b2e0e67c69fd855396c1e2`: 188 focused tests, TypeScript, ESLint (zero errors; three existing test warnings), production build, full local migration replay, Wave 1A SQL regression and Wave 1B SQL mutation/security/persistence matrix. A warmed one-product fixture measured 100 unchanged resolver calls in approximately 623 ms (6.23 ms/call); baseline source-only reads were approximately 1.5 ms/100. These are DB-only fixture measurements, not production latency estimates.
