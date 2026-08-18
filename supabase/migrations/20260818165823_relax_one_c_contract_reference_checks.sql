begin;

alter table public.one_c_counterparty_contracts
  drop constraint if exists one_c_counterparty_contracts_organization_guid_check,
  drop constraint if exists one_c_counterparty_contracts_currency_guid_check;

alter table public.one_c_counterparty_contracts
  add constraint one_c_counterparty_contracts_organization_guid_check
  check (
    organization_external_1c_id is null
    or (
      organization_external_1c_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and organization_external_1c_id <> '00000000-0000-0000-0000-000000000000'
    )
  ) not valid,
  add constraint one_c_counterparty_contracts_currency_guid_check
  check (
    contract_currency_external_1c_id is null
    or (
      contract_currency_external_1c_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and contract_currency_external_1c_id <> '00000000-0000-0000-0000-000000000000'
    )
  ) not valid;

comment on constraint one_c_counterparty_contracts_organization_guid_check
  on public.one_c_counterparty_contracts is
  '1C GUID shape validation without RFC UUID version-bit assumptions.';
comment on constraint one_c_counterparty_contracts_currency_guid_check
  on public.one_c_counterparty_contracts is
  '1C GUID shape validation without RFC UUID version-bit assumptions.';

commit;
