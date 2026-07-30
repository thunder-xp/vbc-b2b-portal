begin;

alter function public.publish_exact_stock_snapshot(uuid)
  rename to publish_exact_stock_snapshot_product_notification_base;

create function public.publish_exact_stock_snapshot(p_sync_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  base_result jsonb;
  before_states jsonb := '[]'::jsonb;
  captured integer := 0;
  capture_error text := null;
begin
  begin
    with affected as (
      select distinct product.id as product_id
      from (
        select stage.external_product_ref
        from public.stock_balance_sync_stage stage
        where stage.sync_id = p_sync_id
        union
        select stage.external_product_ref
        from public.supplier_arrival_balance_stage stage
        where stage.sync_id = p_sync_id
      ) source
      join public.catalog_products product
        on product.external_1c_id = source.external_product_ref
      where product.is_active
        and product.is_visible
        and (
          exists (
            select 1
            from public.purchasing_list_items item
            join public.purchasing_lists list on list.id = item.list_id
            join public.company_memberships membership
              on membership.company_id = list.company_id
             and membership.user_id = list.created_by
             and membership.status = 'active'
            where item.product_id = product.id
              and list.archived_at is null
          )
          or exists (
            select 1
            from public.cart_items item
            join public.carts cart on cart.id = item.cart_id
            join public.company_memberships membership
              on membership.company_id = cart.company_id
             and membership.user_id = cart.created_by
             and membership.status = 'active'
            where item.product_id = product.id
              and cart.status = 'active'
          )
        )
    ),
    snapshot as (
      select affected.product_id,
        case
          when stock.is_published and stock.available_quantity > 0 then 'in_stock'
          when arrival.expected_arrival_date is not null then 'expected'
          when stock.product_id is null then 'unknown'
          else 'unavailable'
        end as state
      from affected
      left join public.product_stock_totals stock
        on stock.product_id = affected.product_id
      left join lateral (
        select min(value.expected_arrival_date) as expected_arrival_date
        from public.product_supplier_arrivals value
        where value.product_id = affected.product_id
          and value.is_published
          and value.expected_arrival_date >= current_date
      ) arrival on true
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'productId', snapshot.product_id,
      'state', snapshot.state
    )), '[]'::jsonb)
    into before_states
    from snapshot;
  exception when others then
    before_states := '[]'::jsonb;
    capture_error := 'before_state_capture_failed';
  end;

  base_result :=
    public.publish_exact_stock_snapshot_product_notification_base(p_sync_id);

  begin
    with before_state as (
      select value.product_id, value.state
      from jsonb_to_recordset(before_states)
        as value(product_id uuid, state text)
    ),
    current_state as (
      select before_state.product_id, before_state.state as previous_state,
        case
          when stock.is_published and stock.available_quantity > 0 then 'in_stock'
          when arrival.expected_arrival_date is not null then 'expected'
          when stock.product_id is null then 'unknown'
          else 'unavailable'
        end as new_state
      from before_state
      left join public.product_stock_totals stock
        on stock.product_id = before_state.product_id
      left join lateral (
        select min(value.expected_arrival_date) as expected_arrival_date
        from public.product_supplier_arrivals value
        where value.product_id = before_state.product_id
          and value.is_published
          and value.expected_arrival_date >= current_date
      ) arrival on true
    )
    insert into public.partner_product_transition_events(
      product_id, transition_type, previous_state_safe, new_state_safe,
      source_sync_id, source_version, fingerprint
    )
    select current_state.product_id, 'availability_changed',
      current_state.previous_state, current_state.new_state,
      p_sync_id, p_sync_id::text,
      encode(digest(concat_ws('|',
        'availability_changed', current_state.product_id::text,
        current_state.previous_state, current_state.new_state,
        p_sync_id::text
      ), 'sha256'), 'hex')
    from current_state
    where current_state.previous_state <> current_state.new_state
    on conflict (fingerprint) do nothing;
    get diagnostics captured = row_count;
  exception when others then
    captured := 0;
    capture_error := coalesce(capture_error, 'transition_capture_failed');
  end;

  return base_result || jsonb_build_object(
    'product_transitions_captured', captured,
    'product_transition_capture_error', capture_error
  );
end;
$$;

revoke all on function
  public.publish_exact_stock_snapshot_product_notification_base(uuid),
  public.publish_exact_stock_snapshot(uuid)
from public, anon, authenticated;
grant execute on function
  public.publish_exact_stock_snapshot_product_notification_base(uuid),
  public.publish_exact_stock_snapshot(uuid)
to service_role;

comment on function public.publish_exact_stock_snapshot(uuid) is
  'Publishes authoritative stock and arrivals, then captures safe watched-product state transitions without making notification capture a publication dependency.';

commit;
