# Conditional attach governed PROMO (Wave 1D)

The existing campaign engine supports `conditional_attach_promo`. One publication
contains 1..N distinct TRIGGER products and exactly one distinct REWARD product.
Typed campaign-item columns are `attach_role` and `required_trigger_quantity`.
Triggers use informational benefits and retain ordinary governed Partner pricing.
Only the reward uses the exact synchronized PROMO profile: UU-000021,
b9f5d585-dab1-11e9-8a58-000c29cf9dd4, USD.

Draft validation rejects missing/multiple rewards, no triggers, shared/duplicate
SKUs, invalid roles, non-positive/fractional quantities, incompatible caps and
mixed mechanic fields. Existing publication readiness validates products,
audience and period. An unavailable/malformed reward PROMO blocks publication;
absence of PROMO on a trigger does not. No price is authored in the campaign.

## Publication and basket authority

Existing immutable version snapshots serialize the complete typed item definition
and audience. The publication records whole-line reward excess semantics and exact
PROMO identity. Reopening and publishing a requirement change from 4 to 6 preserves
the original version-1 requirement and audit evidence.

`private.resolve_campaign_attach_v1` verifies the actor's company permission and
owned active/submitting cart, compares live composition with the immutable
publication, and joins trigger quantities from the actual basket in one bounded
query. It checks all trigger requirements; the shared component-condition helper
checks only the reward's exact PROMO, lifecycle, audience, period and company cap.
Public progress strips numeric price internals. No browser quantity, price,
company claim, reward eligibility or publication version authorizes a discount.

The existing central cart resolver discovers campaigns once per basket and caches
one qualification per attach campaign. Trigger candidates never enter its
discount branch. Only a present reward with all triggers satisfied receives
CAMPAIGN_PROMO. With complete triggers but no reward, PROMO is unlocked, not applied.
All units of a qualifying reward line use PROMO, including excess quantity.

There is no additional pricing engine, generic promotion DSL, background job,
polling or render-time ERP request. Existing Quote Builder pricing is unchanged;
estimate-to-cart continues through the central cart boundary.

## Mutations, collisions and checkout

The existing campaign-add RPC accepts item/quantity/request intent, checks server
basket qualification and known synchronized stock for the reward, then reuses the
existing cart mutation and engagement event. Conditional-attach request IDs are
bounded and idempotent under the existing company lease. A failed/ambiguous retry
cannot add another reward. No stock reservation is introduced.

Publication/resume retain the existing global publication lease. Any overlap of
product/company/time scope involving attach blocks a competing legacy, quantity,
bundle or attach campaign, including overlap on a normally priced trigger. The
central resolver also rejects ambiguous composition defensively.

An explicit participating quantity/removal edit clears related price reviews, so
4→3 immediately restores ordinary reward pricing. External campaign pause,
expiry, audience/publication or PROMO loss retains stale review protection and
fails checkout with ORDER_PRICE_CHANGED. Existing v5 revalidates and persists
source price, campaign/item, publication, mechanic, reward role and FX evidence.
The immutable publication reconstructs the trigger conditions without a new
ledger. Existing OneCOrderProvider exports persisted explicit MDL prices under
the governed company contract/profile.

## Acceptance evidence

The transactional SQL suite is
`supabase/tests/special_offers_conditional_attach_wave1d_runtime.sql`.
Fixture source prices are A=92, B=180, C=75 USD; only C has PROMO=68 USD.
4A/1B/1C, 5A/1B/1C and 4A/2B/1C qualify only C. 3A/1B/1C and 4A/0B/1C
restore C=75. 4A/1B/0C unlocks without applying. Three C units all receive 68.
Malformed definitions/profile/currency, stock shortage, cross-company/cart
access, forged evidence/prices, stale checkout, persistence/export parity,
immutable v1/v2 and strict collisions are covered.

Two concurrent publications with overlapping future scope produced exactly one
scheduled version and one CAMPAIGN_COMMERCIAL_SCOPE_CONFLICT, preserving the
loser's draft. Two concurrent reward-add calls with the same request ID produced
one reward unit and one engagement event; the second response was idempotent.

Admin configured, previewed and published “К 4 камерам — HDD по PROMO” through the
shared browser workflow. A legitimate isolated Partner saw 2/4 progress, then
PROMO unlocked at 4/4, added one reward, reduced to 3 and restored 4.
RTL999=18.0105 gave camera=1657 MDL unchanged, reward=1225 PROMO / 1351 ordinary.
390/768/1440 browser checks showed no horizontal overflow or task console errors.
Known insufficient stock disables the reward CTA; the server also enforces it.

Pausing after review produced visible price-change feedback with zero order/ERP
writes. Exactly one successful isolated order,
`e235eea4-9b7a-4468-94b5-6f687f666e31`, persisted 4 cameras at 1657 and one
reward at 1225 MDL, total 7853. One loopback OData POST exported identical prices;
normal provider readback and the browser's current 1C composition matched.
Only the reward had conditional-attach publication-1 price provenance and order
attribution. This is an isolated ERP fixture, never a production ERP order.

100-call measurements averaged central resolver 11.19 ms, qualifier 3.35 ms and
discovery/progress 8.24 ms per call. Wave 1C reference measurements were
17.17 / 6.41 / 12.46 ms. These are local fixture measurements, not a production SLA.

Official clean CLI replay applied all 546 migrations. Official linked dry-run
showed only the new Wave 1D migration; historical files and ledger identities were
unchanged. Local DB lint found no issues in task functions. Existing unrelated
historical lint findings remain outside scope. Private helper execution is revoked
from public/anon/authenticated; public RPCs retain authenticated permissions,
server-owned company authorization and empty search_path. No RLS/grant expansion
or public commercial-data exposure was introduced.
