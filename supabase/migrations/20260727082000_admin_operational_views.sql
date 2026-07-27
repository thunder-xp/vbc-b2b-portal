begin;

create or replace function public.get_admin_operations_list(
  p_view text,
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  required_permission text;
  page_number integer := greatest(coalesce(p_page, 1), 1);
  page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 50);
begin
  required_permission := case p_view
    when 'orders' then 'admin.orders.view'
    when 'shipments' then 'admin.shipments.view'
    when 'reservations' then 'reservations.review'
    else null
  end;
  if required_permission is null
    or not public.has_internal_permission(required_permission) then
    raise exception 'Operational administration access is not allowed.'
      using errcode = '42501';
  end if;

  if p_view in ('orders', 'shipments') then
    return (
      with filtered as (
        select history.*, company.display_name company_name,
          count(*) over() total_count
        from public.partner_order_history history
        join public.partner_companies company on company.id = history.company_id
        where p_view = 'orders'
          or (
            history.partner_visible
            and not history.one_c_deletion_mark
            and history.one_c_delivery_date is not null
          )
      ),
      page_rows as (
        select * from filtered
        order by case when p_view = 'shipments' then one_c_delivery_date end,
          one_c_document_date desc nulls last, id
        limit page_size offset (page_number - 1) * page_size
      )
      select jsonb_build_object(
        'records', coalesce(jsonb_agg(jsonb_build_object(
          'id', id,
          'company', company_name,
          'reference', coalesce(external_1c_order_number, portal_order_id::text),
          'date', one_c_document_date,
          'plannedDate', one_c_delivery_date,
          'status', coalesce(one_c_state_code, 'unknown'),
          'posted', one_c_posted,
          'positions', position_count,
          'units', total_unit_count,
          'syncAt', one_c_last_synced_at,
          'warning', hidden_reason
        ) order by case when p_view = 'shipments' then one_c_delivery_date end,
          one_c_document_date desc nulls last), '[]'::jsonb),
        'total', coalesce(max(total_count), 0),
        'page', page_number,
        'pageSize', page_size
      ) from page_rows
    );
  end if;

  return (
    with filtered as (
      select request.*, company.display_name company_name,
        count(*) over() total_count,
        (select count(*) from public.reservation_request_items item
          where item.reservation_request_id = request.id) item_count
      from public.reservation_requests request
      join public.partner_companies company on company.id = request.company_id
    ),
    page_rows as (
      select * from filtered order by created_at desc, id
      limit page_size offset (page_number - 1) * page_size
    )
    select jsonb_build_object(
      'records', coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'company', company_name,
        'reference', specification_id::text, 'date', created_at,
        'plannedDate', requested_delivery_date, 'status', status,
        'posted', false, 'positions', item_count, 'units', 0,
        'syncAt', reviewed_at, 'warning', manager_comment
      ) order by created_at desc), '[]'::jsonb),
      'total', coalesce(max(total_count), 0),
      'page', page_number,
      'pageSize', page_size
    ) from page_rows
  );
end;
$$;

revoke all on function public.get_admin_operations_list(text, integer, integer)
  from public, anon;
grant execute on function public.get_admin_operations_list(text, integer, integer)
  to authenticated;

commit;
