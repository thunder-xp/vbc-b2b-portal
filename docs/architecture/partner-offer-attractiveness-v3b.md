# Partner offer attractiveness V3B

The existing permission-gated `list_partner_special_offer_feed_v1` ranks OFFER identities before LIMIT/OFFSET. It does not rank rendered cards or change cart qualification. The selected page retains V3A's compound projection and one bounded application commercial batch. Showcase asks the same feed for five recommended offers and renders the same cards. No new pricing authority, cache, scheduled work, or per-card network calls.

## Evidence and normalization

Ranking reads only the current authorized publication, published valid company/base and PROMO prices, actual MDL RTL999, the two governed commercial FX rates, and authoritative published stock. It validates relevant publication fields; legacy snapshots need not contain columns introduced by later mechanics. Conditional/spend benefits use the reward only, but stock coverage includes required components. Bundles use all component quantities and require complete same-currency economics.

Saving percentage is `(normal - special) / normal * 100`, requiring positive normal and special amounts. Negative saving contributes no benefit. Display omits non-positive saving. MDL bundle comparisons use per-unit rounded normal conversion as in the canonical projection. Markup follows `createCommercialOpportunity`: round each USD SPECIAL unit to whole MDL using the partner rate, aggregate quantities, then `(retailMDL / partnerRate) / (specialMDL / retailRate) - 1`. It uses actual RTL999, never MSRP or normal-price markup. The Decimal service remains display authority for both feed and detail; SQL is its numeric ordering projection, with runtime parity coverage.

Missing values remain NULL. A partial bundle price never becomes a partial total. Evidence tier precedes the recommended score: 2 = both saving and markup supported, 1 = one supported, 0 = neither. Unknown stock is neutral, not zero. Zero stock remains visible and ranks lower than otherwise equal stocked offers. Ranking is advisory and does not relax downstream commercial validation.

## Recommended policy

- Commercial value: 60 points. Saving: 40, normalized to 0–50%. Markup: 20, normalized to 0–100%. Both factors clamp to 0–1; unsupported benefit contributes no points and lowers the evidence tier.
- Stock readiness: 30 points. Unknown: 0.5. Known zero: 0. Insufficient coverage: coverage/2. Confirmed coverage: min(1, 0.5 + coverage/20). Coverage is minimum available/required quantity across components.
- Actual time remaining: 10 points. Over 72 hours: 0.2; 24–72 hours: 0.6; under 24 hours: 1. Expired offers are excluded by the unchanged authorization scope.

Urgency can add at most eight points versus a long-running offer; it cannot displace materially better commercial evidence. No brand boosts, popularity guesses, sensitive profiling or conversion assumptions. Score and factor inputs remain internal, never partner-facing.

## Sort and measurement contract

Recommended: evidence tier, score descending. Maximum saving: saving percentage descending, explicitly labeled `%` to compare USD/MDL without inventing a monetary conversion. Best markup: canonical markup percentage descending. Ending soon: actual ends_at ascending. Missing sort factors are NULLS LAST. All sorts finish with ends_at, campaign UUID, item sort order, item UUID: stable identities and no page overlap for an unchanged dataset. Filters/search retain their existing URL/state contract.

Analytics retain the existing asynchronous bounded navigation batch and actual click event. Safe context adds sortMode, rankPosition, offerType and campaignId; no price snapshots, scores, synchronous render writes or duplicated cart events.

## Local acceptance and latency

The isolated V3B database replayed all 558 migrations, including this forward migration. SQL runtime tests cover 43 identities, all four sorts, page boundaries, zero/unknown stock, missing evidence, company isolation and Decimal parity across six mechanics.

On the same 43-offer fixture and FX evidence, five EXPLAIN ANALYZE calls per mode (first cold, four warm) measured warm medians: V3A recommended 32.9 ms versus V3B 79.4 ms; ending 84.0 ms versus 76.1 ms. The recommended increase includes pre-pagination commercial ranking and more compound offers on its first page; the old default selected PRODUCT offers first. Cold recommended was 58.3/162.0 ms. These local measurements are not production latency guarantees. Application request count remains one feed RPC plus one unique-product commercial batch; there are no per-card RPCs or live ERP reads. Published item arrays are parsed once, and ending-only sorting skips commercial ranking inputs. Showcase removes the previous unbounded active-product discovery and asks the same feed for five offers.
