begin;

create table if not exists public.partner_order_notification_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  partner_order_id uuid not null references public.partner_orders(id) on delete restrict,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  fingerprint text not null unique,
  created_at timestamptz not null default now(),
  constraint partner_order_notification_events_type_check check (event_type in (
    'order_submitted', 'order_confirmed', 'order_requires_attention',
    'order_readback_failed', 'order_reconciliation_required'
  )),
  constraint partner_order_notification_events_fingerprint_check check (
    fingerprint ~ '^[0-9a-f]{64}$'
  )
);

alter table public.partner_order_notification_events enable row level security;
revoke all on public.partner_order_notification_events from public, anon, authenticated;
grant all on public.partner_order_notification_events to service_role;

create or replace function public.notification_user_has_permission(
  target_user_id uuid,
  target_company_id uuid,
  target_permission_code text
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
    where membership.user_id = target_user_id
      and membership.company_id = target_company_id
      and membership.status = 'active'
      and company.status = 'active'
      and profile.status = 'active'
      and not exists (
        select 1
        from public.membership_permission_overrides override
        join public.permissions permission on permission.id = override.permission_id
        where override.membership_id = membership.id
          and permission.code = target_permission_code
          and override.effect = 'deny'
      )
      and (
        exists (
          select 1
          from public.role_permissions role_permission
          join public.permissions permission on permission.id = role_permission.permission_id
          where role_permission.role_id = membership.role_id
            and permission.code = target_permission_code
        )
        or exists (
          select 1
          from public.membership_permission_overrides override
          join public.permissions permission on permission.id = override.permission_id
          where override.membership_id = membership.id
            and permission.code = target_permission_code
            and override.effect = 'allow'
        )
      )
  );
$$;

create or replace function public.project_partner_notification_event(
  target_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  source public.partner_notification_events%rowtype;
  severity_value text;
  mandatory_value boolean;
  title_value text;
  message_value text;
  action_label_value text;
  action_url_value text;
  expiry_days integer;
  created_count integer := 0;
  eligible_count integer := 0;
begin
  select * into source
  from public.partner_notification_events
  where id = target_event_id;
  if not found then
    raise exception 'Notification source event was not found.' using errcode = 'P0002';
  end if;

  select
    case source.event_code
      when 'order_reconciliation_required' then 'critical'
      when 'order_readback_failed' then 'critical'
      when 'shipment_overdue' then 'critical'
      when 'employee_suspended' then 'critical'
      when 'order_requires_attention' then 'warning'
      when 'shipment_due_today' then 'warning'
      when 'invitation_expiring' then 'warning'
      when 'date_change_rejected' then 'warning'
      when 'price_access_changed' then 'warning'
      when 'shipment_due_in_3_days' then 'information'
      when 'shipment_date_changed' then 'information'
      when 'role_changed' then 'information'
      when 'date_change_cancelled' then 'information'
      else 'success'
    end,
    source.event_code in (
      'order_reconciliation_required', 'order_readback_failed',
      'shipment_overdue', 'employee_suspended', 'role_changed',
      'price_access_changed'
    ),
    case source.event_code
      when 'order_submitted' then 'Заказ передан в обработку'
      when 'order_confirmed' then 'Заказ подтверждён'
      when 'order_requires_attention' then 'Заказ требует проверки'
      when 'order_readback_failed' then 'Статус заказа требует проверки'
      when 'order_reconciliation_required' then 'Требуется сверка заказа'
      when 'order_posted' then 'Заказ проведён в 1С'
      when 'order_cancelled' then 'Заказ отменён'
      when 'shipment_due_in_3_days' then 'Отгрузка запланирована через 3 дня'
      when 'shipment_due_today' then 'Отгрузка запланирована сегодня'
      when 'shipment_overdue' then 'Плановая дата отгрузки прошла'
      when 'shipment_date_changed' then 'Дата отгрузки изменилась'
      when 'date_change_approved' then 'Перенос даты согласован'
      when 'date_change_rejected' then 'Перенос даты отклонён'
      when 'date_change_cancelled' then 'Запрос переноса отменён'
      when 'invitation_expiring' then 'Срок приглашения скоро истекает'
      when 'invitation_accepted' then 'Приглашение принято'
      when 'employee_suspended' then 'Доступ сотрудника приостановлен'
      when 'role_changed' then 'Роль сотрудника изменена'
      when 'price_access_changed' then 'Доступ к ценам изменён'
    end,
    case source.event_code
      when 'order_submitted' then 'Novotech получил заказ. Текущий статус доступен в разделе «Заказы».'
      when 'order_confirmed' then 'Заказ создан и подтверждён. Откройте заказ, чтобы проверить детали.'
      when 'order_requires_attention' then 'Откройте заказ и проверьте текущий статус. Данные корзины сохранены при восстанавливаемой ошибке.'
      when 'order_readback_failed' then 'Не удалось подтвердить состояние заказа после отправки. Откройте заказ для проверки.'
      when 'order_reconciliation_required' then 'Результат передачи заказа требует безопасной сверки. Не отправляйте заказ повторно.'
      when 'order_posted' then 'Заказ обработан в 1С Novotech. Откройте заказ, чтобы проверить актуальный статус.'
      when 'order_cancelled' then 'Заказ больше не активен. Подробности доступны на странице заказа.'
      when 'shipment_due_in_3_days' then 'Проверьте позиции заказа и плановую дату отгрузки.'
      when 'shipment_due_today' then 'Проверьте готовность к получению и актуальный статус заказа.'
      when 'shipment_overdue' then 'Откройте заказ и проверьте актуальную плановую дату или запросите перенос.'
      when 'shipment_date_changed' then 'В 1С обновлена плановая дата отгрузки. Новая дата указана в заказе.'
      when 'date_change_approved' then 'Novotech согласовал запрошенную дату. Изменение будет отражено после синхронизации с 1С.'
      when 'date_change_rejected' then 'Novotech не согласовал запрошенную дату. Решение и комментарий доступны в заказе.'
      when 'date_change_cancelled' then 'Запрос изменения даты больше не рассматривается.'
      when 'invitation_expiring' then 'Проверьте приглашение сотрудника и при необходимости отправьте его повторно.'
      when 'invitation_accepted' then 'Сотрудник присоединился к компании с назначенным доступом.'
      when 'employee_suspended' then 'Доступ сотрудника к кабинету компании приостановлен.'
      when 'role_changed' then 'Набор рабочих возможностей сотрудника обновлён.'
      when 'price_access_changed' then 'Коммерческая видимость сотрудника обновлена согласно назначенному доступу.'
    end,
    case when source.event_group = 'company_access'
      then 'Открыть сотрудников'
      else 'Открыть заказ'
    end,
    case when source.event_group = 'company_access'
      then '/cabinet/company/users'
      else '/cabinet/orders/' || source.entity_id::text
        || case when source.event_code like 'date_change_%' then '?tab=date-change' else '' end
    end,
    case
      when source.event_code in ('order_reconciliation_required', 'order_readback_failed') then 180
      when source.event_code in ('employee_suspended', 'role_changed', 'price_access_changed') then 180
      when source.event_code like 'shipment_%' then 30
      when source.event_code = 'invitation_expiring' then 30
      else 90
    end
  into severity_value, mandatory_value, title_value, message_value,
    action_label_value, action_url_value, expiry_days;

  if title_value is null or not public.is_allowed_partner_notification_url(action_url_value) then
    raise exception 'Notification catalog entry is invalid.' using errcode = '22023';
  end if;

  with recipients as (
    select distinct recipient.user_id
    from (
      select case
        when source.event_group in ('orders', 'shipments') then (
          select coalesce(portal_order.submitted_by, direct_order.submitted_by)
          from (select 1) seed
          left join public.partner_order_history history
            on history.id = source.entity_id
          left join public.partner_orders portal_order
            on portal_order.id = history.portal_order_id
          left join public.partner_orders direct_order
            on direct_order.id = source.entity_id
          limit 1
        )
        else null
      end as user_id
      union all
      select membership.user_id
      from public.company_memberships membership
      join public.roles role on role.id = membership.role_id
      where membership.company_id = source.company_id
        and membership.status = 'active'
        and (
          (
            source.event_group in ('orders', 'shipments')
            and role.code in ('partner_owner', 'partner_manager', 'partner_buyer')
            and (
              public.notification_user_has_permission(
                membership.user_id, source.company_id, 'orders.manage'
              )
              or public.notification_user_has_permission(
                membership.user_id, source.company_id, 'orders.view'
              )
            )
          )
          or (
            source.event_group = 'company_access'
            and (
              role.code = 'partner_owner'
              or public.notification_user_has_permission(
                membership.user_id, source.company_id, 'company_users.manage'
              )
            )
          )
        )
      union all
      select nullif(source.safe_payload->>'targetUserId', '')::uuid
      where source.event_group = 'company_access'
        and source.event_code in (
          'employee_suspended', 'role_changed', 'price_access_changed'
        )
      union all
      select nullif(source.safe_payload->>'inviterUserId', '')::uuid
      where source.event_group = 'company_access'
        and source.event_code in ('invitation_expiring', 'invitation_accepted')
    ) recipient
    where recipient.user_id is not null
      and exists (
        select 1 from public.user_profiles profile
        where profile.id = recipient.user_id and profile.status = 'active'
      )
      and (
        source.event_code = 'employee_suspended'
        or public.has_active_notification_membership(
          source.company_id, recipient.user_id
        )
      )
  ),
  counted as (
    select count(*)::integer as count from recipients
  ),
  inserted as (
    insert into public.partner_notifications(
      company_id, recipient_user_id, event_code, event_group, domain,
      severity, mandatory, title, message, action_label, action_url,
      entity_type, entity_id, occurred_at, deduplication_key,
      source_event_id, expires_at, retention_until,
      email_enabled_snapshot, email_delivery_mode
    )
    select
      source.company_id, recipients.user_id, source.event_code,
      source.event_group, source.domain, severity_value, mandatory_value,
      title_value, message_value, action_label_value, action_url_value,
      source.entity_type, source.entity_id, source.occurred_at,
      source.fingerprint, source.id,
      source.occurred_at + make_interval(days => expiry_days),
      source.occurred_at + interval '13 months',
      false, 'off'
    from recipients
    on conflict (recipient_user_id, deduplication_key) do nothing
    returning id
  )
  select counted.count, (select count(*) from inserted)::integer
  into eligible_count, created_count
  from counted;

  return jsonb_build_object(
    'eligibleRecipients', eligible_count,
    'created', created_count,
    'deduplicated', greatest(eligible_count - created_count, 0)
  );
end;
$$;

create or replace function public.create_partner_notification_event(
  p_company_id uuid,
  p_event_code text,
  p_entity_type text,
  p_entity_id uuid,
  p_source_table text,
  p_source_event_id uuid,
  p_source_version text,
  p_occurred_at timestamptz,
  p_safe_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  group_value text;
  domain_value text;
  fingerprint_value text;
  saved public.partner_notification_events;
  projection jsonb;
  was_created boolean := false;
begin
  group_value := case
    when p_event_code like 'order_%' then 'orders'
    when p_event_code like 'shipment_%' or p_event_code like 'date_change_%'
      then 'shipments'
    when p_event_code in (
      'invitation_expiring', 'invitation_accepted', 'employee_suspended',
      'role_changed', 'price_access_changed'
    ) then 'company_access'
    else null
  end;
  domain_value := case
    when group_value = 'orders' then 'orders'
    when group_value = 'shipments' then 'shipments'
    when group_value = 'company_access' then 'access'
  end;
  if group_value is null or p_source_version is null or p_occurred_at is null
     or jsonb_typeof(coalesce(p_safe_payload, '{}'::jsonb)) <> 'object' then
    raise exception 'Notification source input is invalid.' using errcode = '22023';
  end if;

  fingerprint_value := encode(digest(
    concat_ws('|', p_event_code, p_company_id::text, p_entity_type,
      p_entity_id::text, coalesce(p_source_event_id::text, p_source_version),
      p_source_version),
    'sha256'
  ), 'hex');

  insert into public.partner_notification_events(
    company_id, event_code, event_group, domain, entity_type, entity_id,
    source_table, source_event_id, source_version, occurred_at,
    safe_payload, fingerprint
  ) values (
    p_company_id, p_event_code, group_value, domain_value, p_entity_type,
    p_entity_id, p_source_table, p_source_event_id, p_source_version,
    p_occurred_at, coalesce(p_safe_payload, '{}'::jsonb), fingerprint_value
  )
  on conflict (fingerprint) do nothing
  returning * into saved;

  if saved.id is null then
    select * into saved
    from public.partner_notification_events
    where fingerprint = fingerprint_value;
  else
    was_created := true;
  end if;

  projection := public.project_partner_notification_event(saved.id);
  return projection || jsonb_build_object(
    'sourceEventId', saved.id,
    'sourceCreated', was_created
  );
end;
$$;

create or replace function public.record_partner_order_notification_transition()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare event_name text;
begin
  if tg_op = 'INSERT' then
    event_name := 'order_submitted';
  elsif old.integration_status is distinct from new.integration_status then
    event_name := case new.integration_status
      when 'confirmed' then 'order_confirmed'
      when 'reconciliation_required' then 'order_reconciliation_required'
      when 'manual_review_required' then 'order_requires_attention'
      when 'confirmed_not_created' then 'order_requires_attention'
      when 'failed' then 'order_requires_attention'
      else null
    end;
  elsif old.status is distinct from new.status and new.status = 'unknown' then
    event_name := 'order_readback_failed';
  end if;

  if event_name is not null then
    insert into public.partner_order_notification_events(
      company_id, partner_order_id, event_type, occurred_at, fingerprint
    ) values (
      new.company_id, new.id, event_name, now(),
      encode(digest(new.id::text || '|' || event_name || '|'
        || coalesce(new.integration_status, new.status), 'sha256'), 'hex')
    ) on conflict (fingerprint) do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.project_partner_order_notification_event()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare target_order public.partner_orders%rowtype;
begin
  select * into target_order
  from public.partner_orders where id = new.partner_order_id;
  perform public.create_partner_notification_event(
    new.company_id, new.event_type, 'order', new.partner_order_id,
    'partner_order_notification_events', new.id, new.fingerprint,
    new.occurred_at,
    jsonb_build_object(
      'objectNumber', target_order.external_1c_number,
      'creatorUserId', target_order.submitted_by
    )
  );
  return new;
end;
$$;

create or replace function public.project_order_history_notification_event()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  event_name text;
  target_order public.partner_order_history%rowtype;
begin
  event_name := case new.event_type
    when 'posted' then 'order_posted'
    when 'delivery_date_changed' then 'shipment_date_changed'
    when 'date_change_approved' then 'date_change_approved'
    when 'date_change_rejected' then 'date_change_rejected'
    when 'date_change_cancelled' then 'date_change_cancelled'
    else null
  end;
  if event_name is null or new.internal_only then return new; end if;

  select * into target_order
  from public.partner_order_history where id = new.order_history_id;
  if not found or not target_order.partner_visible or target_order.one_c_deletion_mark then
    return new;
  end if;

  perform public.create_partner_notification_event(
    target_order.company_id, event_name,
    case when event_name like 'date_change_%' then 'date_change' else 'shipment' end,
    target_order.id, 'partner_order_history_events', new.id,
    new.fingerprint, new.occurred_at,
    jsonb_build_object(
      'objectNumber', target_order.external_1c_order_number,
      'previousValue', new.previous_value,
      'currentValue', new.current_value
    )
  );
  return new;
end;
$$;

create or replace function public.project_company_access_notification_event()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  event_name text;
  inviter_id uuid;
  entity_id uuid;
begin
  event_name := case new.event_type
    when 'invitation_accepted' then 'invitation_accepted'
    when 'employee_suspended' then 'employee_suspended'
    when 'role_changed' then 'role_changed'
    when 'price_access_changed' then 'price_access_changed'
    else null
  end;
  if event_name is null then return new; end if;

  if new.target_invitation_id is not null then
    select invitation.invited_by into inviter_id
    from public.invitations invitation where invitation.id = new.target_invitation_id;
  end if;
  entity_id := coalesce(new.target_invitation_id, new.target_user_id);
  if entity_id is null then return new; end if;

  perform public.create_partner_notification_event(
    new.company_id, event_name,
    case when new.target_invitation_id is not null then 'invitation' else 'membership' end,
    entity_id, 'company_user_events', new.id,
    new.id::text, new.created_at,
    jsonb_build_object(
      'targetUserId', new.target_user_id,
      'inviterUserId', inviter_id
    )
  );
  return new;
end;
$$;

drop trigger if exists record_partner_order_notification_transition
  on public.partner_orders;
create trigger record_partner_order_notification_transition
after insert or update of status, integration_status on public.partner_orders
for each row execute function public.record_partner_order_notification_transition();

drop trigger if exists project_partner_order_notification_event
  on public.partner_order_notification_events;
create trigger project_partner_order_notification_event
after insert on public.partner_order_notification_events
for each row execute function public.project_partner_order_notification_event();

drop trigger if exists project_order_history_notification_event
  on public.partner_order_history_events;
create trigger project_order_history_notification_event
after insert on public.partner_order_history_events
for each row execute function public.project_order_history_notification_event();

drop trigger if exists project_company_access_notification_event
  on public.company_user_events;
create trigger project_company_access_notification_event
after insert on public.company_user_events
for each row execute function public.project_company_access_notification_event();

revoke all on function public.notification_user_has_permission(uuid, uuid, text) from public;
revoke all on function public.project_partner_notification_event(uuid) from public, anon, authenticated;
revoke all on function public.create_partner_notification_event(uuid, text, text, uuid, text, uuid, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.project_partner_notification_event(uuid) to service_role;
grant execute on function public.create_partner_notification_event(uuid, text, text, uuid, text, uuid, text, timestamptz, jsonb) to service_role;

comment on table public.partner_order_notification_events is
  'Minimal append-only portal-order lifecycle source for notification projection.';
comment on function public.create_partner_notification_event(uuid, text, text, uuid, text, uuid, text, timestamptz, jsonb) is
  'Idempotent governed notification generation service. Domain triggers identify source transitions only.';

commit;
