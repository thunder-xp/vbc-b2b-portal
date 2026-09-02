# Catalog payload acceptance — 2026-09-02

## Scope and release

- Task: `PERF-CATALOG-PAYLOAD-20260902`
- Control: production `origin/main` at `021a00438d5e61c77e5fc9145a4e2abf282730fa`
- Candidate preview: `codex/perf-catalog-payload-20260902`
- Preview alias: `https://vbc-b2b-portal-git-codex-perf-catal-03267b-thunderxp-s-projects.vercel.app`

## Public decoded document measurements

Comparable `Accept-Encoding: identity` document responses were captured from production; candidate responses were captured through authenticated Vercel preview curl.

| Scenario | Control bytes | Candidate bytes | Reduction |
| --- | ---: | ---: | ---: |
| Default Showcase | 229,529 | 202,023 | 12.0% |
| Full Catalog | 477,433 | 333,076 | 30.2% |
| Category `catalog-item-f5379003` | 303,524 | 266,322 | 12.3% |
| Availability filter | 483,235 | 349,888 | 27.6% |

Full Catalog embedded Flight script estimate fell from 250,779 to 140,243 bytes (44.1%). Production compressed transfer was 38,021 bytes for Full Catalog before the change. Exact candidate compressed transfer and authenticated B2B network transfer were unavailable through the protected-preview tooling and are recorded as `UNKNOWN`, not inferred from DOM size.

Production control Full Catalog samples observed TTFB around 0.51–0.58 s and completion around 1.08–1.15 s. Candidate presentation work does not add a read, request, action, or RPC; exact protected-preview TTFB is `UNKNOWN`. The change removes repeated serialization and performs one linear URL projection over the already-returned facet values.

## Authenticated B2B candidate document footprint

The legitimate partner session displayed partner price, retail price, authorized exact stock, and permitted cart/favorite/estimate/compare actions.

| State | Hydrated document chars | Main chars | Script chars |
| --- | ---: | ---: | ---: |
| Showcase | 381,878 | 199,136 | 134,665 |
| Full Catalog grid | 456,933 | 295,646 | 113,110 |
| `categorySet=security` | 402,442 | 249,090 | 105,175 |
| Search `dahua` | 479,007 | 299,855 | 128,455 |
| Availability filter | 469,164 | 298,454 | 120,013 |

Grid/list uses the same initial transport. Switching to list was local, preserved the URL, rendered governed characteristic chips, and generated no catalog navigation.

## Payload ownership

| Domain | Finding and disposition |
| --- | --- |
| A Shell/navigation | Shared shell remains; not duplicated by this change. |
| B Category tree | Governed source retained; client menu now receives only id/name/parentId and public slug. |
| C Quick categories | Nine governed links retained; small server markup. |
| D Filters/facets | Primary avoidable owner. Repeated React element trees and full URLs became one compact facet model, one base URL, and one selection object. |
| E Product cards | Repeated utility-class strings moved to semantic component classes with identical styling. |
| F Characteristics/chips | B2B stays bounded by existing governed key-characteristic projection; public stays at two shortcuts. |
| G Prices | Required rendered commercial fields retained. |
| H Availability | Required authorized presentation retained. |
| I Favorites/compare | Existing primitive action islands retained; no state broadened. |
| J Merchandising | Labels retained. |
| K Pagination/sort/view | URL state and local grid/list preference retained. |
| L Localization/copy | Retained. |
| M Hidden/unused state | Category description/SEO/count fields removed from menu transport. No hidden alternate product mode added. |
| N React/RSC envelope | Framework-owned; reduced only by narrowing application-created element/prop repetition. |

## Product-card DTO audit

### B2B `CatalogProductCardDto`

| Field | Classification |
| --- | --- |
| `id` | ACTION_REQUIRED |
| `sku`, `name`, `slug`, `imageUrl` | RENDERED_ALWAYS |
| `category.id` | ACTION_REQUIRED for compare; remaining category fields are UNUSED by cards |
| `keyCharacteristics` | RENDERED_CONDITIONALLY in list, bounded by existing governed projection |
| `merchandisingLabels` | RENDERED_CONDITIONALLY |
| `shortDescription`, `brand`, `datasheet` | UNUSED by current grid/list card presentation |

Commercial price/stock remains in the separate authorized commercial-view DTO. It is conditionally rendered by server-resolved capabilities. No full description, specification set, instructions, relations, analytics, price history, raw 1C payload, or image array reaches a catalog card.

### Public `PublicRetailProductSummaryDto`

| Field | Classification |
| --- | --- |
| `id` | ACTION_REQUIRED for cart |
| `slug`, `sku`, `name`, `image`, `price`, `availability` | RENDERED_ALWAYS |
| `category.slug` | FILTER_ONLY fallback state |
| `highlights` | RENDERED_CONDITIONALLY, maximum two shortcuts |
| `shortDescription`, `brand`, `calculatorEligible` | UNUSED by catalog card presentation |

Public projection remains separate and contains no company context, partner price, private stock quantity, cost/margin, permissions, or private action state.

## Call count and architecture

- Public listing remains categories + products + facets in parallel, plus category blog only when applicable.
- B2B discovery remains products/workspace/commercial reads plus the existing streamed facet read and category source.
- No HTTP request, RPC, repository read, per-card call, live 1C call, cache invalidation, or N+1 was added.
- The server action still resolves authenticated user → profile → active membership → active company context → permission context → workspace. Runtime evidence showed the legitimate `Vasili Culacov` partner workspace and authorized commercial/actions UI.
- No migration or database change.

## Correctness acceptance

- Public facet selection produced the canonical `attr.<key>=<value>` URL; direct entry and refresh retained it.
- Browser Back/Forward retained URL-driven catalog state.
- All nine B2B Quick Categories remained present.
- Showcase, Full Catalog, categorySet, search, availability, grid, and list rendered.
- Prices, stock, merchandising, chips, favorites, compare, estimate, cart, Product Detail links, and `returnTo` remained present.
- Filter drawer unit acceptance covers open, backdrop close, Escape, focus return, and non-duplicated content.
- Existing responsive classes and visual values were moved verbatim to semantic classes; no layout values changed.

## Validation

- Focused catalog/public tests passed, including client boundaries, filter shell, navigation, Showcase, and product-card ergonomics.
- TypeScript passed.
- Focused ESLint passed.
- Production Next.js build passed (156 static generation entries completed).
- Preview deployment was READY at every measurement candidate.

## Remaining payload sources

The largest remaining application-owned sources are B2B `CatalogPresentation` hydration (product/commercial DTOs for instant grid/list switching), repeated action-island markup, and unused card DTO fields listed above. They are deliberately deferred because the next authorized sprint is Catalog application-owned JavaScript/hydration; this task did not trade payload for extra requests or a broader hydration rewrite.
