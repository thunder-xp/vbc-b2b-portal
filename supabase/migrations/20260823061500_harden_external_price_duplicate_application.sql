begin;

create or replace function public.apply_external_price_upload(
  p_company_id uuid,
  p_upload_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.external_price_uploads;
  inserted_count integer;
  current_count integer;
begin
  if not public.can_access_external_prices(p_company_id, 'external_prices.manage') then
    raise exception 'Access denied.' using errcode = '42501';
  end if;

  select * into target
  from public.external_price_uploads
  where id = p_upload_id and partner_company_id = p_company_id
  for update;

  if target.id is null then
    raise exception 'Import not found.' using errcode = 'P0002';
  end if;
  if target.status = 'applied' then
    return jsonb_build_object('id', target.id, 'status', 'applied', 'idempotent', true);
  end if;
  if target.status <> 'ready_for_review' then
    raise exception 'Import state changed.' using errcode = 'PT409';
  end if;
  if exists (
    select 1 from public.external_price_import_rows row
    where row.upload_id = target.id and row.match_status = 'needs_review'
  ) then
    raise exception 'Review all ambiguous rows before applying.' using errcode = 'PT409';
  end if;
  if exists (
    select 1
    from public.external_price_import_rows row
    cross join lateral (
      values ('partner'::text, row.partner_price), ('retail'::text, row.retail_price)
    ) price(price_type, amount)
    where row.upload_id = target.id
      and row.match_status in ('matched', 'matched_alias')
      and row.catalog_product_id is not null
      and price.amount is not null
    group by row.catalog_product_id, price.price_type
    having count(distinct price.amount) > 1
  ) then
    raise exception 'Conflicting duplicate prices require review.' using errcode = 'PT409';
  end if;
  if not exists (
    select 1 from public.external_price_import_rows row
    where row.upload_id = target.id
      and row.match_status in ('matched', 'matched_alias')
      and row.catalog_product_id is not null
      and (row.partner_price is not null or row.retail_price is not null)
  ) then
    raise exception 'At least one governed product match is required.' using errcode = 'PT409';
  end if;

  insert into public.external_price_observations(
    upload_id, partner_company_id, external_price_source_id,
    catalog_product_id, source_product_code, source_product_name,
    normalized_model, source_description, partner_price, retail_price,
    currency, source_sheet, source_row, source_marker, match_method,
    observed_at
  )
  select target.id, target.partner_company_id,
    target.external_price_source_id, row.catalog_product_id,
    row.source_product_code, row.source_product_name,
    row.normalized_model, row.source_description, row.partner_price,
    row.retail_price, row.currency, row.source_sheet, row.source_row,
    row.source_marker, row.match_method,
    coalesce(target.effective_date, target.created_at::date)
  from public.external_price_import_rows row
  where row.upload_id = target.id
    and row.match_status in ('matched', 'matched_alias')
    and row.catalog_product_id is not null
    and (row.partner_price is not null or row.retail_price is not null)
  on conflict do nothing;
  get diagnostics inserted_count = row_count;

  if target.snapshot_scope = 'full' then
    delete from public.current_external_prices current
    where current.partner_company_id = target.partner_company_id
      and current.external_price_source_id = target.external_price_source_id;
  end if;

  insert into public.current_external_prices(
    partner_company_id, external_price_source_id, catalog_product_id,
    price_type, observation_id, amount, currency, observed_at, upload_id
  )
  select distinct on (
    observation.partner_company_id, observation.external_price_source_id,
    observation.catalog_product_id, price.price_type
  )
    observation.partner_company_id, observation.external_price_source_id,
    observation.catalog_product_id, price.price_type, observation.id,
    price.amount, observation.currency, observation.observed_at,
    observation.upload_id
  from public.external_price_observations observation
  cross join lateral (
    values ('partner'::text, observation.partner_price), ('retail'::text, observation.retail_price)
  ) price(price_type, amount)
  where observation.upload_id = target.id and price.amount is not null
  order by observation.partner_company_id, observation.external_price_source_id,
    observation.catalog_product_id, price.price_type,
    observation.source_sheet, observation.source_row desc, observation.id
  on conflict (
    partner_company_id, external_price_source_id, catalog_product_id,
    price_type
  ) do update set
    observation_id = excluded.observation_id,
    amount = excluded.amount,
    currency = excluded.currency,
    observed_at = excluded.observed_at,
    upload_id = excluded.upload_id,
    updated_at = now();
  get diagnostics current_count = row_count;

  update public.external_price_uploads
  set status = 'applied', applied_at = now(), updated_at = now()
  where id = target.id;

  insert into public.external_price_events(
    upload_id, partner_company_id, actor_user_id, event_type, safe_metadata
  ) values (
    target.id, p_company_id, auth.uid(), 'applied',
    jsonb_build_object(
      'observations', inserted_count,
      'currentPrices', current_count,
      'snapshotScope', target.snapshot_scope
    )
  );

  return jsonb_build_object(
    'id', target.id,
    'status', 'applied',
    'observations', inserted_count,
    'currentPrices', current_count,
    'idempotent', false
  );
end;
$$;

revoke all on function public.apply_external_price_upload(uuid, uuid)
from public, anon;
grant execute on function public.apply_external_price_upload(uuid, uuid)
to authenticated;

commit;
