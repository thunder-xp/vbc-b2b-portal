begin;

create or replace function public.publish_product_price_snapshot(p_sync_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_published integer := 0;
  v_deactivated integer := 0;
  v_unmatched integer := 0;
  v_unknown integer := 0;
  v_staged integer := 0;
  v_unchanged integer := 0;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_removed integer := 0;
  v_started timestamptz := clock_timestamp();
  v_phase_started timestamptz;
  v_profile jsonb := '{}'::jsonb;
begin
  if not exists (
    select 1 from public.price_sync_state
    where id = 'product_prices' and active_sync_id = p_sync_id and scan_complete
  ) then
    raise exception 'price sync is not ready for publication';
  end if;

  v_phase_started := clock_timestamp();
  insert into public.price_types (
    external_ref, external_code, name, currency_ref, currency_code, currency_status,
    vat_included, vat_basis_synced_at, is_active, source_updated_at, updated_at
  )
  select
    staged.external_ref,
    staged.external_code,
    staged.name,
    staged.currency_ref,
    currency.code,
    case when currency.code is null then 'unresolved' else 'resolved' end,
    staged.vat_included,
    case when staged.vat_included is null then null else now() end,
    staged.is_active,
    now(),
    now()
  from public.product_price_type_sync_stage staged
  left join public.product_currency_sync_stage currency
    on currency.sync_id = p_sync_id
   and currency.external_ref = staged.currency_ref
  where staged.sync_id = p_sync_id
  on conflict (external_ref) do update set
    external_code = excluded.external_code,
    name = excluded.name,
    currency_ref = excluded.currency_ref,
    currency_code = excluded.currency_code,
    currency_status = excluded.currency_status,
    vat_included = excluded.vat_included,
    vat_basis_synced_at = excluded.vat_basis_synced_at,
    is_active = excluded.is_active,
    source_updated_at = excluded.source_updated_at,
    updated_at = excluded.updated_at
  where row(
    price_types.external_code,
    price_types.name,
    price_types.currency_ref,
    price_types.currency_code,
    price_types.currency_status,
    price_types.vat_included,
    price_types.is_active
  ) is distinct from row(
    excluded.external_code,
    excluded.name,
    excluded.currency_ref,
    excluded.currency_code,
    excluded.currency_status,
    excluded.vat_included,
    excluded.is_active
  );

  update public.price_types price_type
  set is_active = false, updated_at = now()
  where price_type.is_active
    and not exists (
      select 1 from public.product_price_type_sync_stage staged
      where staged.sync_id = p_sync_id and staged.external_ref = price_type.external_ref
    );
  v_profile := v_profile || jsonb_build_object(
    'price_types_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_phase_started)) * 1000)::bigint)
  );

  v_phase_started := clock_timestamp();
  select count(*) into v_unmatched
  from public.product_price_sync_stage staged
  left join public.catalog_products product on product.external_1c_id = staged.external_product_ref
  where staged.sync_id = p_sync_id and product.id is null;

  select count(*) into v_unknown
  from public.product_price_sync_stage staged
  left join public.price_types price_type on price_type.external_ref = staged.external_price_type_ref
  where staged.sync_id = p_sync_id and price_type.id is null;
  v_profile := v_profile || jsonb_build_object(
    'validation_counts_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_phase_started)) * 1000)::bigint)
  );

  v_phase_started := clock_timestamp();
  with source_rows as (
    select
      product.id as product_id,
      staged.external_price_type_ref,
      coalesce(price_type.currency_code, 'XXX') as currency,
      staged.amount as price_amount,
      staged.effective_at as valid_from,
      staged.is_current and staged.amount > 0 as is_active,
      case when price_type.is_active then price_type.id else null end as price_type_id,
      staged.external_product_ref,
      staged.effective_at,
      price_type.currency_status
    from public.product_price_sync_stage staged
    join public.catalog_products product on product.external_1c_id = staged.external_product_ref
    join public.price_types price_type on price_type.external_ref = staged.external_price_type_ref
    where staged.sync_id = p_sync_id
      and staged.external_characteristic_ref = '00000000-0000-0000-0000-000000000000'
  ),
  classified as (
    select case
      when current_price.id is null then 'insert'
      when row(
        current_price.currency,
        current_price.price_amount,
        current_price.valid_from,
        current_price.valid_to,
        current_price.is_active,
        current_price.price_type_id,
        current_price.external_product_ref,
        current_price.effective_at,
        current_price.currency_status,
        current_price.is_published
      ) is not distinct from row(
        source_rows.currency,
        source_rows.price_amount,
        source_rows.valid_from,
        null::timestamptz,
        source_rows.is_active,
        source_rows.price_type_id,
        source_rows.external_product_ref,
        source_rows.effective_at,
        source_rows.currency_status,
        true
      ) then 'unchanged'
      else 'update'
    end as delta_kind
    from source_rows
    left join public.product_prices current_price
      on current_price.product_id = source_rows.product_id
     and current_price.external_1c_price_type_id = source_rows.external_price_type_ref
  )
  select
    count(*)::integer,
    count(*) filter (where delta_kind = 'unchanged')::integer,
    count(*) filter (where delta_kind = 'insert')::integer,
    count(*) filter (where delta_kind = 'update')::integer
  into v_staged, v_unchanged, v_inserted, v_updated
  from classified;

  select count(*)::integer into v_removed
  from public.product_prices current_price
  where current_price.company_id is null
    and current_price.is_published
    and current_price.is_active
    and not exists (
      select 1
      from public.product_price_sync_stage staged
      join public.catalog_products product
        on product.external_1c_id = staged.external_product_ref
       and product.id = current_price.product_id
      where staged.sync_id = p_sync_id
        and staged.external_characteristic_ref = '00000000-0000-0000-0000-000000000000'
        and staged.external_price_type_ref = current_price.external_1c_price_type_id
    );
  v_profile := v_profile || jsonb_build_object(
    'delta_calculation_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_phase_started)) * 1000)::bigint)
  );

  v_phase_started := clock_timestamp();
  insert into public.product_prices (
    product_id, company_id, external_1c_price_type_id, currency, price_amount,
    valid_from, valid_to, is_active, price_type_id, external_product_ref,
    effective_at, synced_at, currency_status, last_seen_sync_id, is_published
  )
  select
    product.id,
    null,
    staged.external_price_type_ref,
    coalesce(price_type.currency_code, 'XXX'),
    staged.amount,
    staged.effective_at,
    null,
    staged.is_current and staged.amount > 0,
    case when price_type.is_active then price_type.id else null end,
    staged.external_product_ref,
    staged.effective_at,
    now(),
    price_type.currency_status,
    p_sync_id,
    true
  from public.product_price_sync_stage staged
  join public.catalog_products product on product.external_1c_id = staged.external_product_ref
  join public.price_types price_type on price_type.external_ref = staged.external_price_type_ref
  left join public.product_prices current_price
    on current_price.product_id = product.id
   and current_price.external_1c_price_type_id = staged.external_price_type_ref
  where staged.sync_id = p_sync_id
    and staged.external_characteristic_ref = '00000000-0000-0000-0000-000000000000'
    and current_price.id is null
  on conflict (product_id, external_1c_price_type_id) do nothing;
  get diagnostics v_inserted = row_count;
  v_profile := v_profile || jsonb_build_object(
    'price_insert_including_triggers_and_indexes_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_phase_started)) * 1000)::bigint),
    'price_insert_rows', v_inserted
  );

  v_phase_started := clock_timestamp();
  with source_rows as (
    select
      product.id as product_id,
      staged.external_price_type_ref,
      coalesce(price_type.currency_code, 'XXX') as currency,
      staged.amount as price_amount,
      staged.effective_at as valid_from,
      staged.is_current and staged.amount > 0 as is_active,
      case when price_type.is_active then price_type.id else null end as price_type_id,
      staged.external_product_ref,
      staged.effective_at,
      price_type.currency_status
    from public.product_price_sync_stage staged
    join public.catalog_products product on product.external_1c_id = staged.external_product_ref
    join public.price_types price_type on price_type.external_ref = staged.external_price_type_ref
    where staged.sync_id = p_sync_id
      and staged.external_characteristic_ref = '00000000-0000-0000-0000-000000000000'
  )
  update public.product_prices current_price
  set currency = source_rows.currency,
      price_amount = source_rows.price_amount,
      valid_from = source_rows.valid_from,
      valid_to = null,
      is_active = source_rows.is_active,
      price_type_id = source_rows.price_type_id,
      external_product_ref = source_rows.external_product_ref,
      effective_at = source_rows.effective_at,
      synced_at = now(),
      currency_status = source_rows.currency_status,
      last_seen_sync_id = p_sync_id,
      is_published = true
  from source_rows
  where current_price.product_id = source_rows.product_id
    and current_price.external_1c_price_type_id = source_rows.external_price_type_ref
    and row(
      current_price.currency,
      current_price.price_amount,
      current_price.valid_from,
      current_price.valid_to,
      current_price.is_active,
      current_price.price_type_id,
      current_price.external_product_ref,
      current_price.effective_at,
      current_price.currency_status,
      current_price.is_published
    ) is distinct from row(
      source_rows.currency,
      source_rows.price_amount,
      source_rows.valid_from,
      null::timestamptz,
      source_rows.is_active,
      source_rows.price_type_id,
      source_rows.external_product_ref,
      source_rows.effective_at,
      source_rows.currency_status,
      true
    );
  get diagnostics v_updated = row_count;
  v_profile := v_profile || jsonb_build_object(
    'price_update_including_triggers_and_indexes_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_phase_started)) * 1000)::bigint),
    'price_update_rows', v_updated
  );

  v_phase_started := clock_timestamp();
  update public.product_prices current_price
  set is_active = false
  where current_price.company_id is null
    and current_price.is_published
    and current_price.is_active
    and not exists (
      select 1
      from public.product_price_sync_stage staged
      join public.catalog_products product
        on product.external_1c_id = staged.external_product_ref
       and product.id = current_price.product_id
      where staged.sync_id = p_sync_id
        and staged.external_characteristic_ref = '00000000-0000-0000-0000-000000000000'
        and staged.external_price_type_ref = current_price.external_1c_price_type_id
    );
  get diagnostics v_deactivated = row_count;
  v_removed := v_deactivated;
  v_profile := v_profile || jsonb_build_object(
    'removal_write_including_triggers_and_indexes_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_phase_started)) * 1000)::bigint),
    'removal_write_rows', v_deactivated
  );

  v_published := v_inserted + v_updated;

  v_phase_started := clock_timestamp();
  delete from public.product_price_sync_stage where sync_id = p_sync_id;
  delete from public.product_price_type_sync_stage where sync_id = p_sync_id;
  delete from public.product_currency_sync_stage where sync_id = p_sync_id;
  v_profile := v_profile || jsonb_build_object(
    'cleanup_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_phase_started)) * 1000)::bigint)
  );

  v_phase_started := clock_timestamp();
  update public.price_sync_state set
    status = 'succeeded', current_stage = 'completed', finished_at = now(),
    last_successful_sync_at = now(), latest_prices_resolved = v_staged + v_unmatched + v_unknown,
    prices_published = v_published, prices_deactivated = v_deactivated,
    unmatched_products = v_unmatched, unknown_price_types = v_unknown,
    active_sync_id = null, lock_acquired_at = null, active_chunk_token = null,
    chunk_started_at = null, safe_error = null, updated_at = now()
  where id = 'product_prices' and active_sync_id = p_sync_id;
  v_profile := v_profile || jsonb_build_object(
    'state_write_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_phase_started)) * 1000)::bigint),
    'snapshot_total_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_started)) * 1000)::bigint)
  );

  return jsonb_build_object(
    'published', v_published,
    'deactivated', v_deactivated,
    'unmatchedProducts', v_unmatched,
    'unknownPriceTypes', v_unknown,
    'stagedMatched', v_staged,
    'unchanged', v_unchanged,
    'inserted', v_inserted,
    'updated', v_updated,
    'removed', v_removed,
    'profile', v_profile
  );
end;
$$;

revoke all on function public.publish_product_price_snapshot(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.publish_product_price_snapshot(uuid)
to service_role;

comment on function public.publish_product_price_snapshot(uuid) is
  'Publishes only material partner-price deltas; unchanged rows are excluded before INSERT trigger evaluation.';

commit;
