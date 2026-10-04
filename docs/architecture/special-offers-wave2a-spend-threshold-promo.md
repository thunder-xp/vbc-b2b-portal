# Spend threshold governed PROMO reward (Wave 2A)

`spend_threshold_promo` adds an explicit condition to the existing campaign and
central selling-price engine. It is not a cart discount. One campaign selects
1..N distinct qualifying products, a positive USD threshold and exactly one
separate reward product. Only that reward needs governed PROMO: name PROMO,
code UU-000021, ref b9f5d585-dab1-11e9-8a58-000c29cf9dd4, currency USD.

## Typed configuration and arithmetic

`commercial_campaign_spend_configs` owns `numeric(14,2)` threshold and USD
currency. `commercial_campaign_spend_roles` owns QUALIFYING_SPEND/REWARD roles,
with a composite campaign/product foreign key and unique reward index. There
are no additional nullable economic columns on campaign items. Public roles,
including service_role, have no direct table access. Authorized lifecycle RPCs
validate exact product coverage, role/benefit consistency and inactive fields.

Threshold input is a decimal string with at most two fractional digits, strictly
between zero and 1,000,000,000,000. PostgreSQL numeric performs multiplication,
aggregation and comparison. React only formats server progress and validates
draft syntax; it never computes spend or eligibility.

Spend is the sum of actual owned-cart quantities times current published base
governed Partner USD prices for selected qualifiers, before campaign benefits.
The company default Partner profile supplies the basis even when an authorized
cash checkout profile supplies normal transaction prices. Reward, unrelated
products, other PROMO values, MDL presentation and FX savings never contribute.
All configured qualifiers must have an authoritative normal USD source, even
when currently absent from the basket; otherwise the condition fails closed.

## Shared publication and pricing authority

The existing serialized publication lifecycle validates audience, period,
products, quantities/caps and exact current reward PROMO. Publication also
validates actual normal USD sources for every included company. Missing sources
roll back the entire publication. Version snapshots add canonical spend config,
base_partner_usd basis, exact PROMO identity and whole-line reward semantics.
Changing the threshold from 1500 to 2000 creates version 2; version 1 stays 1500.

`private.resolve_campaign_spend_v1` checks company permissions, pricing access,
owned active/submitting cart, lifecycle/period, included audience and exact
live-config/publication agreement. It aggregates qualifying base USD spend and
reuses the common component conditions for reward PROMO, publication and caps.
Public progress contains scoped quantities and decimal spend/remaining values,
without private numeric price internals. Outside-audience eligibility exposes
no campaign conditions. Helpers/delegates are not executable by public roles;
privileged functions have empty search_path and explicit schema references.

The central cart resolver discovers campaigns once, locks source/publication
rows, batches normal price selection and caches one qualification per relevant
basket campaign. Only a present reward can receive CAMPAIGN_PROMO. Reached
threshold without a reward means unlocked, not applied. All reward units on a
qualifying line receive PROMO, subject to existing company/campaign caps; no
mixed-line pricing is introduced. Known synchronized stock gates the CTA and
server addition. This mechanic does not reserve inventory.

Existing cart quantity/removal edits invalidate related reviews and immediately
reprice. External source changes, PROMO loss/wrong identity/currency, pause or new
publication after review produce ORDER_PRICE_CHANGED instead of silently
raising the reward price. Existing v5 validates and persists canonical evidence.
Reward provenance includes config, publication/item/price refs, scoped spend and
only contributing product/quantity/base-price refs with transaction-time USD
amounts. Qualifiers retain PARTNER provenance. No new cart analytics ledger exists.

Duplicate/add retries are idempotent; retrying duplication does not overwrite an
already edited copy. Existing engagement and attribution primitives recognize
the fifth mechanic. Progress rendering creates no telemetry event. Conservative
publication collisions include normally priced qualifiers against all four
previous mechanics and spend itself. No stacking or priority engine is added.

Quote Builder pricing is unchanged. Estimate-to-cart uses the existing central
boundary. The existing 1C provider sends persisted explicit MDL line prices under
the normal governed company contract/profile; return/export authority is unchanged.

## Isolated acceptance

The rollback SQL suite is
`supabase/tests/special_offers_spend_threshold_wave2a_runtime.sql`. It covers
invalid definitions, missing normal USD/reward PROMO, exact 1499.99/1500/1500.01
boundaries, reward/unrelated-product exclusion, whole-line excess/caps, stock CTA,
explicit edits, stale conditions, 11 forged price/evidence variants, owned scope,
outside audience, immutable v1/v2, duplication/add idempotency and strict collisions.
Existing Wave 1A–1D SQL regressions also pass. Two concurrent publications of
overlapping future scope yield one scheduled version and one conflict with no
loser activation. The complete final migration compiles/applies on an isolated
schema restored to its accepted Wave 1D function baseline; historical migration
files and production ledger identities are not edited.

Admin configured, previewed and published a local 1500 USD A+B campaign with
separate reward C. Qualifiers have no PROMO. A=300, B=400, C=100, C PROMO=80 USD:
3A/1B/1C gives 1300 qualifying and C=100; 4A gives 1600 and C=80; drop/restore
returns 100/80. Reward absence unlocks the CTA; one addition activates PROMO.
Editor/progress/CTA/cart checks at 390/768/1440 have no horizontal overflow,
collision or browser console/hydration errors.

One isolated browser cashless order, `9b2e3ac3-335b-43ab-844b-a411a7bb2a0f`,
persists A4 at 5403, B1 at 7204 and C1 at 1441 MDL, total 30257. Source C=80 USD,
RTL999=18.0105. Exactly one loopback OData POST returns 201; normal provider GET
readback returns 200/matched and the order page shows matching 1C composition.
Reward evidence preserves threshold 1500, qualifying spend 1600 and publication 1.
This is an ERP test fixture, not a production 1C order or payment. The pre-existing
checkout exchange-rate warning remains outside scope, per the task contract.

Focused Vitest: 23 files / 259 tests pass. TypeScript, focused ESLint and build
pass. Local DB lint reports no finding in task functions; 40 unrelated historical
function findings are not repaired or represented as a clean repository-wide lint.

## Performance and foundation health

Local synthetic benchmark: four quantity, two bundle, two attach and two spend
campaigns with nonoverlapping scopes; 20 measured calls after three warm-ups.
All changes roll back. These are local measurements, not a production SLA.

| Lines | Campaigns | Central resolver ms | Discovery ms/cart | Spend qualifier ms/campaign | Offers/progress ms |
| --- | --- | --- | --- | --- | --- |
| 20 | 0 | 90.41 | 0.076 | — | 85.77 |
| 50 | 0 | 163.07 | 0.068 | — | 55.82 |
| 20 | 10 | 106.69 | 0.204 | 7.20 | 94.25 |
| 50 | 10 | 167.29 | 0.231 | 6.77 | 72.40 |

Earlier runs measured 68.62/132.72 ms at 20/50 lines with ten campaigns.
Local timing variability prevents a tight before/after SLA claim. The final
run above measures the completed safety checks and remains below 170 ms.

At both basket sizes, 20 resolver calls produce 20 discovery statements and
120 basket qualifications: six relevant bundle/attach/spend campaigns per call,
including exactly two spend qualifications. No per-line basket qualification or
extra browser RPC is introduced. Base lookup is batched; source lookup within it
uses bounded product/profile selection. Per-line authorization/evidence work and
in-memory candidate scans remain scale WATCH items. Domain, Resolver and
Performance remain WATCH; there is no REFACTOR NOW correctness blocker.

There is no new cron, polling, infrastructure service, remote render call or
per-row success logging. Only one canonical Git deployment is required. Normal
request invocation count is unchanged; measured local compute cost is above.
Production migration parity, advisor delta, READY deployment and final SHA are
verified and reported separately at release acceptance.
