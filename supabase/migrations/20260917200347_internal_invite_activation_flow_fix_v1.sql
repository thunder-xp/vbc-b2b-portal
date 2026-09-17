begin;

alter table public.internal_user_provisioning_audit_events
  drop constraint if exists internal_user_provisioning_audit_events_event_type_check;
alter table public.internal_user_provisioning_audit_events
  add constraint internal_user_provisioning_audit_events_event_type_check
  check (event_type in ('requested', 'invite_sent', 'invite_reissued', 'activated', 'failed'));

create or replace function public.get_finance_operator_reissue_candidate(p_email text)
returns table(
  request_id uuid,
  email text,
  auth_user_id uuid,
  email_confirmed boolean,
  provisioning_status text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  normalized_target_email text := lower(btrim(coalesce(p_email, '')));
begin
  if actor_id is null or not public.has_internal_permission('admin.permissions.manage') then
    raise exception 'Internal user provisioning is not allowed.' using errcode = '42501';
  end if;
  if char_length(normalized_target_email) not between 3 and 320
    or normalized_target_email !~ '^[^[:space:]@]+@[^[:space:]@]+$' then
    raise exception 'A valid internal email is required.' using errcode = '22023';
  end if;

  return query
  select request.id, request.normalized_email, request.target_auth_user_id,
    auth_user.email_confirmed_at is not null, request.status
  from public.internal_user_provisioning_requests request
  join public.roles role on role.id = request.role_id
  join auth.users auth_user on auth_user.id = request.target_auth_user_id
  where request.normalized_email = normalized_target_email
    and request.status in ('invited', 'active')
    and role.code = 'novotech_finance'
    and role.scope = 'internal'
    and lower(btrim(auth_user.email)) = request.normalized_email
  order by request.created_at desc
  limit 1;
end;
$$;

create or replace function public.mark_finance_operator_invitation_reissued(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  target_request public.internal_user_provisioning_requests%rowtype;
begin
  if actor_id is null or not public.has_internal_permission('admin.permissions.manage') then
    raise exception 'Internal user provisioning is not allowed.' using errcode = '42501';
  end if;

  select * into target_request
  from public.internal_user_provisioning_requests request
  where request.id = p_request_id
  for update;
  if target_request.id is null then
    raise exception 'Internal user provisioning request was not found.' using errcode = 'P0002';
  end if;
  if target_request.status <> 'invited' or target_request.target_auth_user_id is null then
    raise exception 'Only a pending invited identity can be reissued.' using errcode = '55000';
  end if;

  update public.internal_user_provisioning_requests
  set invited_at = now(), safe_error_code = null
  where id = target_request.id;

  insert into public.internal_user_provisioning_audit_events(
    request_id, target_auth_user_id, actor_user_id, event_type, safe_detail
  ) values (
    target_request.id, target_request.target_auth_user_id, actor_id,
    'invite_reissued', 'supabase_auth'
  );
  return target_request.id;
end;
$$;

revoke all on function public.get_finance_operator_reissue_candidate(text) from public, anon, authenticated;
revoke all on function public.mark_finance_operator_invitation_reissued(uuid) from public, anon, authenticated;
grant execute on function public.get_finance_operator_reissue_candidate(text) to authenticated;
grant execute on function public.mark_finance_operator_invitation_reissued(uuid) to authenticated;

commit;
