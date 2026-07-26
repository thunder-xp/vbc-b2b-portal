# Retail-Only Commercial Redaction

## Purpose

`pricing.partner_price.view` is the confidentiality boundary for company
purchase prices and derived commercial values. A user with only
`pricing.retail_price.view` receives retail/MSRP values while the server may
still use authoritative company pricing for permitted write workflows.

This boundary is enforced in database projections and service DTOs. React
components are not a security boundary.

## Canonical Context

`resolveCommercialVisibility()` derives one immutable context from the
request-memoized effective permission projection:

- `canViewPartnerPrice`
- `canViewRetailPrice`
- `canViewMargin`
- `canViewPartnerTotals`
- `canUseCommercialCalculations`

Explicit membership denies are already reflected in the effective permission
codes. No public or cross-user cache stores this context.

## Exposure Matrix

| Surface | Full commercial access | Retail-only projection |
| --- | --- | --- |
| Catalog grid/list/detail | Partner, retail, opportunity, stock | Retail and stock only |
| Search | Identity and catalog metadata | Same; no commercial suggestion payload |
| Comparison | Partner, retail, opportunity, stock | Retail and stock only |
| Purchasing lists/favorites | Partner and retail references | Retail reference only |
| Cart/checkout | Partner total and retail reference | Retail reference; company purchase total omitted |
| Order submission | Authoritative company price | Same server truth; price absent from action receipt |
| Order list/detail/history | Stored partner snapshots | Identity, quantity, status, dates; partner values omitted |
| Quick Reorder | Historical/current partner comparison | Products, quantities, retail, availability |
| Estimates | Cost, rate, margin, markup, selling values | Selling/customer fields only |
| Proposal preview/PDF/email | Customer-facing values | Same customer-safe DTO |
| Specifications/reservations | Partner snapshots and totals | Retail/operational fields; partner snapshots omitted |
| Dashboard/company | Partner status and allowed summaries | No confidential price type or partner totals |
| Finance | Controlled by finance permissions | Unchanged and independent from pricing permission |
| Internal admin/review | Existing internal authorization | Not reduced by partner employee mode |

Immutable order, estimate, specification, and reservation snapshots remain
unchanged in storage. Redaction happens when a user-facing DTO is built.

## Database Boundary

Partner sessions cannot select `product_prices` directly. Its authenticated
SELECT policy is restricted to internal synchronization operators.

User-facing reads use:

- `get_product_price_projection` for one validated company, bounded product
  IDs, and exactly one permission-allowed price type;
- `catalog_partner_page_v2` for bounded catalog aggregation;
- `list_commercial_currency_codes` for permission-allowed currencies.

The old `catalog_partner_page` execution grant is removed because partner-price
sorting could reveal commercial order without returning the values.

Commercial exchange-rate RLS separates partner conversion rates from retail
conversion rates. `anon` has no execution or table access.

## Authoritative Write Path

Order creation, estimate restoration, and estimate-to-cart conversion must use
current company partner pricing without exposing it to the caller. The
repository has dedicated server-only authoritative methods backed by the
Supabase admin client. They are called only after the service validates the
authenticated active company and operation permission. No action returns these
records.

This is a deliberate narrow exception to ordinary user-session repositories:
an authenticated browser and a Server Action otherwise carry the same JWT, so
an exposed RPC capable of returning hidden prices would also be callable by the
retail-only browser. The service-role key remains server-only and is never used
by UI code.

## Estimates And Proposals

Retail-only users edit customer-facing selling values. Existing confidential
cost, conversion rate, margin, and markup are omitted from responses and
preserved unchanged on save. Pricing mode is projected as direct selling price
to prevent reverse calculation. New retail-only product lines start from the
retail price and do not store a visible acquisition cost.

Proposal preview, immutable proposal content, PDF, and delivery use the
customer-facing proposal DTO. Full estimate aggregates are not passed to the
renderer.

## Cart Legal UX

A retail-only cart labels displayed totals as retail reference values. Before
submission it states that the order uses the company's commercial terms and
that partner prices are hidden by access settings. The user confirms products,
quantities, and delivery date, not an implied visible purchase total.

## Logging And Errors

Routine order logs contain identifiers, counts, payload keys, and durations.
They omit unit prices, totals, exchange rates, complete 1C payloads, and response
bodies. User-facing errors never contain database or commercial diagnostics.

## Cache And Performance

- Effective permission context uses React request memoization.
- No `unstable_cache` or public Next.js cache stores commercial DTOs.
- Commercial repository reads are batched by product ID.
- Retail-only projections skip partner price and partner-rate queries.
- Catalog filtering, sorting, and pagination remain one bounded RPC.
- No additional 1C request is introduced.
- Permission changes are visible on the next request; refresh discards prior
  RSC/client state.

## Verification

Security tests cover explicit permission projection, raw-table denial,
conversion-rate separation, catalog sort inference, DTO omission, authoritative
write-side pricing, redacted historical snapshots, and customer-safe estimate
editing. Production acceptance must additionally inspect RSC/network payloads
for controlled full-access and retail-only employees.
