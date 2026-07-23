# Estimate Unicode Encoding Audit

## Scope

This audit covers cart-to-estimate conversion, estimate persistence, proposal snapshots, preview, and PDF output. It does not introduce text repair in React, services, repositories, or mappers.

## Proven Boundary

The browser passes a normal JavaScript string to `createEstimateFromCartAction`. The action and `EstimateLifecycleService` preserve that value, the Supabase repository serializes ordinary JSON, and PostgreSQL stores `text` using UTF-8.

The applied `create_estimate_from_cart` function contains an already-corrupted SQL literal for the generated section name. PostgreSQL therefore stores the exact bad literal it receives. There is no runtime `Buffer`, `TextEncoder`, `TextDecoder`, percent-decoding, Latin-1 conversion, or base64 transformation in this path.

## Production Evidence

On 2026-07-23, the exact corrupted section literal existed in five `estimate_sections` rows across two companies and five estimates. The rows were created between 2026-07-18 and 2026-07-23. The deterministic value and dates match estimates created through the faulty RPC.

The production database reports both `server_encoding` and the inspected connection's `client_encoding` as `UTF8`.

## Repair Contract

- Replace the RPC through a new migration; do not edit the applied migration.
- Use the UTF-8 source literal `Оборудование`.
- Repair only rows whose `name` exactly equals the proven corrupted literal.
- Report the affected row count through a migration notice.
- Re-running the repair changes zero additional rows.
- Do not rewrite arbitrary partner-entered text or immutable proposal snapshots.

## Performance

The correction changes one SQL literal and performs one bounded exact-match repair during migration. It adds no application query, render-time normalization, client parsing, 1C request, or per-line work.
