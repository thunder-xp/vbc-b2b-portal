alter table public.price_sync_state
  add column if not exists price_rows_received integer not null default 0,
  add column if not exists price_unique_keys integer not null default 0,
  add column if not exists price_duplicate_keys integer not null default 0,
  add column if not exists price_rows_deduplicated integer not null default 0,
  add column if not exists last_failed_sync_id uuid;

create or replace function public.stage_product_price_rows(
  p_sync_id uuid,
  p_rows jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  with source_rows as (
    select
      row.external_product_ref,
      row.external_price_type_ref,
      row.external_characteristic_ref,
      row.amount,
      row.is_current,
      row.effective_at,
      row.currency_code,
      row.currency_status,
      item.ordinality
    from jsonb_array_elements(p_rows) with ordinality as item(value, ordinality)
    cross join lateral jsonb_to_record(item.value) as row(
      external_product_ref text,
      external_price_type_ref text,
      external_characteristic_ref text,
      amount numeric,
      is_current boolean,
      effective_at timestamptz,
      currency_code text,
      currency_status text
    )
  ), ranked_rows as (
    select source_rows.*,
      row_number() over (
        partition by external_product_ref, external_price_type_ref, external_characteristic_ref
        order by effective_at desc, ordinality desc, is_current asc,
          amount::text asc, coalesce(currency_code, '') asc, currency_status asc
      ) as row_rank
    from source_rows
  )
  insert into public.product_price_sync_stage as current (
    sync_id, external_product_ref, external_price_type_ref,
    external_characteristic_ref, amount, is_current, effective_at,
    currency_code, currency_status
  )
  select p_sync_id, external_product_ref, external_price_type_ref,
    external_characteristic_ref, amount, is_current, effective_at,
    currency_code, currency_status
  from ranked_rows
  where row_rank = 1
  on conflict (sync_id, external_product_ref, external_price_type_ref, external_characteristic_ref)
  do update set
    amount = excluded.amount,
    is_current = excluded.is_current,
    effective_at = excluded.effective_at,
    currency_code = excluded.currency_code,
    currency_status = excluded.currency_status
  where excluded.effective_at >= current.effective_at;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.stage_product_price_rows(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.stage_product_price_rows(uuid, jsonb) to service_role;

comment on function public.stage_product_price_rows(uuid, jsonb) is
  'Stages one price page after deterministic logical-key deduplication, preventing SQLSTATE 21000.';
