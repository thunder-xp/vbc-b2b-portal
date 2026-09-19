begin;

insert into auth.users (
  id, aud, role, phone, phone_confirmed_at, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-4000-8000-000000000021', 'authenticated', 'authenticated', '+37369333333', now(), '{"provider":"phone","providers":["phone"]}', '{}', now(), now());

insert into public.customer_identities (id, identity_kind) values
  ('20000000-0000-4000-8000-000000000021', 'PERSON');

insert into public.customer_accounts (
  id, auth_user_id, customer_identity_id, status, identity_resolution_status
) values
  ('30000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000021', '20000000-0000-4000-8000-000000000021', 'ACTIVE', 'MATCHED');

do $$
declare
  evidence jsonb;
begin
  evidence := public.resolve_customer_access_entitlement_v1('10000000-0000-4000-8000-000000000021');
  if evidence <> '{"accountStatus":"ACTIVE","purchaseBacked":false,"legacyCompatible":false}'::jsonb then
    raise exception 'A post-cutover account acquired entitlement without purchase or legacy evidence: %', evidence;
  end if;

  evidence := public.resolve_customer_access_entitlement_v1('10000000-0000-4000-8000-000000000099');
  if evidence <> '{"accountStatus":null,"purchaseBacked":false,"legacyCompatible":false}'::jsonb then
    raise exception 'An Auth-only principal resolved as an entitled customer: %', evidence;
  end if;

  insert into public.customer_account_legacy_entitlements (customer_account_id, auth_user_id)
  values ('30000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000021');

  evidence := public.resolve_customer_access_entitlement_v1('10000000-0000-4000-8000-000000000021');
  if (evidence->>'legacyCompatible')::boolean is not true then
    raise exception 'Closed legacy evidence was not resolved.';
  end if;

  begin
    update public.customer_account_legacy_entitlements
    set grandfathered_at = grandfathered_at + interval '1 second'
    where customer_account_id = '30000000-0000-4000-8000-000000000021';
    raise exception 'Legacy evidence update unexpectedly succeeded.';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000021', true);

do $$
begin
  if has_table_privilege(current_user, 'public.customer_account_legacy_entitlements', 'select')
    or has_table_privilege(current_user, 'public.customer_account_legacy_entitlements', 'insert') then
    raise exception 'Browser role can access the private legacy cohort.';
  end if;
  if has_function_privilege(current_user, 'public.resolve_customer_access_entitlement_v1(uuid)', 'execute') then
    raise exception 'Browser role can invoke the service-only entitlement resolver.';
  end if;
end;
$$;

reset role;
set local role service_role;

do $$
begin
  if has_table_privilege(current_user, 'public.customer_accounts', 'insert') then
    raise exception 'Service role retained generic customer-account creation authority.';
  end if;
  if not has_table_privilege(current_user, 'public.customer_accounts', 'select')
    or not has_table_privilege(current_user, 'public.customer_accounts', 'update') then
    raise exception 'Required customer-account read/profile update authority was lost.';
  end if;
  if not has_function_privilege(current_user, 'public.resolve_customer_access_entitlement_v1(uuid)', 'execute') then
    raise exception 'Service role cannot resolve customer entitlement.';
  end if;
end;
$$;

rollback;
