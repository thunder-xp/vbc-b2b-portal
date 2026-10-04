# Special Offers Wave 2B measurement and pilot operations

## Ownership and attribution

Partner detail view → existing server action/service/company-context boundary → existing engagement table. One view per actor, company, existing browser session and publication; retries/refreshes cannot create another view for that scope. The server resolves publication/mechanic/audience. It accepts no browser company or publication evidence. Measurement failures never block the offer.

Existing add and complete-kit actions remain the intent source. Their first eligibility enrichment is preserved across retries. Publication item identity survives retirement of the live campaign item; the existing FK may still SET NULL when drafts replace items. No commercial function, qualification condition, price selection, cart mutation, checkout, ERP payload or order creation behavior is changed.

An attributed order is a currently `submitted` order containing at least one line with immutable `effective_price_evidence.priceSource = CAMPAIGN_PROMO` and a matching campaign/item/publication, quantity, product, source price/currency and provenance fingerprint in the existing attribution table. Legacy cart-intent-only rows are excluded. Benefit companies, units, line amounts and reward purchases derive from those lines. A full order counts once per campaign even with multiple priced lines. Order value sums all its saved lines once, grouped by settlement currency. Across campaigns, these order totals are not additive.

Qualification is **observed**, from an eligible add/complete-kit action or a confirmed campaign-priced transaction. It is not a census of every temporary cart state. View/action and view/qualification ratios use only companies with a recorded view followed by the relevant evidence in the selected reporting period. They assert temporal association, never causal effect. No marketing last-click window is introduced.

## Results and coverage

Existing workspace → Results comparison (20 campaigns per page, one batched aggregate RPC) → individual Results. Lifetime, 7/30-day and inclusive UTC custom calendar ranges (maximum 366 days) are supported. Publication selection preserves historical mechanic/evidence. Campaign detail links to Results and shows the strong PROMO order count instead of the weak cart-intent order count.

Private coverage singleton starts null. After the canonical release is READY, the release operator performs the one-time activation:

```sql
update private.campaign_measurement_coverage
set views_started_at=clock_timestamp()
where singleton and views_started_at is null;
```

The view RPC returns false before activation. Pre-coverage view metrics are null, not fabricated zeros. Partial-period coverage is disclosed. No exposure backfill is performed. Existing transactional provenance is queried in place, without creating redundant order events.

Unavailable: causal/incremental revenue or conversion uplift, GP/cost, observed base/PROMO price benefit, historical checkout-review counts, category breadth without a transactional category snapshot, and a complete census of carts qualifying without an observed action/order. An attributed total is neither incremental revenue nor promotion cost.

## Mechanics and pilots

| Mechanic | Available measurement | Recommended first pilot |
| --- | --- | --- |
| Legacy | detail reach, add intent, actual campaign-priced transaction when present | Existing governed offers; no new mechanic |
| Quantity | observed qualification, campaign-priced units, units per attributed order | One commercially approved high-volume Dahua SKU; manager chooses governed threshold, audience and period |
| Fixed bundle | complete-kit action, observed qualification, distinct purchased PROMO SKU breadth, attributed orders | Available when commercially useful; not required in the initial three pilots |
| Conditional attach | observed qualified action/transaction, historical reward add, reward purchased lines/units | Approved camera trigger → governed HDD PROMO; compare reward adds and purchases descriptively |
| Spend threshold | observed qualification, reward add/purchase, authoritative qualifying USD spend min/max retained at transaction | Approved scoped base-Partner-USD threshold → separate reward PROMO; monitor attributed whole-order and reward-line value |

Recommended initial pilots are Quantity, Conditional Attach and Spend. Managers must approve actual SKUs, thresholds, stock, governed PROMO prices, audience and publication period. Existing internal name/note is sufficient. This release does not create/publish any pilot, production order or payment. No claim that the offer changed behavior is justified without a later experiment/control design.

## Security, performance and cost

Results route and RPC require internal `campaigns.view`; Partner/anonymous/unauthorized internal users cannot read aggregate company activity. New functions have empty search_path and explicit grants/revokes; existing table RLS and no browser insert/update grants protect engagement and transactional evidence. The private coverage table has RLS, no client grants and no browser API. No Partner surveillance view or Service Role browser use is introduced.

Reporting filters campaign/date before aggregation, using the campaign/date engagement index and existing attribution/order indexes. No N+1 network calls, no 1C reads, no reporting on Partner render/resolver/checkout paths, and no jobs/polling. SQL index lookups within a bounded join are not per-order network requests.

Cost impact: one asynchronous server action plus one lightweight view RPC per actual detail navigation, including refresh retries; at most one new event per actor/company/session/publication. No success logging, scheduler, resolver events or per-card instrumentation. Comparison uses one list RPC plus one aggregate RPC per 20 campaigns; detail uses one aggregate RPC. Pricing request SQL is unchanged.

## Acceptance evidence

- Isolated target migration applies on the accepted Wave 2A schema.
- Runtime tests cover view/session/request duplicates, forged company/campaign/item, anonymous/Partner denial, publication retention, temporal cohorts, reward/spend evidence, one-order multi-line amount correctness and browser provenance/coverage write denial.
- All five isolated mechanic regression fixtures pass, including draft threshold changes and immutable version snapshots.
- Focused mechanics/cart/checkout/order/1C suite: 29 files, 309 tests pass. Shared-session/view tests also pass. The wider exploratory order suite exposes three baseline failures: two obsolete migration filenames and an old merge-RPC string expectation; no affected implementation files changed.
- Representative aggregate: 100,000 events (10,000 selected campaign, 90,000 outside scope), 1,001 attributed orders. Initial aggregate averages 41.68–49.90 ms; final temporal-cohort aggregate under concurrent build load averaged 101.56 ms, with EXPLAIN ANALYZE/BUFFERS 104.54 ms. Event and attribution campaign/date indexes are used; no full engagement-history scan. Final timing may vary by shared-host load.
- Resolver, 20 calls per fixture: 20 lines / 10 campaigns 78.55 → 82.14 ms; 50 lines / 10 campaigns 120.04 → 129.50 ms. Discovery remains one statement per cart; no new pricing SQL/events. These small shared-host variations are below the accepted Wave 2A 106.69/167.29 ms reference.
- Local Results observed at 390/768/1440 without page or internal horizontal overflow; period/publication filter works; no console/hydration errors. Actual local Partner detail plus two refreshes persists exactly one view/company and Admin reads it. Production evidence is required after canonical deployment before task completion.

## Production release evidence

Migration `20261004230000_special_offers_2_wave2b_measurement.sql` was applied only after its exact file reached canonical main (`b8a5c755`). Linked production parity is 548/548, with no pending migrations or ledger repair. Canonical Vercel deployment `dpl_9CPiwUXMUSXX3MbkEgEarPRPEBwm` became READY for nsd.md/www.nsd.md. View coverage was activated once at `2026-10-04 21:18:35.606808 UTC`.

The legitimate production Admin session loads Results; lifetime, seven-day and publication-5 filters work. A custom period ending before coverage reports unavailable views rather than fabricated zero. Production currently has zero strong campaign-priced order attributions; no pilot campaigns/orders/payments were created to populate metrics. Production RLS/grants and empty search_path match the isolated acceptance contract.

Acceptance found one presentation correction: the inclusive custom calendar period displayed its exclusive SQL upper-bound date. The follow-up changes only the displayed final day and adds its focused regression test. This justifies one additional UI build/deployment; the measurement SQL, pricing and order behavior remain unchanged. The same SHA is never redeployed.

Security advisor additions are expected: two authenticated SECURITY DEFINER entry points with explicit internal/company authorization, and the private coverage table's deliberate no-policy/default-deny RLS. Existing unrelated advisor findings are unchanged.
