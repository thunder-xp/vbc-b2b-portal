# Buyer Behavior And Recommendation Architecture

## Purpose

This design adds first-party merchandising and business-event analytics without
turning the Partner Platform into CRM or moving commercial truth out of 1C.
The first release supports manual catalog curation and bounded aggregate
analytics. It does not publish automatic recommendations.

## 1. Event Ownership

The portal owns behavioral events created by interaction with portal workflows.
1C remains the source of product identity, catalog state, prices, stock,
arrivals, and orders. Events never duplicate those commercial values.

The portal also owns manual `NEW`, `TOP`, and `HOT` assignments, their display
priority, publication period, editorial reason, and audit history.

## 2. Event Taxonomy

The allowlist contains discovery, product-interest, commercial-intent, and
demand-gap events. It includes catalog/category/search/filter activity,
merchandising engagement, product views and document activity, favorites and
comparison, cart/estimate/proposal/order intent, and unavailable-product
interest.

`product_viewed_repeatedly_without_purchase` is derived later from aggregates;
it is not emitted directly.

## 3. Identity And Company Boundaries

The browser supplies no company ID. A server service resolves the authenticated
user's active company membership, and the database RPC independently validates
that membership and `catalog.view`. `user_id` is always `auth.uid()`.

Multi-company behavior is attributed only to the server-resolved active
membership context. Cross-company event queries are unavailable to partners.

## 4. Privacy

Events contain bounded business context only. They exclude emails, tokens,
credentials, free-form notes, document contents, browser fingerprints, raw
prices, costs, margins, and authorization data. Routes are stored without query
strings. Search text is normalized, lowercased, whitespace-collapsed, and
limited to 100 characters.

No individual employee surveillance dashboard is provided. Admin analytics
returns aggregates only.

## 5. Retention

The default retention target is 13 months, subject to legal review. Deletion or
anonymization must run as an audited operator process and preserve aggregate
integrity where legally permitted. No client can update or delete event rows.
Partitioning is deferred until observed volume justifies its operational cost.

## 6. Aggregation

The initial read model calculates a bounded 30-day preview for product interest,
search gaps, category interest, and merchandising engagement. It is protected
by `admin.analytics.view`, returns no raw users or companies, and marks results
as preliminary below the minimum volume threshold.

Future scheduled aggregates may materialize:

- product interest by company count and funnel stage;
- company interest by category and brand;
- normalized search-gap frequency;
- unmet demand and no-stock interest;
- conversion indicators from view to order.

## 7. Recommendation Candidates

A future candidate contains:

- candidate label or product placement;
- confidence score;
- bounded evidence summary;
- generation time;
- expiry;
- target scope;
- admin approval status.

Candidates use source `analytics_recommendation` and remain non-publishable.

## 8. Admin Approval

Only users with `admin.catalog.manage` may publish merchandising assignments.
An approved recommendation creates a separate manual assignment through the
same audited mutation RPC. Recommendation generation never updates a published
assignment directly.

## 9. Explainability

Every candidate must explain which aggregate signals contributed, the analysis
window, minimum-volume checks, and exclusions. Raw user histories are not valid
evidence.

## 10. Suppression Rules

Recommendations are suppressed for inactive or hidden products, insufficient
volume, expired evidence, restricted product visibility, unresolved commercial
access, anomalous traffic, and an explicit editorial rejection. A manual
assignment is never overwritten by a 1C signal or analytics candidate.

## 11. Cold Start

With insufficient data, the platform renders only manual or validated 1C
assignments and the complete catalog. It does not fabricate `TOP`, `HOT`, or
`NEW`. Deterministic in-stock fallback discovery may be evaluated separately.

## 12. Multi-Company Behavior

Company-level aggregation uses company IDs only inside protected projections.
Signals from different companies may contribute to global product aggregates
only after minimum-volume suppression. Personalized output must remain scoped
to the requesting active company.

## 13. Role-Aware Recommendations

Future output must respect the active role's catalog, pricing, and stock
permissions. A recommendation may identify a product, but the normal catalog
projection remains responsible for redacting prices and stock.

## 14. Analytics-To-Merchandising Flow

1. Validated events are appended.
2. Bounded aggregate jobs create evidence.
3. A recommendation service creates a non-publishable candidate.
4. Suppression and confidence rules run.
5. An authorized admin reviews the evidence.
6. Approval creates an audited manual assignment.
7. The standard catalog projection validates product eligibility, time window,
   company visibility, and commercial redaction.

## 1C NEW Signal

The required 1C business property is `Это новинка, действителен до`. The current
published catalog integration exposes generic additional requisites but does
not provide a proven resolved date for that property. No OData field name is
guessed. Manual `NEW` remains available. Future ingestion must resolve that
exact additional requisite to a date and create an independent `one_c`
assignment without replacing manual assignments.

## Performance Boundaries

- partner catalog page: one aggregate RPC, including labels;
- curated landing: one merchandising read, one bounded catalog batch, one
  commercial batch;
- admin merchandising list: one paginated aggregate RPC;
- no live 1C calls;
- view events: one non-blocking action with session-level hydration deduplication;
- analytics preview: one bounded aggregate RPC;
- no raw event reads in normal pages.

## Security Summary

RLS is enabled on merchandising and behavior tables. Direct grants are revoked.
Partners read published merchandising only through company-bound RPCs. Admin
mutations and aggregate analytics require explicit internal permissions.
Service-role credentials are not used by application features.
