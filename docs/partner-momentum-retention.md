# Partner Momentum & Retention

## Scope

This feature detects changes in company purchasing momentum from local, published order history. It is not CRM: it creates no leads, deals, tasks, call logs, or free-form manager notes.

## Eligibility

A company is eligible only when it is active and has at least three confirmed/posting order-history rows, at least two distinct purchasing dates, and at least 60 days between its first and latest purchasing dates. Inactive companies are excluded. Companies below the evidence threshold remain `insufficient_history` and cannot enter a risk band.

## Windows and currencies

The primary comparison is the latest 60 days versus the preceding 60 days. Source facts retain 30/60/90-day-compatible order dates for future aggregate views, while the first score version uses the governed 60-day comparison. Monetary totals remain grouped by currency. A monetary ratio is used only when one unambiguous currency exists; multi-currency companies use units for the 35% volume component and are flagged for diagnostics.

## Personal cycle and score

The personal cycle is the median number of days between distinct purchasing dates. With at least four intervals, values are winsorized to the observed 10th and 90th percentile before median and average calculations.

`2026-08-02-v1` uses:

- volume or units versus baseline: 35%;
- order frequency: 25%;
- recency relative to personal cycle: 20%;
- distinct SKU breadth: 10%;
- unresolved intent: 10%.

Bands are `growth` 80-100, `stable` 60-79, `slowing` 40-59, `attention_required` 20-39, and `high_risk` 0-19. Eligibility and recovery are separate states.

## Hysteresis and recovery

Ordinary transitions require two identical calculations. Severe high risk below 15 may transition immediately. Existing decline bands retain a five-point recovery margin: slowing requires 65, attention requires 45, and high risk requires 25 to leave the band. A company becomes `recovered` after a new confirmed order when its score is at least 45 and current-window frequency reaches at least half of baseline. Recovery resolves prior manager/prompt interventions.

## Projection

Order-history, cart, template, and opportunity mutations enqueue only the affected company. The worker claims keys with `FOR UPDATE SKIP LOCKED`, reads a bounded 730-day/2,000-order aggregate, calculates outside React, and publishes snapshot, reasons, and transition atomically. Source truncation fails safely and preserves the previous snapshot. A daily reconciliation enqueues active companies; targeted processing runs every ten minutes.

## Access and privacy

Partner roles owner, manager, and buyer receive only a redacted action summary through a SECURITY DEFINER RPC. Scores, monetary components, internal statuses, manager assignment, and diagnostics are not granted directly. Accounting and retail-only/viewer roles receive no partner momentum capability. Internal sales can view assigned companies; platform administrators can view all. Company capability and role permission must both pass existing canonical access evaluation.

## Stimulation governance

Partner actions begin with repeat purchasing and templates, then existing opportunities and active campaigns. No discount or price is generated. Manager records are transition-deduplicated. Partner dismissal creates a 30-day server-side cooldown. High-risk manager reminders have a 14-day cooldown. The holdout model is present but constrained off until a meaningful sample and approved experiment exist.

## Failure isolation

Projection writes are downstream of authoritative orders, prices, stock, campaigns, and carts. A calculation or publication failure only releases the dirty key with a safe error code. It cannot roll back or replace those source domains.
