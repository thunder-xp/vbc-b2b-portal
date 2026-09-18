begin;

set local lock_timeout = '5s';

create table public.public_legal_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_kind text not null check (document_kind in ('terms','privacy','delivery','returns')),
  locale text not null check (locale in ('ru','ro')),
  version text not null check (version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  effective_at timestamptz not null,
  public_path text not null check (public_path ~ '^/(terms|privacy|delivery|returns)$'),
  status text not null default 'published' check (status in ('published','retired')),
  created_at timestamptz not null default now(),
  unique(document_kind, locale, version)
);

insert into public.public_legal_document_versions(document_kind,locale,version,effective_at,public_path)
values
  ('terms','ru','2026-09-18','2026-09-18T00:00:00+03:00','/terms'),
  ('terms','ro','2026-09-18','2026-09-18T00:00:00+03:00','/terms'),
  ('privacy','ru','2026-09-18','2026-09-18T00:00:00+03:00','/privacy'),
  ('privacy','ro','2026-09-18','2026-09-18T00:00:00+03:00','/privacy'),
  ('delivery','ru','2026-09-18','2026-09-18T00:00:00+03:00','/delivery'),
  ('delivery','ro','2026-09-18','2026-09-18T00:00:00+03:00','/delivery'),
  ('returns','ru','2026-09-18','2026-09-18T00:00:00+03:00','/returns'),
  ('returns','ro','2026-09-18','2026-09-18T00:00:00+03:00','/returns');

create table public.retail_legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  retail_order_id uuid not null references public.retail_orders(id) on delete restrict,
  retail_customer_id uuid not null references public.retail_customers(id) on delete restrict,
  actor_auth_user_id uuid null references auth.users(id) on delete restrict,
  terms_version text not null,
  privacy_version text not null,
  locale text not null check (locale in ('ru','ro')),
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(retail_order_id,terms_version,privacy_version)
);

create index retail_legal_acceptances_customer_created_idx
  on public.retail_legal_acceptances(retail_customer_id,created_at desc,id);

create table public.retail_payment_return_tokens (
  id uuid primary key default gen_random_uuid(),
  payment_attempt_id uuid not null references public.retail_payment_attempts(id) on delete cascade,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null default (now()+interval '30 days'),
  created_at timestamptz not null default now(),
  unique(payment_attempt_id,token_hash)
);

create unique index retail_payment_return_tokens_hash_idx
  on public.retail_payment_return_tokens(token_hash);

create function public.prevent_retail_legal_acceptance_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Retail legal acceptances are append-only.' using errcode='55000';
end;
$$;

create trigger prevent_retail_legal_acceptance_mutation
before update or delete on public.retail_legal_acceptances
for each row execute function public.prevent_retail_legal_acceptance_mutation();

alter table public.public_legal_document_versions enable row level security;
alter table public.retail_legal_acceptances enable row level security;
alter table public.retail_payment_return_tokens enable row level security;
revoke all on public.public_legal_document_versions,public.retail_legal_acceptances,public.retail_payment_return_tokens from public,anon,authenticated,service_role;
grant select on public.public_legal_document_versions to service_role;
grant select,insert on public.retail_legal_acceptances to service_role;
grant select,insert on public.retail_payment_return_tokens to service_role;

create function public.create_public_retail_order_v3(
  p_token_hash text,p_locale text,p_checkout_fingerprint text,p_submission_key uuid,p_request_fingerprint text,
  p_access_token_hash text,p_customer jsonb,p_delivery_address jsonb,p_installation_address jsonb,
  p_commercial_offer_id uuid,p_installation_selection_mode text,p_preferred_provider_id uuid,p_installation_region_code text,
  p_terms_version text,p_privacy_version text,p_legal_locale text
) returns jsonb language plpgsql security definer set search_path = public set row_security = off as $$
declare
  result jsonb;
  target_order public.retail_orders%rowtype;
begin
  if p_terms_version <> '2026-09-18' or p_privacy_version <> '2026-09-18'
    or p_legal_locale not in ('ru','ro') or p_legal_locale <> p_locale then
    raise exception 'Current legal acceptance is required.' using errcode='22023';
  end if;
  if coalesce(btrim(p_customer->>'email'),'') !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A deliverable email is required.' using errcode='22023';
  end if;
  result:=public.create_public_retail_order_v2(
    p_token_hash,p_locale,p_checkout_fingerprint,p_submission_key,p_request_fingerprint,
    p_access_token_hash,p_customer,p_delivery_address,p_installation_address,p_commercial_offer_id,
    p_installation_selection_mode,p_preferred_provider_id,p_installation_region_code
  );
  select * into target_order from public.retail_orders where submission_key=p_submission_key;
  if target_order.id is null then raise exception 'Retail order was not created.' using errcode='P0002'; end if;
  insert into public.retail_legal_acceptances(
    retail_order_id,retail_customer_id,actor_auth_user_id,terms_version,privacy_version,locale
  ) values (
    target_order.id,target_order.customer_id,auth.uid(),p_terms_version,p_privacy_version,p_legal_locale
  ) on conflict(retail_order_id,terms_version,privacy_version) do nothing;
  return result;
end;
$$;

revoke all on function public.create_public_retail_order_v3(text,text,text,uuid,text,text,jsonb,jsonb,jsonb,uuid,text,uuid,text,text,text,text)
from public,anon,authenticated,service_role;
grant execute on function public.create_public_retail_order_v3(text,text,text,uuid,text,text,jsonb,jsonb,jsonb,uuid,text,uuid,text,text,text,text)
to anon,service_role;

create function public.claim_retail_payment_attempt_v2(
  p_access_token_hash text,p_provider text,p_idempotency_key uuid,p_return_access_token_hash text
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  target_order public.retail_orders%rowtype;
  target_customer public.retail_customers%rowtype;
  result jsonb;
begin
  if p_access_token_hash !~ '^[0-9a-f]{64}$' or p_return_access_token_hash !~ '^[0-9a-f]{64}$'
    then return jsonb_build_object('outcome','NOT_ELIGIBLE'); end if;
  select orders.* into target_order
  from public.retail_order_access_tokens token
  join public.retail_orders orders on orders.id=token.order_id
  where token.token_hash=p_access_token_hash and token.revoked_at is null and token.expires_at>now();
  if target_order.id is null then return jsonb_build_object('outcome','NOT_ELIGIBLE'); end if;
  select * into target_customer
  from public.retail_customers customers
  where customers.id=target_order.customer_id;
  if not exists(
    select 1 from public.retail_legal_acceptances acceptance
    where acceptance.retail_order_id=target_order.id and acceptance.retail_customer_id=target_order.customer_id
      and acceptance.terms_version='2026-09-18' and acceptance.privacy_version='2026-09-18'
  ) then return jsonb_build_object('outcome','TERMS_NOT_ACCEPTED'); end if;
  if coalesce(btrim(target_customer.email),'') !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return jsonb_build_object('outcome','EMAIL_REQUIRED');
  end if;
  result:=public.claim_retail_payment_attempt(p_access_token_hash,p_provider,p_idempotency_key);
  if result->>'outcome' in ('CLAIMED','REUSE_PENDING') then
    insert into public.retail_payment_return_tokens(payment_attempt_id,token_hash)
    values ((result->>'attemptId')::uuid,p_return_access_token_hash)
    on conflict(payment_attempt_id,token_hash) do nothing;
  end if;
  return result;
end;
$$;

revoke all on function public.claim_retail_payment_attempt_v2(text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_retail_payment_attempt_v2(text,text,uuid,text) to service_role;

create function public.get_retail_payment_return_state_v2(p_payment_attempt_id uuid,p_return_access_token_hash text)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'status',case when current_state.payment_state='REFUNDED' then 'REFUNDED'
      when current_state.payment_state='REFUND_PENDING' then 'REFUND_PENDING'
      when attempt.status='paid' then 'PAID'
      when attempt.status in ('failed','expired') then 'FAILED'
      when attempt.status='cancelled' then 'CANCELLED' else 'PROCESSING' end,
    'locale',orders.locale,'orderNumber',orders.public_number,'amount',attempt.amount,
    'currency',attempt.currency,'confirmedAt',attempt.confirmed_at,
    'items',coalesce((select jsonb_agg(jsonb_build_object('name',line.product_name,'sku',line.sku,'quantity',line.quantity)
      order by line.line_number) from public.retail_order_lines line where line.order_id=orders.id),'[]'::jsonb)
  )
  from public.retail_payment_attempts attempt
  join public.retail_orders orders on orders.id=attempt.retail_order_id
  join public.retail_payment_return_tokens token on token.payment_attempt_id=attempt.id
    and token.token_hash=p_return_access_token_hash and token.expires_at>now()
  left join public.retail_payment_current_states_v1 current_state on current_state.payment_attempt_id=attempt.id
  where attempt.provider='maib' and attempt.id=p_payment_attempt_id and p_return_access_token_hash ~ '^[0-9a-f]{64}$';
$$;

revoke all on function public.get_retail_payment_return_state_v2(uuid,text) from public,anon,authenticated;
grant execute on function public.get_retail_payment_return_state_v2(uuid,text) to service_role;
revoke execute on function public.get_retail_payment_return_state_v1(uuid) from service_role;

-- Add guest Retail customers as a governed Omnichannel audience.
alter table public.notification_events add column retail_customer_id uuid null references public.retail_customers(id) on delete restrict;
alter table public.notification_events drop constraint notification_events_audience_check;
alter table public.notification_events add constraint notification_events_audience_check check (
  (company_id is not null and customer_account_id is null and retail_customer_id is null)
  or (company_id is null and customer_account_id is not null and retail_customer_id is null and communication_purpose='CUSTOMER_SERVICE')
  or (company_id is null and customer_account_id is null and retail_customer_id is not null and communication_purpose='TRANSACTIONAL')
);
create index notification_events_retail_customer_created_idx
  on public.notification_events(retail_customer_id,created_at desc,id) where retail_customer_id is not null;

alter table public.notification_deliveries add column recipient_retail_customer_id uuid null references public.retail_customers(id) on delete restrict;
alter table public.notification_deliveries drop constraint notification_deliveries_recipient_identity_check;
alter table public.notification_deliveries add constraint notification_deliveries_recipient_identity_check check (
  ((recipient_user_id is not null)::integer+(recipient_auth_user_id is not null)::integer+(recipient_retail_customer_id is not null)::integer)=1
);
create index notification_deliveries_recipient_retail_customer_idx
  on public.notification_deliveries(recipient_retail_customer_id,created_at desc,id) where recipient_retail_customer_id is not null;

alter table public.notification_delivery_rate_limit_reservations
  add column retail_customer_id uuid null references public.retail_customers(id) on delete restrict;
alter table public.notification_delivery_rate_limit_reservations drop constraint notification_rate_limit_audience_check;
alter table public.notification_delivery_rate_limit_reservations add constraint notification_rate_limit_audience_check check (
  (company_id is not null and customer_account_id is null and retail_customer_id is null and audience_identity='partner-company:'||company_id::text)
  or (company_id is null and customer_account_id is not null and retail_customer_id is null and audience_identity='customer-account:'||customer_account_id::text)
  or (company_id is null and customer_account_id is null and retail_customer_id is not null and audience_identity='retail-customer:'||retail_customer_id::text)
);

create or replace function public.prepare_notification_event_governance()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.communication_purpose:=case
    when new.event_type in ('order.registered_in_1c','proposal.delivery','company.invitation','marketplace.invitation','retail.payment_confirmed') then 'TRANSACTIONAL'
    when new.event_type like 'finance.%' then 'FINANCE'
    when new.event_type like 'security.%' then 'SECURITY'
    when new.event_type like 'support.%' then 'SUPPORT'
    when new.event_type like 'customer_service.%' then 'CUSTOMER_SERVICE'
    when new.event_type like 'marketing.%' or new.event_type like 'commercial.%' then 'MARKETING'
    else null end;
  return new;
end;
$$;

create or replace function public.persist_retail_payment_confirmation_email_v1(p_payment_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path = '' set row_security = off as $$
declare
  v_attempt public.retail_payment_attempts%rowtype;
  v_order public.retail_orders%rowtype;
  v_customer public.retail_customers%rowtype;
  v_event_id uuid;
  v_delivery_id uuid;
  v_intent_id text;
  v_delivery_identity text;
  v_rendered jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Retail payment notification requires service role.' using errcode='42501'; end if;
  select * into v_attempt from public.retail_payment_attempts where id=p_payment_attempt_id and provider='maib';
  if v_attempt.id is null or v_attempt.status<>'paid' or v_attempt.confirmed_at is null then
    return jsonb_build_object('outcome','NOT_PAID');
  end if;
  select * into v_order from public.retail_orders where id=v_attempt.retail_order_id;
  select * into v_customer from public.retail_customers where id=v_order.customer_id;
  if coalesce(btrim(v_customer.email),'') !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return jsonb_build_object('outcome','EMAIL_UNAVAILABLE');
  end if;
  v_intent_id:='retail.payment_confirmed:'||v_attempt.id::text;
  v_delivery_identity:=encode(extensions.digest(v_intent_id||'|email|'||lower(btrim(v_customer.email))||'|v1','sha256'),'hex');
  v_rendered:=jsonb_build_object(
    'orderNumber',v_order.public_number,'merchantName','Novotech','website','nsd.md',
    'amount',v_attempt.amount,'currency',v_attempt.currency,'confirmedAt',v_attempt.confirmed_at,
    'locale',v_order.locale,'items',coalesce((select jsonb_agg(jsonb_build_object(
      'name',line.product_name,'sku',line.sku,'quantity',line.quantity) order by line.line_number)
      from public.retail_order_lines line where line.order_id=v_order.id),'[]'::jsonb)
  );
  insert into public.notification_events(
    event_type,company_id,partner_order_id,customer_account_id,retail_customer_id,correlation_id,
    payload_version,payload,status,available_at,intent_id,business_entity_references,business_identity,
    communication_correlation_id,sensitivity
  ) values (
    'retail.payment_confirmed',null,null,null,v_customer.id,v_attempt.id,1,
    jsonb_build_object('paymentAttemptId',v_attempt.id,'orderNumber',v_order.public_number,'locale',v_order.locale,'retailCustomerId',v_customer.id),
    'queued',now(),v_intent_id,jsonb_build_array('retail-order:'||v_order.id::text,'payment-attempt:'||v_attempt.id::text),
    'retail-payment:'||v_attempt.id::text,v_attempt.id::text,'CUSTOMER_PRIVATE'
  ) on conflict(intent_id) do nothing;
  select id into v_event_id from public.notification_events where intent_id=v_intent_id;
  insert into public.notification_deliveries(
    notification_event_id,channel,recipient_user_id,recipient_auth_user_id,recipient_retail_customer_id,
    recipient,template_version,idempotency_key,status,next_attempt_at,delivery_identity,channel_mode,
    delivery_state,template_key,template_revision,recipient_locale,recipient_fingerprint,sensitivity,
    rendered_snapshot,adapter_identity,requested_mode,effective_mode,policy_decision,preference_result,
    rate_limit_result,sandbox_result
  ) values (
    v_event_id,'email',null,null,v_customer.id,lower(btrim(v_customer.email)),1,
    v_delivery_identity||':LIVE','queued',now(),v_delivery_identity,'LIVE','QUEUED','retail_payment_confirmed',
    'v1',v_order.locale,encode(extensions.digest(lower(btrim(v_customer.email)),'sha256'),'hex'),
    'CUSTOMER_PRIVATE',v_rendered,'smtp','LIVE','LIVE','ALLOW','NOT_APPLICABLE','NOT_EVALUATED','NOT_APPLICABLE'
  ) on conflict(delivery_identity,channel_mode) do nothing;
  select id into v_delivery_id from public.notification_deliveries
    where delivery_identity=v_delivery_identity and channel_mode='LIVE';
  insert into public.notification_delivery_audit_events(notification_event_id,notification_delivery_id,event_name,correlation_id,idempotency_key)
  values(v_event_id,v_delivery_id,'communication_intent_persisted',v_attempt.id,'communication_intent_persisted:'||v_intent_id)
  on conflict(idempotency_key) do nothing;
  return jsonb_build_object('outcome','QUEUED','eventId',v_event_id,'deliveryId',v_delivery_id);
end;
$$;

revoke all on function public.persist_retail_payment_confirmation_email_v1(uuid) from public,anon,authenticated;
grant execute on function public.persist_retail_payment_confirmation_email_v1(uuid) to service_role;

create or replace function public.reserve_notification_delivery_rate_limit(p_delivery_id uuid,p_lease_token uuid)
returns jsonb language plpgsql security definer set search_path = '' set row_security = off as $$
declare
  v_delivery public.notification_deliveries%rowtype; v_event public.notification_events%rowtype;
  v_existing public.notification_delivery_rate_limit_reservations%rowtype; v_policy record;
  v_window timestamptz:=date_trunc('hour',now()); v_recipient_count integer; v_audience_count integer;
  v_recipient_limit integer:=10; v_audience_limit integer:=100; v_audience_identity text; v_outcome text;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Communication rate limit is service-only.' using errcode='42501'; end if;
  select * into v_delivery from public.notification_deliveries where id=p_delivery_id and delivery_state='PROCESSING' and lease_token=p_lease_token for update;
  if v_delivery.id is null or v_delivery.channel_mode not in ('LIVE','SANDBOX') then raise exception 'Communication rate-limit claim is stale.' using errcode='55000'; end if;
  select * into v_existing from public.notification_delivery_rate_limit_reservations where notification_delivery_id=v_delivery.id;
  if v_existing.id is not null then return jsonb_build_object('deliveryId',v_delivery.id,'outcome',v_existing.outcome,'recipientCount',v_existing.recipient_count,'companyCount',v_existing.company_count,'recipientLimit',v_existing.recipient_limit,'companyLimit',v_existing.company_limit); end if;
  select * into v_event from public.notification_events where id=v_delivery.notification_event_id;
  if v_event.communication_purpose is null then raise exception 'Communication purpose is not governed.' using errcode='22023'; end if;
  v_audience_identity:=case when v_event.company_id is not null then 'partner-company:'||v_event.company_id::text
    when v_event.customer_account_id is not null then 'customer-account:'||v_event.customer_account_id::text
    else 'retail-customer:'||v_event.retail_customer_id::text end;
  select policy.recipient_limit_per_hour,policy.company_limit_per_hour into v_policy from public.notification_provider_rate_policies policy
    where policy.provider_identity=coalesce(v_delivery.adapter_identity,v_delivery.channel::text) and policy.channel=v_delivery.channel and policy.channel_mode=v_delivery.channel_mode;
  if found then v_recipient_limit:=v_policy.recipient_limit_per_hour; v_audience_limit:=v_policy.company_limit_per_hour; end if;
  perform pg_advisory_xact_lock(hashtextextended('recipient|'||v_delivery.recipient_fingerprint||'|'||v_delivery.channel::text||'|'||v_window::text,0));
  perform pg_advisory_xact_lock(hashtextextended('audience|'||v_audience_identity||'|'||v_event.communication_purpose||'|'||v_delivery.channel::text||'|'||v_window::text,0));
  select count(*) into v_recipient_count from public.notification_delivery_rate_limit_reservations where recipient_fingerprint=v_delivery.recipient_fingerprint and channel=v_delivery.channel and window_started_at=v_window and outcome='ALLOWED';
  select count(*) into v_audience_count from public.notification_delivery_rate_limit_reservations where audience_identity=v_audience_identity and communication_purpose=v_event.communication_purpose and channel=v_delivery.channel and window_started_at=v_window and outcome='ALLOWED';
  v_outcome:=case when v_recipient_count>=v_recipient_limit or v_audience_count>=v_audience_limit then 'RATE_LIMITED' else 'ALLOWED' end;
  if v_outcome='ALLOWED' then v_recipient_count:=v_recipient_count+1; v_audience_count:=v_audience_count+1; end if;
  insert into public.notification_delivery_rate_limit_reservations(notification_delivery_id,company_id,customer_account_id,retail_customer_id,audience_identity,communication_purpose,channel,recipient_fingerprint,window_started_at,outcome,recipient_count,company_count,recipient_limit,company_limit)
  values(v_delivery.id,v_event.company_id,v_event.customer_account_id,v_event.retail_customer_id,v_audience_identity,v_event.communication_purpose,v_delivery.channel,v_delivery.recipient_fingerprint,v_window,v_outcome,v_recipient_count,v_audience_count,v_recipient_limit,v_audience_limit);
  update public.notification_deliveries set rate_limit_result=v_outcome where id=v_delivery.id;
  return jsonb_build_object('deliveryId',v_delivery.id,'outcome',v_outcome,'recipientCount',v_recipient_count,'companyCount',v_audience_count,'recipientLimit',v_recipient_limit,'companyLimit',v_audience_limit);
end;
$$;

comment on table public.retail_legal_acceptances is 'Append-only evidence that the Retail order accepted the exact published legal-document versions.';
comment on function public.claim_retail_payment_attempt_v2(text,text,uuid,text) is 'Fail-closed payment claim requiring current legal acceptance and an authoritative customer email before any PaymentAttempt mutation; issues a separate scoped return-page capability.';
comment on function public.persist_retail_payment_confirmation_email_v1(uuid) is 'Idempotent adapter from authoritative paid Retail state into the durable Omnichannel email outbox.';

commit;
