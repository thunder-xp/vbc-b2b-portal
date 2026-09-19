begin;

-- A verified Auth session may bind an immutable Retail Order to its owner.
-- The browser never supplies an auth user id: the Server Action resolves the
-- authenticated user and the service-only RPC rechecks it against auth.users.
create table public.retail_order_auth_bindings (
  id uuid primary key default gen_random_uuid(),
  retail_order_id uuid not null unique references public.retail_orders(id) on delete restrict,
  retail_customer_id uuid not null references public.retail_customers(id) on delete restrict,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  phone_key_hash text not null check (phone_key_hash ~ '^[0-9a-f]{64}$'),
  phone_key_version integer not null check (phone_key_version > 0),
  binding_source text not null default 'VERIFIED_PHONE_SESSION'
    check (binding_source = 'VERIFIED_PHONE_SESSION'),
  bound_at timestamptz not null default now(),
  unique (retail_order_id, auth_user_id)
);

comment on table public.retail_order_auth_bindings is
  'Immutable server-verified evidence binding a Retail Order to a confirmed Supabase Auth phone owner. Stores keyed-HMAC evidence, never OTP or plaintext phone.';

create index retail_order_auth_bindings_user_idx
  on public.retail_order_auth_bindings (auth_user_id, bound_at desc, id);
create index retail_order_auth_bindings_customer_idx
  on public.retail_order_auth_bindings (retail_customer_id, bound_at desc, id);

create table public.customer_provisioning_outbox (
  id uuid primary key default gen_random_uuid(),
  event_type text not null default 'FIRST_PURCHASE_CONFIRMED'
    check (event_type = 'FIRST_PURCHASE_CONFIRMED'),
  retail_order_id uuid not null unique references public.retail_orders(id) on delete restrict,
  retail_payment_activation_id uuid not null unique references public.retail_payment_activations(id) on delete restrict,
  status text not null default 'PENDING'
    check (status in ('AWAITING_OWNER', 'PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED_RETRYABLE', 'NEEDS_REVIEW')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 1000),
  available_at timestamptz not null default now(),
  lease_token uuid null,
  lease_expires_at timestamptz null,
  processed_at timestamptz null,
  last_error_code text null check (last_error_code is null or char_length(last_error_code) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_provisioning_outbox_lease_check check (
    (status = 'PROCESSING' and lease_token is not null and lease_expires_at is not null)
    or (status <> 'PROCESSING' and lease_token is null and lease_expires_at is null)
  )
);

comment on table public.customer_provisioning_outbox is
  'Provider-neutral durable FIRST_PURCHASE_CONFIRMED events emitted only by authoritative Retail payment activation.';

create index customer_provisioning_outbox_claim_idx
  on public.customer_provisioning_outbox (available_at, created_at, id)
  where status in ('PENDING', 'FAILED_RETRYABLE', 'PROCESSING');

create table public.customer_account_purchase_entitlements (
  id uuid primary key default gen_random_uuid(),
  retail_order_id uuid not null unique references public.retail_orders(id) on delete restrict,
  retail_payment_activation_id uuid not null unique references public.retail_payment_activations(id) on delete restrict,
  retail_order_auth_binding_id uuid not null references public.retail_order_auth_bindings(id) on delete restrict,
  customer_account_id uuid not null references public.customer_accounts(id) on delete restrict,
  customer_identity_id uuid not null references public.customer_identities(id) on delete restrict,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  activation_source text not null default 'FIRST_PURCHASE_CONFIRMED'
    check (activation_source = 'FIRST_PURCHASE_CONFIRMED'),
  activated_at timestamptz not null default now()
);

comment on table public.customer_account_purchase_entitlements is
  'Immutable evidence that a verified, confirmed Retail purchase activated or reused a Final Customer cabinet entitlement.';

create index customer_account_purchase_entitlements_account_idx
  on public.customer_account_purchase_entitlements (customer_account_id, activated_at desc, id);
create index customer_account_purchase_entitlements_user_idx
  on public.customer_account_purchase_entitlements (auth_user_id, activated_at desc, id);

create table public.customer_external_provisioning_jobs (
  id uuid primary key default gen_random_uuid(),
  customer_identity_id uuid not null unique references public.customer_identities(id) on delete restrict,
  source_retail_order_id uuid not null references public.retail_orders(id) on delete restrict,
  state text not null default 'PENDING'
    check (state in ('PENDING', 'PROCESSING', 'MATCHED', 'NEW', 'AMBIGUOUS', 'CONFLICT', 'FAILED_RETRYABLE')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 1000),
  available_at timestamptz not null default now(),
  lease_token uuid null,
  lease_expires_at timestamptz null,
  safe_error_code text null check (safe_error_code is null or char_length(safe_error_code) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null,
  constraint customer_external_provisioning_jobs_lease_check check (
    (state = 'PROCESSING' and lease_token is not null and lease_expires_at is not null)
    or (state <> 'PROCESSING' and lease_token is null and lease_expires_at is null)
  )
);

comment on table public.customer_external_provisioning_jobs is
  'Durable async seam for governed 1C Final Customer match/create. Account activation never waits for this job.';

create index customer_external_provisioning_jobs_claim_idx
  on public.customer_external_provisioning_jobs (available_at, created_at, id)
  where state in ('PENDING', 'FAILED_RETRYABLE', 'PROCESSING');

alter table public.customer_account_events drop constraint customer_account_events_type_check;
alter table public.customer_account_events add constraint customer_account_events_type_check check (event_type in (
  'CUSTOMER_ACCOUNT_CREATED', 'CUSTOMER_IDENTITY_LINKED',
  'IDENTITY_REVIEW_REQUIRED', 'PROFILE_UPDATED',
  'CUSTOMER_ACCOUNT_ACTIVATED_FROM_PURCHASE', 'PURCHASE_LINKED'
));

create unique index customer_account_events_purchase_once_idx
  on public.customer_account_events (
    customer_account_id,
    event_type,
    (safe_metadata->>'retailOrderId')
  )
  where event_type in ('CUSTOMER_ACCOUNT_ACTIVATED_FROM_PURCHASE', 'PURCHASE_LINKED')
    and safe_metadata ? 'retailOrderId';

create or replace function private.prevent_final_customer_provisioning_evidence_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Final Customer purchase evidence is immutable.' using errcode = '42501';
end;
$$;

create trigger prevent_retail_order_auth_binding_mutation
before update or delete on public.retail_order_auth_bindings
for each row execute function private.prevent_final_customer_provisioning_evidence_mutation();

create trigger prevent_customer_purchase_entitlement_mutation
before update or delete on public.customer_account_purchase_entitlements
for each row execute function private.prevent_final_customer_provisioning_evidence_mutation();

create trigger touch_customer_provisioning_outbox_updated_at
before update on public.customer_provisioning_outbox
for each row execute function private.touch_customer_identity_updated_at();

create trigger touch_customer_external_provisioning_jobs_updated_at
before update on public.customer_external_provisioning_jobs
for each row execute function private.touch_customer_identity_updated_at();

alter table public.retail_order_auth_bindings enable row level security;
alter table public.retail_order_auth_bindings force row level security;
alter table public.customer_provisioning_outbox enable row level security;
alter table public.customer_provisioning_outbox force row level security;
alter table public.customer_account_purchase_entitlements enable row level security;
alter table public.customer_account_purchase_entitlements force row level security;
alter table public.customer_external_provisioning_jobs enable row level security;
alter table public.customer_external_provisioning_jobs force row level security;

revoke all on table public.retail_order_auth_bindings,
  public.customer_provisioning_outbox,
  public.customer_account_purchase_entitlements,
  public.customer_external_provisioning_jobs
from public, anon, authenticated, service_role;

grant select, insert on table public.retail_order_auth_bindings to service_role;
grant select, insert, update on table public.customer_provisioning_outbox to service_role;
grant select, insert on table public.customer_account_purchase_entitlements to service_role;
grant select, insert, update on table public.customer_external_provisioning_jobs to service_role;

create or replace function public.bind_retail_order_authenticated_owner_v1(
  p_access_token_hash text,
  p_auth_user_id uuid,
  p_phone_key_hash text,
  p_phone_key_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_auth_user auth.users%rowtype;
  v_order public.retail_orders%rowtype;
  v_customer public.retail_customers%rowtype;
  v_existing public.retail_order_auth_bindings%rowtype;
  v_phone text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Retail owner binding requires service role.' using errcode = '42501';
  end if;
  if p_access_token_hash !~ '^[0-9a-f]{64}$'
    or p_phone_key_hash !~ '^[0-9a-f]{64}$'
    or p_phone_key_version <= 0 then
    raise exception 'Invalid ownership evidence.' using errcode = '22023';
  end if;

  select * into v_auth_user from auth.users where id = p_auth_user_id;
  v_phone := case
    when regexp_replace(coalesce(v_auth_user.phone, ''), '[^0-9]', '', 'g') ~ '^373[0-9]{8}$'
      then '+' || regexp_replace(v_auth_user.phone, '[^0-9]', '', 'g')
    when regexp_replace(coalesce(v_auth_user.phone, ''), '[^0-9]', '', 'g') ~ '^0[0-9]{8}$'
      then '+373' || substring(regexp_replace(v_auth_user.phone, '[^0-9]', '', 'g') from 2)
    else null
  end;
  if v_auth_user.id is null or v_auth_user.phone_confirmed_at is null or v_phone is null then
    raise exception 'Verified phone ownership is required.' using errcode = '42501';
  end if;

  select orders.* into v_order
  from public.retail_order_access_tokens token
  join public.retail_orders orders on orders.id = token.order_id
  where token.token_hash = p_access_token_hash
    and token.revoked_at is null
    and token.expires_at > now()
  for update of orders;
  if v_order.id is null then
    raise exception 'Retail order not found.' using errcode = 'P0002';
  end if;
  select * into v_customer from public.retail_customers where id = v_order.customer_id;
  if v_customer.phone <> v_phone then
    raise exception 'Retail order owner does not match verified session.' using errcode = '42501';
  end if;

  select * into v_existing from public.retail_order_auth_bindings
  where retail_order_id = v_order.id;
  if v_existing.id is not null then
    if v_existing.auth_user_id <> p_auth_user_id
      or v_existing.phone_key_hash <> p_phone_key_hash
      or v_existing.phone_key_version <> p_phone_key_version then
      raise exception 'Retail order is already bound to another owner.' using errcode = '42501';
    end if;
    return jsonb_build_object('bindingId', v_existing.id, 'orderId', v_order.id, 'repeated', true);
  end if;

  insert into public.retail_order_auth_bindings (
    retail_order_id, retail_customer_id, auth_user_id, phone_key_hash, phone_key_version
  ) values (
    v_order.id, v_customer.id, p_auth_user_id, p_phone_key_hash, p_phone_key_version
  ) returning * into v_existing;

  update public.customer_provisioning_outbox
  set status = 'PENDING', available_at = now(), last_error_code = null
  where retail_order_id = v_order.id and status = 'AWAITING_OWNER';

  return jsonb_build_object('bindingId', v_existing.id, 'orderId', v_order.id, 'repeated', false);
end;
$$;

revoke all on function public.bind_retail_order_authenticated_owner_v1(text, uuid, text, integer)
from public, anon, authenticated, service_role;
grant execute on function public.bind_retail_order_authenticated_owner_v1(text, uuid, text, integer)
to service_role;

create or replace function private.enqueue_first_purchase_confirmed(
  p_retail_order_id uuid,
  p_retail_payment_activation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  insert into public.customer_provisioning_outbox (
    retail_order_id, retail_payment_activation_id, status
  ) values (
    p_retail_order_id,
    p_retail_payment_activation_id,
    case when exists (
      select 1 from public.retail_order_auth_bindings binding
      where binding.retail_order_id = p_retail_order_id
    ) then 'PENDING' else 'AWAITING_OWNER' end
  ) on conflict (retail_order_id) do nothing;
end;
$$;

revoke all on function private.enqueue_first_purchase_confirmed(uuid, uuid)
from public, anon, authenticated, service_role;

create or replace function public.claim_customer_provisioning_events_v1(
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Customer provisioning claim requires service role.' using errcode = '42501';
  end if;
  if p_limit not between 1 and 50 then
    raise exception 'Invalid customer provisioning batch size.' using errcode = '22023';
  end if;

  with candidates as (
    select outbox.id
    from public.customer_provisioning_outbox outbox
    where (
      outbox.status in ('PENDING', 'FAILED_RETRYABLE')
      or (outbox.status = 'PROCESSING' and outbox.lease_expires_at < now())
    )
      and outbox.available_at <= now()
      and exists (
        select 1 from public.retail_order_auth_bindings binding
        where binding.retail_order_id = outbox.retail_order_id
      )
    order by outbox.available_at, outbox.created_at, outbox.id
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.customer_provisioning_outbox outbox
    set status = 'PROCESSING',
      attempt_count = outbox.attempt_count + 1,
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + interval '2 minutes',
      last_error_code = null
    from candidates
    where outbox.id = candidates.id
    returning outbox.id, outbox.retail_order_id, outbox.lease_token, outbox.attempt_count
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'eventId', claimed.id,
    'retailOrderId', claimed.retail_order_id,
    'leaseToken', claimed.lease_token,
    'attemptCount', claimed.attempt_count
  ) order by claimed.id), '[]'::jsonb)
  into v_result
  from claimed;
  return v_result;
end;
$$;

create or replace function public.fail_customer_provisioning_event_v1(
  p_event_id uuid,
  p_lease_token uuid,
  p_safe_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Customer provisioning failure requires service role.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_safe_error_code, ''))) not between 1 and 80 then
    raise exception 'Invalid safe error code.' using errcode = '22023';
  end if;
  update public.customer_provisioning_outbox
  set status = 'FAILED_RETRYABLE',
    available_at = now() + least(interval '30 minutes', interval '30 seconds' * greatest(1, attempt_count)),
    lease_token = null,
    lease_expires_at = null,
    last_error_code = upper(btrim(p_safe_error_code))
  where id = p_event_id and status = 'PROCESSING' and lease_token = p_lease_token;
  return found;
end;
$$;

create or replace function public.provision_final_customer_from_purchase_v1(
  p_event_id uuid,
  p_lease_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_event public.customer_provisioning_outbox%rowtype;
  v_order public.retail_orders%rowtype;
  v_activation public.retail_payment_activations%rowtype;
  v_binding public.retail_order_auth_bindings%rowtype;
  v_customer public.retail_customers%rowtype;
  v_account public.customer_accounts%rowtype;
  v_key_identity_id uuid;
  v_identity_id uuid;
  v_resolution text;
  v_account_created boolean := false;
  v_entitlement public.customer_account_purchase_entitlements%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Customer provisioning requires service role.' using errcode = '42501';
  end if;

  select * into v_event from public.customer_provisioning_outbox
  where id = p_event_id and status = 'PROCESSING' and lease_token = p_lease_token
  for update;
  if v_event.id is null or v_event.event_type <> 'FIRST_PURCHASE_CONFIRMED' then
    raise exception 'Customer provisioning claim is stale.' using errcode = '55000';
  end if;

  select * into v_order from public.retail_orders
  where id = v_event.retail_order_id for update;
  select * into v_activation from public.retail_payment_activations
  where id = v_event.retail_payment_activation_id and retail_order_id = v_order.id;
  select * into v_binding from public.retail_order_auth_bindings
  where retail_order_id = v_order.id;
  select * into v_customer from public.retail_customers
  where id = v_order.customer_id for update;

  if v_order.id is null or v_order.status <> 'confirmed' or v_order.paid_at is null
    or v_activation.id is null or v_binding.id is null
    or v_binding.retail_customer_id <> v_customer.id then
    raise exception 'Confirmed purchase evidence is incomplete.' using errcode = '55000';
  end if;
  if not exists (
    select 1 from auth.users auth_user
    where auth_user.id = v_binding.auth_user_id and auth_user.phone_confirmed_at is not null
  ) then
    raise exception 'Verified purchase owner is unavailable.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('customer-account-auth|' || v_binding.auth_user_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(
    'customer-identity-phone|' || v_binding.phone_key_version::text || '|' || v_binding.phone_key_hash,
    0
  ));

  select * into v_account from public.customer_accounts
  where auth_user_id = v_binding.auth_user_id for update;
  select identity_key.customer_identity_id into v_key_identity_id
  from public.customer_identity_keys identity_key
  where identity_key.key_type = 'PHONE'
    and identity_key.key_version = v_binding.phone_key_version
    and identity_key.key_hash = v_binding.phone_key_hash
    and identity_key.verified
    and identity_key.revoked_at is null;

  if v_account.id is not null then
    if v_account.status <> 'ACTIVE' or v_account.customer_identity_id is null then
      update public.customer_provisioning_outbox
      set status = 'NEEDS_REVIEW', lease_token = null, lease_expires_at = null,
        last_error_code = 'ACCOUNT_REVIEW_REQUIRED', processed_at = now()
      where id = v_event.id;
      return jsonb_build_object('outcome', 'NEEDS_REVIEW', 'accountCreated', false);
    end if;
    if v_key_identity_id is not null and v_key_identity_id <> v_account.customer_identity_id then
      insert into public.customer_identity_reconciliation_cases (
        case_type, left_customer_identity_id, right_customer_identity_id, reason_code, safe_evidence
      ) values (
        'CONFLICT', v_account.customer_identity_id, v_key_identity_id, 'IDENTIFIER_CONFLICT',
        jsonb_build_object('source', 'FIRST_PURCHASE_CONFIRMED', 'retailOrderId', v_order.id)
      );
      update public.customer_provisioning_outbox
      set status = 'NEEDS_REVIEW', lease_token = null, lease_expires_at = null,
        last_error_code = 'IDENTITY_CONFLICT', processed_at = now()
      where id = v_event.id;
      return jsonb_build_object('outcome', 'NEEDS_REVIEW', 'accountCreated', false);
    end if;
    v_identity_id := v_account.customer_identity_id;
    v_resolution := v_account.identity_resolution_status;
  else
    v_identity_id := coalesce(v_key_identity_id, v_customer.customer_identity_id);
    if v_identity_id is null then
      insert into public.customer_identities (identity_kind)
      values ('PERSON') returning id into v_identity_id;
      insert into public.customer_identity_events (
        customer_identity_id, event_type, source_context, source_record_id, safe_metadata
      ) values (
        v_identity_id, 'IDENTITY_CREATED', 'RETAIL_CUSTOMER', v_customer.id,
        jsonb_build_object('origin', 'FIRST_PURCHASE_CONFIRMED')
      );
    end if;
    if exists (
      select 1 from public.customer_accounts account
      where account.customer_identity_id = v_identity_id and account.auth_user_id <> v_binding.auth_user_id
    ) then
      update public.customer_provisioning_outbox
      set status = 'NEEDS_REVIEW', lease_token = null, lease_expires_at = null,
        last_error_code = 'IDENTITY_ALREADY_ENTITLED', processed_at = now()
      where id = v_event.id;
      return jsonb_build_object('outcome', 'NEEDS_REVIEW', 'accountCreated', false);
    end if;
    v_resolution := case when v_key_identity_id is null then 'NEW' else 'MATCHED' end;
    insert into public.customer_accounts (
      auth_user_id, customer_identity_id, status, identity_resolution_status, display_name, email
    ) values (
      v_binding.auth_user_id, v_identity_id, 'ACTIVE', v_resolution,
      nullif(btrim(v_customer.name), ''), nullif(lower(btrim(coalesce(v_customer.email, ''))), '')
    ) returning * into v_account;
    v_account_created := true;
    insert into public.customer_account_events (
      customer_account_id, event_type, safe_metadata
    ) values
      (v_account.id, 'CUSTOMER_ACCOUNT_CREATED', jsonb_build_object('resolutionStatus', v_resolution, 'source', 'FIRST_PURCHASE_CONFIRMED')),
      (v_account.id, 'CUSTOMER_IDENTITY_LINKED', jsonb_build_object('resolutionStatus', v_resolution, 'source', 'FIRST_PURCHASE_CONFIRMED'));
    insert into public.customer_identity_events (
      customer_identity_id, event_type, source_context, source_record_id, safe_metadata
    ) values (
      v_identity_id, 'CONTEXT_LINKED', 'FINAL_CUSTOMER_ACCOUNT', v_account.id,
      jsonb_build_object('resolutionStatus', v_resolution, 'source', 'FIRST_PURCHASE_CONFIRMED')
    );
  end if;

  insert into public.customer_identity_keys (
    customer_identity_id, key_type, key_hash, key_version, verified
  ) values (
    v_identity_id, 'PHONE', v_binding.phone_key_hash, v_binding.phone_key_version, true
  ) on conflict (key_type, key_version, key_hash) where revoked_at is null and verified do nothing;

  select identity_key.customer_identity_id into v_key_identity_id
  from public.customer_identity_keys identity_key
  where identity_key.key_type = 'PHONE'
    and identity_key.key_version = v_binding.phone_key_version
    and identity_key.key_hash = v_binding.phone_key_hash
    and identity_key.verified
    and identity_key.revoked_at is null;
  if v_key_identity_id is distinct from v_identity_id then
    raise exception 'Verified identity key conflict.' using errcode = '23505';
  end if;

  if v_customer.customer_identity_id is distinct from v_identity_id then
    update public.retail_customers set customer_identity_id = v_identity_id
    where id = v_customer.id;
    insert into public.customer_identity_events (
      customer_identity_id, event_type, source_context, source_record_id, safe_metadata
    ) values (
      v_identity_id, 'CONTEXT_RELINKED', 'RETAIL_CUSTOMER', v_customer.id,
      jsonb_build_object('source', 'FIRST_PURCHASE_CONFIRMED')
    );
  end if;

  insert into public.customer_account_purchase_entitlements (
    retail_order_id, retail_payment_activation_id, retail_order_auth_binding_id,
    customer_account_id, customer_identity_id, auth_user_id
  ) values (
    v_order.id, v_activation.id, v_binding.id,
    v_account.id, v_identity_id, v_binding.auth_user_id
  ) on conflict (retail_order_id) do nothing;
  select * into v_entitlement from public.customer_account_purchase_entitlements
  where retail_order_id = v_order.id;
  if v_entitlement.auth_user_id <> v_binding.auth_user_id
    or v_entitlement.customer_account_id <> v_account.id then
    raise exception 'Purchase entitlement owner conflict.' using errcode = '42501';
  end if;

  insert into public.customer_account_events (
    customer_account_id, event_type, safe_metadata
  ) values (
    v_account.id,
    case when v_account_created then 'CUSTOMER_ACCOUNT_ACTIVATED_FROM_PURCHASE' else 'PURCHASE_LINKED' end,
    jsonb_build_object(
      'retailOrderId', v_order.id,
      'activationSource', 'FIRST_PURCHASE_CONFIRMED',
      'provisioningOperationId', v_event.id
    )
  ) on conflict do nothing;

  insert into public.customer_external_provisioning_jobs (
    customer_identity_id, source_retail_order_id
  ) values (
    v_identity_id, v_order.id
  ) on conflict (customer_identity_id) do nothing;

  update public.customer_provisioning_outbox
  set status = 'SUCCEEDED', lease_token = null, lease_expires_at = null,
    processed_at = now(), last_error_code = null
  where id = v_event.id;

  return jsonb_build_object(
    'outcome', case when v_account_created then 'CREATED' else 'REUSED' end,
    'customerAccountId', v_account.id,
    'customerIdentityId', v_identity_id,
    'entitlementId', v_entitlement.id,
    'oneCJobState', 'PENDING'
  );
end;
$$;

create or replace function public.classify_legacy_customer_accounts_v1()
returns table(classification text, account_count bigint)
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  with classified as (
    select account.id,
      case
        when account.customer_identity_id is null
          or account.status = 'IDENTITY_REVIEW_REQUIRED'
          or identity.status = 'REVIEW_REQUIRED'
          or exists (
            select 1 from public.customer_identity_reconciliation_cases reconciliation
            where reconciliation.status <> 'RESOLVED'
              and (reconciliation.left_customer_identity_id = account.customer_identity_id
                or reconciliation.right_customer_identity_id = account.customer_identity_id)
          ) then 'NEEDS_REVIEW'
        when exists (
          select 1
          from public.retail_customers customer
          join public.retail_orders orders on orders.customer_id = customer.id
          where customer.customer_identity_id = account.customer_identity_id
            and orders.status = 'confirmed' and orders.paid_at is not null
        ) then 'LEGACY_VALID'
        else 'LEGACY_NO_PURCHASE'
      end as classification
    from public.customer_accounts account
    left join public.customer_identities identity on identity.id = account.customer_identity_id
  )
  select expected.classification, count(classified.id)::bigint
  from (values ('LEGACY_VALID'), ('LEGACY_NO_PURCHASE'), ('NEEDS_REVIEW')) expected(classification)
  left join classified on classified.classification = expected.classification
  group by expected.classification
  order by expected.classification;
$$;

revoke all on function public.claim_customer_provisioning_events_v1(integer),
  public.fail_customer_provisioning_event_v1(uuid, uuid, text),
  public.provision_final_customer_from_purchase_v1(uuid, uuid),
  public.classify_legacy_customer_accounts_v1()
from public, anon, authenticated;
grant execute on function public.claim_customer_provisioning_events_v1(integer),
  public.fail_customer_provisioning_event_v1(uuid, uuid, text),
  public.provision_final_customer_from_purchase_v1(uuid, uuid),
  public.classify_legacy_customer_accounts_v1()
to service_role;

-- The authoritative payment activation remains provider-neutral. The new
-- outbox insert occurs only after the local paid/confirmed transition and its
-- durable payment activation record have succeeded.
create or replace function public.activate_paid_retail_order(
  p_retail_order_id uuid,
  p_activation_mode text,
  p_idempotency_key uuid,
  p_safe_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  orders public.retail_orders;
  existing public.retail_payment_activations;
  region_id uuid;
  requirement_id uuid;
  activation_id uuid := gen_random_uuid();
  tariff_version_value integer;
  dispatch_result jsonb;
begin
  if p_activation_mode not in ('payment_verified', 'pilot_simulated')
    or (p_activation_mode = 'pilot_simulated' and char_length(btrim(coalesce(p_safe_reason, ''))) < 10) then
    raise exception 'Invalid payment activation.' using errcode = '22023';
  end if;

  select * into orders from public.retail_orders where id = p_retail_order_id for update;
  if not found then
    raise exception 'Retail order not found.' using errcode = 'P0002';
  end if;

  select * into existing from public.retail_payment_activations where retail_order_id = orders.id;
  if found then
    perform private.enqueue_first_purchase_confirmed(orders.id, existing.id);
    return jsonb_build_object(
      'orderId', orders.id,
      'orderNumber', orders.public_number,
      'status', orders.status,
      'installationRequirementId', existing.installation_requirement_id,
      'assignment', null,
      'repeated', true
    );
  end if;

  if orders.status <> 'awaiting_payment' or not orders.orchestration_snapshot_locked then
    raise exception 'Retail order is not awaiting payment.' using errcode = 'PT409';
  end if;

  update public.retail_orders
  set status = 'confirmed', paid_at = now(), payment_activation_mode = p_activation_mode, revision = revision + 1
  where id = orders.id;
  insert into public.retail_order_events(order_id, event_type, safe_evidence)
  values (orders.id, 'payment_confirmed', jsonb_build_object(
    'activationMode', p_activation_mode,
    'simulated', p_activation_mode = 'pilot_simulated'
  ));

  if orders.installation_selection_mode is null then
    insert into public.retail_payment_activations(
      id, retail_order_id, activation_mode, idempotency_key, actor_user_id, safe_reason
    ) values (
      activation_id, orders.id, p_activation_mode, p_idempotency_key, auth.uid(), nullif(btrim(coalesce(p_safe_reason, '')), '')
    );
    perform private.enqueue_first_purchase_confirmed(orders.id, activation_id);
    return jsonb_build_object(
      'orderId', orders.id,
      'orderNumber', orders.public_number,
      'status', 'confirmed',
      'installationRequirementId', null,
      'assignment', null,
      'repeated', false
    );
  end if;

  select id into region_id
  from public.installation_service_regions
  where code = orders.installation_region_code and active;
  if region_id is null or orders.installation_address_snapshot is null or orders.installation_tariff_set_id is null
    or orders.installation_subtotal is null or jsonb_array_length(orders.installation_work_lines_snapshot) = 0 then
    raise exception 'Retail installation snapshot is unavailable.' using errcode = 'P0002';
  end if;

  select version into tariff_version_value
  from public.installation_tariff_sets
  where id = orders.installation_tariff_set_id;

  insert into public.installation_requirements(
    retail_order_id, system_type, selection_mode, preferred_provider_id, service_region_id,
    locality_snapshot, exact_address_snapshot, customer_pii_snapshot, work_lines_snapshot,
    tariff_set_id, tariff_version, customer_installation_charge, currency, vat_treatment,
    requested_scheduling_context, activation_mode, activation_evidence
  ) values (
    orders.id, 'cctv', orders.installation_selection_mode, orders.preferred_installation_provider_id, region_id,
    orders.installation_address_snapshot->>'locality', orders.installation_address_snapshot, orders.customer_snapshot,
    orders.installation_work_lines_snapshot, orders.installation_tariff_set_id, tariff_version_value,
    orders.installation_subtotal, orders.currency, orders.vat_presentation, '{}'::jsonb, p_activation_mode,
    jsonb_build_object('paymentActivationId', activation_id, 'simulated', p_activation_mode = 'pilot_simulated')
  ) returning id into requirement_id;

  insert into public.installation_requirement_lines(
    requirement_id, line_number, service_type, unit_code, quantity, customer_unit_price, customer_line_amount
  )
  select requirement_id, row_number() over(order by line->>'serviceType'), line->>'serviceType', line->>'unitCode',
    (line->>'quantity')::numeric, (line->>'unitPrice')::numeric, (line->>'amount')::numeric
  from jsonb_array_elements(orders.installation_work_lines_snapshot) line;

  insert into public.installation_assignment_events(
    requirement_id, event_type, actor_user_id, correlation_id, safe_evidence
  ) values
    (requirement_id, 'installation_requirement_activated', auth.uid(), p_idempotency_key,
      jsonb_build_object('activationMode', p_activation_mode, 'tariffSetId', orders.installation_tariff_set_id, 'tariffVersion', tariff_version_value)),
    (requirement_id, 'provider_preferred', auth.uid(), p_idempotency_key,
      jsonb_build_object('selectionMode', orders.installation_selection_mode, 'preferredProviderId', orders.preferred_installation_provider_id));

  insert into public.retail_payment_activations(
    id, retail_order_id, activation_mode, idempotency_key, actor_user_id, safe_reason, installation_requirement_id
  ) values (
    activation_id, orders.id, p_activation_mode, p_idempotency_key, auth.uid(),
    nullif(btrim(coalesce(p_safe_reason, '')), ''), requirement_id
  );

  perform private.enqueue_first_purchase_confirmed(orders.id, activation_id);
  dispatch_result := public.dispatch_installation_requirement(requirement_id, 'automatic', null, p_idempotency_key);
  return jsonb_build_object(
    'orderId', orders.id,
    'orderNumber', orders.public_number,
    'status', 'confirmed',
    'installationRequirementId', requirement_id,
    'assignment', dispatch_result,
    'repeated', false
  );
end;
$$;

revoke all on function public.activate_paid_retail_order(uuid, text, uuid, text)
from public, anon, authenticated;
grant execute on function public.activate_paid_retail_order(uuid, text, uuid, text)
to service_role;

commit;
