begin;

alter table public.partner_orders
  add column if not exists authoritative_presence text not null default 'pending_initial_confirmation',
  add column if not exists last_authority_verified_at timestamptz null,
  add column if not exists last_authority_result text null;

update public.partner_orders
set authoritative_presence = 'unknown'
where status = 'submitted'
  and integration_status = 'confirmed'
  and external_1c_ref is not null
  and authoritative_presence = 'pending_initial_confirmation';

alter table public.partner_orders
  add constraint partner_orders_authoritative_presence_check
    check (authoritative_presence in (
      'pending_initial_confirmation',
      'confirmed_present_in_1c',
      'confirmed_missing_from_1c',
      'unknown'
    )),
  add constraint partner_orders_last_authority_result_check
    check (last_authority_result is null or last_authority_result in (
      'exists', 'deletion_marked', 'absent', 'unknown'
    )),
  add constraint partner_orders_missing_authority_shape_check
    check (
      authoritative_presence <> 'confirmed_missing_from_1c'
      or (
        status = 'submitted'
        and integration_status = 'confirmed'
        and external_1c_ref is not null
      )
    );

create index if not exists partner_orders_company_external_ref_idx
  on public.partner_orders(company_id, external_1c_ref)
  where external_1c_ref is not null;

create index if not exists partner_orders_authority_candidate_idx
  on public.partner_orders(company_id, last_authority_verified_at, confirmed_at, id)
  where status = 'submitted'
    and integration_status = 'confirmed'
    and external_1c_ref is not null;

create table public.partner_order_authority_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.partner_orders(id) on delete restrict,
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  sync_id uuid not null,
  result text not null check (result in ('exists', 'deletion_marked', 'absent')),
  previous_presence text not null check (previous_presence in (
    'pending_initial_confirmation',
    'confirmed_present_in_1c',
    'confirmed_missing_from_1c',
    'unknown'
  )),
  current_presence text not null check (current_presence in (
    'confirmed_present_in_1c', 'confirmed_missing_from_1c'
  )),
  verified_at timestamptz not null,
  fingerprint text not null unique,
  created_at timestamptz not null default now()
);

create index partner_order_authority_events_order_idx
  on public.partner_order_authority_events(order_id, verified_at desc, id desc);

create or replace function public.prevent_partner_order_authority_event_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Partner order authority events are append-only.' using errcode = '55000';
end;
$$;

create trigger prevent_partner_order_authority_event_mutation
before update or delete on public.partner_order_authority_events
for each row execute function public.prevent_partner_order_authority_event_mutation();

alter table public.partner_order_authority_events enable row level security;
revoke all on table public.partner_order_authority_events from public, anon, authenticated;
grant select, insert on table public.partner_order_authority_events to service_role;

create or replace function public.set_partner_order_confirmed_authority()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'submitted'
    and new.integration_status = 'confirmed'
    and new.external_1c_ref is not null
    and (
      tg_op = 'INSERT'
      or old.status is distinct from new.status
      or old.integration_status is distinct from new.integration_status
      or old.external_1c_ref is distinct from new.external_1c_ref
    ) then
    new.authoritative_presence := 'confirmed_present_in_1c';
    new.last_authority_verified_at := coalesce(new.confirmed_at, now());
    new.last_authority_result := 'exists';
  end if;
  return new;
end;
$$;

create trigger set_partner_order_confirmed_authority
before insert or update on public.partner_orders
for each row execute function public.set_partner_order_confirmed_authority();

create or replace function public.get_partner_order_authority_candidates(
  p_company_id uuid,
  p_limit integer default 25
)
returns table(
  source_kind text,
  portal_order_id uuid,
  external_1c_order_ref text,
  one_c_source_version text,
  partner_visible boolean,
  hidden_reason text,
  one_c_deletion_mark boolean,
  currency_code text
)
language sql
security definer
set search_path = public
set row_security = off
as $$
  with history_candidates as (
    select
      'history'::text as source_kind,
      history.portal_order_id,
      history.external_1c_order_ref,
      history.one_c_source_version,
      history.partner_visible,
      history.hidden_reason,
      history.one_c_deletion_mark,
      history.currency_code,
      case
        when history.partner_visible
          and not history.one_c_deletion_mark
          and (not history.one_c_posted or history.one_c_state_code is distinct from 'completed')
          then 1
        when history.last_existence_verified_at is null then 2
        when history.hidden_reason is not null then 3
        else 4
      end as priority,
      history.last_existence_verified_at as last_checked_at,
      history.one_c_document_date as business_date,
      history.id as stable_id
    from public.partner_order_history history
    where history.company_id = p_company_id
  ), portal_candidates as (
    select distinct on (lower(portal.external_1c_ref))
      'portal_order'::text as source_kind,
      portal.id as portal_order_id,
      portal.external_1c_ref as external_1c_order_ref,
      null::text as one_c_source_version,
      portal.authoritative_presence <> 'confirmed_missing_from_1c' as partner_visible,
      case portal.last_authority_result
        when 'deletion_marked' then 'deleted_in_1c'
        when 'absent' then 'missing_from_1c'
        else null
      end as hidden_reason,
      portal.last_authority_result = 'deletion_marked' as one_c_deletion_mark,
      portal.currency_code,
      case
        when portal.last_authority_verified_at is null
          or portal.authoritative_presence = 'unknown' then 0
        when portal.authoritative_presence = 'confirmed_missing_from_1c' then 2
        else 1
      end as priority,
      portal.last_authority_verified_at as last_checked_at,
      coalesce(portal.external_1c_date, portal.confirmed_at, portal.created_at) as business_date,
      portal.id as stable_id
    from public.partner_orders portal
    where portal.company_id = p_company_id
      and portal.status = 'submitted'
      and portal.integration_status = 'confirmed'
      and portal.external_1c_ref is not null
      and not exists (
        select 1
        from public.partner_order_history history
        where history.company_id = portal.company_id
          and (
            history.portal_order_id = portal.id
            or lower(history.external_1c_order_ref) = lower(portal.external_1c_ref)
          )
      )
    order by lower(portal.external_1c_ref), portal.confirmed_at desc nulls last, portal.id
  ), candidates as (
    select * from history_candidates
    union all
    select * from portal_candidates
  )
  select
    candidates.source_kind,
    candidates.portal_order_id,
    candidates.external_1c_order_ref,
    candidates.one_c_source_version,
    candidates.partner_visible,
    candidates.hidden_reason,
    candidates.one_c_deletion_mark,
    candidates.currency_code
  from candidates
  where (select auth.role()) = 'service_role'
  order by
    candidates.priority,
    candidates.last_checked_at asc nulls first,
    candidates.business_date desc,
    candidates.stable_id
  limit greatest(1, least(p_limit, 25));
$$;

create or replace function public.apply_partner_order_authority_batch(
  p_company_id uuid,
  p_sync_id uuid,
  p_verified_at timestamptz,
  p_results jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  history_result jsonb;
  portal_transitions jsonb := '[]'::jsonb;
  portal_updated integer := 0;
  portal_hidden integer := 0;
  portal_restored integer := 0;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'Partner order authority reconciliation is server-only.' using errcode = '42501';
  end if;
  if p_company_id is null or p_sync_id is null or p_verified_at is null
    or jsonb_typeof(p_results) <> 'array'
    or jsonb_array_length(p_results) < 1
    or jsonb_array_length(p_results) > 25 then
    raise exception 'Partner order authority batch is invalid.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_results) source
    where nullif(btrim(source->>'external_1c_order_ref'), '') is null
      or source->>'status' not in ('exists', 'deletion_marked', 'absent', 'unknown')
  ) or (
    select count(*)
    from jsonb_array_elements(p_results)
  ) <> (
    select count(distinct lower(source->>'external_1c_order_ref'))
    from jsonb_array_elements(p_results) source
  ) then
    raise exception 'Partner order authority batch is invalid.' using errcode = '22023';
  end if;

  history_result := public.apply_partner_order_history_existence_batch(
    p_company_id,
    p_sync_id,
    p_verified_at,
    p_results
  );

  with source as materialized (
    select
      lower(value->>'external_1c_order_ref') as external_ref,
      value->>'status' as result
    from jsonb_array_elements(p_results)
  ), existing as materialized (
    select
      portal.id,
      portal.company_id,
      portal.authoritative_presence as previous_presence,
      source.result
    from public.partner_orders portal
    join source on source.external_ref = lower(portal.external_1c_ref)
    where portal.company_id = p_company_id
      and portal.status = 'submitted'
      and portal.integration_status = 'confirmed'
      and portal.external_1c_ref is not null
    for update of portal
  ), updated as (
    update public.partner_orders portal
    set
      authoritative_presence = case
        when existing.result = 'exists' then 'confirmed_present_in_1c'
        when existing.result in ('deletion_marked', 'absent') then 'confirmed_missing_from_1c'
        else portal.authoritative_presence
      end,
      last_authority_verified_at = p_verified_at,
      last_authority_result = existing.result
    from existing
    where portal.id = existing.id
    returning
      portal.id,
      portal.company_id,
      existing.result,
      existing.previous_presence,
      portal.authoritative_presence as current_presence
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'order_id', updated.id,
    'company_id', updated.company_id,
    'result', updated.result,
    'previous_presence', updated.previous_presence,
    'current_presence', updated.current_presence
  )), '[]'::jsonb)
  into portal_transitions
  from updated;

  select
    count(*),
    count(*) filter (
      where transition->>'previous_presence' <> 'confirmed_missing_from_1c'
        and transition->>'current_presence' = 'confirmed_missing_from_1c'
    ),
    count(*) filter (
      where transition->>'previous_presence' = 'confirmed_missing_from_1c'
        and transition->>'current_presence' = 'confirmed_present_in_1c'
    )
  into portal_updated, portal_hidden, portal_restored
  from jsonb_array_elements(portal_transitions) transition;

  insert into public.partner_order_authority_events(
    order_id,
    company_id,
    sync_id,
    result,
    previous_presence,
    current_presence,
    verified_at,
    fingerprint
  )
  select
    (transition->>'order_id')::uuid,
    (transition->>'company_id')::uuid,
    p_sync_id,
    transition->>'result',
    transition->>'previous_presence',
    transition->>'current_presence',
    p_verified_at,
    md5((transition->>'order_id') || ':authority:' || p_sync_id::text || ':' || (transition->>'result'))
  from jsonb_array_elements(portal_transitions) transition
  where transition->>'previous_presence' <> transition->>'current_presence'
    and transition->>'result' in ('exists', 'deletion_marked', 'absent')
  on conflict (fingerprint) do nothing;

  return jsonb_build_object(
    'updated', coalesce((history_result->>'updated')::integer, 0) + portal_updated,
    'hidden', coalesce((history_result->>'hidden')::integer, 0) + portal_hidden,
    'restored', coalesce((history_result->>'restored')::integer, 0) + portal_restored,
    'historyUpdated', coalesce((history_result->>'updated')::integer, 0),
    'portalUpdated', portal_updated
  );
end;
$$;

revoke all on function public.prevent_partner_order_authority_event_mutation() from public, anon, authenticated;
revoke all on function public.set_partner_order_confirmed_authority() from public, anon, authenticated;
revoke all on function public.get_partner_order_authority_candidates(uuid, integer) from public, anon, authenticated;
revoke all on function public.apply_partner_order_authority_batch(uuid, uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.get_partner_order_authority_candidates(uuid, integer) to service_role;
grant execute on function public.apply_partner_order_authority_batch(uuid, uuid, timestamptz, jsonb) to service_role;

comment on column public.partner_orders.authoritative_presence is
  'Governed 1C existence state for confirmed portal orders. Missing hides the fallback without deleting portal audit evidence.';
comment on table public.partner_order_authority_events is
  'Append-only audit of confirmed portal order visibility transitions caused by exact 1C reference verification.';
comment on function public.get_partner_order_authority_candidates(uuid, integer) is
  'Returns one bounded exact-reference verification batch across canonical history and unmatched confirmed portal orders.';
comment on function public.apply_partner_order_authority_batch(uuid, uuid, timestamptz, jsonb) is
  'Atomically reconciles exact 1C existence results into canonical history and retained portal-order authority state.';

commit;
