begin;

insert into private.one_c_price_type_domain_registry(
  external_ref, price_domain, governance_note
) values
  ('7481362e-b5b8-11e4-8355-74d02b7dfd8c', 'INTERNAL/OTHER', 'Accounting/internal price type'),
  ('f397f009-1437-11eb-94f3-000c29cf9dd4', 'INTERNAL/OTHER', 'Manufacturer/internal sale price type'),
  ('41c98d97-e182-11ea-bc65-000c29cf9dd4', 'INTERNAL/OTHER', 'Legacy internal A price type; not A, BCR'),
  ('41c98d98-e182-11ea-bc65-000c29cf9dd4', 'INTERNAL/OTHER', 'Legacy internal B price type; not B, BCR'),
  ('41c98d99-e182-11ea-bc65-000c29cf9dd4', 'INTERNAL/OTHER', 'Legacy internal C price type; not C, BCR'),
  ('41c98d9a-e182-11ea-bc65-000c29cf9dd4', 'INTERNAL/OTHER', 'Inactive internal D price type'),
  ('41c98d9b-e182-11ea-bc65-000c29cf9dd4', 'INTERNAL/OTHER', 'Inactive internal E price type'),
  ('390429be-5c48-11ee-959b-7239d3b7bd5c', 'INTERNAL/OTHER', 'Inactive internal F price type'),
  ('7f5c574f-5fb7-11eb-8cec-000c29cf9dd4', 'INTERNAL/OTHER', 'Internal FOB price type'),
  ('9bdf451e-a1a1-11eb-3790-000c29bfef02', 'INTERNAL/OTHER', 'Internal EUR price type'),
  ('b9f5d585-dab1-11e9-8a58-000c29cf9dd4', 'INTERNAL/OTHER', 'Internal promotional price type')
on conflict (external_ref) do update set
  price_domain = excluded.price_domain,
  governance_note = excluded.governance_note,
  updated_at = now();

create or replace function private.classify_one_c_price_type(
  p_external_ref text
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select registry.price_domain
      from private.one_c_price_type_domain_registry registry
      where registry.external_ref = lower(btrim(coalesce(p_external_ref, '')))
    ),
    'INTERNAL/OTHER'
  );
$$;

revoke all on function private.classify_one_c_price_type(text)
  from public, anon, authenticated, service_role;

drop index if exists public.one_c_counterparty_contracts_price_domain_idx;
drop index if exists public.partner_companies_price_domain_idx;

update public.price_types price_type
set price_domain = private.classify_one_c_price_type(price_type.external_ref)
where price_domain is distinct from private.classify_one_c_price_type(price_type.external_ref);

update private.price_sync_type_page_metrics metrics
set price_domain = private.classify_one_c_price_type(metrics.external_price_type_ref)
where price_domain is distinct from private.classify_one_c_price_type(metrics.external_price_type_ref);

comment on function private.classify_one_c_price_type(text) is
  'Fail-closed governed Ref_Key registry lookup. Unregistered types remain INTERNAL/OTHER until explicitly approved; display names and incidental contract rows never classify a price type.';

commit;
