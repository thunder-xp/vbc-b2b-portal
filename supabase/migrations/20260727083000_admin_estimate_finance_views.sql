begin;

create or replace function public.get_admin_support_list(
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
  permission_code text;
  page_number integer := greatest(coalesce(p_page, 1), 1);
  page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 50);
begin
  permission_code := case p_view
    when 'estimates' then 'admin.estimates.view'
    when 'finance' then 'admin.finance.view'
    else null
  end;
  if permission_code is null
    or not public.has_internal_permission(permission_code) then
    raise exception 'Support administration access is not allowed.'
      using errcode = '42501';
  end if;

  if p_view = 'estimates' then
    return (
      with rows as (
        select estimate.id, company.display_name company,
          estimate.estimate_number reference, estimate.name title,
          estimate.status, estimate.updated_at,
          (select count(*) from public.estimate_items item
            where item.estimate_id = estimate.id) item_count,
          (select count(*) from public.estimate_proposal_versions version
            where version.estimate_id = estimate.id) version_count,
          (select coalesce(max(delivery.status), 'not_sent')
            from public.estimate_proposal_deliveries delivery
            where delivery.estimate_id = estimate.id) delivery_status,
          count(*) over() total_count
        from public.estimates estimate
        join public.partner_companies company on company.id = estimate.company_id
      ),
      page_rows as (
        select * from rows order by updated_at desc, id
        limit page_size offset (page_number - 1) * page_size
      )
      select jsonb_build_object(
        'records', coalesce(jsonb_agg(jsonb_build_object(
          'id', id, 'company', company, 'reference', reference,
          'title', title, 'status', status, 'updatedAt', updated_at,
          'primaryCount', item_count, 'secondaryCount', version_count,
          'safeState', delivery_status
        ) order by updated_at desc), '[]'::jsonb),
        'total', coalesce(max(total_count), 0),
        'page', page_number, 'pageSize', page_size
      ) from page_rows
    );
  end if;

  return (
    with rows as (
      select company.id, company.display_name company,
        coalesce(company.external_1c_code, company.external_1c_id, 'not_mapped') reference,
        company.display_name title,
        coalesce(state.status, 'never_run') status,
        coalesce(state.updated_at, company.updated_at) updated_at,
        coalesce(state.published_count, 0) primary_count,
        coalesce(state.excluded_deleted_count, 0) secondary_count,
        state.last_error_code safe_state,
        count(*) over() total_count
      from public.partner_companies company
      left join public.partner_finance_sync_state state
        on state.company_id = company.id
      where company.status = 'active'
    ),
    page_rows as (
      select * from rows order by company, id
      limit page_size offset (page_number - 1) * page_size
    )
    select jsonb_build_object(
      'records', coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'company', company, 'reference', reference,
        'title', title, 'status', status, 'updatedAt', updated_at,
        'primaryCount', primary_count, 'secondaryCount', secondary_count,
        'safeState', safe_state
      ) order by company), '[]'::jsonb),
      'total', coalesce(max(total_count), 0),
      'page', page_number, 'pageSize', page_size
    ) from page_rows
  );
end;
$$;

revoke all on function public.get_admin_support_list(text, integer, integer)
  from public, anon;
grant execute on function public.get_admin_support_list(text, integer, integer)
  to authenticated;

commit;
