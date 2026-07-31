begin;

create or replace function public.create_purchase_template(
  target_company_id uuid, target_name text, target_description text,
  target_visibility text, target_source_type text, target_source_id uuid,
  target_request_key uuid, target_request_fingerprint text, target_items jsonb
)
returns public.purchase_templates language plpgsql security definer set search_path = public as $$
declare created public.purchase_templates; prior public.purchase_template_operations;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_request_key::text, 0));
  select * into prior from public.purchase_template_operations where request_key = target_request_key;
  if prior.id is not null then
    if prior.created_by <> auth.uid() or prior.company_id <> target_company_id
      or prior.operation_type <> 'create' or prior.request_fingerprint <> target_request_fingerprint then
      raise exception 'Purchase template operation key is already used.' using errcode = '23505';
    end if;
    select * into created from public.purchase_templates where id = prior.template_id;
    return created;
  end if;
  if auth.uid() is null or not public.has_permission(target_company_id, 'purchase_templates.create')
    or char_length(btrim(target_name)) not between 1 and 120
    or char_length(coalesce(target_description, '')) > 1000
    or target_visibility not in ('private', 'company')
    or target_source_type not in ('manual', 'cart', 'order', 'purchasing_list', 'dashboard_reorder')
    or jsonb_typeof(target_items) <> 'array' or jsonb_array_length(target_items) > 200
    or exists (
      select 1 from jsonb_to_recordset(target_items) row(product_id uuid, preferred_quantity numeric, line_note text)
      where row.preferred_quantity <= 0 or row.preferred_quantity > 9999
        or char_length(coalesce(row.line_note, '')) > 500
        or not exists (select 1 from public.catalog_products product where product.id = row.product_id)
    ) then raise exception 'Purchase template input is invalid.' using errcode = '22023';
  end if;
  insert into public.purchase_templates(company_id, owner_user_id, name, description, visibility, source_type, source_id)
  values (target_company_id, auth.uid(), btrim(target_name), nullif(btrim(target_description), ''), target_visibility, target_source_type, target_source_id)
  returning * into created;
  insert into public.purchase_template_items(template_id, product_id, preferred_quantity, line_note, sort_order)
  select created.id, (element.value->>'product_id')::uuid,
    least(9999, sum((element.value->>'preferred_quantity')::numeric)),
    nullif(max(nullif(btrim(element.value->>'line_note'), '')), ''),
    row_number() over (order by min(element.ordinality))
  from jsonb_array_elements(target_items) with ordinality element(value, ordinality)
  group by (element.value->>'product_id')::uuid;
  insert into public.purchase_template_operations(request_key, operation_type, template_id, company_id, created_by, request_fingerprint, result)
  values (target_request_key, 'create', created.id, created.company_id, auth.uid(), target_request_fingerprint, jsonb_build_object('template_id', created.id));
  return created;
end;
$$;

revoke all on function public.create_purchase_template(uuid, text, text, text, text, uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.create_purchase_template(uuid, text, text, text, text, uuid, uuid, text, jsonb) to authenticated;

commit;
