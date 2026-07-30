begin;

create table if not exists public.partner_notification_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  event_code text not null,
  event_group text not null,
  domain text not null,
  entity_type text not null,
  entity_id uuid not null,
  source_table text not null,
  source_event_id uuid null,
  source_version text not null,
  occurred_at timestamptz not null,
  safe_payload jsonb not null default '{}'::jsonb,
  fingerprint text not null unique,
  created_at timestamptz not null default now(),
  constraint partner_notification_events_code_check check (event_code in (
    'order_submitted', 'order_confirmed', 'order_requires_attention',
    'order_readback_failed', 'order_reconciliation_required', 'order_posted',
    'order_cancelled', 'shipment_due_in_3_days', 'shipment_due_today',
    'shipment_overdue', 'shipment_date_changed', 'date_change_approved',
    'date_change_rejected', 'date_change_cancelled', 'invitation_expiring',
    'invitation_accepted', 'employee_suspended', 'role_changed',
    'price_access_changed'
  )),
  constraint partner_notification_events_group_check check (
    event_group in ('orders', 'shipments', 'company_access')
  ),
  constraint partner_notification_events_payload_check check (
    jsonb_typeof(safe_payload) = 'object'
    and pg_column_size(safe_payload) <= 4096
  ),
  constraint partner_notification_events_fingerprint_check check (
    fingerprint ~ '^[0-9a-f]{64}$'
  )
);

create table if not exists public.partner_notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  recipient_user_id uuid not null references public.user_profiles(id) on delete restrict,
  event_code text not null,
  event_group text not null,
  domain text not null,
  severity text not null,
  mandatory boolean not null default false,
  title text not null,
  message text not null,
  action_label text not null,
  action_url text not null,
  entity_type text not null,
  entity_id uuid not null,
  occurred_at timestamptz not null,
  delivered_in_app_at timestamptz not null default now(),
  read_at timestamptz null,
  dismissed_at timestamptz null,
  deduplication_key text not null,
  source_event_id uuid not null references public.partner_notification_events(id) on delete restrict,
  expires_at timestamptz not null,
  retention_until timestamptz not null,
  email_enabled_snapshot boolean not null default false,
  email_delivery_mode text not null default 'off',
  created_at timestamptz not null default now(),
  constraint partner_notifications_event_code_check check (event_code in (
    'order_submitted', 'order_confirmed', 'order_requires_attention',
    'order_readback_failed', 'order_reconciliation_required', 'order_posted',
    'order_cancelled', 'shipment_due_in_3_days', 'shipment_due_today',
    'shipment_overdue', 'shipment_date_changed', 'date_change_approved',
    'date_change_rejected', 'date_change_cancelled', 'invitation_expiring',
    'invitation_accepted', 'employee_suspended', 'role_changed',
    'price_access_changed'
  )),
  constraint partner_notifications_group_check check (
    event_group in ('orders', 'shipments', 'company_access')
  ),
  constraint partner_notifications_severity_check check (
    severity in ('critical', 'warning', 'information', 'success')
  ),
  constraint partner_notifications_delivery_mode_check check (
    email_delivery_mode in ('immediate', 'daily', 'off')
  ),
  constraint partner_notifications_plain_text_check check (
    char_length(title) between 1 and 180
    and char_length(message) between 1 and 600
    and char_length(action_label) between 1 and 80
    and title !~ '[<>]' and message !~ '[<>]' and action_label !~ '[<>]'
  ),
  constraint partner_notifications_lifecycle_check check (
    expires_at > occurred_at
    and retention_until >= expires_at
    and retention_until <= occurred_at + interval '13 months'
    and (not mandatory or dismissed_at is null)
  ),
  unique (recipient_user_id, deduplication_key)
);

create table if not exists public.partner_notification_preferences (
  company_id uuid not null references public.partner_companies(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  event_group text not null,
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default false,
  delivery_mode text not null default 'immediate',
  updated_at timestamptz not null default now(),
  primary key (company_id, user_id, event_group),
  constraint partner_notification_preferences_group_check check (
    event_group in ('orders', 'shipments', 'company_access')
  ),
  constraint partner_notification_preferences_mode_check check (
    delivery_mode in ('immediate', 'daily', 'off')
  ),
  constraint partner_notification_preferences_mandatory_check check (
    in_app_enabled
  )
);

create table if not exists public.partner_notification_generation_runs (
  id uuid primary key default gen_random_uuid(),
  worker text not null,
  business_date date null,
  status text not null,
  source_events_processed integer not null default 0,
  recipients_resolved integer not null default 0,
  notifications_created integer not null default 0,
  deduplicated integer not null default 0,
  suppressed integer not null default 0,
  safe_error_code text null,
  duration_ms integer null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  constraint partner_notification_generation_runs_status_check check (
    status in ('running', 'succeeded', 'failed', 'locked')
  ),
  constraint partner_notification_generation_runs_counts_check check (
    source_events_processed >= 0 and recipients_resolved >= 0
    and notifications_created >= 0 and deduplicated >= 0 and suppressed >= 0
  )
);

create index if not exists partner_notifications_recipient_active_idx
  on public.partner_notifications(recipient_user_id, company_id, occurred_at desc, id desc)
  where dismissed_at is null;
create index if not exists partner_notifications_recipient_unread_idx
  on public.partner_notifications(recipient_user_id, company_id, occurred_at desc, id desc)
  where read_at is null and dismissed_at is null;
create index if not exists partner_notification_events_company_created_idx
  on public.partner_notification_events(company_id, occurred_at desc, id desc);
create index if not exists partner_notification_runs_started_idx
  on public.partner_notification_generation_runs(started_at desc);

create or replace function public.is_allowed_partner_notification_url(value text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select value ~ '^/cabinet/orders/[0-9a-f-]{36}(\?tab=date-change)?$'
    or value = '/cabinet/reservation-requests'
    or value = '/cabinet/company/users';
$$;

alter table public.partner_notifications
  drop constraint if exists partner_notifications_action_url_check;
alter table public.partner_notifications
  add constraint partner_notifications_action_url_check
  check (public.is_allowed_partner_notification_url(action_url));

create or replace function public.has_active_notification_membership(
  target_company_id uuid,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.company_memberships membership
    join public.partner_companies company on company.id = membership.company_id
    join public.user_profiles profile on profile.id = membership.user_id
    where membership.company_id = target_company_id
      and membership.user_id = target_user_id
      and membership.status = 'active'
      and company.status = 'active'
      and profile.status = 'active'
  );
$$;

alter table public.partner_notification_events enable row level security;
alter table public.partner_notifications enable row level security;
alter table public.partner_notification_preferences enable row level security;
alter table public.partner_notification_generation_runs enable row level security;

revoke all on public.partner_notification_events from public, anon, authenticated;
revoke all on public.partner_notifications from public, anon, authenticated;
revoke all on public.partner_notification_preferences from public, anon, authenticated;
revoke all on public.partner_notification_generation_runs from public, anon, authenticated;
grant select on public.partner_notifications to authenticated;
grant select on public.partner_notification_preferences to authenticated;
grant all on public.partner_notification_events, public.partner_notifications,
  public.partner_notification_preferences, public.partner_notification_generation_runs
  to service_role;

create policy "Recipients read own active notifications"
on public.partner_notifications for select to authenticated
using (
  recipient_user_id = auth.uid()
  and public.has_active_notification_membership(company_id, auth.uid())
);

create policy "Users read own notification preferences"
on public.partner_notification_preferences for select to authenticated
using (
  user_id = auth.uid()
  and public.has_active_notification_membership(company_id, auth.uid())
);

create or replace function public.get_partner_notification_summary(
  p_company_id uuid,
  p_limit integer default 8
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  normalized_limit integer := least(greatest(coalesce(p_limit, 8), 1), 8);
  result jsonb;
begin
  if not public.has_active_notification_membership(p_company_id, auth.uid()) then
    raise exception 'Notification access denied.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'unreadCount', count(*) filter (where notification.read_at is null),
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', notification.id,
      'eventCode', notification.event_code,
      'eventGroup', notification.event_group,
      'severity', notification.severity,
      'mandatory', notification.mandatory,
      'title', notification.title,
      'message', notification.message,
      'actionLabel', notification.action_label,
      'actionUrl', notification.action_url,
      'occurredAt', notification.occurred_at,
      'readAt', notification.read_at,
      'dismissedAt', notification.dismissed_at,
      'expiresAt', notification.expires_at
    ) order by notification.occurred_at desc, notification.id desc)
      filter (where notification.list_rank <= normalized_limit), '[]'::jsonb)
  ) into result
  from (
    select value.*, row_number() over (
      order by value.occurred_at desc, value.id desc
    ) as list_rank
    from public.partner_notifications value
    where value.company_id = p_company_id
      and value.recipient_user_id = auth.uid()
      and value.dismissed_at is null
      and value.expires_at > now()
  ) notification;

  return coalesce(result, jsonb_build_object('unreadCount', 0, 'items', '[]'::jsonb));
end;
$$;

create or replace function public.list_partner_notifications(
  p_company_id uuid,
  p_event_group text default null,
  p_unread_only boolean default false,
  p_cursor_occurred_at timestamptz default null,
  p_cursor_id uuid default null,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  normalized_size integer := least(greatest(coalesce(p_page_size, 20), 1), 50);
  result jsonb;
begin
  if not public.has_active_notification_membership(p_company_id, auth.uid()) then
    raise exception 'Notification access denied.' using errcode = '42501';
  end if;
  if p_event_group is not null
     and p_event_group not in ('orders', 'shipments', 'company_access') then
    raise exception 'Notification filter is invalid.' using errcode = '22023';
  end if;
  if (p_cursor_occurred_at is null) <> (p_cursor_id is null) then
    raise exception 'Notification cursor is invalid.' using errcode = '22023';
  end if;

  with page as (
    select notification.*
    from public.partner_notifications notification
    where notification.company_id = p_company_id
      and notification.recipient_user_id = auth.uid()
      and notification.dismissed_at is null
      and notification.expires_at > now()
      and (p_event_group is null or notification.event_group = p_event_group)
      and (not p_unread_only or notification.read_at is null)
      and (
        p_cursor_occurred_at is null
        or (notification.occurred_at, notification.id)
          < (p_cursor_occurred_at, p_cursor_id)
      )
    order by notification.occurred_at desc, notification.id desc
    limit normalized_size + 1
  ),
  visible as (
    select * from page
    order by occurred_at desc, id desc
    limit normalized_size
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', visible.id,
      'eventCode', visible.event_code,
      'eventGroup', visible.event_group,
      'severity', visible.severity,
      'mandatory', visible.mandatory,
      'title', visible.title,
      'message', visible.message,
      'actionLabel', visible.action_label,
      'actionUrl', visible.action_url,
      'occurredAt', visible.occurred_at,
      'readAt', visible.read_at,
      'dismissedAt', visible.dismissed_at,
      'expiresAt', visible.expires_at
    ) order by visible.occurred_at desc, visible.id desc), '[]'::jsonb),
    'nextCursor', case when (select count(*) from page) > normalized_size then (
      select jsonb_build_object('occurredAt', tail.occurred_at, 'id', tail.id)
      from visible tail order by tail.occurred_at, tail.id limit 1
    ) else null end
  ) into result
  from visible;

  return coalesce(result, jsonb_build_object('items', '[]'::jsonb, 'nextCursor', null));
end;
$$;

create or replace function public.mark_partner_notification_read(
  p_company_id uuid,
  p_notification_id uuid
)
returns timestamptz
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare marked_at timestamptz;
begin
  if not public.has_active_notification_membership(p_company_id, auth.uid()) then
    raise exception 'Notification access denied.' using errcode = '42501';
  end if;
  update public.partner_notifications notification
  set read_at = coalesce(notification.read_at, now())
  where notification.id = p_notification_id
    and notification.company_id = p_company_id
    and notification.recipient_user_id = auth.uid()
  returning notification.read_at into marked_at;
  if marked_at is null then
    raise exception 'Notification is unavailable.' using errcode = 'P0002';
  end if;
  return marked_at;
end;
$$;

create or replace function public.mark_all_partner_notifications_read(
  p_company_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare affected integer;
begin
  if not public.has_active_notification_membership(p_company_id, auth.uid()) then
    raise exception 'Notification access denied.' using errcode = '42501';
  end if;
  update public.partner_notifications
  set read_at = now()
  where company_id = p_company_id
    and recipient_user_id = auth.uid()
    and read_at is null and dismissed_at is null and expires_at > now();
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.dismiss_partner_notification(
  p_company_id uuid,
  p_notification_id uuid
)
returns timestamptz
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare dismissed timestamptz;
begin
  if not public.has_active_notification_membership(p_company_id, auth.uid()) then
    raise exception 'Notification access denied.' using errcode = '42501';
  end if;
  update public.partner_notifications notification
  set dismissed_at = coalesce(notification.dismissed_at, now()),
      read_at = coalesce(notification.read_at, now())
  where notification.id = p_notification_id
    and notification.company_id = p_company_id
    and notification.recipient_user_id = auth.uid()
    and not notification.mandatory
  returning notification.dismissed_at into dismissed;
  if dismissed is null then
    raise exception 'Notification cannot be dismissed.' using errcode = '42501';
  end if;
  return dismissed;
end;
$$;

create or replace function public.get_partner_notification_preferences(
  p_company_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.has_active_notification_membership(p_company_id, auth.uid()) then
    raise exception 'Notification access denied.' using errcode = '42501';
  end if;
  return (
    select jsonb_agg(jsonb_build_object(
      'eventGroup', groups.event_group,
      'inAppEnabled', coalesce(preference.in_app_enabled, true),
      'emailEnabled', coalesce(preference.email_enabled, false),
      'deliveryMode', coalesce(preference.delivery_mode, 'immediate')
    ) order by groups.ordinality)
    from unnest(array['orders', 'shipments', 'company_access'])
      with ordinality groups(event_group, ordinality)
    left join public.partner_notification_preferences preference
      on preference.company_id = p_company_id
      and preference.user_id = auth.uid()
      and preference.event_group = groups.event_group
  );
end;
$$;

create or replace function public.set_partner_notification_preference(
  p_company_id uuid,
  p_event_group text,
  p_in_app_enabled boolean,
  p_email_enabled boolean,
  p_delivery_mode text
)
returns public.partner_notification_preferences
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare saved public.partner_notification_preferences;
begin
  if not public.has_active_notification_membership(p_company_id, auth.uid()) then
    raise exception 'Notification access denied.' using errcode = '42501';
  end if;
  if p_event_group not in ('orders', 'shipments', 'company_access')
     or p_delivery_mode not in ('immediate', 'daily', 'off')
     or not p_in_app_enabled then
    raise exception 'Notification preference is invalid.' using errcode = '22023';
  end if;

  insert into public.partner_notification_preferences(
    company_id, user_id, event_group, in_app_enabled,
    email_enabled, delivery_mode, updated_at
  ) values (
    p_company_id, auth.uid(), p_event_group, true,
    false, p_delivery_mode, now()
  )
  on conflict (company_id, user_id, event_group) do update set
    in_app_enabled = true,
    email_enabled = false,
    delivery_mode = excluded.delivery_mode,
    updated_at = now()
  returning * into saved;
  return saved;
end;
$$;

revoke all on function public.is_allowed_partner_notification_url(text) from public;
revoke all on function public.has_active_notification_membership(uuid, uuid) from public;
revoke all on function public.get_partner_notification_summary(uuid, integer) from public, anon;
revoke all on function public.list_partner_notifications(uuid, text, boolean, timestamptz, uuid, integer) from public, anon;
revoke all on function public.mark_partner_notification_read(uuid, uuid) from public, anon;
revoke all on function public.mark_all_partner_notifications_read(uuid) from public, anon;
revoke all on function public.dismiss_partner_notification(uuid, uuid) from public, anon;
revoke all on function public.get_partner_notification_preferences(uuid) from public, anon;
revoke all on function public.set_partner_notification_preference(uuid, text, boolean, boolean, text) from public, anon;

grant execute on function public.get_partner_notification_summary(uuid, integer) to authenticated;
grant execute on function public.list_partner_notifications(uuid, text, boolean, timestamptz, uuid, integer) to authenticated;
grant execute on function public.mark_partner_notification_read(uuid, uuid) to authenticated;
grant execute on function public.mark_all_partner_notifications_read(uuid) to authenticated;
grant execute on function public.dismiss_partner_notification(uuid, uuid) to authenticated;
grant execute on function public.get_partner_notification_preferences(uuid) to authenticated;
grant execute on function public.set_partner_notification_preference(uuid, text, boolean, boolean, text) to authenticated;

comment on table public.partner_notification_events is
  'Append-only canonical notification outbox. Payloads contain safe rendering inputs only.';
comment on table public.partner_notifications is
  'Recipient-specific immutable notification content. Only read and dismiss state is mutable through scoped RPCs.';
comment on table public.partner_notification_preferences is
  'Self-managed company-scoped notification preferences. Email and digest delivery are reserved for a later slice.';

commit;
