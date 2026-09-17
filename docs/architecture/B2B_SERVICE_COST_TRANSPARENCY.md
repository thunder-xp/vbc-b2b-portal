# B2B Service Cost Transparency

## Ownership and read path

1C is the commercial source of truth. The Portal only synchronizes a local, read-only service-history projection and aggregates it for the authenticated partner company. Partner pages never call 1C. Authorization remains `auth user → active membership → company → service.view`; a contract is document metadata, not an ownership boundary.

The existing `OneCServiceHistoryProvider`, sync lease, page publication, audit events, and `one_c_service_history` model are reused. Financial publication is idempotent by immutable `Ref_Key`, and a corrected, unposted, deleted, or no-longer-eligible source document replaces the local facts on the next governed reconciliation.

## Production 1C contract

OData entity: `Document_ПриемИПередачаВРемонт`.

| Meaning | Exact 1C field | Portal projection |
| --- | --- | --- |
| Immutable document identity | `Ref_Key` | `source_document_ref` |
| Partner/customer | `Контрагент_Key` | canonical company mapping through `external_1c_id` |
| Contract | `Договор_Key` | `contract_ref` plus catalog description snapshot |
| Organization | `Организация_Key` | `organization_ref` |
| Number/date | `Number`, `Date` | document number/date |
| Status | `СостояниеРемонта_Key` → `Catalog_ЭтапыРемонта` | source ref plus normalized status |
| Product/serial | `Номенклатура_Key`, `Серия_Key` | existing product/serial projection |
| Repair result | `РезультатРемонта`, `ВариантЗавершенияРемонта` | authoritative result facts |
| Work performed | `ОписаниеРемонта` | `completed_work_summary` |
| Completion/issue | `РемонтВыполнен`, `ДатаРемонтВыполнен`, `ВыдачаИзРемонта`, `ДатаВыдачаИзРемонта` | completion/issue flags and timestamps |
| Service total | `СуммаДокумента` | `service_amount numeric(18,2)` |
| VAT | `СуммаНДС` | `vat_amount numeric(18,2)` |
| Currency | `ВалютаДокумента_Key` → `Catalog_Валюты` | Ref_Key and ISO-style code |
| VAT semantics | `СуммаВключаетНДС`, `НДСВключатьВСтоимость`, `НалогообложениеНДС` | source flags/snapshot |

Production metadata declares the monetary fields as `Edm.Double`; the provider serializes each authoritative source value to a fixed two-decimal string before database publication. Portal aggregation is PostgreSQL `numeric`, never JavaScript floating-point arithmetic.

## Amount and completion semantics

Production document `NSUU-000027` proves the source semantics: `СуммаДокумента = 250.00`, `СуммаНДС = 41.67`, and both VAT-inclusion flags are true. Therefore the service amount is gross and already includes VAT; VAT is an informational included breakdown and must not be added again.

Monthly attribution uses `ДатаРемонтВыполнен`. It is populated for all currently completed source documents, while legacy `ДатаОкончанияРемонта` is sparse. An eligible completed service must be posted, not deleted, have `РемонтВыполнен = true`, have a completion timestamp, and have one of these governed status references:

- `eae23442-315b-11e9-a7dc-94de80db60f1` — ready for customer issue;
- `eae23441-315b-11e9-a7dc-94de80db60f1` — issued to customer.

Localized status descriptions are display metadata only and are not used for eligibility.

## Monthly aggregation

`get_partner_service_month_summary` groups eligible rows by company, calendar month of `repair_completed_at`, and currency. It deliberately does not group by contract. It returns completed document count, gross service total, included VAT total, and an explicit count for rows whose currency still needs reconciliation. Different currencies are displayed separately and are never converted.

`get_partner_service_workspace` combines the existing paginated history and monthly summary in one database RPC. A partial index on `(company_id, repair_completed_at, currency_code)` covers the local monthly path. Page rendering performs no 1C request and does not fetch all documents into React.

## Security and reconciliation

The projection tables retain RLS and remain inaccessible to `anon` and `authenticated`; only server-owned RPCs expose bounded DTOs. Every partner RPC checks `service.view` against the requested company, so a browser-supplied company identifier cannot bypass membership authorization. The v3 sync claim/publication functions are executable only by `service_role` and preserve the existing lease, batch-size, fingerprint, and reconciliation contracts.

Corrections replace the current amount, VAT, currency, status, and completion facts. Unposted/deleted rows become inactive through the existing publisher; rows that lose the canonical completion conditions also lose `completed_service_eligible`, so stale values leave the monthly total without an accounting-style adjustment ledger in Portal.
