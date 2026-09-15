# Installation Marketplace Ranking V2

## Boundary

Ranking V2 orders an already bounded set of installation Partners for one customer-owned Installation Project. It neither assigns a Partner automatically nor changes eligibility, pricing, payment, Agent attribution, warranty, or commercial truth. It uses local Marketplace, canonical Partner, service-area and catalog references only; there is no live 1C dependency.

Organic ranking and any future sponsored placement are different products. Sponsored results must be explicitly labelled and may never overwrite organic trust evidence.

## Explicit pipeline

`ELIGIBILITY → RELEVANCE → TRUST_QUALITY → RELIABILITY → EXPOSURE_FAIRNESS → FINAL_ORDER`

The database returns one set-based evidence payload. Independent TypeScript functions calculate each stage. A second server-only RPC writes the immutable decision and deduplicated appearances. React receives only public Partner facts and customer-facing labels—never component scores or competitor evidence.

## Policy `installation-ranking-v2.1`

All parameters live in `INSTALLATION_RANKING_POLICY`:

| Parameter | Value |
| --- | ---: |
| Verified-quality prior | 4.0 / 5 |
| Prior weight | 5 reviews |
| Quality sufficient sample | 5 reviews |
| Reliability minimum denominator | 3 outcomes |
| Dispute-rate minimum denominator | 5 confirmed/disputed outcomes |
| Fast response | ≤120 minutes |
| Same-day response | ≤480 minutes |
| Slow band boundary | 1,440 minutes |
| Exposure lookback | 30 days |
| Impression dedupe window | 30 minutes |
| Fair-exposure epoch | 7 days |
| Reserved exploration positions | at most 1, only when shortlist size ≥3 |
| Component weights | relevance 45%, quality 25%, reliability 20%, exposure 10% |

Changing these values requires a new policy version. Historical decisions keep their original version and component evidence.

## Eligibility and relevance

Eligibility is never scored. A candidate is excluded unless the canonical B2B company is active and publicly listed, the provider is active/approved/marketplace-enabled, the profile is published and available, the exact system capability is active, and declared geography covers the request.

For a canonical service region, exact coverage is stronger than an explicitly declared ancestor region. When the customer selected “any available area”, the provider must still have at least one active declared service region; geography is marked `UNSPECIFIED` rather than inferred from free text. V2 does not fabricate product-category or object/need specialization because V1 does not yet contain canonical provider evidence at that granularity.

## Verified quality and confidence

Only `VERIFIED_INSTALLATION` reviews with moderation status `PUBLISHED` contribute. The observed rating is:

`0.50 × overall + 0.20 × workmanship + 0.15 × communication + 0.15 × agreement`

Small samples use the explicit Bayesian prior:

`adjusted = (4.0 × 5 + observed × review_count) / (5 + review_count)`

Confidence is `review_count / (5 + review_count)`. No history is `NO_HISTORY`; one to four reviews are `LOW_SAMPLE`; five or more are `SUFFICIENT`. A single 5.0 therefore adjusts to 4.1667 and cannot automatically outrank substantial verified history.

Hidden or pending reviews remain raw audit facts but provide no positive ranking evidence. Moderation never rewrites ratings.

## Reliability

Metrics are used only after their own minimum denominator is met:

- response time: median server timestamps from `selected_at` to accepted/declined;
- acceptance: accepted / accepted + declined + expired;
- completion: Partner-installed / accepted;
- confirmation: customer-confirmed / Partner-installed;
- disputes: negative confidence only from at least five confirmed/disputed outcomes.

Unavailable metrics are omitted from the reliability mean. With no usable metric the component is neutral `0.5` and explicitly `NO_HISTORY`, not artificial perfection or failure. Cancellations are measured for calibration but omitted because V1 has no governed fault attribution. Customer confirmation is stronger evidence than the Partner’s installation claim.

## Cold start and fair exposure

Base order uses the versioned component result with stable name/UUID tie-breaking. When more candidates exist than slots, a shortlist of at least three may reserve only its last slot for a qualified new/learning or materially underexposed candidate. Selection is deterministic by relevance, 30-day exposure, project, policy epoch and provider identity. The leading relevant/trusted candidates are not randomized.

Repeated rendering by the same customer/project/provider inside a 30-minute server-derived window creates no additional exposure row or eligible impression. This limits refresh gaming. The audit tracks the first counted position and policy version for that window.

Admin concentration diagnostics report top-1/top-3/top-5 impression shares plus HHI. Equal distribution is not an objective by itself; eligibility and relevance remain primary.

## Explainability and shadow calibration

Every stored candidate includes language-neutral reason codes, stage evidence, eligibility result and final position. Customer UI may say `Recommended` and show recognizable facts; it never claims “best installer” or exposes an opaque public score.

Each decision also stores the former V1 neutral order. Admin can compare it with V2 without exposing shadow results to customers or Partners. Selection events attach the latest matching decision ID, policy version and shortlist position server-side.

## Security and anti-gaming

- Evidence and decision-write RPCs are `service_role` only and called from server-only repository code.
- Customer ownership is checked again inside each RPC; browser IDs are not authority.
- Decision/exposure tables use RLS, `FORCE RLS`, least-privilege grants and Admin-only read policies.
- Admin diagnostics require `admin.retail_marketplace.view`.
- Partner surfaces receive no competitor ranking, position or component details.
- Reviews require the verified closed loop; only customer-confirmed completion strengthens trust.
- Deduplication limits rapid refresh; stable server timestamps prevent client-clock manipulation.
- Accept-then-cancel is not treated as quality; disputes are sample-bounded rather than catastrophic.

## Calibration seam

The immutable decision, deduplicated exposure and lifecycle facts support selection rate by position, acceptance/confirmation/review rates, exposure concentration, cold-start exposure and dispute rate. Production V2 begins in sparse-data mode and should be recalibrated only after sufficient real outcomes exist. No BI dashboard or final weight optimization is part of V2.
