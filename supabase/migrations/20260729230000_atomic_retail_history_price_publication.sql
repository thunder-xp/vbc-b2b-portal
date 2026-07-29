begin;

create or replace function public.finalize_retail_price_history_continuity(
  p_sync_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  matched integer := 0;
  mismatched integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'RETAIL_HISTORY_PERMISSION_DENIED' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.retail_price_history_backfill_runs
    where sync_id = p_sync_id and status = 'succeeded'
  ) then
    return jsonb_build_object('status', 'skipped', 'syncId', p_sync_id);
  end if;

  with latest_source as (
    select distinct on (history.product_id)
      history.product_id,
      history.price_amount
    from public.product_price_history history
    where history.source = 'one_c_history'
      and history.external_price_type_code = 'UU-000020'
      and history.currency = 'MDL'
    order by history.product_id, history.effective_at desc,
      history.observed_at desc, history.id desc
  ),
  continuity as (
    select source.product_id,
      current.price_amount = source.price_amount as matches
    from latest_source source
    join public.product_prices current
      on current.product_id = source.product_id
      and current.company_id is null
      and current.external_1c_price_type_id = 'e181c772-93fc-11e9-94cb-000c29cf9dd4'
      and current.currency = 'MDL'
      and current.currency_status = 'resolved'
      and current.is_active and current.is_published
  )
  select
    count(*) filter (where matches)::integer,
    count(*) filter (where not matches)::integer
  into matched, mismatched
  from continuity;

  with latest_source as (
    select distinct on (history.product_id)
      history.product_id,
      history.price_amount
    from public.product_price_history history
    where history.source = 'one_c_history'
      and history.external_price_type_code = 'UU-000020'
      and history.currency = 'MDL'
    order by history.product_id, history.effective_at desc,
      history.observed_at desc, history.id desc
  )
  insert into public.retail_price_history_incidents(sync_id, product_id, incident_code)
  select p_sync_id, source.product_id, 'RETAIL_HISTORY_CURRENT_MISMATCH'
  from latest_source source
  join public.product_prices current
    on current.product_id = source.product_id
    and current.company_id is null
    and current.external_1c_price_type_id = 'e181c772-93fc-11e9-94cb-000c29cf9dd4'
    and current.currency = 'MDL'
    and current.currency_status = 'resolved'
    and current.is_active and current.is_published
  where current.price_amount <> source.price_amount
  on conflict (sync_id, product_id, incident_code) do nothing;

  update public.retail_price_history_backfill_runs
  set continuity_matches = matched,
      continuity_mismatches = mismatched,
      updated_at = now()
  where sync_id = p_sync_id;

  return jsonb_build_object(
    'status', 'evaluated',
    'syncId', p_sync_id,
    'continuityMatches', matched,
    'continuityMismatches', mismatched
  );
end;
$$;

revoke all on function public.finalize_retail_price_history_continuity(uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_retail_price_history_continuity(uuid)
  to service_role;

create or replace function public.publish_product_prices_with_retail_history(
  p_sync_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  history_result jsonb;
  price_result jsonb;
  continuity_result jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'RETAIL_HISTORY_PERMISSION_DENIED' using errcode = '42501';
  end if;

  history_result := public.publish_retail_price_history_backfill(p_sync_id);
  price_result := public.publish_product_price_snapshot(p_sync_id);
  continuity_result := public.finalize_retail_price_history_continuity(p_sync_id);

  return jsonb_build_object(
    'history', history_result,
    'prices', price_result,
    'continuity', continuity_result
  );
end;
$$;

revoke all on function public.publish_product_prices_with_retail_history(uuid)
  from public, anon, authenticated;
grant execute on function public.publish_product_prices_with_retail_history(uuid)
  to service_role;

comment on function public.publish_product_prices_with_retail_history(uuid) is
  'Atomically publishes an explicitly requested verified RETAIL history backfill, the current price snapshot, and continuity diagnostics. A failure rolls back all three.';

commit;
