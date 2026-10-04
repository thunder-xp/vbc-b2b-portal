# Fixed bundle → governed PROMO (Wave 1C)

Task: `VBC-SPECIAL-OFFERS-2-WAVE1C-BUNDLE-PROMO-20261004`.

## Contract and ownership

One campaign contains at least two distinct existing products. Its mechanic is
`fixed_bundle_promo`; each existing campaign item has a typed positive integer
`required_bundle_quantity`, bounded by its existing minimum/company maximum.
There are no new tables, bundle selling prices, percentages or rule language.

Publication snapshots preserve item IDs, product IDs, required quantities and the
exact synchronized PROMO profile: name `PROMO`, code `UU-000021`, external reference
`b9f5d585-dab1-11e9-8a58-000c29cf9dd4`, currency USD. Existing immutable publication
and audience mechanisms remain authoritative. Reopening and publishing creates a
new version; it cannot rewrite version 1.

The private qualification helper checks the actor/company, owned current basket,
publication composition, lifecycle, dates, audience, constraints and every
component's synchronized PROMO. All actual basket quantities must reach their
published requirements. Browser-supplied hypothetical quantities cannot qualify a
bundle. Progress DTOs contain no numeric price authority.

The existing `resolve_partner_cart_prices_internal_v1` remains the only selling
price selector. It discovers candidates once per basket and qualifies each bundle
once, then uses synchronized `product_prices` and the existing FX conversion.
Missing one component or any PROMO contract restores ordinary Partner prices for
all participants.

## Intentional excess semantics

The benefit applies to the **whole participating SKU line**, including excess.
For requirements 4 cameras / 1 recorder / 1 HDD, basket 6/1/1 receives PROMO on all
six cameras. There are no mixed price segments or multiples-of-kit calculations.
Existing caps and stock checks still apply.

## Mutations, checkout and conflicts

Complete-kit locks the company's existing cart transaction boundary and atomically
upserts only missing quantities to the required minimum. It reuses `cart_items`
and existing mutation/intent triggers; it validates final quantities rather than
rejecting a valid 3→4 completion because delta 1 is below minimum 2. Known
insufficient synchronized stock rejects the entire operation. The request ID and
existing engagement events make retries idempotent. No reservation or remote ERP
call occurs.

Explicit component edits invalidate price acknowledgements for the affected
bundle. Unrelated edits retain those acknowledgements. A lost PROMO after review
still raises `ORDER_PRICE_CHANGED` at checkout, rather than persisting a silently
higher total. Existing v5 validates and persists source/profile, campaign/item,
publication, mechanic, required quantity and FX evidence. Existing OneCOrderProvider
exports the persisted MDL values.

Publication and resume serialize collision checks. Shared product/company/time
scope blocks bundle versus legacy, quantity or another bundle. Existing
quantity-versus-legacy behavior is unchanged. The resolver also rejects ambiguous
bundle overlaps defensively.

Quote Builder's independently persisted prices are unchanged. Estimate→cart uses
the existing cart boundary and central repricing.

## Isolated browser and ERP evidence

Admin creation, quantity configuration, readiness, preview and publication were
performed through the browser. Partner empty/partial complete-kit, manual missing
component addition, removal, progress and cart repricing passed at 390/768/1440 px
without overflow or console/hydration errors. Admin fields use `min-w-0` to avoid
mobile editor overflow.

Fixture source Partner/PROMO prices were USD 92/84; RTL999 was 18.0105. Incomplete
4/1/0 used MDL 1657 per unit. Complete 4/1/1 used MDL 1513 per unit, total 9078.
Removing the third component restored ordinary prices. Pausing after review
blocked checkout with visible price-change feedback and zero order/ERP writes.

Exactly one successful isolated order, `6efd1da7-7319-47be-ab75-065d564f76e5`, was
submitted through the legitimate local Partner fixture. All three persisted lines
retained bundle/publication-1/required-quantity/PROMO evidence. One loopback OData
POST exported 4/1/1 at 1513 MDL, total 9078; normal provider readback matched, and
the browser loaded “Заказ принят” with the same current 1C composition. This was a
local ERP fixture, not a production ERP order.

Two concurrent complete-kit requests using the same ID returned added quantities
6 and 0. The resulting new basket was exactly 4/1/1 with one batch event.

Runtime SQL acceptance is in
`supabase/tests/special_offers_fixed_bundle_wave1c_runtime.sql`; it runs in a
transaction and rolls back all fixtures. It covers malformed definitions,
whole-line excess, removal, absent/malformed PROMO, stock failure, stale checkout,
unrelated edits, cross-company denial, forged evidence, persisted/exported parity,
immutable versions, collisions and minimal grants. Wave 1A/1B runtime suites remain
separate regressions. No background jobs, polling, live ERP reads or additional
per-item HTTP requests were introduced.

## Final local validation

Clean CLI replay applied all 545 migrations through `20261004200000`. Wave 1A,
Wave 1B and Wave 1C runtime SQL suites passed afterwards. The first reset had a
local Auth schema-initialization race; stopping only this isolated stack's Auth,
Storage and Realtime containers allowed the repeat to finish normally.

The final 100-call measurements were: same three-line ordinary cart 8.86 ms/call,
complete three-line bundle 17.17 ms/call, qualification 6.41 ms/call, offer
discovery/progress 12.46 ms/call. Existing one-line Wave 1B resolver averaged
7.12 ms/call (previous measurement 7.03 ms). The additional bundle qualification
is bounded local SQL; campaign discovery is once per basket and there is no
per-line eligibility RPC. Complete-kit performs one transaction and one final
qualification, rather than repeated whole-cart repricing per added component.

After rebasing onto the concurrent sidebar change, 296 focused campaign/pricing/
order/navigation tests and 16 OneCOrderProvider tests passed. TypeScript, focused
ESLint, production build and diff checks passed. Local DB lint reported no issues
for the new bundle/component/conflict/resolver/acknowledgement functions; unrelated
historical temporary-table lint findings were left out of scope.
