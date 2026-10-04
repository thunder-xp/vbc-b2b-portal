# Special Offers Wave 1 foundation review

Task: `VBC-SPECIAL-OFFERS-2-WAVE1-FOUNDATION-REVIEW-20261004`.
Baseline: `9afb58fcede72bd39ecba125f0c3b618dfb4f00a`.
Branch: `refactor/special-offers-wave1-foundation-review-20261004`.

## Architecture scorecard

| Area | Result | Evidence / disposition |
| --- | --- | --- |
| Domain model | WATCH | Explicit four-mechanic union; four nullable item condition fields are bounded by service/SQL validation and CHECK constraints. A different economic mechanic should get a deliberate typed configuration boundary. |
| Readiness | HEALTHY | Shared publication lifecycle validates common fields/audience, then explicit typed composition. Editor now uses the same quantity invariant as service validation. SQL remains authoritative. |
| Eligibility | HEALTHY | One item eligibility entry point; shared component conditions plus explicit quantity/bundle/attach evaluators. Actor, audience, publication, cart ownership and stock remain server-owned. |
| Pricing resolver | WATCH | One final cart price authority. Explicit dispatch is manageable; per-line base-price and permission reads remain a scaling consideration. No second mechanic-specific price engine. |
| Publication | HEALTHY | Versioned definition/item/audience snapshots, immutable history guards and publication locks. New metadata is captured additively. |
| Provenance | HEALTHY | Common order `effective_price_evidence` and mechanic metadata; legacy display/attribution is distinguished from an actually applied governed price. |
| Collision model | HEALTHY | Product/audience/time overlap is rejected under serialized publication, including attach triggers. No stacking or priority winner is introduced. |
| Admin UX | HEALTHY | One builder and Preview. Initialization/switch defaults now share one explicit transition policy; stale fields clear before save. |
| Partner UX | HEALTHY | Shared campaign card/detail and governed cart mutations, with separate bundle/attach progress presentation. No client price authority. |
| Test architecture | HEALTHY | Existing runtime fixture is reused for the new backend draft-switch case; focused pure-contract and builder tests cover consolidation. |
| Security | HEALTHY | New Wave 1 function grants/search paths checked read-only in production; advisor WARN count remains 762, delta 0. |
| Performance | WATCH | Moderate 20/50-line, 10-campaign measurements are safe; very large baskets/campaign catalogs are not proven by this bounded test. |

## Findings recorded before refactoring

| Category | Location | Current behavior / risk | Action |
| --- | --- | --- | --- |
| Healthy | Wave 1A–D SQL eligibility, publication, cart/order resolver | One central price authority, immutable versions and strict collisions. Defensive locked price revalidation protects checkout races. | Preserve SQL and schemas. |
| Minor debt | `CampaignBuilder.tsx` step validation / Preview; `commercial-campaign.service.ts` | Required-quantity bounds/caps repeated. Bundle editor/Preview allowed quantity below purchase minimum; trigger step differed from service/Preview. Invalid drafts could look ready then fail server validation. | Share a pure draft-contract predicate with explicit per-mechanic minimum. |
| Minor debt | `CampaignBuilder.tsx` product initialization / mechanic change | Two copies of default/clear policy could diverge when fields change. | Share an explicit typed item transition helper and test all 16 from/to pairs. |
| Structural watch | Nullable item configuration; central resolver | Unbounded future nullable fields or multiplying per-line DB work would raise extension cost. Current four-mechanic model does not yet justify a schema or resolver rewrite. | Document next-mechanic design boundaries and measure moderate scaling; no speculative framework. |

Implemented only the two minor items. `campaign-draft-mechanics.ts` owns draft shape and numeric validity, never published eligibility or price. The quantity-threshold purchase-minimum independence remains unchanged; bundle/trigger requirements respect their existing service minimum. Caps, messages, product DTOs, benefit choices and server errors remain intact. Attach transitions require explicit trigger/reward editing; legacy keeps the current benefit choice while clearing all condition fields.

## Schema and function map

Historical migrations are unchanged:

| Wave / migration | Schema effect |
| --- | --- |
| 1A / `20261004170000_special_offers_2_wave1a_quantity_promo.sql` | Campaign `mechanic_type`; item `promo_threshold_quantity`; engagement/attribution product, version and mechanic evidence; quantity/cap/enum constraints; audit product foreign keys. |
| 1B / `20261004190000_special_offers_2_wave1b_governed_pricing.sql` | Private RLS-enabled `partner_cart_price_reviews`; order-item object `effective_price_evidence`; `(product_id,campaign_id)` campaign-item index; acknowledgement invalidation and order-evidence triggers. |
| 1C / `20261004200000_special_offers_2_wave1c_fixed_bundle_promo.sql` | Item `required_bundle_quantity` and minimum/cap constraint; extended mechanic/event enums; publication composition snapshot trigger; acknowledgement invalidation extends to insert/delete/update. |
| 1D / `20261004210000_special_offers_2_wave1d_conditional_attach_promo.sql` | Item `attach_role` / `required_trigger_quantity`, typed TRIGGER informational and REWARD PROMO constraints; extended mechanic/event evidence. No new table/index/policy/trigger. |

Wave 1 introduces 12 implemented functions: 7 public and 5 private. This is not 12 new browser RPC endpoints. It also preserves 10 renamed pre-Wave delegate identities and redefines existing APIs.

Public additions: `resolve_commercial_campaign_item_eligibility_v1`, `clear_cart_price_acknowledgement_on_quantity`, `resolve_partner_cart_prices_for_order_v1`, `resolve_partner_cart_prices_internal_v1`, `resolve_partner_cart_prices_v1`, `snapshot_partner_order_effective_price`, `complete_commercial_campaign_bundle_v1`.

Private additions: `campaign_scope_conflicts_v1`, `resolve_campaign_bundle_v1`, `resolve_campaign_component_conditions_v1`, `snapshot_campaign_bundle_contract_v1`, `resolve_campaign_attach_v1`.

Production catalog verification: all 12 deny anon execution; only the public item-eligibility, cart-resolver and bundle-completion functions grant authenticated execution. All 5 private helpers deny authenticated execution. Eleven are SECURITY DEFINER; the private composition snapshot trigger is SECURITY INVOKER. All have empty `search_path`; definers use explicit actor/company/permission checks with `row_security=off`. Private review storage is RLS-enabled and has no public/authenticated grants or reader policies. No privilege expansion, policy change or Service Role browser exposure occurs in this task.

Supporting indexes include cart `(cart_id,product_id)` uniqueness, campaign items `(product_id,campaign_id)` and campaign/sort order, audience `(company_id,included,campaign_id)`, campaign status/start and synchronized product-price profile/active-scope indexes.

**NO MIGRATION.** Production ledger remains 546 through `20261004210000`. No production SQL mutation, historical rewrite or clean schema replay is needed for this code-only consolidation.

## Runtime ownership and resolver

The Wave 1D central internal resolver body is about 158 lines with explicit branching (17 IF/ELSIF tokens, three FOR loops and 18 SELECT tokens; tokens are not round-trip counts). It loads the owned cart, discovers candidate publications once, caches bundle/attach qualification per campaign, selects benefit-bearing lines, rechecks locked synchronized PROMO prices and produces one effective result per line.

Common component conditions live in `private.resolve_campaign_component_conditions_v1`. Quantity evaluation remains line-based. Bundle and attach evaluators own exact server-cart composition; attach triggers always retain the governed partner price. Helpers report eligibility/reasons/composition, not invented numeric prices. Excess bundle/reward quantities fall back according to the existing accepted contracts. Quote Builder and 1C export boundaries are unchanged.

The PROMO identity is governed by profile external reference, UU-000021/PROMO identity, USD and published/current synchronized price. Display/search/readiness and final locked checkout intentionally repeat some identity predicates. There is one selling-price engine, but the SQL predicate is not literally implemented only once everywhere. Removing the locked defensive check to reduce duplication would weaken race safety.

Common lifecycle/readiness is delegated to the existing core publisher; typed wrappers add mechanic checks. Editor Preview is advisory. Bundle/attach repeat a small cart/audience/publication context guard; it is defensive and coupled to distinct exact-composition contracts. A new private helper migration solely to remove those few lines is unjustified now.

Publication snapshots include row fields and versioned composition/PROMO metadata. A future mechanic needs additive typed snapshot metadata and historical readers that tolerate absent keys. Never reinterpret or regenerate existing versions. Order evidence consistently records applied source, campaign/item/version/mechanic, governed profile/price IDs, USD source and FX snapshot. Quantity, bundle and attach add their relevant condition evidence. Legacy informational campaigns can remain PARTNER-priced: attribution/display does not falsely imply CAMPAIGN_PROMO.

## Explicit questions

| Question | Answer |
| --- | --- |
| Q1: mechanic DB field growth unsustainable? | Not yet. Four bounded nullable fields have typed validation. WATCH: a structurally different fifth mechanic should use deliberate typed configuration rather than indefinite nullable-column growth. |
| Q2: dispatch centralized enough? | Yes: one cart resolver, one item eligibility entry point and explicit private evaluators. No plugin registry is needed. |
| Q3: PROMO implemented once? | Selling-price authority is singular. Identity checks also exist in display/readiness and final locked confirmation; not literally one SQL predicate. Preserve defensive checks; watch drift. |
| Q4: common readiness once? | Core lifecycle/publication checks are shared; explicit mechanic validation extends them. Draft numeric validity now shares one predicate across service/editor/Preview. |
| Q5: common context eligibility once? | Shared component/item boundary is central. Small bundle/attach owned-cart guards repeat intentionally; no separate company or price authority. |
| Q6: mechanic conditions isolated? | Yes. Quantity threshold, exact bundle composition, and attach trigger/reward checks are explicit and do not calculate arbitrary prices. |
| Q7: future snapshots safe? | Yes with additive typed snapshot/version extensions and backward-compatible readers. Existing history must remain immutable. |
| Q8: four-mechanic provenance consistent? | Yes with the legacy informational/attribution distinction. Applied CAMPAIGN_PROMO uses common evidence; PARTNER outcomes remain honestly PARTNER. |
| Q9: switching stale data? | The explicit shared transition clears inactive fields. All 16 pairs, full saved UI sequence, and backend existing-draft sequence pass; malformed mixed definitions still fail closed. |
| Q10: spend requires substantial copying? | No whole-engine copy. Add typed config, readiness/snapshot support and a basket-condition evaluator feeding the existing governed benefit resolver; explicit Admin fields are needed. |
| Q11: compatibility rewrites ownership? | No. Keep campaign/audience/publication ownership; extend the scope-conflict/central ambiguity policy only after a governed compatibility decision. |
| Q12: moderate performance safe? | Measured yes at 20/50 lines and 10 campaigns. Discovery once per basket; basket qualification once per relevant campaign. Per-line base/permission work remains a WATCH for larger scales. |

## Spend Threshold thought experiment — no implementation

Owner decisions are prerequisites: spend basis before/after benefits, authoritative currency/conversion, included/excluded lines, reward scope and caps. Do not invent them.

DB: add a typed spend configuration linked to campaign, governed threshold currency/basis and constrained reward scope, rather than another unrelated nullable item quantity. Readiness: validate that config plus shared audience/time/products/exact PROMO. Publication: snapshot the typed configuration and benefit targets additively. Eligibility: one server-owned cart aggregation per candidate campaign, cached by the central resolver. Pricing: reuse the current governed PROMO benefit selection and locked confirmation, adding dispatch rather than a new numeric engine. Admin: explicit fields and Preview branch using the same contract. Tests: extend existing campaign/cart/snapshot/security fixtures. Unrelated mechanics need no semantic change.

## Future composition thought experiment — no implementation

The economic mechanic is separate from campaign audience/time and shared stock/price constraints. Bundle + time/stock constraints already fits this separation. A compatible secondary quantity condition would be an explicitly typed constraint, not a second arbitrary price calculator. Stacking/compatibility requires a separate owner decision covering precedence, benefit conflicts and provenance. The current serialized `campaign_scope_conflicts_v1` boundary and central ambiguity rejection can then evolve without rewriting campaign ownership, audiences or immutable publications. No compatibility matrix or stacking code is introduced here.

## Performance evidence

Local existing Supabase instance, 20 measured calls after three warm-ups; transactional synthetic fixtures roll back. Ten campaigns: four quantity, two bundle, two attach and two informational legacy, on nonoverlapping product scopes. Generated products use synchronized base/PROMO and published stock; the benchmark asserts expected applied PROMO line count. Times are local averages, not a production SLA or a broad catalog load test.

| Lines | Relevant campaigns | Cart resolver ms | Offers/progress ms |
| --- | --- | --- | --- |
| 20 | 0 | 33.18 | 9.79 |
| 50 | 0 | 87.98 | 7.65 |
| 20 | 10 | 58.28 | 28.05 |
| 50 | 10 | 108.06 | 26.03 |

`pg_stat_statements` delta: 20 discovery statements for 20 resolver calls at both basket sizes. Transaction-local function counters: 80 bundle/attach qualifications for 20 calls (four relevant basket campaigns), independent of 20 versus 50 lines. The offers baseline still sees the existing unrelated attach campaign. In-memory candidate scans and per-line synchronized price/authorization reads remain; the measurements disprove per-line basket qualification in this range, not all potential scale risks. Current SQL is unchanged, so this refactor introduces no new query or round trip. Three-line Wave 1D recheck: resolver 13.33 ms, qualification 3.38 ms, discovery 9.40 ms.

## Validation evidence

- `npx tsc --noEmit`: PASS.
- Focused ESLint on the five TS/TSX changed files: PASS.
- Focused Vitest campaign suites plus pricing-inventory, order submission, cart pricing, 1C provider and estimate/quote regressions: 26 files / 305 tests PASS.
- Existing SQL runtime suites `special_offers_quantity_promo_wave1a_runtime.sql`, `special_offers_governed_pricing_wave1b_runtime.sql`, `special_offers_fixed_bundle_wave1c_runtime.sql`, `special_offers_conditional_attach_wave1d_runtime.sql`: PASS in isolated DB, with rollback; last suite now reuses the fixture for quantity → bundle → attach → legacy updates of one draft.
- Fresh concurrent publication of two overlapping future attach drafts: one scheduled/version 1, one draft/version 0 with `CAMPAIGN_SCOPE_CONFLICT`; no double activation.
- Security, malformed config, cross-company, stock, stale checkout/forged input, idempotency, immutable v1/v2 and provenance/export runtime cases PASS.
- `npm run build`: PASS. `git diff --check`: required before commit.
- Production CLI security advisor: 762 WARN / 0 ERROR, zero change from accepted baseline. MCP advisor groups summarize five categories; category count is not warning-instance count.
- Browser isolated Admin: one draft saved at revisions 1/2/3/4 through all four mechanics, final legacy has zero inactive fields and no published version. Editor controls checked at 390/768/1440 for each mechanic, no horizontal overflow, no console warnings/errors. Representative Partner offers/cart/checkout are checked separately using legitimate fixture role; no production ERP orders are created.

Deployment and final Git identities are reported with production verification in the task final report. Canonical project identity is `prj_VrGa1zrCDn9BS0nmAvfsTY1FySeA`, `thunderxp-s-projects/vbc-b2b-portal`. Main's subsequent Inter typography update is preserved. The user's original dirty worktree is untouched.

## Recommendation

**FOUNDATION HEALTHY — PROCEED TO WAVE 2** after this bounded consolidation and acceptance. There is no unresolved correctness/security issue requiring a schema or resolver redesign. Treat typed configuration and larger-scale per-line work as explicit design WATCH items for a future mechanic, not a reason to build a framework now.
