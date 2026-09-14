begin;

alter table public.price_sync_state
  add column if not exists delta_unchanged integer not null default 0,
  add column if not exists delta_inserted integer not null default 0,
  add column if not exists delta_updated integer not null default 0,
  add column if not exists delta_removed integer not null default 0,
  add column if not exists publication_batches integer not null default 0,
  add column if not exists publication_db_duration_ms bigint not null default 0,
  add column if not exists publication_timeout_budget_ms integer not null default 8000,
  add column if not exists publication_headroom_percent numeric(5,2) not null default 100,
  add column if not exists publication_warning boolean not null default false,
  add column if not exists publication_profile jsonb not null default '{}'::jsonb;

alter table public.price_sync_state
  add constraint price_sync_state_publication_delta_check check (
    delta_unchanged >= 0 and delta_inserted >= 0 and delta_updated >= 0
    and delta_removed >= 0 and publication_batches >= 0
  ) not valid,
  add constraint price_sync_state_publication_runtime_check check (
    publication_db_duration_ms >= 0
    and publication_timeout_budget_ms > 0
    and publication_headroom_percent between 0 and 100
  ) not valid,
  add constraint price_sync_state_publication_profile_object_check check (
    jsonb_typeof(publication_profile) = 'object'
  ) not valid;

alter table public.price_sync_state validate constraint price_sync_state_publication_delta_check;
alter table public.price_sync_state validate constraint price_sync_state_publication_runtime_check;
alter table public.price_sync_state validate constraint price_sync_state_publication_profile_object_check;

comment on column public.price_sync_state.publication_profile is
  'Server-measured phase timings for the last partner-price publication; operational metadata only.';

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
    price_type.external_ref,
    price_type.external_code,
    price_type.name,
    price_type.currency_ref,
    currency.code,
    case when currency.code is null then 'unresolved' else 'resolved' end,
    price_type.vat_included,
    case when price_type.vat_included is null then null else now() end,
    price_type.is_active,
    now(),
    now()
  from public.product_price_type_sync_stage price_type
  left join public.product_currency_sync_stage currency
    on currency.sync_id = p_sync_id
   and currency.external_ref = price_type.currency_ref
  where price_type.sync_id = p_sync_id
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
    updated_at = excluded.updated_at;

  update public.price_types price_type set is_active = false, updated_at = now()
  where not exists (
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
      price_type.id as price_type_id,
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
    select source_rows.*,
      case
        when current_price.id is null then 'insert'
        when current_price.currency is not distinct from source_rows.currency
          and current_price.price_amount is not distinct from source_rows.price_amount
          and current_price.valid_from is not distinct from source_rows.valid_from
          and current_price.valid_to is null
          and current_price.is_active is not distinct from source_rows.is_active
          and current_price.price_type_id is not distinct from source_rows.price_type_id
          and current_price.external_product_ref is not distinct from source_rows.external_product_ref
          and current_price.effective_at is not distinct from source_rows.effective_at
          and current_price.currency_status is not distinct from source_rows.currency_status
          and current_price.is_published
          then 'unchanged'
        else 'update'
      end as delta_kind
    from source_rows
    left join public.product_prices current_price
      on current_price.product_id = source_rows.product_id
     and current_price.external_1c_price_type_id = source_rows.external_price_type_ref
  ),
  counts as (
    select count(*)::integer staged,
      count(*) filter (where delta_kind = 'unchanged')::integer unchanged,
      count(*) filter (where delta_kind = 'insert')::integer inserted,
      count(*) filter (where delta_kind = 'update')::integer updated
    from classified
  )
  select staged, unchanged, inserted, updated
  into v_staged, v_unchanged, v_inserted, v_updated
  from counts;

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
      join public.price_types price_type
        on price_type.external_ref = staged.external_price_type_ref
       and price_type.id = current_price.price_type_id
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
    product.id, null, staged.external_price_type_ref,
    coalesce(price_type.currency_code, 'XXX'), staged.amount, staged.effective_at, null,
    staged.is_current and staged.amount > 0, price_type.id, staged.external_product_ref,
    staged.effective_at, now(), price_type.currency_status, p_sync_id, true
  from public.product_price_sync_stage staged
  join public.catalog_products product on product.external_1c_id = staged.external_product_ref
  join public.price_types price_type on price_type.external_ref = staged.external_price_type_ref
  where staged.sync_id = p_sync_id
    and staged.external_characteristic_ref = '00000000-0000-0000-0000-000000000000'
  on conflict (product_id, external_1c_price_type_id) do update set
    currency = excluded.currency,
    price_amount = excluded.price_amount,
    valid_from = excluded.valid_from,
    valid_to = null,
    is_active = excluded.is_active,
    price_type_id = excluded.price_type_id,
    external_product_ref = excluded.external_product_ref,
    effective_at = excluded.effective_at,
    synced_at = excluded.synced_at,
    currency_status = excluded.currency_status,
    last_seen_sync_id = p_sync_id,
    is_published = true;
  get diagnostics v_published = row_count;
  v_profile := v_profile || jsonb_build_object(
    'price_write_including_triggers_and_indexes_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_phase_started)) * 1000)::bigint),
    'price_write_rows', v_published
  );

  v_phase_started := clock_timestamp();
  update public.product_prices set is_active = false
  where is_published and company_id is null and last_seen_sync_id is distinct from p_sync_id;
  get diagnostics v_deactivated = row_count;
  v_profile := v_profile || jsonb_build_object(
    'removal_write_including_triggers_and_indexes_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_phase_started)) * 1000)::bigint),
    'removal_write_rows', v_deactivated
  );

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
    last_successful_sync_at = now(), latest_prices_resolved = v_published + v_unmatched + v_unknown,
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

create or replace function public.publish_product_prices_with_retail_history_notification_base(p_sync_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  history_result jsonb;
  price_result jsonb;
  continuity_result jsonb;
  v_started timestamptz := clock_timestamp();
  v_phase_started timestamptz;
  v_profile jsonb := '{}'::jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'RETAIL_HISTORY_PERMISSION_DENIED' using errcode = '42501';
  end if;

  v_phase_started := clock_timestamp();
  history_result := public.publish_retail_price_history_backfill(p_sync_id);
  v_profile := v_profile || jsonb_build_object('history_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_phase_started)) * 1000)::bigint));

  v_phase_started := clock_timestamp();
  price_result := public.publish_product_price_snapshot(p_sync_id);
  v_profile := v_profile || jsonb_build_object('snapshot_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_phase_started)) * 1000)::bigint));

  v_phase_started := clock_timestamp();
  continuity_result := public.finalize_retail_price_history_continuity(p_sync_id);
  v_profile := v_profile || jsonb_build_object(
    'continuity_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_phase_started)) * 1000)::bigint),
    'base_total_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_started)) * 1000)::bigint)
  );

  return jsonb_build_object(
    'history', history_result,
    'prices', price_result,
    'continuity', continuity_result,
    'profile', v_profile
  );
end;
$$;

create or replace function public.publish_product_prices_with_retail_history(p_sync_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  base_result jsonb;
  before_states jsonb := '[]'::jsonb;
  captured integer := 0;
  capture_error text := null;
  v_started timestamptz := clock_timestamp();
  v_phase_started timestamptz;
  v_total_ms bigint := 0;
  v_timeout_ms integer := 8000;
  v_headroom numeric(5,2) := 100;
  v_profile jsonb := '{}'::jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'RETAIL_HISTORY_PERMISSION_DENIED' using errcode = '42501';
  end if;

  v_phase_started := clock_timestamp();
  begin
    with affected as (
      select distinct product.id as product_id, stage.external_price_type_ref
      from public.product_price_sync_stage stage
      join public.catalog_products product on product.external_1c_id = stage.external_product_ref
      where stage.sync_id = p_sync_id
        and stage.external_characteristic_ref = '00000000-0000-0000-0000-000000000000'
        and product.is_active and product.is_visible
        and (
          exists (
            select 1 from public.purchasing_list_items item
            join public.purchasing_lists list on list.id = item.list_id
            join public.company_memberships membership
              on membership.company_id = list.company_id
             and membership.user_id = list.created_by and membership.status = 'active'
            where item.product_id = product.id and list.archived_at is null
          )
          or exists (
            select 1 from public.cart_items item
            join public.carts cart on cart.id = item.cart_id
            join public.company_memberships membership
              on membership.company_id = cart.company_id
             and membership.user_id = cart.created_by and membership.status = 'active'
            where item.product_id = product.id and cart.status = 'active'
          )
        )
    ),
    snapshot as (
      select affected.product_id, affected.external_price_type_ref,
        case when price.id is not null and price.is_active and price.is_published
          and price.price_amount > 0 and price.currency_status = 'resolved'
          then 'available' else 'unavailable' end as state,
        encode(digest(concat_ws('|',
          case when price.id is null then 'missing' else 'present' end,
          coalesce(price.currency, ''), coalesce(price.price_amount::text, ''),
          coalesce(price.is_active::text, 'false'), coalesce(price.is_published::text, 'false'),
          coalesce(price.currency_status, '')
        ), 'sha256'), 'hex') as value_fingerprint
      from affected
      left join public.product_prices price
        on price.product_id = affected.product_id
       and price.external_1c_price_type_id = affected.external_price_type_ref
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'productId', snapshot.product_id, 'priceTypeRef', snapshot.external_price_type_ref,
      'state', snapshot.state, 'fingerprint', snapshot.value_fingerprint
    )), '[]'::jsonb)
    into before_states from snapshot;
  exception when others then
    before_states := '[]'::jsonb;
    capture_error := 'before_price_capture_failed';
  end;
  v_profile := v_profile || jsonb_build_object('before_transition_capture_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_phase_started)) * 1000)::bigint));

  v_phase_started := clock_timestamp();
  base_result := public.publish_product_prices_with_retail_history_notification_base(p_sync_id);
  v_profile := v_profile || jsonb_build_object('base_publication_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_phase_started)) * 1000)::bigint));

  v_phase_started := clock_timestamp();
  begin
    with before_state as (
      select value.product_id, value.price_type_ref, value.state, value.fingerprint
      from jsonb_to_recordset(before_states) as value(product_id uuid, price_type_ref text, state text, fingerprint text)
    ),
    current_state as (
      select before_state.product_id, before_state.price_type_ref,
        before_state.state as previous_state, before_state.fingerprint as previous_fingerprint,
        case when price.id is not null and price.is_active and price.is_published
          and price.price_amount > 0 and price.currency_status = 'resolved'
          then 'available' else 'unavailable' end as new_state,
        encode(digest(concat_ws('|',
          case when price.id is null then 'missing' else 'present' end,
          coalesce(price.currency, ''), coalesce(price.price_amount::text, ''),
          coalesce(price.is_active::text, 'false'), coalesce(price.is_published::text, 'false'),
          coalesce(price.currency_status, '')
        ), 'sha256'), 'hex') as new_fingerprint
      from before_state
      left join public.product_prices price
        on price.product_id = before_state.product_id
       and price.external_1c_price_type_id = before_state.price_type_ref
    )
    insert into public.partner_product_transition_events(
      product_id, transition_type, previous_state_safe, new_state_safe,
      previous_value_fingerprint, new_value_fingerprint, price_context_type,
      external_price_type_ref, source_sync_id, source_version, fingerprint
    )
    select current_state.product_id, 'price_changed', current_state.previous_state,
      current_state.new_state, current_state.previous_fingerprint, current_state.new_fingerprint,
      'price_type', current_state.price_type_ref, p_sync_id, p_sync_id::text,
      encode(digest(concat_ws('|', 'price_changed', current_state.product_id::text,
        current_state.price_type_ref, current_state.previous_fingerprint,
        current_state.new_fingerprint, p_sync_id::text), 'sha256'), 'hex')
    from current_state
    where current_state.previous_fingerprint <> current_state.new_fingerprint
    on conflict (fingerprint) do nothing;
    get diagnostics captured = row_count;
  exception when others then
    captured := 0;
    capture_error := coalesce(capture_error, 'price_transition_capture_failed');
  end;
  v_profile := v_profile || jsonb_build_object('after_transition_capture_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_phase_started)) * 1000)::bigint));

  v_total_ms := greatest(0, floor(extract(epoch from (clock_timestamp() - v_started)) * 1000)::bigint);
  v_headroom := greatest(0, least(100, round((1 - v_total_ms::numeric / v_timeout_ms::numeric) * 100, 2)));
  v_profile := v_profile
    || coalesce(base_result->'profile', '{}'::jsonb)
    || coalesce(base_result->'prices'->'profile', '{}'::jsonb)
    || jsonb_build_object('total_db_ms', v_total_ms);

  update public.price_sync_state set
    delta_unchanged = coalesce((base_result->'prices'->>'unchanged')::integer, 0),
    delta_inserted = coalesce((base_result->'prices'->>'inserted')::integer, 0),
    delta_updated = coalesce((base_result->'prices'->>'updated')::integer, 0),
    delta_removed = coalesce((base_result->'prices'->>'removed')::integer, 0),
    publication_batches = 1,
    publication_db_duration_ms = v_total_ms,
    publication_timeout_budget_ms = v_timeout_ms,
    publication_headroom_percent = v_headroom,
    publication_warning = v_total_ms > (v_timeout_ms * 0.70),
    publication_profile = v_profile,
    updated_at = now()
  where id = 'product_prices';

  return base_result || jsonb_build_object(
    'product_price_transitions_captured', captured,
    'product_price_transition_capture_error', capture_error,
    'publication_profile', v_profile
  );
end;
$$;

revoke all on function
  public.publish_product_prices_with_retail_history_notification_base(uuid),
  public.publish_product_prices_with_retail_history(uuid)
from public, anon, authenticated;
grant execute on function
  public.publish_product_prices_with_retail_history_notification_base(uuid),
  public.publish_product_prices_with_retail_history(uuid)
to service_role;

commit;
