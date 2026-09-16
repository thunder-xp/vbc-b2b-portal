# Installation Marketplace V1

## Purpose and boundary

Installation Marketplace connects a final customer, a product or order, and an eligible installation Partner through a first-class `InstallationProject`. It is intentionally separate from the paid RetailOrder installation requirement/execution engine: no price, bid, payment, payout, or assignment fee is created here.

## Reuse matrix

| Concern | Canonical owner reused |
| --- | --- |
| Customer authentication and identity | `customer_accounts` → `customer_identities` |
| Product and order source | published public-retail projection and customer-owned `retail_orders` |
| Partner identity | `partner_companies` and active `company_memberships` |
| Public Partner profile | existing public partner directory plus governed `installation_provider_profiles` |
| Eligibility | explicitly ACTIVE, approved marketplace provider; active company/public listing; published profile; matching governed capability and active service region; current availability |
| Operational UI | existing final-customer cabinet, Partner installation workspace, Admin Retail Installation page |
| Audit | append-only `installation_project_events` |

No parallel customer identity, Partner registry, public directory, or commercial truth is introduced.

## Aggregate and lifecycle

`installation_projects` is the aggregate root. Product/order context is snapshotted only as immutable references and quantities in `installation_project_items`; current display data still resolves from the active public retail projection.

The governed lifecycle is:

`DRAFT → PARTNER_PENDING → PARTNER_ACCEPTED → CONTACTED → SCHEDULED → INSTALLED → CUSTOMER_CONFIRMED → CLOSED`

`PARTNER_DECLINED`, `CANCELLED`, `EXPIRED`, and `DISPUTED` are explicit states. Assignment rows are never replaced or deleted. A partial unique index permits only one pending/accepted assignment while keeping all earlier attempts.

## Privacy and authorization

- Customer ownership is derived from `auth.uid()` through the canonical customer account.
- Partner company scope is derived from an active membership; browser company IDs are verified server-side.
- Exact/private location and customer contact are absent from shortlist and pending-offer payloads.
- Contact is exposed only to the accepted Partner and only when the customer recorded consent.
- Admin access uses existing Retail Marketplace permissions.
- Tables use RLS and `FORCE ROW LEVEL SECURITY`; writes are exposed only through narrow definer RPCs with empty `search_path`.

## Partner selection and reputation

Ranking V2 replaces the customer-facing V1 neutral order with the versioned pipeline documented in `MARKETPLACE_RANKING_V2.md`. Eligibility remains a hard gate. The service then combines deterministic relevance, confidence-adjusted verified quality, sufficiently evidenced reliability and one bounded fair-exposure slot. V1 order is retained in every decision as a shadow comparator.

A customer may publish exactly one `VERIFIED_INSTALLATION` review after confirming completion. Public reputation exposes the average, verified-review count, and customer-confirmed completion count. Zero-review Partners remain eligible and are labelled explicitly, avoiding a misleading small-sample rank.

Moderation changes visibility and records an append-only event; it does not silently delete negative reviews.

## Journeys

- Product: only installation-relevant public products show “Choose installer”.
- Order: a customer-owned order shows the same action only when it contains a currently governed installation-relevant product.
- Custom: the customer can create a short CCTV consultation/design request without an order.
- Partner: new, active, and completed customer-selected projects share the existing installation workspace.
- Admin: monitoring, disputes, review status, and moderation live in the existing Retail Installation page.
- Partner activation: explicit opt-in, readiness, self-declared capabilities, service areas, availability, terms/privacy acceptance and Admin verification live in `/cabinet/installation-marketplace`.

## Deliberately deferred

- Partner pricing, bids, deposits, marketplace payments, refunds, payouts, and monetization.
- Automatic assignment, paid placement, opaque scoring, and rating-based eligibility.
- New SMS mechanisms or agent commission attribution.
- Public Partner detail pages and unconstrained/free-text competence taxonomy.
- SLA/legal/warranty promises beyond existing governed policy.

These can extend the aggregate through forward migrations and audited events without replacing customer, Partner, product, order, or assignment ownership.

## Future seams and legal boundary

The object type, locality, private-location snapshot, item references, and event history provide a migration seam to a future Customer Site / Digital Security Passport and to existing Customer Service, warranty, and equipment history. V1 does not create a competing Site, asset, or Service aggregate.

Commercial Agent attribution remains customer/referral-owned and is neither read nor mutated by Partner selection or installation progress. Future marketplace monetization must be a separate governed commercial phase. Sponsored placement, if ever introduced, must be explicitly labelled and separated from organic eligibility and trust evidence.

Novotech provides the matching platform. Installation is performed by the independently selected Partner; the Portal does not describe Partner staff as Novotech employees and introduces no Novotech installation guarantee.

Partner participation governance, supply diagnostics and cold-start interaction are specified in `MARKETPLACE_PARTNER_ACTIVATION.md`.
