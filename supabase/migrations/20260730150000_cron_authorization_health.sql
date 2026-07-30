begin;

create table public.cron_route_health (
  route text primary key,
  last_invoked_at timestamptz not null default now(),
  last_authorized_at timestamptz,
  last_denied_at timestamptz,
  last_auth_category text not null,
  last_caller_type text not null,
  last_deployment_sha text,
  last_request_id text,
  authorized_count bigint not null default 0,
  denied_count bigint not null default 0,
  constraint cron_route_health_route_check
    check (route like '/api/%' and length(route) <= 160),
  constraint cron_route_health_category_check
    check (last_auth_category in (
      'authorized', 'missing_configuration', 'missing_bearer', 'invalid_bearer'
    )),
  constraint cron_route_health_caller_check
    check (last_caller_type in ('vercel_cron', 'manual'))
);

alter table public.cron_route_health enable row level security;
revoke all on table public.cron_route_health from public, anon, authenticated;
grant select, insert, update on table public.cron_route_health to service_role;

create or replace function public.record_cron_route_invocation(
  p_route text,
  p_authorized boolean,
  p_auth_category text,
  p_caller_type text,
  p_deployment_sha text default null,
  p_request_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'CRON_HEALTH_PERMISSION_DENIED' using errcode = '42501';
  end if;
  if p_route not like '/api/%' or length(p_route) > 160
    or p_auth_category not in (
      'authorized', 'missing_configuration', 'missing_bearer', 'invalid_bearer'
    )
    or p_caller_type not in ('vercel_cron', 'manual') then
    raise exception 'CRON_HEALTH_INVALID_INPUT' using errcode = '22023';
  end if;

  insert into public.cron_route_health(
    route,
    last_invoked_at,
    last_authorized_at,
    last_denied_at,
    last_auth_category,
    last_caller_type,
    last_deployment_sha,
    last_request_id,
    authorized_count,
    denied_count
  ) values (
    p_route,
    now(),
    case when p_authorized then now() end,
    case when not p_authorized then now() end,
    p_auth_category,
    p_caller_type,
    nullif(left(coalesce(p_deployment_sha, ''), 64), ''),
    nullif(left(coalesce(p_request_id, ''), 128), ''),
    case when p_authorized then 1 else 0 end,
    case when p_authorized then 0 else 1 end
  )
  on conflict (route) do update
  set last_invoked_at = excluded.last_invoked_at,
      last_authorized_at = coalesce(
        excluded.last_authorized_at,
        cron_route_health.last_authorized_at
      ),
      last_denied_at = coalesce(
        excluded.last_denied_at,
        cron_route_health.last_denied_at
      ),
      last_auth_category = excluded.last_auth_category,
      last_caller_type = excluded.last_caller_type,
      last_deployment_sha = excluded.last_deployment_sha,
      last_request_id = excluded.last_request_id,
      authorized_count = cron_route_health.authorized_count
        + excluded.authorized_count,
      denied_count = cron_route_health.denied_count + excluded.denied_count;
end;
$$;

revoke all on function public.record_cron_route_invocation(
  text, boolean, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.record_cron_route_invocation(
  text, boolean, text, text, text, text
) to service_role;

create or replace function public.get_admin_cron_route_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.has_internal_permission('admin.integrations.view') then
    raise exception 'Cron diagnostics access denied.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'route', health.route,
      'lastInvokedAt', health.last_invoked_at,
      'lastAuthorizedAt', health.last_authorized_at,
      'lastDeniedAt', health.last_denied_at,
      'lastAuthCategory', health.last_auth_category,
      'lastCallerType', health.last_caller_type,
      'lastDeploymentSha', health.last_deployment_sha,
      'authorizedCount', health.authorized_count,
      'deniedCount', health.denied_count
    ) order by health.route)
    from public.cron_route_health health
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_admin_cron_route_health()
  from public, anon;
grant execute on function public.get_admin_cron_route_health()
  to authenticated;

commit;
