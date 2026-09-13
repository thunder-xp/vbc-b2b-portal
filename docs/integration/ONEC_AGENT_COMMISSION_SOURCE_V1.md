# AgentCommissionSourceV1

Status: implementation contract

Owner of accounting facts: 1C

Consumer: Novotech Portal integration layer

Contract version: `1`

## 1. Purpose and ownership

This is the minimum read-only source contract required for Portal to project Commercial Agent commission eligibility. It does not calculate commission and does not make Portal an accounting ledger.

1C is authoritative for realization, realized line amounts, VAT, discount, customer payment, payment allocation, return/correction, currency, posting state and deletion/cancellation state. Portal is authoritative for referral, attribution and forecast policy. Portal must not reconstruct missing accounting facts.

The recommended transport is one narrow versioned 1C HTTP service with three bounded resources:

- `GET /commission-source/v1/realizations`
- `GET /commission-source/v1/payments`
- `GET /commission-source/v1/adjustments`

Standard OData remains a source used inside 1C where appropriate, but is not the external contract. The current publication does not expose immutable tabular-line identities, deterministic payment-to-realization-line allocation, or a uniform return/correction relation. A second accounting register containing copied commercial amounts is not recommended.

## 2. Common protocol

All resources accept:

| Query | Type | Required | Semantics |
|---|---|---:|---|
| `changed_since` | RFC 3339 timestamp | no | Exclusive lower change boundary. Omit only for bootstrap/reconciliation. |
| `snapshot_at` | RFC 3339 timestamp | yes | Inclusive, immutable upper boundary shared by every page in a run. |
| `cursor` | opaque string | no | Continuation created by 1C; has meaning only with the same `snapshot_at`. |
| `limit` | integer 1..1000 | no | Requested bound; server may lower it. |

Every response is JSON with `contract_version: 1`, the echoed `snapshot_at`, `items`, `next_cursor` or `null`, and aggregate diagnostics. Items are ordered deterministically by `(last_modified_at, source_id)`. A cursor must not contain credentials or PII.

Amounts are exact base-10 JSON strings matching `^-?\d{1,18}(\.\d{1,4})?$`; exponent notation and binary JSON floats are forbidden. Currency is ISO 4217 uppercase. Dates use `YYYY-MM-DD`; timestamps are RFC 3339 with offset. The 1C endpoint performs currency rounding before export. Portal does not assume a VAT rate.

`source_version` changes whenever any exported field or exported child changes. `last_modified_at` is monotonic for that source identity. Unposting, deletion marking, reposting and changed allocations must therefore reappear in incremental output.

### Error behavior

- Invalid request: HTTP 400 with stable code `INVALID_REQUEST`.
- Invalid/unsupported cursor: HTTP 409 with `CURSOR_INVALID` or `SNAPSHOT_EXPIRED`; consumer restarts the bounded window.
- A source record that cannot satisfy this contract is omitted from `items`, quarantined inside the integration service, counted in diagnostics and returned as a safe error containing only source type, masked source ID, code and field.
- Unknown classification, missing customer ID, missing net amount, invalid allocation, currency mismatch or unstable identity must never be coerced to a default.
- Transport failure is retryable. Repeating the same request yields the same facts for the same snapshot.

## 3. Realizations

### Header

| JSON field | Type | Required | Semantics |
|---|---|---:|---|
| `contract_version` | literal `1` | yes | Schema version. |
| `source_realization_id` | string | yes | Immutable 1C document `Ref_Key`. |
| `source_realization_type` | enum/string | yes | Stable 1C document type, not display text. |
| `source_order_id` | string/null | yes | Immutable customer-order `Ref_Key`, if the realization is order-backed. |
| `source_customer_1c_id` | string | yes | `Catalog_Контрагенты.Ref_Key` of the final customer. |
| `organization_1c_id` | string | yes | Immutable organization `Ref_Key`. |
| `document_number` | string | yes | Display/audit number; never an identity. |
| `document_date` | date | yes | Authoritative posting document date. |
| `posted` | boolean | yes | Current 1C posted state. |
| `deletion_marked` | boolean | yes | Current 1C deletion state. |
| `currency` | ISO code | yes | One currency for header and all amounts/allocations. |
| `gross_total` | unsigned decimal | yes | Actual realized total including VAT, after discounts. |
| `net_total` | unsigned decimal | yes | Actual realized total excluding VAT, after discounts. |
| `vat_total` | unsigned decimal | yes | Actual VAT total. |
| `source_version` | string | yes | Opaque stable change token. |
| `last_modified_at` | timestamp | yes | Change timestamp used by incremental sync. |
| `lines` | line[] | yes | At least one line; header totals must equal line totals. |

`gross_total = net_total + vat_total`. The same equality is mandatory per line. Unposted or deletion-marked documents remain exportable so Portal can reconcile stale projections; they are not eligible facts.

### Line

| JSON field | Type | Required | Semantics |
|---|---|---:|---|
| `source_realization_id` | string | yes | Parent immutable realization ID. |
| `source_line_id` | string | yes | Immutable line identity; never document number or mutable line number alone. |
| `source_nomenclature_id` | string | yes | `Catalog_Номенклатура.Ref_Key`. |
| `quantity` | positive decimal | yes | Actual realized quantity. |
| `gross_amount` | unsigned decimal | yes | Actual line gross including VAT, after discount. |
| `discount_amount` | unsigned decimal | yes | Actual discount recorded by 1C; informational and not subtracted again. |
| `net_amount_before_vat` | unsigned decimal | yes | Actual line base excluding VAT, after discount. |
| `vat_amount` | unsigned decimal | yes | Actual line VAT. |
| `commission_classification` | enum | yes | One authoritative classification below. |
| `transaction_flags` | object | yes | Required booleans `tender`, `subcontract`, `special_price_project`, `excluded`. |

### Classification contract

The sole nomenclature-level authority is a new governed 1C enum attribute:

`Catalog_Номенклатура.НСД_КлассификацияКомиссииАгента`

Allowed values and exact meanings:

| Value | Meaning |
|---|---|
| `EQUIPMENT` | Goods/equipment potentially eligible under equipment policy. |
| `NOVOTECH_INSTALLATION` | Installation performed and sold by Novotech. It is not the standard 1C “agent service” flag. |
| `ELIGIBLE_SERVICE` | Service eligible for the governed first-service-payment policy. |
| `NONCOMMISSIONABLE` | Delivery, fee, state fee, third-party work or any nomenclature that is never commissionable. |

Current nomenclature type, category and goods/service accounting fields safely distinguish goods from generic services, but cannot distinguish Novotech installation, eligible service, third-party/subcontract work and excluded service. Therefore they may seed a reviewed migration proposal but cannot be the runtime authority. Name matching is prohibited. Existing `ЭтоАгентскаяУслуга` is not this classifier and must not be reused.

`transaction_flags` are transaction facts, not a second classifier. The endpoint must map governed existing tender/project/subcontract/exclusion facts. If a flag cannot be proved for a transaction, 1C must quarantine the record rather than emit `false` by assumption. A transaction-specific `excluded=true` can suppress a normally classified line; it must never make `NONCOMMISSIONABLE` nomenclature eligible.

## 4. Payments and allocations

### Payment

| JSON field | Type | Required | Semantics |
|---|---|---:|---|
| `contract_version` | literal `1` | yes | Schema version. |
| `source_payment_id` | string | yes | Immutable payment/refund/correction document `Ref_Key`. |
| `source_payment_type` | enum | yes | `BANK_RECEIPT`, `CASH_RECEIPT`, `BANK_REFUND`, `CASH_REFUND`, `PAYMENT_CORRECTION`, `PAYMENT_CANCELLATION`. |
| `reverses_source_payment_id` | string/null | yes | Required for refund/cancellation; original immutable payment ID. |
| `source_customer_1c_id` | string | yes | Final-customer `Ref_Key`. |
| `payment_date` | date | yes | Authoritative payment posting date. |
| `currency` | ISO code | yes | Payment/allocation currency. |
| `payment_amount` | unsigned decimal | yes | Absolute source amount. |
| `posted` | boolean | yes | Current posted state. |
| `deletion_marked` | boolean | yes | Current deletion state. |
| `source_version` | string | yes | Change token. |
| `last_modified_at` | timestamp | yes | Incremental change timestamp. |
| `allocations` | allocation[] | yes | May be empty for unapplied prepayment. |

### Authoritative line allocation

| JSON field | Type | Required | Semantics |
|---|---|---:|---|
| `source_allocation_id` | string | yes | Immutable identity of this payment/line allocation fact. |
| `source_payment_id` | string | yes | Parent payment ID. |
| `source_realization_id` | string | yes | Target realization ID. |
| `source_line_id` | string | yes | Target immutable line ID. |
| `direction` | enum | yes | `APPLY` or `REVERSE`. |
| `currency` | ISO code | yes | Must match payment and target realization. |
| `allocated_gross_amount` | positive decimal | yes | Exact applied/reversed gross. |
| `allocated_net_amount_before_vat` | unsigned decimal | yes | 1C-authoritative allocated net. |
| `allocated_vat_amount` | unsigned decimal | yes | 1C-authoritative allocated VAT. |

The endpoint, not Portal, owns allocation. It must resolve one payment to many realizations, many payments to one realization, partial payments, prepayments and final payments. Document-level-only output is insufficient because Portal must not invent a proportional allocation policy. If current 1C stores allocation only at document level, Finance/1C must define and implement the line-level accounting allocation before this endpoint is accepted.

For an unapplied prepayment, the payment is exported with `allocations: []`; when it is applied, the same `source_payment_id` receives a new `source_version` and new stable allocation facts. Receipt allocations use `APPLY`; refund/cancellation allocations use `REVERSE`. `PAYMENT_CORRECTION` may contain either direction. Absolute allocations per payment must not exceed `payment_amount`. A cross-currency allocation is rejected; currency conversion cannot be inferred by Portal.

Chronological “first qualifying service payment” is the earliest posted, non-deleted `APPLY` allocation to an `ELIGIBLE_SERVICE` line after reversing/cancelling source events are reconciled. The source exposes facts only; Portal policy decides eligibility later.

## 5. Returns and sale corrections

To keep reversal deterministic, 1C emits one adjustment item per affected original realization line.

| JSON field | Type | Required | Semantics |
|---|---|---:|---|
| `contract_version` | literal `1` | yes | Schema version. |
| `source_adjustment_id` | string | yes | Immutable adjustment-line event identity. |
| `adjustment_type` | enum | yes | `RETURN`, `CORRECTION`, or `CANCELLATION`. |
| `original_realization_id` | string | yes | Original immutable realization ID. |
| `original_line_id` | string | yes | Original immutable realization-line ID. |
| `source_customer_1c_id` | string | yes | Same governed final customer. |
| `adjustment_date` | date | yes | Authoritative adjustment date. |
| `currency` | ISO code | yes | Must match original realization. |
| `gross_delta` | signed decimal | yes | Change to original realized gross. |
| `net_delta` | signed decimal | yes | Change to original realized net. |
| `vat_delta` | signed decimal | yes | Change to original VAT. |
| `posted` | boolean | yes | Current posted state. |
| `deletion_marked` | boolean | yes | Current deletion state. |
| `source_version` | string | yes | Change token. |
| `last_modified_at` | timestamp | yes | Incremental change timestamp. |

`gross_delta = net_delta + vat_delta`. Returns and cancellations use non-positive deltas. Corrections use signed deltas. An adjustment without exact original line linkage is invalid. Whole-document cancellation is exported as one line-linked cancellation per original line. Payment refunds/reversals are separate payment events; a sale adjustment does not imply money was refunded.

## 6. Stable identities and 1C implementation

Document `Ref_Key` is the realization/payment identity. The current standard tabular `LineNumber` is not accepted as immutable through edit/repost/reordering. 1C must provide stable UUIDs for realization lines and payment allocations. The smallest supported implementation is either:

1. persistent UUID attributes on relevant 1C tabular rows; or
2. one technical information register `НСД_ИдентификаторыИсточникаКомиссии` keyed by document identity plus a native immutable row signature.

The register stores identity/change metadata only, not a parallel accounting balance. `source_adjustment_id` can be the immutable adjustment document ID plus its persisted adjustment-row UUID. No random identity may be regenerated during export.

One HTTP service `NSDAgentCommissionSourceV1` exposes the three resources. It reads existing accounting documents/registers, performs the Finance-approved allocation and normalized status mapping, and returns only the fields in this document.

## 7. Customer mapping

The canonical Portal mapping is the existing `customer_external_refs` table:

```text
system = '1C'
entity_type = 'COUNTERPARTY'
external_id = Catalog_Контрагенты.Ref_Key
```

No parallel mapping table is allowed. Population order:

1. Reuse a verified 1C `Ref_Key` captured during governed customer creation.
2. Otherwise propose an exact legal-identifier match after normalizing the governed values.
3. Otherwise propose exact verified phone/email matches through Shared Customer Identity.
4. Auto-link only when all available strong signals resolve to exactly one active, non-deleted 1C counterparty and no signal conflicts.
5. A duplicated source value, multiple distinct candidates, or contradictory signals creates a reconciliation case; no mapping is inserted automatically.

Names are never matching evidence. Mapping is performed by a governed Portal reconciliation service, not this provider and not React.

### Read-only production calibration (2026-09-13)

The calibration compared normalized strong identifiers in protected server-side projections and returned aggregates only. It made no writes and disclosed no PII.

| Measure | Count |
|---|---:|
| Active/non-deleted 1C counterparties examined | 113,764 |
| Existing customer identities | 69 |
| Exact legal-ID candidate identities | 0 |
| Exact phone candidate identities | 0 |
| Exact email candidate identities | 0 |
| Unambiguous matches | 0 |
| Ambiguous matches | 0 |
| Conflicting strong-signal matches | 0 |
| Unmatched identities | 69 |
| Existing active 1C external mappings | 0 |

Result: current data cannot be backfilled automatically. New mappings must be captured at customer creation or resolved through governed verification/reconciliation. This blocks commission projection for the current 69 identities until mappings exist, but does not block implementing the 1C source endpoint.

## 8. Diagnostics

Each page returns these non-negative aggregate counters:

```text
REALIZATIONS_READ
LINES_READ
PAYMENTS_READ
ALLOCATIONS_READ
ADJUSTMENTS_READ
UNKNOWN_CLASSIFICATION
UNMAPPED_CUSTOMER
INVALID_ALLOCATION
CURRENCY_CONFLICT
```

INFO logging is one aggregate sync summary. Invalid facts are WARN summaries by code/count; errors retain masked source identity and correlation ID. No full customer record, contact value, source payload, secret, internal margin, STOP/DDP field, unrelated counterparty or accounting journal internals are logged or returned.

## 9. Current 1C capability matrix

Evidence source: current production `$metadata` snapshot plus the existing read-only 1C/Supabase projections. “Derivable safely” means 1C can derive the exported fact from its own accounting objects; it does not authorize Portal inference.

| Requirement | Status | Current evidence / gap |
|---|---|---|
| Realization document identity/header | `AVAILABLE_NOW` | `Document_РасходнаяНакладная`, `Document_АктВыполненныхРабот`, retail realization objects expose document `Ref_Key`, customer, organization, date/state. |
| Order relation | `AVAILABLE_NOW` | `Document_ЗаказПокупателя` and realization base/order references exist. |
| Actual discounts | `AVAILABLE_NOW` | Realization lines expose discount fields including `СуммаСкидкиНаценки` / automatic discount. |
| Actual gross/VAT source values | `AVAILABLE_NOW` | Lines expose `Сумма`, `СуммаНДС`, `Всего` and header VAT-included evidence. |
| Uniform net-before-VAT output | `DERIVABLE_SAFELY` | 1C can normalize its source amount/VAT semantics and must export the exact result; Portal may not assume a rate. |
| Equipment vs generic service | `DERIVABLE_SAFELY` | Nomenclature/accounting types and goods/service tabular sections distinguish these broad classes. |
| Four-value commission classification | `REQUIRES_1C_EXTENSION` | Own installation, eligible service, third-party work and excluded lines are not deterministically distinguished. |
| Tender/subcontract/special/excluded flags | `UNKNOWN` | Metadata has no proved uniform transaction contract; exact current objects require Finance mapping or governed extension. |
| Immutable realization-line ID | `REQUIRES_1C_EXTENSION` | Standard line number is not immutable through document edits/reordering. |
| Payment document identity/header | `AVAILABLE_NOW` | `Document_ПоступлениеНаСчет` and `Document_ПоступлениеВКассу` expose immutable document identity/date/customer/state. |
| Order/document payment allocation | `AVAILABLE_NOW` | Current finance path reads allocation rows and customer settlement register. |
| Exact realization allocation | `REQUIRES_1C_EXTENSION` | Existing Portal path resolves order paid amount, not authoritative realization allocation. |
| Exact line-level payment allocation | `REQUIRES_1C_EXTENSION` | No accepted source/policy exists; proportional Portal inference is prohibited. |
| Immutable allocation ID | `REQUIRES_1C_EXTENSION` | No stable published allocation-row identity is proved. |
| Prepayment lifecycle | `DERIVABLE_SAFELY` | 1C can export unapplied payment then changed allocations under a new version. Exact runtime mapping remains an endpoint responsibility. |
| Return/correction events | `AVAILABLE_NOW` | Sale correction, customer return and retail return document types are published. |
| Original realization relation | `DERIVABLE_SAFELY` | 1C base-document accounting relation can be normalized by endpoint. |
| Exact original-line relation | `REQUIRES_1C_EXTENSION` | Uniform immutable original/adjustment line relation is not proved. |
| Payment refund/reversal relation | `REQUIRES_1C_EXTENSION` | Refund/correction candidates exist, but an accepted uniform original-payment and allocation reversal relation does not. |
| Source version | `DERIVABLE_SAFELY` | 1C document data version/change registration can produce an opaque version. |
| Uniform `last_modified_at` cursor source | `REQUIRES_1C_EXTENSION` | Current publication does not prove one monotonic cross-object timestamp. |
| Counterparty immutable ID | `AVAILABLE_NOW` | `Catalog_Контрагенты.Ref_Key`. |
| Counterparty to Portal identity mapping | `REQUIRES_1C_EXTENSION` | No data-schema extension is required, but governed capture/reconciliation must populate existing Portal mappings; current count is zero. |

## 10. Minimum exact 1C work

1. Add and govern the single nomenclature enum attribute `НСД_КлассификацияКомиссииАгента` with the four contract values; backfill only through reviewed 1C master-data governance.
2. Implement `NSDAgentCommissionSourceV1` and its three bounded GET resources.
3. Provide persistent immutable realization-line, payment-allocation and adjustment-line identities using native row UUIDs or the one identity/change register described above.
4. Implement Finance-approved payment-to-realization-line allocation and reversal output. Do not choose a proportional rule in Portal.
5. Normalize original realization/line linkage for returns/corrections and original payment linkage for refunds/cancellations.
6. Provide `source_version` plus monotonic `last_modified_at`, including unpost/delete/repost changes.
7. Map or explicitly govern the four transaction flags. Unprovable flags quarantine the source record.

Existing features reused: counterparty/document/nomenclature `Ref_Key`, realization amount/VAT/discount values, payment documents, customer settlement/allocation registers, returns/corrections, posting/deletion states and 1C change registration. Estimated 1C complexity is medium: one master-data attribute, one narrow HTTP service, one Finance-approved allocation normalizer, and identity/change persistence where native row identity is absent.

## 11. Synthetic examples

These examples demonstrate the selected contract. Allocation values are facts supplied by 1C; they are not a Portal formula.

### Realization: equipment plus Novotech installation

```json
{
  "contract_version": 1,
  "source_realization_id": "11111111-1111-4111-8111-111111111111",
  "source_realization_type": "GOODS_AND_SERVICES_REALIZATION",
  "source_order_id": "22222222-2222-4222-8222-222222222222",
  "source_customer_1c_id": "33333333-3333-4333-8333-333333333333",
  "organization_1c_id": "44444444-4444-4444-8444-444444444444",
  "document_number": "SYN-0001",
  "document_date": "2026-09-13",
  "posted": true,
  "deletion_marked": false,
  "currency": "MDL",
  "gross_total": "12000.00",
  "net_total": "10000.00",
  "vat_total": "2000.00",
  "source_version": "synthetic-v1",
  "last_modified_at": "2026-09-13T12:00:00+03:00",
  "lines": [
    {
      "source_realization_id": "11111111-1111-4111-8111-111111111111",
      "source_line_id": "line-equipment-001",
      "source_nomenclature_id": "55555555-5555-4555-8555-555555555555",
      "quantity": "1",
      "gross_amount": "9600.00",
      "discount_amount": "400.00",
      "net_amount_before_vat": "8000.00",
      "vat_amount": "1600.00",
      "commission_classification": "EQUIPMENT",
      "transaction_flags": {"tender": false, "subcontract": false, "special_price_project": false, "excluded": false}
    },
    {
      "source_realization_id": "11111111-1111-4111-8111-111111111111",
      "source_line_id": "line-installation-001",
      "source_nomenclature_id": "66666666-6666-4666-8666-666666666666",
      "quantity": "1",
      "gross_amount": "2400.00",
      "discount_amount": "0.00",
      "net_amount_before_vat": "2000.00",
      "vat_amount": "400.00",
      "commission_classification": "NOVOTECH_INSTALLATION",
      "transaction_flags": {"tender": false, "subcontract": false, "special_price_project": false, "excluded": false}
    }
  ]
}
```

### Two partial payments for the 10,000 net sale

Payment 1 is gross `3600.00`, allocated by 1C as `3000.00` net + `600.00` VAT. Payment 2 is gross `8400.00`, allocated by 1C as `7000.00` net + `1400.00` VAT. Across both payments, line allocations exactly reach the realized line totals. Each payment has one allocation per affected line; the snippets show the first payment.

```json
{
  "contract_version": 1,
  "source_payment_id": "payment-001",
  "source_payment_type": "BANK_RECEIPT",
  "reverses_source_payment_id": null,
  "source_customer_1c_id": "33333333-3333-4333-8333-333333333333",
  "payment_date": "2026-09-14",
  "currency": "MDL",
  "payment_amount": "3600.00",
  "posted": true,
  "deletion_marked": false,
  "source_version": "synthetic-v1",
  "last_modified_at": "2026-09-14T09:00:00+03:00",
  "allocations": [
    {"source_allocation_id": "alloc-001-e", "source_payment_id": "payment-001", "source_realization_id": "11111111-1111-4111-8111-111111111111", "source_line_id": "line-equipment-001", "direction": "APPLY", "currency": "MDL", "allocated_gross_amount": "2880.00", "allocated_net_amount_before_vat": "2400.00", "allocated_vat_amount": "480.00"},
    {"source_allocation_id": "alloc-001-i", "source_payment_id": "payment-001", "source_realization_id": "11111111-1111-4111-8111-111111111111", "source_line_id": "line-installation-001", "direction": "APPLY", "currency": "MDL", "allocated_gross_amount": "720.00", "allocated_net_amount_before_vat": "600.00", "allocated_vat_amount": "120.00"}
  ]
}
```

### Partial return and refund

1C emits a line-linked return reducing equipment by gross `2400.00` (net `2000.00`, VAT `400.00`). A separate bank-refund payment references the original payment and carries `REVERSE` allocation to that exact original line. Portal does not infer the refund from the return.

```json
{
  "contract_version": 1,
  "source_adjustment_id": "return-001-line-001",
  "adjustment_type": "RETURN",
  "original_realization_id": "11111111-1111-4111-8111-111111111111",
  "original_line_id": "line-equipment-001",
  "source_customer_1c_id": "33333333-3333-4333-8333-333333333333",
  "adjustment_date": "2026-09-20",
  "currency": "MDL",
  "gross_delta": "-2400.00",
  "net_delta": "-2000.00",
  "vat_delta": "-400.00",
  "posted": true,
  "deletion_marked": false,
  "source_version": "synthetic-v1",
  "last_modified_at": "2026-09-20T10:00:00+03:00"
}
```

## 12. Portal adapter boundary and readiness

Portal exposes the provider-neutral `CommissionSourceProvider` with `listRealizations`, `listPayments` and `listAdjustments`. Its explicit DTOs use camelCase but map one-to-one to the snake_case wire fields above. The adapter may fetch, normalize and validate only. Strict validators reject unknown fields, unrecognized classifications, malformed decimals, inconsistent net/VAT/gross totals, duplicate or mismatched child IDs, invalid directions, allocation overrun and currency mismatch. Business policy remains outside the provider.

No commission calculation, commission table, Agent UI, 1C write or production activation is included in this contract task.

```text
READY_TO_IMPLEMENT_1C_SOURCE=READY
READY_TO_RESUME_COMMISSION_PROJECTION=BLOCKED
```

Projection resumes only after the 1C endpoint passes contract fixtures/read-only production calibration and governed `customer_external_refs` mappings exist for the relevant attributed customers.
