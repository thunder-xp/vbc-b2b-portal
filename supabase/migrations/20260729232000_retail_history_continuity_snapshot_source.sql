begin;

create or replace function public.finalize_retail_price_history_continuity(
  p_sync_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  source_products integer := 0;
  current_products integer := 0;
  evaluated_products integer := 0;
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
  current_snapshot as (
    select distinct on (history.product_id)
      history.product_id,
      history.price_amount
    from public.product_price_history history
    where history.source in ('initial_baseline', 'price_sync_snapshot')
      and history.external_price_type_code = 'UU-000020'
      and history.currency = 'MDL'
    order by history.product_id, history.effective_at desc,
      history.observed_at desc, history.id desc
  ),
  continuity as (
    select source.product_id,
      current.price_amount = source.price_amount as matches
    from latest_source source
    join current_snapshot current using (product_id)
  )
  select
    (select count(*) from latest_source)::integer,
    (select count(*) from current_snapshot)::integer,
    count(*)::integer,
    count(*) filter (where matches)::integer,
    count(*) filter (where not matches)::integer
  into source_products, current_products, evaluated_products, matched, mismatched
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
  ),
  current_snapshot as (
    select distinct on (history.product_id)
      history.product_id,
      history.price_amount
    from public.product_price_history history
    where history.source in ('initial_baseline', 'price_sync_snapshot')
      and history.external_price_type_code = 'UU-000020'
      and history.currency = 'MDL'
    order by history.product_id, history.effective_at desc,
      history.observed_at desc, history.id desc
  )
  insert into public.retail_price_history_incidents(sync_id, product_id, incident_code)
  select p_sync_id, source.product_id, 'RETAIL_HISTORY_CURRENT_MISMATCH'
  from latest_source source
  join current_snapshot current using (product_id)
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
    'sourceProducts', source_products,
    'currentProducts', current_products,
    'evaluatedProducts', evaluated_products,
    'continuityMatches', matched,
    'continuityMismatches', mismatched
  );
end;
$$;

revoke all on function public.finalize_retail_price_history_continuity(uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_retail_price_history_continuity(uuid)
  to service_role;

commit;
