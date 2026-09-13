begin;

insert into auth.users (
  id, aud, role, phone, phone_confirmed_at, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', '+37369111111', now(), '{"provider":"phone","providers":["phone"]}', '{}', now(), now()),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', '+37369222222', now(), '{"provider":"phone","providers":["phone"]}', '{}', now(), now());

insert into public.customer_identities (id, identity_kind) values
  ('20000000-0000-4000-8000-000000000001', 'PERSON'),
  ('20000000-0000-4000-8000-000000000002', 'PERSON');

insert into public.customer_accounts (
  id, auth_user_id, customer_identity_id, status, identity_resolution_status
) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'ACTIVE', 'MATCHED'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'ACTIVE', 'MATCHED');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

do $$
begin
  if (select count(*) from public.customer_accounts) <> 1 then
    raise exception 'Final Customer account RLS exposed another user.';
  end if;
  if exists (
    select 1 from public.customer_accounts
    where auth_user_id = '10000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'Final Customer cross-user traversal was possible.';
  end if;
  if has_table_privilege(current_user, 'public.customer_identity_keys', 'select')
    or has_table_privilege(current_user, 'public.customer_account_events', 'select')
    or has_table_privilege(current_user, 'public.customer_auth_sms_rate_buckets', 'select') then
    raise exception 'Private identity or Auth SMS tables are browser-readable.';
  end if;
  if has_function_privilege(current_user, 'public.reserve_customer_auth_sms_delivery(text,integer,integer)', 'execute') then
    raise exception 'Authenticated role can invoke the service-only Auth SMS limiter.';
  end if;
end;
$$;

reset role;
set local role service_role;

do $$
declare
  phone_hash text := repeat('a', 64);
begin
  if not public.reserve_customer_auth_sms_delivery(phone_hash, 5, 10)
    or not public.reserve_customer_auth_sms_delivery(phone_hash, 5, 10)
    or not public.reserve_customer_auth_sms_delivery(phone_hash, 5, 10)
    or not public.reserve_customer_auth_sms_delivery(phone_hash, 5, 10)
    or not public.reserve_customer_auth_sms_delivery(phone_hash, 5, 10) then
    raise exception 'Valid bounded Auth SMS reservations were rejected.';
  end if;
  if public.reserve_customer_auth_sms_delivery(phone_hash, 5, 10) then
    raise exception 'Auth SMS limiter allowed a sixth delivery.';
  end if;
end;
$$;

rollback;
