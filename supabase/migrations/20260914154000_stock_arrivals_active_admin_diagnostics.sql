begin;

-- The historical transition wrapper serialized productId but deserialized
-- product_id, causing every post-publication transition insert to enter its
-- swallowed error path. Keep the same bounded workflow and correct the key.
create or replace function public.publish_exact_stock_snapshot_reconciliation_base(
  p_sync_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_base_result jsonb;
  v_before_states jsonb := '[]'::jsonb;
  v_captured integer := 0;
  v_capture_error text := null;
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
      where product.is_active and product.is_visible
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
    ), snapshot as (
      select affected.product_id,
        case
          when stock.is_published and stock.available_quantity > 0
            then 'in_stock'
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
      'product_id', snapshot.product_id,
      'state', snapshot.state
    )), '[]'::jsonb)
    into v_before_states
    from snapshot;
  exception when others then
    v_before_states := '[]'::jsonb;
    v_capture_error := 'before_state_capture_failed';
  end;

  v_base_result :=
    public.publish_exact_stock_snapshot_product_notification_base(p_sync_id);

  begin
    with before_state as (
      select value.product_id, value.state
      from jsonb_to_recordset(v_before_states)
        as value(product_id uuid, state text)
    ), current_state as (
      select before_state.product_id,
        before_state.state as previous_state,
        case
          when stock.is_published and stock.available_quantity > 0
            then 'in_stock'
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
    get diagnostics v_captured = row_count;
  exception when others then
    v_captured := 0;
    v_capture_error := coalesce(
      v_capture_error,
      'transition_capture_failed'
    );
  end;

  return v_base_result || jsonb_build_object(
    'product_transitions_captured', v_captured,
    'product_transition_capture_error', v_capture_error
  );
end;
$$;

revoke all on function
  public.publish_exact_stock_snapshot_reconciliation_base(uuid)
from public, anon, authenticated;
grant execute on function
  public.publish_exact_stock_snapshot_reconciliation_base(uuid)
to service_role;

comment on function
  public.publish_exact_stock_snapshot_reconciliation_base(uuid) is
  'Captures eligible stock/arrival state transitions with a schema-matched product_id JSON key.';

-- Extend the production Admin Integration Center read model. This preserves
-- the existing price diagnostics and adds stock/arrivals evidence to the stock
-- card without another database request.
create or replace function public.get_admin_integration_center()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_center jsonb;
  v_domains jsonb;
begin
  v_center := public.get_admin_integration_center_base();

  select coalesce(jsonb_agg(
    case
      when item.value->>'domain' = 'prices' then
        item.value || jsonb_build_object(
          'pricePublication', coalesce((
            select jsonb_build_object(
              'stagedRows', coalesce(state.rows_staged, 0),
              'unchanged', coalesce(state.delta_unchanged, 0),
              'inserted', coalesce(state.delta_inserted, 0),
              'updated', coalesce(state.delta_updated, 0),
              'removed', coalesce(state.delta_removed, 0),
              'batches', coalesce(state.publication_batches, 0),
              'databaseDurationMs',
                coalesce(state.publication_db_duration_ms, 0),
              'timeoutBudgetMs',
                coalesce(state.publication_timeout_budget_ms, 8000),
              'headroomPercent',
                coalesce(state.publication_headroom_percent, 100),
              'warning', coalesce(state.publication_warning, false)
            )
            from public.price_sync_state state
            where state.id = 'product_prices'
          ), jsonb_build_object(
            'stagedRows', 0, 'unchanged', 0, 'inserted', 0,
            'updated', 0, 'removed', 0, 'batches', 0,
            'databaseDurationMs', 0, 'timeoutBudgetMs', 8000,
            'headroomPercent', 100, 'warning', false
          ))
        )
      when item.value->>'domain' = 'stock' then
        item.value || jsonb_build_object(
          'stockPublication', coalesce((
            select jsonb_build_object(
              'stockReceived', coalesce(state.physical_rows, 0)
                + coalesce(state.reserved_rows, 0)
                + coalesce(state.incoming_rows, 0),
              'arrivalsReceived', coalesce(state.supplier_balance_rows, 0),
              'sourceCalls', coalesce(state.pages_processed, 0),
              'stockStagedRows', coalesce(state.stock_staged_rows, 0),
              'arrivalsStagedRows', coalesce(state.arrivals_staged_rows, 0),
              'stockDelta', jsonb_build_object(
                'unchanged', state.stock_delta_unchanged,
                'inserted', state.stock_delta_inserted,
                'updated', state.stock_delta_updated,
                'removed', state.stock_delta_removed
              ),
              'arrivalsDelta', jsonb_build_object(
                'unchanged', state.arrivals_delta_unchanged,
                'inserted', state.arrivals_delta_inserted,
                'updated', state.arrivals_delta_updated,
                'removed', state.arrivals_delta_removed
              ),
              'databaseDurationMs', state.publication_db_ms,
              'applicationDurationMs', state.publication_application_ms,
              'timeoutBudgetMs', state.publication_timeout_budget_ms,
              'headroomPercent', state.publication_headroom_percent,
              'lockWaitMs', state.publication_lock_wait_ms,
              'triggerRows', state.publication_trigger_rows,
              'triggerDurationMs', null,
              'sqlState', state.database_error_code,
              'failedStage', state.failed_stage,
              'recoveryState', case when state.status = 'failed'
                then 'LAST_GOOD_ACTIVE_STAGING_RETAINED'
                else 'CONFIRMED_PUBLICATION_ACTIVE' end,
              'affectedDomains', jsonb_build_array('stock', 'arrivals'),
              'warning', coalesce(state.publication_db_ms, 0) >
                state.publication_timeout_budget_ms * 0.7
            )
            from public.stock_sync_state state
            where state.id = 'exact_stock'
          ), '{}'::jsonb)
        )
      else item.value
    end
    order by item.ordinality
  ), '[]'::jsonb)
  into v_domains
  from jsonb_array_elements(v_center->'domains')
    with ordinality as item(value, ordinality);

  return jsonb_set(v_center, '{domains}', v_domains);
end;
$$;

comment on function public.get_admin_integration_center() is
  'Returns the existing Admin Integration Center projection with bounded price and stock/arrivals publication diagnostics.';

commit;
