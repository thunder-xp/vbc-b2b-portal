-- Atomic catalog/opportunity product entry into a newly created governed estimate.

create or replace function public.create_estimate_with_catalog_product(
  target_company_id uuid,
  estimate_name text,
  target_final_customer_id uuid,
  target_customer_name text,
  target_project_name text,
  target_currency_code text,
  target_validity_days integer,
  estimate_request_key uuid,
  line_request_key uuid,
  line_request_fingerprint text,
  line_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.estimates;
  equipment_section_id uuid;
  insertion jsonb;
begin
  if jsonb_typeof(line_items) <> 'array' or jsonb_array_length(line_items) <> 1
     or line_items->0->>'line_type' <> 'product' then
    raise exception 'Catalog estimate entry is invalid.' using errcode = '22023';
  end if;

  select * into target from public.create_estimate_v3(
    target_company_id,
    estimate_name,
    target_final_customer_id,
    target_customer_name,
    target_project_name,
    target_currency_code,
    target_validity_days,
    estimate_request_key
  );

  select section.id into equipment_section_id
  from public.estimate_sections section
  where section.estimate_id = target.id and section.system_key = 'equipment'
  limit 1;

  if equipment_section_id is null then
    raise exception 'Equipment section is unavailable.' using errcode = '22023';
  end if;

  insertion := public.add_estimate_items_v2(
    target.id,
    target.revision,
    equipment_section_id,
    line_request_key,
    line_request_fingerprint,
    line_items
  );

  return jsonb_build_object(
    'estimate_id', target.id,
    'repeated', coalesce((insertion->>'repeated')::boolean, false)
  );
end;
$$;

revoke all on function public.create_estimate_with_catalog_product(uuid,text,uuid,text,text,text,integer,uuid,uuid,text,jsonb) from public, anon;
grant execute on function public.create_estimate_with_catalog_product(uuid,text,uuid,text,text,text,integer,uuid,uuid,text,jsonb) to authenticated;
