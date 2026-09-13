# Shared Customer Identity

## Responsibility

`customer_identities` is the minimal, source-neutral correlation root for a real-world `PERSON` or `LEGAL_ENTITY`. It owns identity correlation only. Partner customer profiles, Retail privacy/order behavior, Agent attribution, prices, debt, orders, estimates, warranty, commission and accounting remain with their existing owners.

`partner_final_customers` and `retail_customers` retain their primary keys and every existing runtime foreign key. Each receives only a nullable `customer_identity_id` link. Estimates still reference Partner final customers; Retail orders still reference Retail customers.

## Evidence and matching

The shared resolver normalizes only deterministic evidence:

- phone: explicit E.164; no country-code guessing;
- email: trim and lowercase;
- legal identifier: uppercase and removal of permitted formatting only;
- 1C: exact governed external reference.

Normalized phone, email and legal identifiers are represented by HMAC-SHA256 in `customer_identity_keys`; plaintext normalized values are not stored there. `CUSTOMER_IDENTITY_HMAC_SECRET` is dedicated and server-only. `key_version` permits dual-read/backfill during future rotation: deploy a new version, attach new hashes to existing roots in a bounded job, switch writes, verify coverage, then revoke old keys. Rotation never deletes roots or context records.

Matching precedence is `EXACT_1C_REF`, `EXACT_LEGAL_IDENTIFIER`, `EXACT_VERIFIED_PHONE`, then `EXACT_VERIFIED_EMAIL`. One strong root yields `MATCHED`; no match with evidence may yield `NEW`; weak/colliding evidence yields `AMBIGUOUS`; strong evidence pointing to different roots yields `CONFLICT`. Names, addresses and fuzzy scores never authorize a merge.

## Backfill and reconciliation

The production dry-run found 63 Partner records, 6 Retail records, zero authoritative cross-context matches, zero ambiguous keys and zero conflicts. Therefore the additive migration creates 69 distinct roots and links every source record without merging or deleting anything. It processes only null links, so replay is idempotent. New context rows receive a root in the same database transaction.

Ambiguity/conflict cases and append-only identity events preserve traceability. A future bounded Admin resolver may relink a context to another root only through audited service operations; source rows are never physically merged.

## Privacy boundaries

All shared tables use RLS plus FORCE RLS and have no `anon` or `authenticated` table grants. Only server-side service-role repositories and fixed-empty-search-path RPCs can access them. A common root never grants Partner access to Retail rows, Retail access to Partner rows, or Agent access to either context. Admin views expose only governed operational projections.

## External and future seams

`customer_external_refs` maps exact external objects such as a 1C counterparty while keeping the root independent of 1C. The unique active source reference prevents the same 1C object from being attached to multiple roots.

Agent referrals and attribution target the shared root. A future Final Customer Cabinet can add an authenticated-user-to-root relation without changing Partner, Retail or Agent attribution schemas. That relation is deliberately not implemented in V1.
