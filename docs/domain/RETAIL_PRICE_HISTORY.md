# RETAIL price history

## Canonical source

- Price type code: `UU-000020`
- Price type reference: `e181c772-93fc-11e9-94cb-000c2988d323`
- Current verified currency: `MDL`
- 1C source: `InformationRegister_ЦеныНоменклатуры`

The register does not expose currency per historical row. Historical 1C rows
are therefore private discovery data until currency continuity is verified.
They must never appear in the partner chart while verification is blocked.

## Consistency

`product_prices` remains the current-price read model. An append-only trigger
captures a RETAIL change point inside the existing price-publication
transaction. If history capture fails, current-price publication rolls back
and the previous current price and history remain valid.

The migration creates one `initial_baseline` point for every currently
published MDL RETAIL price. Later synchronization adds a
`price_sync_snapshot` only when amount or currency changes. Unchanged runs are
idempotent.

## Read path

The product route derives the product ID. The browser supplies only one of
`3m`, `6m`, `12m`, or `all`; it cannot select a price type. A single bounded
RPC returns at most 500 chronological points for canonical RETAIL. Product
rendering never calls 1C.

Full-commercial and retail-only members may read RETAIL history. Company
partner prices, discounts, margins, sync identifiers, and source fingerprints
are not exposed.

## Historical verification

The admin price page shows discovery aggregates and the blocked state.
Verification requires `admin.integrations.manage`, a supported evidence type,
a detailed reason, and an append-only audit row. No partner-facing control can
enable unverified history.
