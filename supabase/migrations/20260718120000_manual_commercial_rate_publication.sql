-- Temporary manual publication bridge until 1C exposes authoritative current
-- commercial rates. Existing legacy exchange-rate consumers remain unchanged.

insert into public.permissions (code, description)
values ('commercial_rates.manage', 'Publish commercial conversion rates copied from 1C.')
on conflict (code) do update set description = excluded.description;

with permitted_roles(role_code) as (
  values ('novotech_admin'), ('novotech_sales')
)
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from permitted_roles seed
join public.roles role on role.code = seed.role_code
join public.permissions permission on permission.code = 'commercial_rates.manage'
on conflict (role_id, permission_id) do nothing;

alter table public.commercial_exchange_rates
  add column if not exists purpose text null,
  add column if not exists effective_at timestamptz null,
  add column if not exists published_by uuid null references public.user_profiles(id) on delete restrict,
  add column if not exists source_type text null,
  add column if not exists source_note text null,
  add column if not exists evidence_comment text null,
  add column if not exists previous_rate_id uuid null references public.commercial_exchange_rates(id) on delete restrict,
  add column if not exists is_active boolean not null default false;

alter table public.commercial_exchange_rates
  drop constraint if exists commercial_exchange_rates_purpose_check,
  drop constraint if exists commercial_exchange_rates_source_type_check,
  drop constraint if exists commercial_exchange_rates_manual_fields_check,
  drop constraint if exists commercial_exchange_rates_source_note_check,
  drop constraint if exists commercial_exchange_rates_evidence_comment_check,
  add constraint commercial_exchange_rates_purpose_check check (
    purpose is null or purpose in ('partner_price_usd_to_mdl', 'retail_price_mdl_to_usd')
  ),
  add constraint commercial_exchange_rates_source_type_check check (
    source_type is null or source_type = 'manual_from_1c'
  ),
  add constraint commercial_exchange_rates_manual_fields_check check (
    purpose is null or (
      effective_at is not null
      and published_by is not null
      and source_type = 'manual_from_1c'
      and source_note is not null
      and is_published = true
    )
  ),
  add constraint commercial_exchange_rates_source_note_check check (
    source_note is null or char_length(source_note) between 3 and 500
  ),
  add constraint commercial_exchange_rates_evidence_comment_check check (
    evidence_comment is null or char_length(evidence_comment) <= 1000
  );

create unique index if not exists commercial_exchange_rates_one_active_purpose_idx
  on public.commercial_exchange_rates(purpose)
  where purpose is not null and is_active = true and is_published = true;

create index if not exists commercial_exchange_rates_purpose_history_idx
  on public.commercial_exchange_rates(purpose, effective_at desc, published_at desc)
  where purpose is not null;

create table if not exists public.commercial_exchange_rate_audit_events (
  id uuid primary key default gen_random_uuid(),
  rate_id uuid not null references public.commercial_exchange_rates(id) on delete restrict,
  purpose text not null check (purpose in ('partner_price_usd_to_mdl', 'retail_price_mdl_to_usd')),
  event_type text not null check (event_type = 'published'),
  actor_user_id uuid not null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.commercial_exchange_rate_audit_events enable row level security;
revoke all on table public.commercial_exchange_rate_audit_events from public, anon, authenticated;
grant select on table public.commercial_exchange_rate_audit_events to authenticated;

create or replace function public.can_manage_commercial_rates()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles profile
    where profile.id = auth.uid()
      and profile.status = 'active'
      and profile.user_type in ('internal', 'admin')
  )
  and exists (
    select 1
    from public.roles role
    join public.role_permissions role_permission on role_permission.role_id = role.id
    join public.permissions permission on permission.id = role_permission.permission_id
    where role.code in ('novotech_admin', 'novotech_sales')
      and permission.code = 'commercial_rates.manage'
  );
$$;

revoke all on function public.can_manage_commercial_rates() from public, anon;
grant execute on function public.can_manage_commercial_rates() to authenticated;

drop policy if exists "Internal users can read commercial rate history"
on public.commercial_exchange_rates;
create policy "Internal users can read commercial rate history"
on public.commercial_exchange_rates
for select
to authenticated
using (public.can_manage_commercial_rates());

drop policy if exists "Internal users can read commercial rate audit events"
on public.commercial_exchange_rate_audit_events;
create policy "Internal users can read commercial rate audit events"
on public.commercial_exchange_rate_audit_events
for select
to authenticated
using (public.can_manage_commercial_rates());

create or replace function public.publish_manual_commercial_exchange_rate_v2(
  p_purpose text,
  p_rate numeric,
  p_effective_at timestamptz,
  p_source_note text,
  p_evidence_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  current_rate public.commercial_exchange_rates%rowtype;
  published_rate public.commercial_exchange_rates%rowtype;
  normalized_source_note text := btrim(p_source_note);
  normalized_evidence_comment text := nullif(btrim(p_evidence_comment), '');
begin
  if actor_id is null or not public.can_manage_commercial_rates() then
    raise exception 'Commercial-rate publication is forbidden.' using errcode = '42501';
  end if;

  if p_purpose not in ('partner_price_usd_to_mdl', 'retail_price_mdl_to_usd')
    or p_rate is null
    or p_rate = 'NaN'::numeric
    or p_rate <= 0
    or p_rate > 1000
    or scale(p_rate) > 8
    or p_effective_at is null
    or p_effective_at > now() + interval '5 minutes'
    or char_length(normalized_source_note) not between 3 and 500
    or (normalized_evidence_comment is not null and char_length(normalized_evidence_comment) > 1000)
  then
    raise exception 'Invalid commercial-rate publication payload.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('manual_commercial_rate:' || p_purpose));

  select * into current_rate
  from public.commercial_exchange_rates
  where purpose = p_purpose
    and is_active = true
    and is_published = true
  for update;

  if current_rate.id is not null and p_effective_at < current_rate.effective_at then
    raise exception 'An older commercial rate cannot replace the active rate.' using errcode = '22023';
  end if;

  if current_rate.id is not null then
    update public.commercial_exchange_rates
    set is_active = false,
        is_published = false,
        updated_at = now()
    where id = current_rate.id;
  end if;

  insert into public.commercial_exchange_rates (
    source_code,
    base_currency,
    quote_currency,
    rate_direction,
    rate,
    effective_date,
    effective_at,
    source_updated_at,
    published_at,
    published_by,
    source_type,
    source_note,
    evidence_comment,
    previous_rate_id,
    is_active,
    is_published
  ) values (
    p_purpose || ':' || to_char(p_effective_at at time zone 'UTC', 'YYYYMMDDHH24MISSUS'),
    'USD',
    'MDL',
    'quote_per_base',
    p_rate,
    p_effective_at::date,
    p_effective_at,
    p_effective_at,
    now(),
    actor_id,
    'manual_from_1c',
    normalized_source_note,
    normalized_evidence_comment,
    current_rate.id,
    true,
    true
  )
  returning * into published_rate;

  insert into public.commercial_exchange_rate_audit_events (
    rate_id,
    purpose,
    event_type,
    actor_user_id
  ) values (
    published_rate.id,
    p_purpose,
    'published',
    actor_id
  );

  return to_jsonb(published_rate);
end;
$$;

revoke all on function public.publish_manual_commercial_exchange_rate_v2(text, numeric, timestamptz, text, text)
from public, anon, authenticated;
grant execute on function public.publish_manual_commercial_exchange_rate_v2(text, numeric, timestamptz, text, text)
to authenticated;

comment on function public.publish_manual_commercial_exchange_rate_v2(text, numeric, timestamptz, text, text) is
  'Atomically publishes an immutable purpose-based rate copied from 1C; publisher identity comes only from auth.uid().';
comment on table public.commercial_exchange_rate_audit_events is
  'Immutable audit events for temporary manual commercial-rate publication.';
