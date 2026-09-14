begin;

alter function public.get_admin_integration_center()
  rename to get_admin_integration_center_base;

revoke all on function public.get_admin_integration_center_base()
from public, anon, authenticated, service_role;

create or replace function public.get_admin_integration_center()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  center jsonb;
  domains jsonb;
begin
  center := public.get_admin_integration_center_base();

  select coalesce(jsonb_agg(
    case
      when item.value->>'domain' = 'prices' then item.value || jsonb_build_object(
        'pricePublication', coalesce((
          select jsonb_build_object(
            'stagedRows', coalesce(state.rows_staged, 0),
            'unchanged', coalesce(state.delta_unchanged, 0),
            'inserted', coalesce(state.delta_inserted, 0),
            'updated', coalesce(state.delta_updated, 0),
            'removed', coalesce(state.delta_removed, 0),
            'batches', coalesce(state.publication_batches, 0),
            'databaseDurationMs', coalesce(state.publication_db_duration_ms, 0),
            'timeoutBudgetMs', coalesce(state.publication_timeout_budget_ms, 8000),
            'headroomPercent', coalesce(state.publication_headroom_percent, 100),
            'warning', coalesce(state.publication_warning, false)
          )
          from public.price_sync_state state
          where state.id = 'product_prices'
        ), jsonb_build_object(
          'stagedRows', 0,
          'unchanged', 0,
          'inserted', 0,
          'updated', 0,
          'removed', 0,
          'batches', 0,
          'databaseDurationMs', 0,
          'timeoutBudgetMs', 8000,
          'headroomPercent', 100,
          'warning', false
        ))
      )
      else item.value
    end
    order by item.ordinality
  ), '[]'::jsonb)
  into domains
  from jsonb_array_elements(center->'domains') with ordinality as item(value, ordinality);

  return jsonb_set(center, '{domains}', domains);
end;
$$;

revoke all on function public.get_admin_integration_center()
from public, anon, authenticated, service_role;
grant execute on function public.get_admin_integration_center()
to authenticated;

comment on function public.get_admin_integration_center() is
  'Admin integration center including partner-price delta and timeout-headroom diagnostics.';
comment on function public.get_admin_integration_center_base() is
  'Server-only canonical integration-center projection wrapped by the operator diagnostics RPC.';

commit;
