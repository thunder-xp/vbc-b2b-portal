begin;

create table public.partner_access_presets (
  code text primary key,
  name text not null,
  sort_order smallint not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint partner_access_preset_code_check
    check (code in ('full_partner_access', 'orders_only', 'catalog_only', 'custom'))
);

create table public.partner_access_preset_capabilities (
  preset_code text not null references public.partner_access_presets(code) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete restrict,
  primary key (preset_code, permission_id)
);

create table public.partner_company_access_policies (
  company_id uuid primary key references public.partner_companies(id) on delete cascade,
  preset_code text not null references public.partner_access_presets(code) on delete restrict,
  version integer not null default 1 check (version > 0),
  changed_by uuid references public.user_profiles(id) on delete restrict,
  change_note text,
  changed_at timestamptz not null default now(),
  constraint partner_company_access_note_check
    check (change_note is null or char_length(change_note) <= 500)
);

create table public.partner_company_capabilities (
  company_id uuid not null references public.partner_companies(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete restrict,
  enabled_by uuid references public.user_profiles(id) on delete restrict,
  enabled_at timestamptz not null default now(),
  primary key (company_id, permission_id)
);

create table public.partner_company_access_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  actor_user_id uuid references public.user_profiles(id) on delete restrict,
  event_type text not null check (event_type in ('default_assigned', 'access_updated')),
  previous_preset_code text,
  next_preset_code text not null,
  previous_version integer,
  next_version integer not null,
  enabled_permission_codes text[] not null default '{}',
  note text,
  correlation_id uuid not null,
  occurred_at timestamptz not null default now(),
  constraint partner_company_access_event_note_check
    check (note is null or char_length(note) <= 500)
);

create table public.partner_company_bootstrap_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.partner_companies(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed')),
  requested_domains text[] not null default array['commercial', 'orders', 'finance']::text[],
  correlation_id uuid not null,
  requested_by uuid references public.user_profiles(id) on delete restrict,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  safe_error_code text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  constraint partner_company_bootstrap_domains_check check (
    requested_domains = array['commercial', 'orders', 'finance']::text[]
  ),
  constraint partner_company_bootstrap_error_check check (
    safe_error_code is null or char_length(safe_error_code) <= 80
  )
);

create index partner_company_capabilities_permission_idx
  on public.partner_company_capabilities(permission_id, company_id);
create index partner_company_access_events_company_idx
  on public.partner_company_access_events(company_id, occurred_at desc);
create index partner_company_bootstrap_jobs_status_idx
  on public.partner_company_bootstrap_jobs(status, created_at);

alter table public.partner_access_presets enable row level security;
alter table public.partner_access_preset_capabilities enable row level security;
alter table public.partner_company_access_policies enable row level security;
alter table public.partner_company_capabilities enable row level security;
alter table public.partner_company_access_events enable row level security;
alter table public.partner_company_bootstrap_jobs enable row level security;

create or replace function public.prevent_partner_company_access_event_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Partner company access events are append-only.' using errcode = '55000';
end;
$$;

create trigger prevent_partner_company_access_event_mutation
before update or delete on public.partner_company_access_events
for each row execute function public.prevent_partner_company_access_event_mutation();

revoke all on public.partner_access_presets,
  public.partner_access_preset_capabilities,
  public.partner_company_access_policies,
  public.partner_company_capabilities,
  public.partner_company_access_events,
  public.partner_company_bootstrap_jobs from public, anon, authenticated;

insert into public.partner_access_presets(code, name, sort_order) values
  ('full_partner_access', 'Full access', 10),
  ('orders_only', 'Orders only', 20),
  ('catalog_only', 'Catalog only', 30),
  ('custom', 'Custom', 40)
on conflict (code) do update
set name = excluded.name, sort_order = excluded.sort_order, is_active = true;

update public.permissions
set category = case
  when code like 'purchase_templates.%' then 'purchasing'
  when code = 'proposal.send' then 'estimates'
  else category
end
where code like 'purchase_templates.%' or code = 'proposal.send';

-- Explicit released capability catalog. User administration remains role-only.
with preset_permissions(preset_code, permission_code) as (
  values
    ('full_partner_access', 'catalog.view'),
    ('full_partner_access', 'pricing.partner_price.view'),
    ('full_partner_access', 'pricing.retail_price.view'),
    ('full_partner_access', 'prices.view'),
    ('full_partner_access', 'stock.view'),
    ('full_partner_access', 'cart.manage'),
    ('full_partner_access', 'orders.create'),
    ('full_partner_access', 'orders.manage'),
    ('full_partner_access', 'orders.view'),
    ('full_partner_access', 'orders.view_company'),
    ('full_partner_access', 'finance.view_company'),
    ('full_partner_access', 'documents.view_company'),
    ('full_partner_access', 'specifications.manage'),
    ('full_partner_access', 'reservations.manage'),
    ('full_partner_access', 'estimates.view'),
    ('full_partner_access', 'estimates.manage'),
    ('full_partner_access', 'estimates.pricing.manage'),
    ('full_partner_access', 'estimates.generate_pdf'),
    ('full_partner_access', 'estimates.convert_to_cart'),
    ('full_partner_access', 'proposal_templates.manage'),
    ('full_partner_access', 'proposal.send'),
    ('full_partner_access', 'purchasing_lists.view'),
    ('full_partner_access', 'purchasing_lists.manage'),
    ('full_partner_access', 'purchase_templates.view'),
    ('full_partner_access', 'purchase_templates.create'),
    ('full_partner_access', 'purchase_templates.edit_own'),
    ('full_partner_access', 'purchase_templates.edit_company'),
    ('full_partner_access', 'purchase_templates.archive'),
    ('full_partner_access', 'purchase_templates.use'),
    ('full_partner_access', 'opportunities.view'),
    ('full_partner_access', 'campaigns.view'),
    ('orders_only', 'catalog.view'),
    ('orders_only', 'pricing.partner_price.view'),
    ('orders_only', 'pricing.retail_price.view'),
    ('orders_only', 'prices.view'),
    ('orders_only', 'stock.view'),
    ('orders_only', 'cart.manage'),
    ('orders_only', 'orders.create'),
    ('orders_only', 'orders.manage'),
    ('orders_only', 'orders.view'),
    ('orders_only', 'orders.view_company'),
    ('catalog_only', 'catalog.view'),
    ('catalog_only', 'pricing.partner_price.view'),
    ('catalog_only', 'pricing.retail_price.view'),
    ('catalog_only', 'prices.view'),
    ('catalog_only', 'stock.view'),
    ('catalog_only', 'documents.view_company')
)
insert into public.partner_access_preset_capabilities(preset_code, permission_id)
select source.preset_code, permission.id
from preset_permissions source
join public.permissions permission on permission.code = source.permission_code
where permission.scope in ('partner', 'both')
on conflict do nothing;

create or replace function public.assign_default_partner_company_access(
  p_company_id uuid,
  p_actor_user_id uuid default null,
  p_correlation_id uuid default gen_random_uuid(),
  p_enqueue_bootstrap boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  insert into public.partner_company_access_policies(
    company_id, preset_code, changed_by, change_note
  ) values (
    p_company_id, 'full_partner_access', p_actor_user_id, 'Initial partner access'
  ) on conflict (company_id) do nothing;

  if found then
    insert into public.partner_company_capabilities(company_id, permission_id, enabled_by)
    select p_company_id, capability.permission_id, p_actor_user_id
    from public.partner_access_preset_capabilities capability
    where capability.preset_code = 'full_partner_access'
    on conflict do nothing;

    insert into public.partner_company_access_events(
      company_id, actor_user_id, event_type, next_preset_code, next_version,
      enabled_permission_codes, note, correlation_id
    )
    select p_company_id, p_actor_user_id, 'default_assigned',
      'full_partner_access', 1,
      coalesce(array_agg(permission.code order by permission.code), '{}'),
      'Initial partner access', p_correlation_id
    from public.partner_access_preset_capabilities capability
    join public.permissions permission on permission.id = capability.permission_id
    where capability.preset_code = 'full_partner_access';

    if p_enqueue_bootstrap then
      insert into public.partner_company_bootstrap_jobs(
        company_id, correlation_id, requested_by
      ) values (
        p_company_id, p_correlation_id, p_actor_user_id
      ) on conflict (company_id) do nothing;
    end if;
  end if;
end;
$$;

create or replace function public.initialize_partner_company_access()
returns trigger language plpgsql security definer set search_path = public set row_security = off as $$
begin
  perform public.assign_default_partner_company_access(new.id, auth.uid(), gen_random_uuid(), true);
  return new;
end;
$$;

create trigger initialize_partner_company_access
after insert on public.partner_companies
for each row execute function public.initialize_partner_company_access();

do $$ declare company record; begin
  for company in select id from public.partner_companies loop
    perform public.assign_default_partner_company_access(company.id, null, gen_random_uuid(), false);
  end loop;
end $$;

create or replace function public.require_company_access_policy_for_active_membership()
returns trigger language plpgsql security definer set search_path = public set row_security = off as $$
begin
  if new.status = 'active' and not exists (
    select 1 from public.partner_company_access_policies policy
    where policy.company_id = new.company_id
  ) then
    raise exception 'company_access_policy_required' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger require_company_access_policy_for_active_membership
before insert or update on public.company_memberships
for each row execute function public.require_company_access_policy_for_active_membership();

create or replace function public.get_admin_partner_company_access(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public set row_security = off as $$
declare result jsonb;
begin
  if not public.has_internal_permission('admin.companies.view') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.partner_companies where id = p_company_id) then
    return null;
  end if;

  select jsonb_build_object(
    'companyId', policy.company_id,
    'presetCode', policy.preset_code,
    'version', policy.version,
    'changedAt', policy.changed_at,
    'changedBy', changer.full_name,
    'changeNote', policy.change_note,
    'canManage', public.has_internal_permission('admin.permissions.manage'),
    'presets', (
      select jsonb_agg(jsonb_build_object(
        'code', preset.code,
        'name', preset.name,
        'permissionCodes', coalesce((
          select jsonb_agg(permission.code order by permission.code)
          from public.partner_access_preset_capabilities capability
          join public.permissions permission on permission.id = capability.permission_id
          where capability.preset_code = preset.code
        ), '[]'::jsonb)
      ) order by preset.sort_order)
      from public.partner_access_presets preset where preset.is_active
    ),
    'capabilities', (
      select jsonb_agg(jsonb_build_object(
        'code', permission.code,
        'description', permission.description,
        'category', permission.category,
        'enabled', enabled.permission_id is not null
      ) order by permission.category, permission.code)
      from (
        select distinct p.* from public.permissions p
        join public.partner_access_preset_capabilities pc on pc.permission_id = p.id
      ) permission
      left join public.partner_company_capabilities enabled
        on enabled.company_id = p_company_id and enabled.permission_id = permission.id
      where permission.code not in ('company_users.manage', 'prices.view')
    ),
    'recentEvents', (
      select coalesce(jsonb_agg(to_jsonb(event_row) order by event_row."occurredAt" desc), '[]'::jsonb)
      from (
        select event.event_type as "eventType", event.next_preset_code as "presetCode",
          event.next_version as version, event.note, event.occurred_at as "occurredAt",
          actor.full_name as "actorName"
        from public.partner_company_access_events event
        left join public.user_profiles actor on actor.id = event.actor_user_id
        where event.company_id = p_company_id
        order by event.occurred_at desc limit 10
      ) event_row
    )
  ) into result
  from public.partner_company_access_policies policy
  left join public.user_profiles changer on changer.id = policy.changed_by
  where policy.company_id = p_company_id;
  return result;
end;
$$;

create or replace function public.update_admin_partner_company_access(
  p_company_id uuid,
  p_expected_version integer,
  p_preset_code text,
  p_enabled_permission_codes text[],
  p_note text,
  p_correlation_id uuid
)
returns jsonb language plpgsql security definer set search_path = public set row_security = off as $$
declare actor uuid := auth.uid(); current_policy public.partner_company_access_policies%rowtype;
declare requested_codes text[]; next_codes text[]; invalid_codes text[]; next_version integer;
begin
  if actor is null or not public.has_internal_permission('admin.permissions.manage') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_correlation_id is null or p_expected_version < 1
    or p_preset_code not in ('full_partner_access', 'orders_only', 'catalog_only', 'custom') then
    raise exception 'Invalid access update' using errcode = '22023';
  end if;

  select * into current_policy from public.partner_company_access_policies
  where company_id = p_company_id for update;
  if current_policy.company_id is null then raise exception 'Company access not found' using errcode = 'P0002'; end if;
  if current_policy.version <> p_expected_version then raise exception 'stale_company_access_version' using errcode = '40001'; end if;

  if p_preset_code = 'custom' then
    select coalesce(array_agg(distinct code order by code), '{}') into requested_codes
    from unnest(coalesce(p_enabled_permission_codes, '{}')) code;

    select coalesce(array_agg(code order by code), '{}') into invalid_codes
    from unnest(requested_codes) code
    where code in ('company_users.manage', 'prices.view') or not exists (
      select 1 from public.partner_access_preset_capabilities capability
      join public.permissions permission on permission.id = capability.permission_id
      where capability.preset_code = 'full_partner_access' and permission.code = code
    );
    if cardinality(invalid_codes) > 0 then
      raise exception 'Unsupported company capability' using errcode = '22023';
    end if;

    next_codes := requested_codes;
    if requested_codes && array['pricing.partner_price.view', 'pricing.retail_price.view']::text[] then
      next_codes := array(
        select distinct code
        from unnest(requested_codes || array['prices.view']) code
        order by code
      );
    end if;
  else
    select coalesce(array_agg(permission.code order by permission.code), '{}') into next_codes
    from public.partner_access_preset_capabilities capability
    join public.permissions permission on permission.id = capability.permission_id
    where capability.preset_code = p_preset_code;
  end if;

  next_version := current_policy.version + 1;
  delete from public.partner_company_capabilities where company_id = p_company_id;
  insert into public.partner_company_capabilities(company_id, permission_id, enabled_by)
  select p_company_id, permission.id, actor from public.permissions permission
  where permission.code = any(next_codes);

  update public.partner_company_access_policies
  set preset_code = p_preset_code, version = next_version, changed_by = actor,
    change_note = nullif(left(btrim(coalesce(p_note, '')), 500), ''), changed_at = now()
  where company_id = p_company_id;

  insert into public.partner_company_access_events(
    company_id, actor_user_id, event_type, previous_preset_code, next_preset_code,
    previous_version, next_version, enabled_permission_codes, note, correlation_id
  ) values (
    p_company_id, actor, 'access_updated', current_policy.preset_code, p_preset_code,
    current_policy.version, next_version, next_codes,
    nullif(left(btrim(coalesce(p_note, '')), 500), ''), p_correlation_id
  );
  return jsonb_build_object('version', next_version, 'correlationId', p_correlation_id);
end;
$$;

-- Onboarding's historical profile switches must not survive as permissions.
create or replace function public.clear_onboarding_derived_permission_overrides()
returns trigger language plpgsql security definer set search_path = public set row_security = off as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' and new.company_id is not null then
    delete from public.membership_permission_overrides override
    using public.company_memberships membership, public.permissions permission
    where membership.company_id = new.company_id
      and membership.user_id = new.user_profile_id
      and override.membership_id = membership.id
      and permission.id = override.permission_id
      and permission.code in (
        'pricing.partner_price.view', 'pricing.retail_price.view', 'cart.manage',
        'orders.create', 'orders.view_company', 'finance.view_company'
      );
  end if;
  return new;
end;
$$;

create trigger clear_onboarding_derived_permission_overrides
after update of status on public.access_requests
for each row execute function public.clear_onboarding_derived_permission_overrides();

create or replace function public.get_effective_company_permissions(p_company_id uuid)
returns table (
  user_id uuid, company_id uuid, profile_status text, company_status text,
  membership_id uuid, membership_status text, role_id uuid, role_code text,
  role_name text, is_internal_override boolean, role_permission_codes text[],
  allowed_override_codes text[], denied_override_codes text[], effective_permission_codes text[]
)
language plpgsql stable security definer set search_path = public set row_security = off as $$
declare target_user public.user_profiles%rowtype; target_company public.partner_companies%rowtype;
declare target_membership public.company_memberships%rowtype; target_role public.roles%rowtype;
declare internal_roles text[]; internal_codes text[]; role_codes text[] := '{}';
declare allowed_codes text[] := '{}'; denied_codes text[] := '{}'; company_codes text[] := '{}'; effective_codes text[] := '{}';
begin
  if auth.uid() is null or p_company_id is null then return; end if;
  select * into target_user from public.user_profiles where id = auth.uid() and status = 'active';
  if not found then return; end if;
  select * into target_company from public.partner_companies where id = p_company_id and status = 'active';
  if not found then return; end if;

  select context.internal_role_codes, context.effective_permission_codes into internal_roles, internal_codes
  from public.get_effective_internal_permissions() context where context.user_id = target_user.id;
  if found then
    return query select target_user.id, target_company.id, target_user.status, target_company.status,
      null::uuid, null::text, null::uuid, internal_roles[1], internal_roles[1], true,
      internal_codes, '{}'::text[], '{}'::text[], internal_codes;
    return;
  end if;

  -- Preserve the pre-existing legacy admin compatibility path.
  if target_user.user_type = 'admin' then
    select coalesce(array_agg(permission.code order by permission.code), '{}') into internal_codes
    from public.permissions permission;
    return query select target_user.id, target_company.id, target_user.status, target_company.status,
      null::uuid, null::text, null::uuid, 'novotech_admin'::text, 'Novotech Admin'::text, true,
      internal_codes, '{}'::text[], '{}'::text[], internal_codes;
    return;
  end if;

  select * into target_membership from public.company_memberships
  where user_id = target_user.id and company_id = target_company.id and status = 'active';
  if not found then return; end if;
  select * into target_role from public.roles where id = target_membership.role_id and scope = 'partner';
  if not found then return; end if;
  if not exists (
    select 1 from public.partner_company_access_policies policy
    where policy.company_id = target_company.id
  ) then return; end if;

  select coalesce(array_agg(permission.code order by permission.code), '{}') into role_codes
  from public.role_permissions rp join public.permissions permission on permission.id = rp.permission_id
  where rp.role_id = target_role.id and permission.scope in ('partner', 'both');
  select coalesce(array_agg(permission.code order by permission.code), '{}') into company_codes
  from public.partner_company_capabilities capability
  join public.permissions permission on permission.id = capability.permission_id
  where capability.company_id = target_company.id;
  select coalesce(array_agg(permission.code order by permission.code) filter (where override.effect = 'allow'), '{}'),
    coalesce(array_agg(permission.code order by permission.code) filter (where override.effect = 'deny'), '{}')
  into allowed_codes, denied_codes
  from public.membership_permission_overrides override
  join public.permissions permission on permission.id = override.permission_id
  where override.membership_id = target_membership.id and permission.scope in ('partner', 'both');

  select coalesce(array_agg(code order by code), '{}') into effective_codes from (
    select role_code.code
    from unnest(role_codes) role_code(code)
    where role_code.code = 'company_users.manage'
       or role_code.code = any(company_codes)
    except select unnest(denied_codes) code
  ) resolved;
  return query select target_user.id, target_company.id, target_user.status, target_company.status,
    target_membership.id, target_membership.status, target_role.id, target_role.code, target_role.name,
    false, role_codes, allowed_codes, denied_codes, effective_codes;
end;
$$;

revoke all on function public.assign_default_partner_company_access(uuid, uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.initialize_partner_company_access() from public, anon, authenticated;
revoke all on function public.require_company_access_policy_for_active_membership() from public, anon, authenticated;
revoke all on function public.clear_onboarding_derived_permission_overrides() from public, anon, authenticated;
revoke all on function public.prevent_partner_company_access_event_mutation() from public, anon, authenticated;
revoke all on function public.get_admin_partner_company_access(uuid) from public, anon;
revoke all on function public.update_admin_partner_company_access(uuid, integer, text, text[], text, uuid) from public, anon;
grant execute on function public.get_admin_partner_company_access(uuid) to authenticated;
grant execute on function public.update_admin_partner_company_access(uuid, integer, text, text[], text, uuid) to authenticated;
revoke all on function public.get_effective_company_permissions(uuid) from public, anon;
grant execute on function public.get_effective_company_permissions(uuid) to authenticated;

comment on table public.partner_company_access_policies is
  'Portal-owned, versioned company feature policy. Commercial tiers and 1C price types never select it.';
comment on table public.partner_company_bootstrap_jobs is
  'Server-only initial synchronization queue created atomically with a new partner company policy.';
comment on column public.partner_companies.onboarding_order_access is
  'Compatibility-only onboarding decision history; not an authorization source.';
comment on column public.partner_companies.onboarding_finance_access is
  'Compatibility-only onboarding decision history; not an authorization source.';
comment on function public.get_effective_company_permissions(uuid) is
  'Role grants intersect explicit company capabilities; membership deny wins. Commercial attributes are not inputs.';

commit;
