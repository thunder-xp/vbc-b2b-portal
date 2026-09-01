begin;

do $$
declare
  actor_id uuid;
  manager_role_id uuid;
  purpose_under_test constant text := 'partner_price_usd_to_mdl';
  effective_ts timestamptz := date_trunc('day', now());
  initial_result jsonb;
  replay_result jsonb;
  evidence_change_result jsonb;
  rate_change_result jsonb;
  initial_row_count bigint;
  initial_event_count bigint;
begin
  select profile.id into actor_id
  from public.user_profiles profile
  where profile.status = 'active'
    and profile.user_type in ('internal', 'admin')
  order by profile.created_at
  limit 1;

  if actor_id is null then
    raise exception 'Runtime fixture requires an active internal user.';
  end if;

  if not exists (
    select 1
    from public.internal_user_role_assignments assignment
    where assignment.user_id = actor_id
      and assignment.revoked_at is null
  ) then
    select role.id into manager_role_id
    from public.roles role
    join public.role_permissions role_permission on role_permission.role_id = role.id
    join public.permissions permission
      on permission.id = role_permission.permission_id
     and permission.code = 'commercial_rates.manage'
    where role.scope = 'internal'
    order by role.code
    limit 1;

    insert into public.internal_user_role_assignments (user_id, role_id, assigned_by)
    values (actor_id, manager_role_id, actor_id);
  end if;

  perform set_config('request.jwt.claim.sub', actor_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', actor_id::text, 'role', 'authenticated')::text,
    true
  );

  initial_result := public.publish_manual_commercial_exchange_rate_v2(
    purpose_under_test,
    19.12345678,
    effective_ts + interval '12 hours',
    'Runtime idempotency evidence',
    null
  );

  select count(*) into initial_row_count
  from public.commercial_exchange_rates
  where purpose = purpose_under_test;

  select count(*) into initial_event_count
  from public.commercial_exchange_rate_audit_events
  where rate_id = (initial_result ->> 'id')::uuid;

  replay_result := public.publish_manual_commercial_exchange_rate_v2(
    purpose_under_test,
    19.12345678,
    effective_ts,
    '  Runtime idempotency evidence  ',
    ''
  );

  if replay_result ->> 'id' <> initial_result ->> 'id' then
    raise exception 'Semantic replay created a new version.';
  end if;

  if (select count(*) from public.commercial_exchange_rates where purpose = purpose_under_test) <> initial_row_count
    or (select count(*) from public.commercial_exchange_rate_audit_events where rate_id = (initial_result ->> 'id')::uuid) <> initial_event_count
  then
    raise exception 'Semantic replay changed immutable history or audit events.';
  end if;

  evidence_change_result := public.publish_manual_commercial_exchange_rate_v2(
    purpose_under_test,
    19.12345678,
    effective_ts,
    'Runtime idempotency evidence changed',
    null
  );

  if evidence_change_result ->> 'id' = initial_result ->> 'id'
    or evidence_change_result ->> 'previous_rate_id' <> initial_result ->> 'id'
  then
    raise exception 'Material evidence change did not create a linked immutable version.';
  end if;

  rate_change_result := public.publish_manual_commercial_exchange_rate_v2(
    purpose_under_test,
    19.22345678,
    effective_ts,
    'Runtime idempotency evidence changed',
    null
  );

  if rate_change_result ->> 'id' = evidence_change_result ->> 'id'
    or rate_change_result ->> 'previous_rate_id' <> evidence_change_result ->> 'id'
  then
    raise exception 'Material rate change did not create a linked immutable version.';
  end if;
end;
$$;

rollback;
