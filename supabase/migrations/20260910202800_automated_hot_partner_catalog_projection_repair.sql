begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Preserve the complete current catalog-card projection (characteristics and
-- retail price fields) while replacing only HOT membership and ordering.
do $migration$
declare definition text; changed text;
begin
  select pg_get_functiondef(procedure.oid) into definition
  from pg_proc procedure join pg_namespace namespace on namespace.oid=procedure.pronamespace
  where namespace.nspname='public' and procedure.proname='catalog_partner_page_unified_period_v6';
  changed := replace(definition, 'FUNCTION public.catalog_partner_page_unified_period_v6(',
    'FUNCTION public.catalog_partner_page_automated_hot_v6(');
  changed := replace(changed, 'public.catalog_partner_page_unified_period_base(',
    'public.catalog_partner_page_automated_hot_base(');
  if changed=definition or changed not like '%catalog_partner_page_automated_hot_base%' then
    raise exception 'Could not derive automated HOT characteristic projection.';
  end if;
  execute changed;

  select pg_get_functiondef(procedure.oid) into definition
  from pg_proc procedure join pg_namespace namespace on namespace.oid=procedure.pronamespace
  where namespace.nspname='public' and procedure.proname='catalog_partner_page_unified_period_v7';
  changed := replace(definition, 'FUNCTION public.catalog_partner_page_unified_period_v7(',
    'FUNCTION public.catalog_partner_page_automated_hot_v7(');
  changed := replace(changed, 'public.catalog_partner_page_unified_period_v6(',
    'public.catalog_partner_page_automated_hot_v6(');
  if changed=definition or changed not like '%catalog_partner_page_automated_hot_v6%' then
    raise exception 'Could not derive automated HOT retail projection.';
  end if;
  execute changed;
end
$migration$;

revoke all on function public.catalog_partner_page_automated_hot_v6(
  uuid,uuid,uuid[],uuid,text,text,jsonb,text,text,integer,integer,integer
), public.catalog_partner_page_automated_hot_v7(
  uuid,uuid,uuid[],uuid,text,text,jsonb,text,text,integer,integer,integer
) from public,anon,authenticated,service_role;

create or replace function public.catalog_partner_page_v12(
  p_company_id uuid, p_category_id uuid default null,
  p_category_ids uuid[] default null, p_brand_id uuid default null,
  p_search text default null, p_availability text default 'all',
  p_filters jsonb default '{}'::jsonb,
  p_merchandising_label text default null, p_sort text default 'default',
  p_limit integer default 12, p_offset integer default 0,
  p_period_days integer default 365
)
returns jsonb language plpgsql stable security definer
set search_path='' set row_security=off
as $$
declare payload jsonb; items jsonb;
begin
  if p_period_days not in (30,60,90,365) then
    raise exception 'Invalid merchandising period.' using errcode='22023'; end if;
  if p_merchandising_label is distinct from 'HOT' then
    return public.catalog_partner_page_v11(p_company_id,p_category_id,p_category_ids,
      p_brand_id,p_search,p_availability,p_filters,p_merchandising_label,p_sort,
      p_limit,p_offset,p_period_days);
  end if;
  payload := public.catalog_partner_page_automated_hot_v7(p_company_id,p_category_id,
    p_category_ids,p_brand_id,p_search,p_availability,p_filters,p_merchandising_label,
    p_sort,p_limit,p_offset,p_period_days);
  select coalesce(jsonb_agg(
    case when coalesce(source.item->'merchandising_labels','[]'::jsonb) ? 'HOT'
      then source.item else jsonb_set(source.item,'{merchandising_labels}',
        coalesce(source.item->'merchandising_labels','[]'::jsonb)||'"HOT"'::jsonb) end
    order by source.ordinal),'[]'::jsonb)
  into items from jsonb_array_elements(coalesce(payload->'items','[]'::jsonb))
    with ordinality source(item,ordinal);
  return payload||jsonb_build_object('items',items);
end;
$$;

revoke all on function public.catalog_partner_page_v12(
  uuid,uuid,uuid[],uuid,text,text,jsonb,text,text,integer,integer,integer
) from public,anon;
grant execute on function public.catalog_partner_page_v12(
  uuid,uuid,uuid[],uuid,text,text,jsonb,text,text,integer,integer,integer
) to authenticated;

comment on function public.catalog_partner_page_v12(
  uuid,uuid,uuid[],uuid,text,text,jsonb,text,text,integer,integer,integer
) is 'Current partner catalog page; automated HOT preserves the complete characteristic and retail-price projection.';

commit;
