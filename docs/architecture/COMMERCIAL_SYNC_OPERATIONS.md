# Commercial Synchronization Operations

## Production Evidence

On 2026-07-25 the production commercial-rate cron started at 01:30 UTC and
completed successfully in 1,016 ms. The active partner-facing conversion rates
were still published on 2026-07-18.

The cause is a data-boundary mismatch:

- `/api/cron/commercial-rate` verifies and publishes the 1C BCRU source rate;
- partner and retail conversion rates are controlled snapshots with purposes
  `partner_price_usd_to_mdl` and `retail_price_usd_to_mdl`;
- no authoritative automatic 1C source for the RTL 999 conversion has been
  approved.

A successful source-rate check must not alter the RTL value or its publication
timestamp. The portal therefore continues to warn when the controlled
conversion snapshot is stale.

## Daily Schedule

Vercel cron expressions are UTC and do not follow Europe/Chisinau daylight
saving time.

| Domain | UTC | Chisinau summer | Chisinau winter | Endpoint |
| --- | --- | --- | --- | --- |
| 1C BCRU source rate | 22:15 | 01:15 | 00:15 | `/api/cron/commercial-rate` |
| Product and partner prices | 23:25 | 02:25 | 01:25 | `/api/cron/price-sync-start` |
| Exact stock and supplier arrivals | 00:35 | 03:35 | 02:35 | `/api/cron/stock-sync-start` |
| Catalog support data | 02:55 | 05:55 | 04:55 | `/api/internal/catalog-sync` |

Price and stock continuation routes run every minute only while a persisted
job is queued or running. They are workers, not additional full-sync starts.

Supplier arrivals remain an atomic phase of the exact-stock snapshot. Splitting
their publication into a second job would duplicate staging and could expose a
stock/arrival snapshot assembled from different source times.

## Dependency And Locking

Rates start before prices. Prices start before stock. Catalog no longer starts
prices as a side effect.

- BCRU rate uses the `commercial_rate` distributed lock.
- Price and stock starts use their persisted singleton state and database
  acquisition functions.
- Price completion may launch stock only when stock is not already running.
- Previous published snapshots remain unchanged until atomic publication.
- A failed source-rate check does not clear prices.

## Manual Operations

Internal/admin users retain focused rate, price, catalog, and stock actions.
The browser supplies only the operation type. Credentials, 1C resources, query
strings, company references, and source payloads remain server-side.

## Remaining Source Constraint

RTL 999 remains a controlled manual conversion rate until an authoritative 1C
read contract is approved. Automation must not infer or refresh that rate from
the BCRU source.
