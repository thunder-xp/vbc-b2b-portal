# Campaign intent cart — isolated acceptance

TASK_ID: VBC-SPECIAL-OFFERS-CAMPAIGN-INTENT-CART-20261004

TASK_TITLE: Special Offers 2.0 — Make Campaign Entry Intent Authoritative for Cart Pricing

Release status: local acceptance passed; production promotion awaits resolution of the canonical-main/production divergence below. No feature migration or deployment has been applied to production.

## A–J: commercial contract and architecture

- **Root cause:** the old resolver excluded `legacy_promo`, so ARA34E fell back to governed Partner USD 9.21, yielding 166 MDL at RTL 999 / 18.041. The offer's governed PROMO USD 8.25 yields 148.83825 / displayed 149 MDL. See [forensic evidence](campaign-intent-cart-root-cause-20261004.md), captured before implementation.
- **Previous model:** one cart/product bucket, attribution-only context, global campaign discovery and whole-cart qualification. Product-keyed projection/order joins could not distinguish commercial contexts.
- **New model:** normal catalog and purchasing writers establish `STANDARD`. Authorized offer RPCs establish `CAMPAIGN` after checking actor/company permissions, audience, period, live item and immutable publication. Browser input contains IDs, quantity and an idempotency key; no commercial price or eligibility is trusted.
- **Identity:** `(cart, product, commercial_context_key)`, where context is `STANDARD` or `CAMPAIGN:campaign:publication:item`. Same context merges; STANDARD and different publications remain separate. Quantity/removal use exact cart line IDs.
- **One resolver:** selects only explicitly referenced campaign contexts. Product metadata, stock and FX stay batched; prices/evidence/projected views/order validation use cart line identity. There is no second pricing engine or new per-line network request.
- **Five mechanics:** legacy PROMO requires valid intent; quantity counts its campaign line; bundle counts its publication's components; attach counts that context's trigger/reward; spend counts that context's qualifying spend/reward. STANDARD never qualifies a campaign. Trigger/qualifying lines retain normal Partner prices.
- **Security:** no direct cart INSERT/UPDATE/DELETE for authenticated/anon/service_role; checked definer mutations retain their authorization. New RPCs deny anon, use an empty search_path, and pin the client-reviewed publication. Internal normalization has no public/API execute grant. Existing cart/order RLS remains enabled. Actual JWT/REST forgery and cross-company calls were denied.
- **Existing carts:** new source defaults to STANDARD; existing attribution does not imply accepted commercial intent. No existing order values/evidence are updated. New order lines snapshot cart-line identity; old order identities remain valid.
- **Publication lifecycle:** live draft items are replaced during editing. Cart item identity therefore belongs to immutable publication JSON, not the disposable live-item FK. A publication FK plus snapshot validation enforces context validity and caps. Future draft edits do not null immutable order attribution IDs. Pausing, expiry, loss of governed PROMO or audience replacement invalidates reviewed benefits with PT409 / ORDER_PRICE_CHANGED.
- **Checkout/order/ERP:** isolated guarded v5 validation and order insertion preserve two lines: STANDARD 2 × 166 plus CAMPAIGN 1 × 149 = 481 MDL. Stored USD 9.21/8.25, FX snapshot and ordinary ERP explicit-price lines agree. An unqualified quantity-campaign order uses USD 9.21 / 166 MDL, retains campaign/publication/mechanic evidence and creates no false PROMO attribution. No real ERP order was created.
- **Measurement:** offer views remain engagement only. Explicit successful mutation establishes intent. Only actual CAMPAIGN_PROMO order evidence creates strong pricing attribution; concurrent duplicate requests create one event. Historical attribution survives live item retirement.

## K: validation

- 37 focused Vitest files / **383 tests passed**: applicable Wave1A/B/C/D, Wave2A/B, campaign service/components/migrations, pricing, cart, checkout, order, B2B payment and 1C export suites.
- TypeScript `npx tsc --noEmit`: passed.
- Focused ESLint: zero errors; three existing unused-variable warnings in the pricing test fixture. Validation/browser/API scripts: passed ESLint.
- `npm run build`: passed (Next.js 16.3.0; compile 34 s, TypeScript completed, routes emitted).
- Clean replay: **549 migrations**, through `20261005000000_campaign_intent_cart.sql`, passed from zero in the disposable project.
- SQL matrix: all five mechanics, catalog isolation, mixed SKU contexts, repeated request idempotency, compound completion, exact quantity/removal, forged publication/cross-company rejection and reviewed pause invalidation passed.
- Lifecycle: pause → reopen → edit → republish passed; old publication context and quantity/removal remain valid, old intent falls back to Partner and new publication gets PROMO; publications do not merge.
- Order matrix: qualified and unqualified campaign snapshots, duplicate/mismatched line IDs, forged price/context rejection, ERP payload parity and truthful measurement passed. Editing a draft after order insertion preserved immutable attribution.
- Actual PostgREST/JWT acceptance: direct INSERT/UPDATE denied 42501, unexpected ordinary-RPC commercial arguments denied PGRST202, forged publication denied PT409, cross-company denied 42501. Two concurrent identical offer requests produced one line quantity increment and one engagement event.
- Concurrent publication: an old-version action waited for Admin draft replacement/publication, then failed PT409; no deadlock, cart mutation or engagement from the rejected action.
- Expiry, inactive governed PROMO and legitimate new-publication audience replacement after price review: ORDER_PRICE_CHANGED, intent retained.
- Security advisors: zero findings for changed campaign/cart/order functions or fixture helpers. Fourteen unrelated existing public-function search_path warnings remain outside this task.
- `git diff --check`: passed.

## L: real browser acceptance

Application connected only to disposable Supabase; fixture Partner signed in through the public sign-in form.

1. Catalog → ordinary selection → cart: **166 MDL**, STANDARD, no offer badge, while a matching campaign was active.
2. Empty cart → Special Offers → detail → Add → cart: **149 MDL**, trusted publication 1, `Спецпредложение` badge.
3. Same SKU via both real paths: separate **CAMPAIGN × 1 / 149** and **STANDARD × 2 / 166**, total **481 MDL**; ordinary add preserved the campaign line.
4. **390 / 768 / 1440** screenshots and DOM geometry: no horizontal overflow, collisions or provenance collapse. The badge appears only on the campaign line. Quick Pay/savings/pay-later panel remains present.
5. No console/hydration errors during accepted flows. A prior isolated-bootstrap phone-lookup error at 05:43 UTC was resolved by matching the canonical backend SELECT baseline; it did not recur after fixture completion.

MAIB credentials are deliberately absent from this isolated environment, so Pay Now remains disabled by the existing configuration guard. No payment/provider call was attempted. The normal B2B payment and rate-guard regressions passed.

## M: paired resolver measurement

Same disposable dataset, warmed once, ten calls per model/context, milliseconds per call. Baseline central function was captured from canonical pre-change SQL and swapped only inside a rolled-back test transaction. Both variants used the migrated identity schema; old discovery still wrongly captured STANDARD rows.

| Context | Lines | Before ms | After ms |
|---|---:|---:|---:|
| STANDARD | 20 | 72.103 | 33.603 |
| CAMPAIGN | 20 | 66.703 | 68.079 |
| Mixed | 20 | 66.667 | 51.994 |
| STANDARD | 50 | 167.422 | 79.522 |
| CAMPAIGN | 50 | 174.404 | 171.932 |
| Mixed | 50 | 162.279 | 123.940 |

STANDARD and mixed work became more bounded. The 20-line campaign measurement was ~2% slower; there is no claim of universal speedup. Earlier same-size campaign samples varied up to ~206 ms. No new polling, cron, log stream, infrastructure project, per-item network call or recurring invocation was added; cart indicator is server-rendered.

## N–O: production release gate and Git

- Official linked migration-history verifier: **548 remote versions**, no remote-only version; pending **20261005000000 only**.
- Official linked production dry-run: proposes only `20261005000000_campaign_intent_cart.sql`; no seeds or roles, no migration applied.
- Canonical Vercel identity verified: project `prj_VrGa1zrCDn9BS0nmAvfsTY1FySeA`, team `team_GC8w4bvuJjCLVzwIS4cApsHZ`, `vbc-b2b-portal`, domains `nsd.md` / `www.nsd.md`. No new/relinked Vercel project.
- Current origin/main and task base: `eecfa4d5113bdaf4c66fc51a6da5b5d2d6abe205`.
- Current READY production: `a4ac5ca027082c279c01054b28d8a7da203363a1`, deployment `dpl_3dfGydEGNaFzHpvTko7ZJKJWuYbU`, from the existing dashboard-hotfix branch. It contains four commits absent from canonical main: `c821ee13`, `93b0ffb8`, `dd970dfb`, `a4ac5ca0`.
- Owner decision requested before promoting those unrelated existing production commits into main. Releasing the older base would undo accepted production UI changes. Production feature migration/push/deployment therefore remain pending.
- Same feature worktree/branch retained; no unrelated user files, secrets, generated builds, protected browser artifacts or CURRENT_TASK are staged.

## Local incident disposition and safeguard

- Earlier destructive category: `supabase db reset --db-url` unexpectedly reset shared local Supabase and removed local users/campaigns/orders/cart lines and local validation DBs. Production was unaffected.
- **Pre-incident shared-local backup: NOT FOUND / NOT PROVABLY RECOVERABLE.** SQL candidates were schema-only/rollback/postincident files, not proven data backups. Owner accepted loss. Original evidence and checked locations remain in ignored `.codex/LOCAL_REPLAY_INCIDENT.md`; nothing was erased.
- Shared local remains canonical **548 migrations / 20261004230000**, **0 users / campaigns / orders / cart lines**. No approximate restoration or task fixture load was performed there. Primary dirty worktree is untouched.
- Disposable identity: `campaign-intent-20261004`; container/volume `supabase_db_campaign-intent-20261004`; workdir `.codex/intent-validation`; API **55381**, DB **55382**, shadow **55380**, mail **55384–55386**. App **localhost:3108**. No production connection exists in the disposable config.
- `scripts/campaign-intent-validation.mjs` checks exact config, project marker, real path, absence of linked project ref, Docker project/workdir labels, volume, port and DB marker. Only hardcoded `--local` replay exists; arbitrary flags/URLs are refused before DB work. Shared container identity is checked before/after. All task SQL fixtures independently require the DB marker and PGAPPNAME.
- Deterministic fixtures use fixed user/company/product/campaign/cart IDs and a reproducible UUID sequence for membership/prices/publications/items. Cart/order/order-line IDs derive deterministically from context/submission identity, even after rolled-back tests. Fixture Auth identities are fixed; the ephemeral local password is protected and never committed/logged.
- Isolated browser bootstrap matches the read-only production metadata baseline: service_role SELECT on 463 of 468 public tables, preserving the five deliberate exclusions. No authenticated/anon privileges, writes or RLS are expanded. This is test bootstrap only and is not part of the production migration.

### Reproduction order

1. `node scripts/campaign-intent-validation.mjs prepare`, then `start` (or guarded `replay`).
2. After `assert`, load `supabase/tests/campaign_intent_fixture.sql` using the exact disposable container and `PGAPPNAME=campaign-intent-disposable`.
3. Run the SQL matrix/order/unqualified/performance scripts while seeded campaigns are DRAFT; they roll back.
4. Load `campaign_intent_browser_fixture.sql`, capture isolated CLI status privately in `.codex/intent-status.json`, run `campaign_intent_browser_setup.mjs`, and start Next on 3108. Never print the status/credential files.
5. Run `campaign_intent_api.mjs` before browser cart additions (it restores its exact fixture lines).
6. Perform real A/B/mixed UI acceptance; then run `campaign_intent_concurrency.mjs` and `campaign_intent_invalidation_runtime.sql` (concurrency advances the disposable publication; invalidation rolls back).

Do not use these fixtures or acceptance scripts against shared local or production.
