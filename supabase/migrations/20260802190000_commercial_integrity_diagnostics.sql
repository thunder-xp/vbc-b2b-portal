begin;

create or replace function public.enqueue_partner_opportunity_from_company_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  company uuid;
begin
  if tg_table_name in ('carts', 'purchasing_lists', 'purchase_templates', 'partner_order_history') then
    company := coalesce(new.company_id, old.company_id);
  elsif tg_table_name = 'cart_items' then
    select value.company_id into company
    from public.carts value
    where value.id = coalesce(new.cart_id, old.cart_id);
  elsif tg_table_name = 'purchasing_list_items' then
    select value.company_id into company
    from public.purchasing_lists value
    where value.id = coalesce(new.list_id, old.list_id);
  elsif tg_table_name = 'purchase_template_items' then
    select value.company_id into company
    from public.purchase_templates value
    where value.id = coalesce(new.template_id, old.template_id);
  elsif tg_table_name = 'partner_order_history_items' then
    select value.company_id into company
    from public.partner_order_history value
    where value.id = coalesce(new.order_history_id, old.order_history_id);
  end if;

  if company is not null then
    perform public.enqueue_partner_commercial_opportunity_company(company, tg_table_name);
  end if;
  return null;
end;
$$;

revoke all on function public.enqueue_partner_opportunity_from_company_source()
from public, anon, authenticated;

create or replace function public.diagnose_stock_publication_failure(p_sync_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  error_state text;
  error_message text;
  error_detail text;
  error_hint text;
  error_context text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Stock publication diagnostics are server-only.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.stock_sync_state state
    where state.id = 'exact_stock'
      and state.last_failed_sync_id = p_sync_id
      and state.scan_complete = true
  ) then
    raise exception 'Failed stock synchronization is unavailable.' using errcode = 'P0002';
  end if;

  begin
    perform public.publish_exact_stock_snapshot(p_sync_id);
    raise exception 'commercial_integrity_rollback_success' using errcode = 'P0001';
  exception when others then
    get stacked diagnostics
      error_state = returned_sqlstate,
      error_message = message_text,
      error_detail = pg_exception_detail,
      error_hint = pg_exception_hint,
      error_context = pg_exception_context;
    if error_state = 'P0001' and error_message = 'commercial_integrity_rollback_success' then
      return jsonb_build_object('would_succeed', true);
    end if;
    return jsonb_build_object(
      'would_succeed', false,
      'code', error_state,
      'message', left(coalesce(error_message, ''), 500),
      'details', left(coalesce(error_detail, ''), 500),
      'hint', left(coalesce(error_hint, ''), 500),
      'context', left(coalesce(error_context, ''), 1000)
    );
  end;
end;
$$;

revoke all on function public.diagnose_stock_publication_failure(uuid)
from public, anon, authenticated;
grant execute on function public.diagnose_stock_publication_failure(uuid)
to service_role;

comment on function public.diagnose_stock_publication_failure(uuid) is
  'Runs failed stock publication in a rollback-only subtransaction and returns bounded database diagnostics to service_role.';

commit;
