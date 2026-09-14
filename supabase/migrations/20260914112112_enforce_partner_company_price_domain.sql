begin;

create or replace function private.enforce_partner_company_price_domain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.external_1c_price_type_id is not null
     and private.classify_one_c_price_type(new.external_1c_price_type_id)
       <> 'PARTNER_CONTRACT_PRICE' then
    raise exception 'PARTNER_PRICE_DOMAIN_VIOLATION'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_partner_company_price_domain()
  from public, anon, authenticated, service_role;

drop trigger if exists reject_final_customer_retail_partner_profile
  on public.partner_companies;

create trigger enforce_partner_company_price_domain
before insert or update of external_1c_price_type_id on public.partner_companies
for each row execute function private.enforce_partner_company_price_domain();

comment on trigger enforce_partner_company_price_domain on public.partner_companies is
  'Fail-closed defense: only governed PARTNER_CONTRACT_PRICE Ref_Key values may become a partner commercial profile.';

commit;
