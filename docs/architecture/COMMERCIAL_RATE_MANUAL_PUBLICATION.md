# Temporary Commercial Rate Publication

## Purpose

The production 1C OData contract exposes `Catalog_Валюты` identity and formula metadata, but it does not expose authoritative current commercial rates, multiplicity, or effective dates. Until 1C provides that contract, an authorized Novotech employee may copy independently verified values from 1C into a portal read model.

1C remains the source of truth. The portal stores immutable publication history and identifies rates by commercial purpose, never by an inferred currency description.

## Purposes

- `partner_price_usd_to_mdl`: converts the assigned partner USD price to MDL.
- `retail_price_mdl_to_usd`: converts the RETAIL MDL price to a whole-dollar reference value.

The labels `RTL`, `BCR`, and `BCRU` are not security or calculation identifiers. No rate may substitute for the other purpose.

## Boundaries

- React renders values and submits forms; it performs no conversion or authorization.
- `CommercialRateManagementService` validates actor type, permission, precision, effective date, and source notes.
- `PricingInventoryRepository` is the only Supabase boundary.
- `publish_manual_commercial_exchange_rate_v2` serializes each purpose, rejects older effective dates, derives `published_by` from `auth.uid()`, retires only the prior row for the same purpose, inserts a new immutable value row, and writes an audit event in one transaction.
- Existing checkout, estimate, cart, and order rate requirements continue using their established legacy rate read until a separately approved migration is designed.

## Security

Publication requires an active `internal` or `admin` profile and `commercial_rates.manage`. The RPC repeats this authorization as defense in depth. Partners cannot read internal history or execute the RPC. Authenticated users receive no direct insert, update, or delete grants on rate or audit tables.

## Product Calculations

The product service loads both active purposes in one bounded database query and reuses the snapshot for every product in the request.

```text
partnerPriceMdl = partnerPriceUsd * partner_price_usd_to_mdl
retailPriceUsd = ROUND_HALF_UP(retailPriceMdl / retail_price_mdl_to_usd, 0)
grossProfitMdl = retailPriceMdl - partnerPriceMdl
markupPercent = grossProfitMdl / partnerPriceMdl * 100
```

All operations use Decimal arithmetic. Missing purposes suppress only their own derived presentation. Product rendering never calls 1C.

## Permanent 1C Contract

The future provider must return authoritative records in one bounded response:

```ts
type CommercialRateSourceDTO = {
  purpose: "partner_price_usd_to_mdl" | "retail_price_mdl_to_usd";
  currencyReference: string;
  code: string;
  symbolicCode: string | null;
  rate: string;
  multiplicity: string;
  normalizedRate: string;
  effectiveAt: string;
  dataVersion: string | null;
};
```

The provider must validate positive finite values, preserve source identity and version, and publish through the same purpose-based atomic boundary. Replacing the manual producer must require no product-page formula or UI change.

## Removal

After the authoritative endpoint is production-verified, remove the manual page/action and `manual_from_1c` producer. Preserve existing history for audit and let the automatic provider publish new rows into the same purposes.
