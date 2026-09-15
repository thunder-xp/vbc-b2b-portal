begin;

-- Extend the durable Omnichannel audience without forging a partner company.
alter table public.notification_events
  alter column company_id drop not null,
  add column customer_account_id uuid null references public.customer_accounts(id) on delete restrict;
alter table public.notification_events
  drop constraint notification_events_communication_purpose_check,
  drop constraint notification_events_sensitivity_check,
  add constraint notification_events_communication_purpose_check check (
    communication_purpose is null or communication_purpose in (
      'TRANSACTIONAL','FINANCE','SECURITY','SUPPORT','CUSTOMER_SERVICE','MARKETING'
    )
  ),
  add constraint notification_events_sensitivity_check check (
    sensitivity in ('PUBLIC','PARTNER_PRIVATE','CUSTOMER_PRIVATE','FINANCIAL_PRIVATE','SECURITY_SENSITIVE')
  ),
  add constraint notification_events_audience_check check (
    (company_id is not null and customer_account_id is null)
    or (company_id is null and customer_account_id is not null and communication_purpose = 'CUSTOMER_SERVICE')
  );
create index notification_events_customer_account_created_idx
  on public.notification_events(customer_account_id, created_at desc, id desc)
  where customer_account_id is not null;

alter table public.notification_deliveries
  add column recipient_auth_user_id uuid null references auth.users(id) on delete restrict,
  drop constraint notification_deliveries_sensitivity_check,
  add constraint notification_deliveries_sensitivity_check check (
    sensitivity in ('PUBLIC','PARTNER_PRIVATE','CUSTOMER_PRIVATE','FINANCIAL_PRIVATE','SECURITY_SENSITIVE')
  ),
  add constraint notification_deliveries_recipient_identity_check check (
    (recipient_user_id is not null and recipient_auth_user_id is null)
    or (recipient_user_id is null and recipient_auth_user_id is not null)
  );
create index notification_deliveries_recipient_auth_user_idx
  on public.notification_deliveries(recipient_auth_user_id, created_at desc, id desc)
  where recipient_auth_user_id is not null;

alter table public.notification_delivery_rate_limit_reservations
  alter column company_id drop not null,
  add column customer_account_id uuid null references public.customer_accounts(id) on delete restrict,
  add column audience_identity text;
update public.notification_delivery_rate_limit_reservations
set audience_identity = 'partner-company:' || company_id::text;
alter table public.notification_delivery_rate_limit_reservations
  alter column audience_identity set not null,
  drop constraint notification_delivery_rate_limit_re_communication_purpose_check,
  add constraint notification_delivery_rate_limit_reservations_communication_purpose_check check (
    communication_purpose in ('TRANSACTIONAL','FINANCE','SECURITY','SUPPORT','CUSTOMER_SERVICE','MARKETING')
  ),
  add constraint notification_rate_limit_audience_check check (
    (company_id is not null and customer_account_id is null and audience_identity = 'partner-company:' || company_id::text)
    or (company_id is null and customer_account_id is not null and audience_identity = 'customer-account:' || customer_account_id::text)
  );
create index notification_rate_limit_audience_window_idx
  on public.notification_delivery_rate_limit_reservations(
    audience_identity, communication_purpose, channel, window_started_at
  ) where outcome = 'ALLOWED';

create or replace function public.prepare_notification_event_governance()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.communication_purpose := case
    when new.event_type in ('order.registered_in_1c','proposal.delivery','company.invitation') then 'TRANSACTIONAL'
    when new.event_type like 'finance.%' then 'FINANCE'
    when new.event_type like 'security.%' then 'SECURITY'
    when new.event_type like 'support.%' then 'SUPPORT'
    when new.event_type like 'customer_service.%' then 'CUSTOMER_SERVICE'
    when new.event_type like 'marketing.%' or new.event_type like 'commercial.%' then 'MARKETING'
    else null end;
  return new;
end;
$$;

create or replace function public.prepare_notification_delivery_governance()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_purpose text;
  v_explicit_preference public.partner_notification_preferences%rowtype;
begin
  select event.communication_purpose into v_purpose
  from public.notification_events event where event.id = new.notification_event_id;
  new.requested_mode := coalesce(new.requested_mode,new.channel_mode);
  new.effective_mode := coalesce(new.effective_mode,
    case when new.delivery_state='SUPPRESSED' then 'DISABLED'::public.communication_channel_mode else new.channel_mode end);
  if v_purpose='FINANCE' and new.channel='in_app' then
    select preference.* into v_explicit_preference
    from public.partner_notification_preferences preference
    join public.notification_events event on event.id=new.notification_event_id
    where preference.company_id=event.company_id
      and preference.user_id=new.recipient_user_id and preference.event_group='finance';
    new.preference_result:=coalesce(new.preference_result,case
      when v_explicit_preference.company_id is null then 'ALLOWED'
      when v_explicit_preference.in_app_enabled and v_explicit_preference.delivery_mode<>'off' then 'ALLOWED'
      else 'SUPPRESSED' end);
  else
    new.preference_result:=coalesce(new.preference_result,case
      when v_purpose in ('TRANSACTIONAL','SECURITY','CUSTOMER_SERVICE') then 'NOT_APPLICABLE'
      when v_purpose='FINANCE' and new.channel='email' then 'NOT_APPLICABLE'
      else 'NOT_CONFIGURED' end);
  end if;
  if new.preference_result in ('SUPPRESSED','NOT_CONFIGURED') then
    new.delivery_state:='SUPPRESSED'; new.status:='suppressed'; new.effective_mode:='DISABLED';
    new.suppression_reason:=coalesce(new.suppression_reason,
      case when new.preference_result='SUPPRESSED' then 'PREFERENCE_DISABLED' else 'PURPOSE_DISABLED' end);
  end if;
  new.rate_limit_result:=coalesce(new.rate_limit_result,'NOT_EVALUATED');
  new.sandbox_result:=coalesce(new.sandbox_result,
    case when new.channel_mode='SANDBOX' then 'RECIPIENT_NOT_ALLOWED' else 'NOT_APPLICABLE' end);
  new.policy_decision:=coalesce(new.policy_decision,
    case when new.delivery_state='SUPPRESSED' or new.preference_result in ('SUPPRESSED','NOT_CONFIGURED') then 'SUPPRESS' else 'ALLOW' end);
  return new;
end;
$$;

alter table public.customer_service_requests
  add column customer_locale text not null default 'ru'
  check (customer_locale in ('ru','ro'));

create or replace function public.create_customer_service_request_v2(
  p_customer_account_id uuid, p_customer_identity_id uuid, p_actor_user_id uuid,
  p_request_type text, p_subject text, p_description text, p_preferred_contact text,
  p_customer_locale text, p_retail_order_id uuid default null, p_retail_order_line_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare created_id uuid;
begin
  if p_customer_locale not in ('ru','ro') then
    raise exception 'Invalid customer locale.' using errcode='22023';
  end if;
  if not exists (select 1 from public.customer_accounts account where account.id=p_customer_account_id
    and account.customer_identity_id=p_customer_identity_id and account.auth_user_id=p_actor_user_id and account.status='ACTIVE')
    then raise exception 'Invalid customer context.' using errcode='42501'; end if;
  if p_retail_order_id is not null and not exists (select 1 from public.retail_orders orders
    join public.retail_customers customer on customer.id=orders.customer_id
    where orders.id=p_retail_order_id and customer.customer_identity_id=p_customer_identity_id)
    then raise exception 'Invalid customer order reference.' using errcode='42501'; end if;
  if p_retail_order_line_id is not null and not exists (select 1 from public.retail_order_lines line
    where line.id=p_retail_order_line_id and line.order_id=p_retail_order_id)
    then raise exception 'Invalid customer order-line reference.' using errcode='42501'; end if;
  insert into public.customer_service_requests(customer_account_id,customer_identity_id,retail_order_id,
    retail_order_line_id,request_type,subject,description,preferred_contact,customer_locale)
  values(p_customer_account_id,p_customer_identity_id,p_retail_order_id,p_retail_order_line_id,
    p_request_type,p_subject,p_description,p_preferred_contact,p_customer_locale) returning id into created_id;
  insert into public.customer_service_request_events(request_id,actor_kind,actor_user_id,event_type,to_status,safe_metadata)
  values(created_id,'CUSTOMER',p_actor_user_id,'CUSTOMER_SERVICE_CREATED','NEW',jsonb_build_object('requestType',p_request_type));
  return created_id;
end;
$$;

create or replace function public.get_customer_service_sms_recipient_context(p_source_event_id uuid)
returns jsonb language plpgsql security definer set search_path = '' set row_security = off as $$
declare result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Customer Service SMS recipient lookup requires service role.' using errcode='42501';
  end if;
  select jsonb_build_object(
    'requestId', request.id,
    'eventId', event.id,
    'eventCode', event.event_type,
    'customerAccountId', account.id,
    'authUserId', account.auth_user_id,
    'verifiedPhone', auth_user.phone,
    'locale', request.customer_locale
  ) into result
  from public.customer_service_request_events event
  join public.customer_service_requests request on request.id=event.request_id
  join public.customer_accounts account on account.id=request.customer_account_id
    and account.status='ACTIVE'
  join auth.users auth_user on auth_user.id=account.auth_user_id
    and auth_user.phone_confirmed_at is not null and auth_user.phone is not null
  where event.id=p_source_event_id
    and event.event_type in (
      'CUSTOMER_SERVICE_NEED_INFO','CUSTOMER_SERVICE_REPLY_FROM_NOVOTECH','CUSTOMER_SERVICE_RESOLVED'
    );
  return result;
end;
$$;

create or replace function public.persist_customer_service_sms_intent(p_intent jsonb,p_delivery jsonb)
returns jsonb language plpgsql security definer set search_path = '' set row_security = off as $$
declare
  v_event_id uuid;
  v_delivery_id uuid;
  v_customer_account_id uuid;
  v_recipient_auth_user_id uuid;
  v_source_event_id uuid;
  v_request_id uuid;
  v_correlation_id uuid;
  v_expected_phone text;
  v_source_event_type text;
  v_expected_business_event_type text;
  v_expected_template_key text;
  v_event_status public.notification_delivery_status;
  v_delivery_state public.communication_delivery_state;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Customer Service SMS persistence requires service role.' using errcode='42501';
  end if;
  if jsonb_typeof(p_intent) <> 'object' or jsonb_typeof(p_delivery) <> 'object'
    or p_intent->>'purpose' <> 'CUSTOMER_SERVICE'
    or p_intent->>'businessEventType' not in (
      'customer_service.need_info','customer_service.reply_from_novotech','customer_service.resolved'
    )
    or p_intent->>'sensitivity' <> 'CUSTOMER_PRIVATE'
    or jsonb_typeof(p_intent->'businessEntityReferences') <> 'array'
    or jsonb_array_length(p_intent->'businessEntityReferences') <> 2
    or not (p_intent ? 'companyId')
    or p_intent->'companyId' <> 'null'::jsonb
    or coalesce(p_intent->>'intentId','') !~ '^customer-service-sms:[0-9a-f-]{36}$'
    or coalesce(p_intent->>'businessIdentity','') !~ '^customer-service:[0-9a-f-]{36}$'
    or p_delivery->>'channel' <> 'sms'
    or p_delivery->>'channelMode' not in ('DISABLED','SANDBOX')
    or p_delivery->>'requestedMode' not in ('DISABLED','SANDBOX')
    or p_delivery->>'state' not in ('SUPPRESSED','READY','QUEUED')
    or coalesce(p_delivery->>'deliveryIdentity','') !~ '^[0-9a-f]{64}$'
    or coalesce(p_delivery->>'templateKey','') !~ '^customer_service\.[a-z_]+$'
    or p_delivery->>'templateRevision' <> 'v1'
    or p_delivery->>'locale' not in ('ru','ro')
    or p_delivery->>'adapterIdentity' <> 'moldcell' then
    raise exception 'Customer Service SMS intent is invalid.' using errcode='22023';
  end if;
  begin
    v_customer_account_id := (p_intent->>'customerAccountId')::uuid;
    v_recipient_auth_user_id := (p_intent->>'recipientUserId')::uuid;
    v_source_event_id := substring(p_intent->>'intentId' from 22)::uuid;
    v_request_id := substring((p_intent->'businessEntityReferences'->>0) from 26)::uuid;
    v_correlation_id := (p_intent->>'correlationId')::uuid;
  exception when others then
    raise exception 'Customer Service SMS identity is invalid.' using errcode='22023';
  end;
  select auth_user.phone, source_event.event_type into v_expected_phone, v_source_event_type
  from public.customer_accounts account
  join auth.users auth_user on auth_user.id=account.auth_user_id
  join public.customer_service_requests request on request.customer_account_id=account.id
  join public.customer_service_request_events source_event on source_event.request_id=request.id
  where account.id=v_customer_account_id and account.auth_user_id=v_recipient_auth_user_id
    and account.status='ACTIVE' and auth_user.phone_confirmed_at is not null
    and request.id=v_request_id and source_event.id=v_source_event_id
    and source_event.event_type in (
      'CUSTOMER_SERVICE_NEED_INFO','CUSTOMER_SERVICE_REPLY_FROM_NOVOTECH','CUSTOMER_SERVICE_RESOLVED'
    ) and request.customer_locale=p_delivery->>'locale';
  if v_expected_phone is null or btrim(v_expected_phone) <> btrim(p_delivery->>'recipient') then
    raise exception 'Customer Service SMS recipient is not the verified customer phone.' using errcode='42501';
  end if;
  v_expected_business_event_type := case v_source_event_type
    when 'CUSTOMER_SERVICE_NEED_INFO' then 'customer_service.need_info'
    when 'CUSTOMER_SERVICE_REPLY_FROM_NOVOTECH' then 'customer_service.reply_from_novotech'
    when 'CUSTOMER_SERVICE_RESOLVED' then 'customer_service.resolved'
    else null end;
  v_expected_template_key := case v_source_event_type
    when 'CUSTOMER_SERVICE_NEED_INFO' then 'customer_service.need_info_sms'
    when 'CUSTOMER_SERVICE_REPLY_FROM_NOVOTECH' then 'customer_service.reply_sms'
    when 'CUSTOMER_SERVICE_RESOLVED' then 'customer_service.resolved_sms'
    else null end;
  if v_correlation_id <> v_source_event_id
    or p_intent->>'intentId' <> 'customer-service-sms:' || v_source_event_id::text
    or p_intent->>'businessIdentity' <> 'customer-service:' || v_source_event_id::text
    or p_intent->'businessEntityReferences'->>0 <> 'customer-service-request:' || v_request_id::text
    or p_intent->'businessEntityReferences'->>1 <> 'customer-service-event:' || v_source_event_id::text
    or nullif(p_delivery->>'customerAccountId','')::uuid is distinct from v_customer_account_id
    or p_intent->>'businessEventType' <> v_expected_business_event_type
    or p_delivery->>'templateKey' <> v_expected_template_key then
    raise exception 'Customer Service SMS semantic identity is invalid.' using errcode='22023';
  end if;
  v_delivery_state := (p_delivery->>'state')::public.communication_delivery_state;
  v_event_status := case when v_delivery_state in ('READY','QUEUED') then 'queued'::public.notification_delivery_status
    else 'suppressed'::public.notification_delivery_status end;
  insert into public.notification_events(
    event_type,company_id,customer_account_id,partner_order_id,correlation_id,payload_version,payload,
    status,available_at,intent_id,business_entity_references,business_identity,
    communication_correlation_id,sensitivity,communication_purpose
  ) values (
    p_intent->>'businessEventType',null,v_customer_account_id,null,v_correlation_id,1,
    jsonb_build_object('scheduledBusinessDate',p_intent->>'scheduledBusinessDate',
      'businessEntityReferences',p_intent->'businessEntityReferences','customerAccountId',v_customer_account_id,
      'sourceEventId',v_source_event_id,'requestId',v_request_id),
    v_event_status,now(),p_intent->>'intentId',p_intent->'businessEntityReferences',
    p_intent->>'businessIdentity',p_intent->>'correlationId','CUSTOMER_PRIVATE','CUSTOMER_SERVICE'
  ) on conflict(intent_id) do nothing returning id into v_event_id;
  if v_event_id is null then
    select id into v_event_id from public.notification_events
    where intent_id=p_intent->>'intentId' and customer_account_id=v_customer_account_id
      and event_type=p_intent->>'businessEventType' and business_identity=p_intent->>'businessIdentity';
    if v_event_id is null then raise exception 'Customer Service SMS intent identity conflict.' using errcode='23505'; end if;
  else
    insert into public.notification_delivery_audit_events(notification_event_id,event_name,correlation_id,idempotency_key)
    values(v_event_id,'communication_intent_persisted',v_correlation_id,
      'communication_intent_persisted:' || (p_intent->>'intentId')) on conflict(idempotency_key) do nothing;
  end if;
  insert into public.notification_deliveries(
    notification_event_id,channel,recipient_user_id,recipient_auth_user_id,recipient,template_version,
    idempotency_key,status,next_attempt_at,delivery_identity,channel_mode,delivery_state,template_key,
    template_revision,recipient_locale,recipient_fingerprint,sensitivity,rendered_snapshot,
    suppression_reason,adapter_identity,requested_mode,effective_mode,policy_decision,
    preference_result,rate_limit_result,sandbox_result,sandbox_actual_recipient
  ) values (
    v_event_id,'sms',null,v_recipient_auth_user_id,btrim(p_delivery->>'recipient'),1,
    (p_delivery->>'deliveryIdentity') || ':' || (p_delivery->>'channelMode'),
    case when v_delivery_state='SUPPRESSED' then 'suppressed'::public.notification_delivery_status else 'queued'::public.notification_delivery_status end,
    now(),p_delivery->>'deliveryIdentity',(p_delivery->>'channelMode')::public.communication_channel_mode,
    v_delivery_state,p_delivery->>'templateKey','v1',p_delivery->>'locale',
    encode(extensions.digest(btrim(p_delivery->>'recipient'),'sha256'),'hex'),'CUSTOMER_PRIVATE',
    p_delivery->'renderSnapshot',nullif(p_delivery->>'suppressionReason',''),'moldcell',
    (p_delivery->>'requestedMode')::public.communication_channel_mode,
    (p_delivery->>'effectiveMode')::public.communication_channel_mode,p_delivery->>'policyDecision',
    p_delivery->>'preferenceOutcome',p_delivery->>'rateLimitOutcome',p_delivery->>'sandboxOutcome',
    nullif(btrim(p_delivery->>'sandboxActualRecipient'),'')
  ) on conflict(delivery_identity,channel_mode) do nothing returning id into v_delivery_id;
  if v_delivery_id is null then
    select id into v_delivery_id from public.notification_deliveries
    where notification_event_id=v_event_id and delivery_identity=p_delivery->>'deliveryIdentity'
      and channel_mode=(p_delivery->>'channelMode')::public.communication_channel_mode and channel='sms';
    if v_delivery_id is null then raise exception 'Customer Service SMS delivery identity conflict.' using errcode='23505'; end if;
  else
    insert into public.notification_delivery_audit_events(
      notification_event_id,notification_delivery_id,event_name,error_category,correlation_id,idempotency_key
    ) values (v_event_id,v_delivery_id,
      case when v_delivery_state='SUPPRESSED' then 'notification_delivery_suppressed' else 'notification_delivery_projected' end,
      nullif(p_delivery->>'suppressionReason',''),v_correlation_id,
      'communication_delivery_persisted:' || (p_delivery->>'deliveryIdentity') || ':' || (p_delivery->>'channelMode'))
    on conflict(idempotency_key) do nothing;
  end if;
  return jsonb_build_object('intentId',p_intent->>'intentId','eventId',v_event_id,'deliveries',jsonb_build_array(
    jsonb_build_object('deliveryId',v_delivery_id,'deliveryIdentity',p_delivery->>'deliveryIdentity',
      'channel','sms','channelMode',p_delivery->>'channelMode','state',p_delivery->>'state')));
end;
$$;

create or replace function public.reserve_notification_delivery_rate_limit(p_delivery_id uuid,p_lease_token uuid)
returns jsonb language plpgsql security definer set search_path = '' set row_security = off as $$
declare
  v_delivery public.notification_deliveries%rowtype;
  v_event public.notification_events%rowtype;
  v_existing public.notification_delivery_rate_limit_reservations%rowtype;
  v_policy record;
  v_window timestamptz := date_trunc('hour',now());
  v_recipient_count integer;
  v_audience_count integer;
  v_recipient_limit integer := 10;
  v_audience_limit integer := 100;
  v_audience_identity text;
  v_outcome text;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Communication rate limit is service-only.' using errcode='42501'; end if;
  select * into v_delivery from public.notification_deliveries
  where id=p_delivery_id and delivery_state='PROCESSING' and lease_token=p_lease_token for update;
  if v_delivery.id is null or v_delivery.channel_mode not in ('LIVE','SANDBOX') then
    raise exception 'Communication rate-limit claim is stale.' using errcode='55000'; end if;
  select * into v_existing from public.notification_delivery_rate_limit_reservations
  where notification_delivery_id=v_delivery.id;
  if v_existing.id is not null then return jsonb_build_object('deliveryId',v_delivery.id,'outcome',v_existing.outcome,
    'recipientCount',v_existing.recipient_count,'companyCount',v_existing.company_count,
    'recipientLimit',v_existing.recipient_limit,'companyLimit',v_existing.company_limit); end if;
  select * into v_event from public.notification_events where id=v_delivery.notification_event_id;
  if v_event.communication_purpose is null then raise exception 'Communication purpose is not governed.' using errcode='22023'; end if;
  v_audience_identity := case when v_event.company_id is not null then 'partner-company:' || v_event.company_id::text
    else 'customer-account:' || v_event.customer_account_id::text end;
  select policy.recipient_limit_per_hour,policy.company_limit_per_hour into v_policy
  from public.notification_provider_rate_policies policy
  where policy.provider_identity=coalesce(v_delivery.adapter_identity,v_delivery.channel::text)
    and policy.channel=v_delivery.channel and policy.channel_mode=v_delivery.channel_mode;
  if found then v_recipient_limit:=v_policy.recipient_limit_per_hour; v_audience_limit:=v_policy.company_limit_per_hour; end if;
  if v_event.communication_purpose='CUSTOMER_SERVICE' and v_delivery.channel='sms'
    and v_delivery.channel_mode='SANDBOX' then v_recipient_limit:=3; v_audience_limit:=10; end if;
  perform pg_advisory_xact_lock(hashtextextended('recipient|' || v_delivery.recipient_fingerprint || '|' || v_delivery.channel::text || '|' || v_window::text,0));
  perform pg_advisory_xact_lock(hashtextextended('audience|' || v_audience_identity || '|' || v_event.communication_purpose || '|' || v_delivery.channel::text || '|' || v_window::text,0));
  select count(*) into v_recipient_count from public.notification_delivery_rate_limit_reservations
    where recipient_fingerprint=v_delivery.recipient_fingerprint and channel=v_delivery.channel
      and window_started_at=v_window and outcome='ALLOWED';
  select count(*) into v_audience_count from public.notification_delivery_rate_limit_reservations
    where audience_identity=v_audience_identity and communication_purpose=v_event.communication_purpose
      and channel=v_delivery.channel and window_started_at=v_window and outcome='ALLOWED';
  v_outcome:=case when v_recipient_count>=v_recipient_limit or v_audience_count>=v_audience_limit then 'RATE_LIMITED' else 'ALLOWED' end;
  if v_outcome='ALLOWED' then v_recipient_count:=v_recipient_count+1; v_audience_count:=v_audience_count+1; end if;
  insert into public.notification_delivery_rate_limit_reservations(
    notification_delivery_id,company_id,customer_account_id,audience_identity,communication_purpose,channel,
    recipient_fingerprint,window_started_at,outcome,recipient_count,company_count,recipient_limit,company_limit
  ) values (v_delivery.id,v_event.company_id,v_event.customer_account_id,v_audience_identity,v_event.communication_purpose,
    v_delivery.channel,v_delivery.recipient_fingerprint,v_window,v_outcome,v_recipient_count,v_audience_count,
    v_recipient_limit,v_audience_limit);
  update public.notification_deliveries set rate_limit_result=v_outcome where id=v_delivery.id;
  return jsonb_build_object('deliveryId',v_delivery.id,'outcome',v_outcome,'recipientCount',v_recipient_count,
    'companyCount',v_audience_count,'recipientLimit',v_recipient_limit,'companyLimit',v_audience_limit);
end;
$$;

revoke all on function public.create_customer_service_request_v2(uuid,uuid,uuid,text,text,text,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_customer_service_request_v2(uuid,uuid,uuid,text,text,text,text,text,uuid,uuid) to service_role;
revoke all on function public.get_customer_service_sms_recipient_context(uuid) from public,anon,authenticated;
grant execute on function public.get_customer_service_sms_recipient_context(uuid) to service_role;
revoke all on function public.persist_customer_service_sms_intent(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.persist_customer_service_sms_intent(jsonb,jsonb) to service_role;

comment on function public.persist_customer_service_sms_intent(jsonb,jsonb) is
  'Service-only Final Customer adapter into the common durable Omnichannel outbox. It accepts only verified Customer Service SMS evidence.';
comment on column public.customer_service_requests.customer_locale is
  'Trusted locale captured from the authenticated customer request; deterministic RU fallback applies to older rows.';

commit;
