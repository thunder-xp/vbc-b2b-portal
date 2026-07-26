begin;

create or replace function public.can_manage_company_users(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.has_internal_permission('company_users.manage')
    or public.has_permission(p_company_id, 'company_users.manage');
$$;

create or replace function public.list_admin_partner_companies(
  p_search text default null,
  p_limit integer default 100
)
returns table (id uuid, display_name text)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select company.id, company.display_name
  from public.partner_companies company
  where p_limit between 1 and 100
    and public.has_internal_permission('admin.users.view')
    and (
      nullif(trim(p_search), '') is null
      or company.display_name ilike '%' || trim(p_search) || '%'
    )
  order by company.display_name
  limit p_limit;
$$;

create or replace function public.record_company_admin_intervention(
  p_company_id uuid,
  p_target_user_id uuid,
  p_target_invitation_id uuid,
  p_operation text
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if public.has_internal_permission('company_users.manage') then
    insert into public.company_user_events (
      company_id, target_user_id, target_invitation_id, actor_user_id,
      event_type, safe_payload
    ) values (
      p_company_id, p_target_user_id, p_target_invitation_id, auth.uid(),
      'admin_intervention',
      jsonb_build_object('operation', left(p_operation, 100))
    );
  end if;
end;
$$;

revoke all on function public.can_manage_company_users(uuid) from public, anon;
revoke all on function public.list_admin_partner_companies(text, integer)
  from public, anon;
revoke all on function public.record_company_admin_intervention(uuid, uuid, uuid, text)
  from public, anon;
grant execute on function public.can_manage_company_users(uuid) to authenticated;
grant execute on function public.list_admin_partner_companies(text, integer)
  to authenticated;

commit;
