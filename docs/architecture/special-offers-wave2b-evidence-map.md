# Special Offers Wave 2B: evidence map (before implementation)

Baseline: `24ce81418d73f5faa027d1e2c5e3b16111bf3383`.

| Evidence | Existing source/persistence | Campaign/version/company/mechanic | Product/quantity/value/time | Decision |
| --- | --- | --- | --- | --- |
| Publication and lifecycle | campaign versions, audience snapshots, immutable audit events | campaign + publication; audience company; definition mechanic | published composition; audit timestamp | Reuse; never rewrite publications |
| Detail view | engagement RPC/table, but no UI callers | server company/actor; current campaign/version/mechanic | optional product, timestamp; no commercial value | Necessary gap: connect actual detail view, bound once per existing browser session and publication; correct retry mutation |
| Add intent | existing add RPC writes `added_to_cart` | campaign/version/company/mechanic | product + requested quantity + time | Reuse; not evidence of applied pricing |
| Complete kit | existing `bundle_added_to_cart` plus component adds | campaign/version/company/mechanic | added component quantities + time | Reuse; report complete-kit action separately from component adds |
| Qualification during commercial action | existing engagement `mechanic_eligible` | versioned server-owned eligibility | product + quantity + time | Reuse observed qualified actions; completeness differs by mechanic; transaction qualification also proven by actual PROMO snapshot |
| Current benefit / checkout review | private `partner_cart_price_reviews.evidence` | resolved campaign/version/mechanic and owning cart/company | source price + mechanic evidence | Mutable current review, not historical checkout funnel. Do not misrepresent as durable lifetime review counts |
| Benefit and order | immutable `partner_order_items.effective_price_evidence`; immutable campaign order attribution | server snapshot campaign/version/mechanic; order company | product, quantity, source amount/currency; settled line total and FX; order time | Primary deterministic attribution: priceSource = CAMPAIGN_PROMO AND matching persisted attribution. Exclude legacy cart-intent-only attribution |
| Spend qualification | order price evidence `qualifyingSpendUsd`, `spendConfig`, `qualifyingSources` | publication and scope preserved | authoritative USD spend at transaction | Reuse; no new resolver events |
| Attach reward purchase | order price evidence `attachRole` / `spendRole` = REWARD | campaign/version/company/mechanic | reward product + units + settled value | Reuse; action reward role must use historical publication definition, not edited current items |
| Base Partner price difference | PROMO order evidence stores applied source price, not guaranteed base Partner price | no complete transaction base-price snapshot | current prices cannot reconstruct historical difference safely | Unavailable; do not calculate savings from current price |
| Gross profit | no governed transaction cost snapshot in this call path | unavailable | no authoritative cost | Unavailable; no shadow costing |
| Behavior session | `novotech-behavior-session` sessionStorage UUID | authenticated actor resolved server-side | non-fingerprinting session convention | Reuse session convention; dedicated campaign dedupe keys, not another event system |
| Admin analytics | campaign detail flat counts, including weak legacy attribution | campaign aggregate | counts only | Replace visible misleading counters with Results; bounded aggregate RPC, existing campaigns.view internal authorization |

## Minimum implementation contract

Reuse engagement and order-attribution tables. No new generic telemetry, mechanic, pricing engine, jobs, polling, or order events. Append only new view evidence; request collisions must never update historical events. Record publication/mechanic on the server and deny forged company/item context. Views are bounded by actor/company/session/publication; refresh is not another exposure.

Reporting separates observed qualified actions from transaction-proven qualification. Qualification outside a recorded action/order is not a complete cart census. Applied benefit means persisted campaign-priced order lines, not cart intent or a rendered promotional price. Order count is distinct; line amounts count each line once and full-order value each order once, grouped by settlement currency. Exclude failed/unpersisted order submissions according to existing lifecycle evidence and disclose eligible statuses. Never infer views from purchases.

The reporting period is bounded; publication drill-down retains historical context. Historical view coverage is explicitly unavailable before instrumentation activation. Ratio denominators use intersecting viewed-company cohorts with actions/qualification at or after their first recorded view in the selected period, not unrelated counts or purchases before a view; ratios are descriptive and never causal. Unsupported stages (historical checkout review, observed base-price savings, GP, category breadth without transactional category snapshot) remain unavailable.

Release activation: after the canonical deployment is READY, the release operator sets the private singleton `views_started_at` once. The view RPC does nothing before activation. This records an honest production instrumentation start and never fabricates historical exposure. No Partner/Admin browser has write access to that private configuration.

## Nice-to-have / deferred

Impressions on the listing, click timing, session duration, historical exposure backfill, causal uplift, experiment management, baseline comparison and automated campaign creation. Existing campaign name/internal note is sufficient for pilots.
