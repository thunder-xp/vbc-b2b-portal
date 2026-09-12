# SDUC dynamic pricing core

## Status and ownership

SDUC V1 is a price-decrease authorization engine. It is deployed in `DRY_RUN`, disabled, and has no production discount ceiling. It cannot change catalog, cart, estimate, or order prices.

1C remains authoritative for the partner status, assigned price type, base partner price, STOP price, product, currency, and final customer order. The Portal owns only SDUC policy, temporary authorization lifecycle, audit, and the future transaction-time decision.

The authoritative base path is the existing governed pricing path:

`partner_companies.external_1c_price_type_id -> price_types -> current published product_prices`

STOP is resolved from the active 1C price type whose identity is all of:

- ref `5c72ff41-88d6-11e8-80dd-000c29a58b59`
- code `UU-000004`
- name `STOP`

No live 1C call is introduced. Both values come from the existing synchronized commercial read model.

## Calculation contract

`evaluateDecreaseEnvelope` is the one server-domain calculation boundary. Decimal arithmetic is used throughout.

```text
reserve_abs = base_price - stop_price
reserve_pct = reserve_abs / base_price * 100
allowed_pct = min(reserve_pct, global_ceiling_pct, mechanism_maximum_pct)
approved_pct = greatest configured step <= requested_pct and <= allowed_pct
effective_price = ceil_6(base_price * (100 - approved_pct) / 100)
```

A non-zero price can never round below STOP. Missing or invalid prices, incomparable currencies, a non-positive reserve, disabled policy, absent ceiling, and the absence of an allowed step all produce deterministic reason codes rather than a price.

Policies do not stack in V1. If several authorizations are available, selection is deterministic: lowest effective price, then highest policy priority, then stable authorization ID. An authorization is scoped to one company, product, mechanism, mechanism instance, and transaction. The unique scope and advisory lock make retries idempotent and concurrency-safe.

## Lifecycle and revalidation

The generic persisted lifecycle supports `DECREASE` and a future `INCREASE` direction, but every V1 creation path rejects anything except a DRY_RUN decrease. Authorization states are `ACTIVE`, `CONSUMED`, `EXPIRED`, `INVALIDATED`, and `REVOKED`.

Before a future order export, the caller must lock and revalidate:

- active state and validity window;
- company/product scope;
- current mechanism policy;
- current base price and source version;
- current STOP price and source version;
- currency comparability;
- effective price at or above current STOP.

Every transition is appended to the private event log. Audit metadata is deliberately safe: no partner-visible STOP, reserve, ceiling, or price authorization internals.

## Future integration seams (not active)

Order export is technically `READY`: `SalesOrderItemDTO.price` already accepts an explicit unit amount and `buildOneCCustomerOrderPayload` sends it as `Цена`; the provider also verifies line price and total after export. The safe insertion point is in `OrderService` after fresh authoritative commercial snapshots and currency validation, before `buildSalesOrder`, submission fingerprinting, and `beginSubmission`. Revalidation, winner selection, authorization ID, and effective price must be included in the immutable order snapshot before export. V1 does not connect this seam.

Estimate integration is `PARTIAL`: proposal lines already persist source and selling price snapshots, but no authorization linkage exists. A later task must add the authorization ID, effective price, and expiry to the estimate line/snapshot and revalidate on send, acceptance, and order conversion. A stale authorization must produce a neutral “price requires refresh” state; it must not silently fall back or recreate a discount. V1 does not alter estimate storage or UX.

An increase engine may reuse policy, authorization, audit, conflict, idempotency, revalidation, and transaction linkage. It requires its own authority, ceiling/floor, eligibility, calculation, and reason-code rules. None are inferred here.

## Security and performance

All SDUC state is in `private`, uses `ENABLE` plus `FORCE ROW LEVEL SECURITY`, and has table/sequence privileges revoked from `anon`, `authenticated`, and `service_role`. Only fixed-search-path `SECURITY DEFINER` RPCs provide bounded service-role operations. Partner/browser roles cannot evaluate or inspect SDUC internals.

The existing `/admin/commercial/prices` permission gate can read one aggregate diagnostic RPC. It exposes mode, source readiness, aggregate coverage, and counts only. It does not expose STOP values, reserves, ceilings, or authorization rows.

Calibration computes the active-company × active-visible-product population transiently and persists aggregates only. It is not attached to page loads and adds no catalog/PDP/dashboard request or live 1C dependency.

## Activation prerequisites

Production activation is a separate commercial decision and migration. It requires an approved global ceiling, approved per-mechanism maximums/steps/validity, mechanism enablement, end-to-end order and estimate integration, finance/legal approval, and production failure-path acceptance. This core deliberately satisfies none of those by default.
