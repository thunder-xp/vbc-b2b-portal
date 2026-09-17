begin;

insert into auth.users(id, aud, role, email, email_confirmed_at, created_at, updated_at)
values ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin@runtime.test', now(), now(), now());

insert into public.user_profiles(id, email, full_name, status, user_type)
values ('10000000-0000-4000-8000-000000000001', 'admin@runtime.test', 'Runtime Admin', 'active', 'internal');

insert into public.internal_user_role_assignments(user_id, role_id, assigned_by)
select '10000000-0000-4000-8000-000000000001', role.id, null
from public.roles role where role.code = 'novotech_admin';

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
create temporary table runtime_request as
select * from public.begin_finance_operator_provisioning(
  'finance@novotech.local', 'finance', 'Runtime finance operator acceptance'
);

insert into auth.users(id, aud, role, email, email_confirmed_at, created_at, updated_at)
values ('20000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'finance@novotech.local', null, now(), now());

select public.mark_finance_operator_invited(
  (select request_id from runtime_request),
  '20000000-0000-4000-8000-000000000002'
);

create temporary table runtime_reissue as
select * from public.get_finance_operator_reissue_candidate('finance@novotech.local');

do $$
begin
  if (select count(*) from runtime_reissue) <> 1
    or (select auth_user_id from runtime_reissue) <> '20000000-0000-4000-8000-000000000002'
    or (select email_confirmed from runtime_reissue)
    or (select provisioning_status from runtime_reissue) <> 'invited' then
    raise exception 'Governed reissue candidate did not preserve the exact pending Auth identity.';
  end if;
end;
$$;

select public.mark_finance_operator_invitation_reissued(
  (select request_id from runtime_request)
);

do $$
begin
  if exists (
    select 1 from public.user_profiles profile
    where profile.id = '20000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'Finance profile was activated before verified acceptance.';
  end if;
end;
$$;

update auth.users set email_confirmed_at = now()
where id = '20000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
select public.activate_invited_finance_operator();
select public.activate_invited_finance_operator();

do $$
declare
  role_code text;
  assignment_count integer;
  audit_count integer;
begin
  select role.code, count(*) over() into role_code, assignment_count
  from public.internal_user_role_assignments assignment
  join public.roles role on role.id = assignment.role_id
  where assignment.user_id = '20000000-0000-4000-8000-000000000002'
    and assignment.revoked_at is null;
  if role_code is distinct from 'novotech_finance' or assignment_count <> 1 then
    raise exception 'Finance operator single-role activation failed.';
  end if;
  if not public.has_internal_permission('admin.payments.refund') then
    raise exception 'Finance operator refund permission is absent.';
  end if;
  select count(*) into audit_count
  from public.internal_user_provisioning_audit_events event
  where event.request_id = (select request_id from runtime_request)
    and event.event_type in ('requested', 'invite_sent', 'invite_reissued', 'activated');
  if audit_count <> 4 then
    raise exception 'Provisioning audit is incomplete.';
  end if;
  if (select count(*) from public.internal_role_assignment_audit_events event
      where event.target_user_id = '20000000-0000-4000-8000-000000000002'
        and event.event_type = 'assigned') <> 1 then
    raise exception 'Role assignment audit is incomplete.';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
do $$
begin
  if (select role.code from public.internal_user_role_assignments assignment
      join public.roles role on role.id = assignment.role_id
      where assignment.user_id = '10000000-0000-4000-8000-000000000001'
        and assignment.revoked_at is null) <> 'novotech_admin' then
    raise exception 'Current admin role changed.';
  end if;
end;
$$;

rollback;
