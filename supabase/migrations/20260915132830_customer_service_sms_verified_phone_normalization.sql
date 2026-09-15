begin;

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
  v_expected_phone_digits text;
  v_expected_phone_canonical text;
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
  v_expected_phone_digits := regexp_replace(coalesce(v_expected_phone,''),'[^0-9]','','g');
  v_expected_phone_canonical := case
    when v_expected_phone_digits ~ '^373[0-9]{8}$' then '+' || v_expected_phone_digits
    when v_expected_phone_digits ~ '^0[0-9]{8}$' then '+373' || substring(v_expected_phone_digits from 2)
    when v_expected_phone_digits ~ '^[0-9]{8}$' then '+373' || v_expected_phone_digits
    else null
  end;
  if v_expected_phone_canonical is null or v_expected_phone_canonical <> btrim(p_delivery->>'recipient') then
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

revoke all on function public.persist_customer_service_sms_intent(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.persist_customer_service_sms_intent(jsonb,jsonb) to service_role;

comment on function public.persist_customer_service_sms_intent(jsonb,jsonb) is
  'Service-only Final Customer adapter into the common durable Omnichannel outbox. It canonicalizes the verified Supabase Auth phone before identity comparison.';

commit;
