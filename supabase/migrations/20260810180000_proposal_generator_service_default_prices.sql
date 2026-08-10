-- Calculator-scoped customer selling defaults for governed service mappings.

alter table public.estimate_generator_calculator_profiles
  add column if not exists default_selling_unit_price numeric(18,2) null,
  add column if not exists default_selling_currency_code text null,
  add column if not exists default_selling_vat_mode text null;

alter table public.estimate_generator_calculator_profiles
  add constraint estimate_generator_profile_default_price_check check (
    (default_selling_unit_price is null and default_selling_currency_code is null and default_selling_vat_mode is null)
    or (
      partner_service_id is not null
      and default_selling_unit_price > 0
      and default_selling_unit_price <= 9999999999999999.99
      and default_selling_currency_code ~ '^[A-Z]{3}$'
      and default_selling_vat_mode in ('included','excluded')
    )
  );

alter table public.estimate_generator_calculator_profile_events
  add column if not exists previous_default_selling_unit_price numeric(18,2) null,
  add column if not exists default_selling_unit_price numeric(18,2) null,
  add column if not exists previous_default_selling_currency_code text null,
  add column if not exists default_selling_currency_code text null,
  add column if not exists previous_default_selling_vat_mode text null,
  add column if not exists default_selling_vat_mode text null;

alter table public.estimate_generator_calculator_profile_events
  drop constraint if exists estimate_generator_profile_event_type_check;
alter table public.estimate_generator_calculator_profile_events
  add constraint estimate_generator_profile_event_type_check
  check (event_type in ('mapping_changed','service_price_changed'));

drop function public.resolve_estimate_generator_calculator_profiles(uuid,text[]);
create function public.resolve_estimate_generator_calculator_profiles(target_company_id uuid, target_profile_keys text[])
returns table(
  profile_key text,label text,section_key text,unit text,version integer,resolution text,resolved_id uuid,resolved_label text,
  default_selling_unit_price numeric,default_selling_currency_code text,default_selling_vat_mode text
)
language sql security definer set search_path=public stable as $$
  select profile.profile_key,profile.label,profile.section_key,profile.unit,profile.version,
    case
      when product.id is not null then 'catalog'
      when service.id is not null then 'service'
      when external_item.id is not null and library.external_nomenclature_id is not null then 'own_nomenclature'
      when external_item.id is not null and external_item.curation_status='active' then 'shared_nomenclature'
      else 'unresolved'
    end,
    coalesce(product.id,service.id,external_item.id),
    case
      when product.id is not null then product.sku || ' · ' || product.name
      when service.id is not null then service.name
      when external_item.id is not null then external_item.name
    end,
    case when service.id is not null then profile.default_selling_unit_price end,
    case when service.id is not null then profile.default_selling_currency_code end,
    case when service.id is not null then profile.default_selling_vat_mode end
  from public.estimate_generator_calculator_profiles profile
  left join public.catalog_products product on product.id=profile.catalog_product_id and product.is_active and product.is_visible
  left join public.partner_services service on service.id=profile.partner_service_id and service.is_active and service.company_id is null
    and service.default_unit=profile.unit
  left join public.external_nomenclature_items external_item on external_item.id=profile.external_nomenclature_id and external_item.is_active
    and external_item.canonical_item_id is null and external_item.curation_status in ('active','review_required')
  left join public.partner_external_nomenclature_library library on library.company_id=target_company_id
    and library.external_nomenclature_id=external_item.id and library.status='active'
  where profile.profile_key=any(coalesce(target_profile_keys,array[]::text[])) and profile.is_active
    and public.can_access_estimates(target_company_id,'estimates.manage');
$$;

drop function public.list_estimate_generator_calculator_profiles();
create function public.list_estimate_generator_calculator_profiles()
returns table(
  profile_key text,system_type text,label text,section_key text,unit text,version integer,is_active boolean,
  resolution text,resolved_id uuid,resolved_label text,default_selling_unit_price numeric,
  default_selling_currency_code text,default_selling_vat_mode text
)
language sql security definer set search_path=public stable as $$
  select profile.profile_key,profile.system_type,profile.label,profile.section_key,profile.unit,profile.version,profile.is_active,
    case when product.id is not null then 'catalog' when service.id is not null then 'service'
      when external_item.id is not null then 'shared_nomenclature' else 'unresolved' end,
    coalesce(product.id,service.id,external_item.id),
    case when product.id is not null then product.sku || ' · ' || product.name
      when service.id is not null then service.name when external_item.id is not null then external_item.name end,
    case when service.id is not null then profile.default_selling_unit_price end,
    case when service.id is not null then profile.default_selling_currency_code end,
    case when service.id is not null then profile.default_selling_vat_mode end
  from public.estimate_generator_calculator_profiles profile
  left join public.catalog_products product on product.id=profile.catalog_product_id and product.is_active and product.is_visible
  left join public.partner_services service on service.id=profile.partner_service_id and service.is_active and service.company_id is null
    and service.default_unit=profile.unit
  left join public.external_nomenclature_items external_item on external_item.id=profile.external_nomenclature_id
    and external_item.is_active and external_item.canonical_item_id is null
  where profile.is_active and public.has_internal_permission('admin.estimates.view')
  order by profile.section_key,profile.profile_key;
$$;

create or replace function public.update_estimate_generator_calculator_profile(
  target_profile_key text,expected_version integer,target_type text,target_id uuid
) returns integer language plpgsql security definer set search_path=public as $$
declare profile public.estimate_generator_calculator_profiles; previous_type text; previous_id uuid;
begin
  if not public.has_internal_permission('admin.integrations.manage') then
    raise exception 'Generator mapping management is not available.' using errcode='42501';
  end if;
  if target_type not in ('unresolved','catalog','service','external_nomenclature')
    or (target_type='unresolved' and target_id is not null)
    or (target_type<>'unresolved' and target_id is null) then
    raise exception 'Generator mapping is invalid.' using errcode='22023';
  end if;
  select * into profile from public.estimate_generator_calculator_profiles
  where profile_key=target_profile_key and is_active for update;
  if profile.profile_key is null then raise exception 'Generator profile was not found.' using errcode='22023'; end if;
  if profile.version<>expected_version then raise exception 'Generator profile changed. Refresh and retry.' using errcode='40001'; end if;
  if target_type='catalog' and not exists(
    select 1 from public.catalog_products where id=target_id and is_active and is_visible
  ) then raise exception 'Catalog product is unavailable.' using errcode='22023'; end if;
  if target_type='service' and not exists(
    select 1 from public.partner_services where id=target_id and is_active and company_id is null and default_unit=profile.unit
  ) then raise exception 'Service is unavailable or has an incompatible unit.' using errcode='22023'; end if;
  if target_type='external_nomenclature' and not exists(
    select 1 from public.external_nomenclature_items where id=target_id and is_active
      and canonical_item_id is null and curation_status='active'
  ) then raise exception 'External nomenclature is unavailable.' using errcode='22023'; end if;

  previous_type:=case when profile.catalog_product_id is not null then 'catalog'
    when profile.partner_service_id is not null then 'service'
    when profile.external_nomenclature_id is not null then 'external_nomenclature' else 'unresolved' end;
  previous_id:=coalesce(profile.catalog_product_id,profile.partner_service_id,profile.external_nomenclature_id);
  update public.estimate_generator_calculator_profiles set
    catalog_product_id=case when target_type='catalog' then target_id end,
    partner_service_id=case when target_type='service' then target_id end,
    external_nomenclature_id=case when target_type='external_nomenclature' then target_id end,
    default_selling_unit_price=null,default_selling_currency_code=null,default_selling_vat_mode=null,
    version=version+1,updated_by=auth.uid(),updated_at=now()
  where profile_key=target_profile_key returning version into expected_version;
  insert into public.estimate_generator_calculator_profile_events(
    profile_key,actor_user_id,previous_target_type,previous_target_id,target_type,target_id,
    previous_default_selling_unit_price,previous_default_selling_currency_code,previous_default_selling_vat_mode
  ) values(
    target_profile_key,auth.uid(),previous_type,previous_id,target_type,target_id,
    profile.default_selling_unit_price,profile.default_selling_currency_code,profile.default_selling_vat_mode
  );
  return expected_version;
end;
$$;

create or replace function public.update_estimate_generator_service_default_price(
  target_profile_key text,expected_version integer,target_unit_price numeric,
  target_currency_code text,target_vat_mode text
) returns integer language plpgsql security definer set search_path=public as $$
declare profile public.estimate_generator_calculator_profiles; current_target_type text; current_target_id uuid;
begin
  if not public.has_internal_permission('admin.integrations.manage') then
    raise exception 'Generator price management is not available.' using errcode='42501';
  end if;
  if not (
    (target_unit_price is null and target_currency_code is null and target_vat_mode is null)
    or (target_unit_price > 0 and target_unit_price <= 9999999999999999.99
      and target_currency_code ~ '^[A-Z]{3}$' and target_vat_mode in ('included','excluded'))
  ) then raise exception 'Generator service price is invalid.' using errcode='22023'; end if;

  select * into profile from public.estimate_generator_calculator_profiles
  where profile_key=target_profile_key and is_active for update;
  if profile.profile_key is null or profile.partner_service_id is null then
    raise exception 'Mapped generator service was not found.' using errcode='22023';
  end if;
  if profile.version<>expected_version then
    raise exception 'Generator profile changed. Refresh and retry.' using errcode='40001';
  end if;
  if not exists(select 1 from public.partner_services service where service.id=profile.partner_service_id
    and service.is_active and service.company_id is null and service.default_unit=profile.unit) then
    raise exception 'Mapped generator service is unavailable.' using errcode='22023';
  end if;

  current_target_type:='service'; current_target_id:=profile.partner_service_id;
  update public.estimate_generator_calculator_profiles set
    default_selling_unit_price=target_unit_price,
    default_selling_currency_code=target_currency_code,
    default_selling_vat_mode=target_vat_mode,
    version=version+1,updated_by=auth.uid(),updated_at=now()
  where profile_key=target_profile_key returning version into expected_version;
  insert into public.estimate_generator_calculator_profile_events(
    profile_key,actor_user_id,event_type,previous_target_type,previous_target_id,target_type,target_id,
    previous_default_selling_unit_price,default_selling_unit_price,
    previous_default_selling_currency_code,default_selling_currency_code,
    previous_default_selling_vat_mode,default_selling_vat_mode
  ) values(
    target_profile_key,auth.uid(),'service_price_changed',current_target_type,current_target_id,current_target_type,current_target_id,
    profile.default_selling_unit_price,target_unit_price,
    profile.default_selling_currency_code,target_currency_code,
    profile.default_selling_vat_mode,target_vat_mode
  );
  return expected_version;
end;
$$;

create or replace function public.create_estimate_from_generator(
  target_company_id uuid, target_session_id uuid, target_final_customer_id uuid,
  estimate_name text, target_project_name text, target_currency_code text,
  target_validity_days integer, target_request_key uuid, target_request_fingerprint text,
  generated_lines jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  session_row public.estimate_generator_sessions; created public.estimates; line jsonb; section_id uuid;
  external_item public.external_nomenclature_items; service public.partner_services;
  calculator_profile public.estimate_generator_calculator_profiles; service_selling_price numeric; inserted_count integer := 0;
begin
  if auth.uid() is null or not public.can_access_estimates(target_company_id, 'estimates.manage')
    or not public.can_access_estimates(target_company_id, 'estimates.pricing.manage') then
    raise exception 'Proposal generator is not available.' using errcode = '42501';
  end if;
  if jsonb_typeof(generated_lines) <> 'array' or jsonb_array_length(generated_lines) < 1 or jsonb_array_length(generated_lines) > 30 then
    raise exception 'Generated estimate lines are invalid.' using errcode = '22023';
  end if;
  select * into session_row from public.estimate_generator_sessions where id = target_session_id for update;
  if session_row.id is null or session_row.company_id <> target_company_id or session_row.actor_user_id <> auth.uid()
    or session_row.request_fingerprint <> target_request_fingerprint then
    raise exception 'Generator session is not available.' using errcode = '42501';
  end if;
  if session_row.estimate_id is not null then return session_row.estimate_id; end if;

  select * into created from public.create_estimate_v3(target_company_id, estimate_name, target_final_customer_id, '', target_project_name,
    target_currency_code, target_validity_days, target_request_key);

  for line in select value from jsonb_array_elements(generated_lines) loop
    select id into section_id from public.estimate_sections where estimate_id = created.id and system_key = line->>'section_key';
    if section_id is null or (line->>'line_type') not in ('product','service','external','custom')
      or coalesce((line->>'quantity')::numeric,0)<=0 then
      raise exception 'Generated estimate line is invalid.' using errcode='22023';
    end if;
    if line->>'line_type'='external' then
      select * into external_item from public.external_nomenclature_items where id=(line->>'external_nomenclature_id')::uuid
        and is_active and canonical_item_id is null and curation_status in ('active','review_required')
        and (curation_status='active' or exists(select 1 from public.partner_external_nomenclature_library library
          where library.company_id=target_company_id and library.external_nomenclature_id=external_nomenclature_items.id and library.status='active'));
      if external_item.id is null then raise exception 'External nomenclature is not available.' using errcode='42501'; end if;
      insert into public.estimate_items(estimate_id,section_id,line_type,external_nomenclature_id,position,description,quantity,unit,selling_unit_price)
      values(created.id,section_id,'external',external_item.id,inserted_count+1,external_item.name,(line->>'quantity')::numeric,external_item.unit,null);
      insert into public.partner_external_nomenclature_library(company_id,external_nomenclature_id,status,created_by,last_used_at)
      values(target_company_id,external_item.id,'active',auth.uid(),now()) on conflict(company_id,external_nomenclature_id)
      do update set status='active',archived_at=null,archived_by=null,last_used_at=now();
    elsif line->>'line_type'='service' then
      select * into service from public.partner_services where id=(line->>'service_id')::uuid
        and is_active and company_id is null and default_unit=line->>'unit';
      if service.id is null then raise exception 'Service is not available.' using errcode='42501'; end if;
      calculator_profile:=null; service_selling_price:=service.default_selling_price;
      if nullif(line->>'profile_key','') is not null then
        select * into calculator_profile from public.estimate_generator_calculator_profiles profile
        where profile.profile_key=line->>'profile_key' and profile.partner_service_id=service.id and profile.is_active;
        if calculator_profile.profile_key is not null and calculator_profile.default_selling_currency_code=target_currency_code then
          service_selling_price:=calculator_profile.default_selling_unit_price;
        end if;
      end if;
      insert into public.estimate_items(estimate_id,section_id,line_type,service_id,position,internal_cost_unit_price,
        converted_cost_unit_price,exchange_rate,description,quantity,unit,selling_unit_price)
      values(created.id,section_id,'service',service.id,inserted_count+1,service.default_cost,service.default_cost,
        case when service.default_cost is null then null else 1 end,service.name,(line->>'quantity')::numeric,
        service.default_unit,service_selling_price);
    elsif line->>'line_type'='product' then
      if not exists(select 1 from public.catalog_products product where product.id=(line->>'product_id')::uuid and product.is_active and product.is_visible) then
        raise exception 'Catalog product is not available.' using errcode='42501';
      end if;
      insert into public.estimate_items(estimate_id,section_id,line_type,product_id,position,sku_snapshot,product_name_snapshot,
        source_unit_price,source_currency_code,source_snapshot_at,internal_cost_unit_price,converted_cost_unit_price,
        exchange_rate,exchange_rate_effective_date,description,quantity,unit,selling_unit_price)
      values(created.id,section_id,'product',(line->>'product_id')::uuid,inserted_count+1,line->>'sku_snapshot',line->>'product_name_snapshot',
        nullif(line->>'source_unit_price','')::numeric,nullif(line->>'source_currency_code',''),nullif(line->>'source_snapshot_at','')::timestamptz,
        nullif(line->>'internal_cost_unit_price','')::numeric,nullif(line->>'converted_cost_unit_price','')::numeric,
        nullif(line->>'exchange_rate','')::numeric,nullif(line->>'exchange_rate_effective_date','')::date,
        left(line->>'description',2000),(line->>'quantity')::numeric,'pcs',nullif(line->>'selling_unit_price','')::numeric);
    else
      insert into public.estimate_items(estimate_id,section_id,line_type,position,description,quantity,unit,selling_unit_price)
      values(created.id,section_id,'custom',inserted_count+1,left(line->>'description',2000),(line->>'quantity')::numeric,line->>'unit',null);
    end if;
    inserted_count:=inserted_count+1;
  end loop;

  update public.estimate_generator_sessions set status='estimate_created',estimate_id=created.id,estimate_created_at=now(),
    resolved_catalog_count=(select count(*) from jsonb_array_elements(generated_lines) value where value->>'resolution'='catalog'),
    resolved_service_count=(select count(*) from jsonb_array_elements(generated_lines) value where value->>'resolution'='service'),
    own_nomenclature_count=(select count(*) from jsonb_array_elements(generated_lines) value where value->>'resolution'='own_nomenclature'),
    shared_nomenclature_count=(select count(*) from jsonb_array_elements(generated_lines) value where value->>'resolution'='shared_nomenclature'),
    unresolved_count=(select count(*) from jsonb_array_elements(generated_lines) value where value->>'resolution'='unresolved')
  where id=session_row.id;
  insert into public.estimate_events(estimate_id,actor_user_id,event_type) values(created.id,auth.uid(),'generator_created');
  return created.id;
end;
$$;

revoke all on function public.update_estimate_generator_service_default_price(text,integer,numeric,text,text)
from public,anon;
grant execute on function public.update_estimate_generator_service_default_price(text,integer,numeric,text,text)
to authenticated;
revoke all on function public.resolve_estimate_generator_calculator_profiles(uuid,text[]),
  public.list_estimate_generator_calculator_profiles()
from public,anon;
grant execute on function public.resolve_estimate_generator_calculator_profiles(uuid,text[]),
  public.list_estimate_generator_calculator_profiles()
to authenticated;
