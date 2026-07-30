begin;

alter table public.partner_notification_events
  drop constraint if exists partner_notification_events_code_check;
alter table public.partner_notification_events
  add constraint partner_notification_events_code_check check (event_code in (
    'order_submitted', 'order_confirmed', 'order_requires_attention',
    'order_readback_failed', 'order_reconciliation_required', 'order_posted',
    'order_cancelled', 'shipment_due_in_3_days', 'shipment_due_today',
    'shipment_overdue', 'shipment_date_changed', 'date_change_approved',
    'date_change_rejected', 'date_change_cancelled', 'invitation_expiring',
    'invitation_accepted', 'employee_suspended', 'role_changed',
    'price_access_changed', 'watched_product_back_in_stock',
    'watched_product_expected_arrival_added', 'watched_product_arrived',
    'watched_product_price_changed', 'cart_product_price_changed',
    'cart_product_availability_changed'
  ));
alter table public.partner_notification_events
  drop constraint if exists partner_notification_events_group_check;
alter table public.partner_notification_events
  add constraint partner_notification_events_group_check
  check (event_group in ('orders', 'shipments', 'company_access', 'products'));

alter table public.partner_notifications
  drop constraint if exists partner_notifications_event_code_check;
alter table public.partner_notifications
  add constraint partner_notifications_event_code_check check (event_code in (
    'order_submitted', 'order_confirmed', 'order_requires_attention',
    'order_readback_failed', 'order_reconciliation_required', 'order_posted',
    'order_cancelled', 'shipment_due_in_3_days', 'shipment_due_today',
    'shipment_overdue', 'shipment_date_changed', 'date_change_approved',
    'date_change_rejected', 'date_change_cancelled', 'invitation_expiring',
    'invitation_accepted', 'employee_suspended', 'role_changed',
    'price_access_changed', 'watched_product_back_in_stock',
    'watched_product_expected_arrival_added', 'watched_product_arrived',
    'watched_product_price_changed', 'cart_product_price_changed',
    'cart_product_availability_changed'
  ));
alter table public.partner_notifications
  drop constraint if exists partner_notifications_group_check;
alter table public.partner_notifications
  add constraint partner_notifications_group_check
  check (event_group in ('orders', 'shipments', 'company_access', 'products'));

alter table public.partner_notification_preferences
  drop constraint if exists partner_notification_preferences_group_check;
alter table public.partner_notification_preferences
  add constraint partner_notification_preferences_group_check
  check (event_group in ('orders', 'shipments', 'company_access', 'products'));
alter table public.partner_notification_preferences
  drop constraint if exists partner_notification_preferences_mandatory_check;
alter table public.partner_notification_preferences
  add constraint partner_notification_preferences_mandatory_check
  check (event_group = 'products' or in_app_enabled);

create table public.partner_product_transition_events (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.catalog_products(id) on delete restrict,
  transition_type text not null,
  previous_state_safe text not null,
  new_state_safe text not null,
  previous_value_fingerprint text null,
  new_value_fingerprint text null,
  price_context_type text null,
  external_price_type_ref text null,
  source_sync_id uuid not null,
  source_version text not null,
  fingerprint text not null unique,
  occurred_at timestamptz not null default now(),
  processing_status text not null default 'pending',
  processing_attempts integer not null default 0,
  processed_at timestamptz null,
  safe_error_code text null,
  created_at timestamptz not null default now(),
  constraint partner_product_transition_type_check
    check (transition_type in ('availability_changed', 'price_changed')),
  constraint partner_product_transition_state_check check (
    (transition_type = 'availability_changed'
      and previous_state_safe in ('unknown', 'unavailable', 'expected', 'in_stock')
      and new_state_safe in ('unknown', 'unavailable', 'expected', 'in_stock'))
    or
    (transition_type = 'price_changed'
      and previous_state_safe in ('unavailable', 'available')
      and new_state_safe in ('unavailable', 'available')
      and previous_value_fingerprint ~ '^[0-9a-f]{64}$'
      and new_value_fingerprint ~ '^[0-9a-f]{64}$'
      and price_context_type = 'price_type'
      and external_price_type_ref is not null)
  ),
  constraint partner_product_transition_status_check
    check (processing_status in ('pending', 'processing', 'processed', 'failed')),
  constraint partner_product_transition_attempts_check
    check (processing_attempts between 0 and 10),
  constraint partner_product_transition_fingerprint_check
    check (fingerprint ~ '^[0-9a-f]{64}$')
);

create index partner_product_transition_pending_idx
  on public.partner_product_transition_events(processing_status, occurred_at, id)
  where processing_status in ('pending', 'failed');
create index partner_product_transition_sync_idx
  on public.partner_product_transition_events(source_sync_id, product_id);

create table public.partner_product_notification_projection_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null,
  source_sync_id uuid null,
  transitions_processed integer not null default 0,
  watcher_recipients_resolved integer not null default 0,
  notifications_created integer not null default 0,
  deduplicated integer not null default 0,
  suppressed integer not null default 0,
  failed_projections integer not null default 0,
  safe_error_code text null,
  duration_ms integer null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  constraint partner_product_projection_status_check
    check (status in ('running', 'succeeded', 'failed', 'locked')),
  constraint partner_product_projection_counts_check check (
    transitions_processed >= 0 and watcher_recipients_resolved >= 0
    and notifications_created >= 0 and deduplicated >= 0
    and suppressed >= 0 and failed_projections >= 0
  )
);

create index partner_product_projection_runs_started_idx
  on public.partner_product_notification_projection_runs(started_at desc);

alter table public.partner_product_transition_events enable row level security;
alter table public.partner_product_notification_projection_runs enable row level security;
revoke all on public.partner_product_transition_events,
  public.partner_product_notification_projection_runs
  from public, anon, authenticated;
grant all on public.partner_product_transition_events,
  public.partner_product_notification_projection_runs
  to service_role;

create or replace function public.is_allowed_partner_notification_url(value text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select value ~ '^/cabinet/orders/[0-9a-f-]{36}(\?tab=date-change)?$'
    or value = '/cabinet/reservation-requests'
    or value = '/cabinet/company/users'
    or value = '/cabinet/cart'
    or value ~ '^/cabinet/catalog/[a-z0-9][a-z0-9-]{0,199}$';
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
    from unnest(array['orders', 'shipments', 'company_access', 'products'])
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
  if p_event_group not in ('orders', 'shipments', 'company_access', 'products')
     or p_delivery_mode not in ('immediate', 'daily', 'off')
     or p_email_enabled
     or (p_event_group <> 'products'
       and (not p_in_app_enabled or p_delivery_mode = 'off'))
     or (p_event_group = 'products'
       and p_in_app_enabled <> (p_delivery_mode <> 'off')) then
    raise exception 'Notification preference is invalid.' using errcode = '22023';
  end if;

  insert into public.partner_notification_preferences(
    company_id, user_id, event_group, in_app_enabled,
    email_enabled, delivery_mode, updated_at
  ) values (
    p_company_id, auth.uid(), p_event_group, p_in_app_enabled,
    false, p_delivery_mode, now()
  )
  on conflict (company_id, user_id, event_group) do update set
    in_app_enabled = excluded.in_app_enabled,
    email_enabled = false,
    delivery_mode = excluded.delivery_mode,
    updated_at = now()
  returning * into saved;
  return saved;
end;
$$;

revoke all on function public.get_partner_notification_preferences(uuid)
  from public, anon;
grant execute on function public.get_partner_notification_preferences(uuid)
  to authenticated;
revoke all on function public.set_partner_notification_preference(
  uuid, text, boolean, boolean, text
) from public, anon;
grant execute on function public.set_partner_notification_preference(
  uuid, text, boolean, boolean, text
) to authenticated;

comment on table public.partner_product_transition_events is
  'Append-only safe commercial transition outbox. Stores no quantities, prices, or raw 1C payloads.';
comment on table public.partner_product_notification_projection_runs is
  'Aggregate telemetry for bounded watched-product notification projection.';

commit;
