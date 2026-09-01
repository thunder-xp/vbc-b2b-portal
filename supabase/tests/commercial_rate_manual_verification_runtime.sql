begin;

do $$
declare
  actor uuid;
  manager_role uuid;
  active_rate public.commercial_exchange_rates%rowtype;
  before_count bigint;
  result jsonb;
begin
  select id into actor from public.user_profiles where status = 'active' and user_type in ('internal', 'admin') limit 1;
  if actor is null then raise exception 'Runtime fixture requires an active internal profile'; end if;
  if not exists (select 1 from public.internal_user_role_assignments where user_id = actor and revoked_at is null) then
    select r.id into manager_role from public.roles r
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id and p.code = 'commercial_rates.manage'
    where r.scope = 'internal' order by r.code limit 1;
    insert into public.internal_user_role_assignments (user_id, role_id, assigned_by)
    values (actor, manager_role, actor);
  end if;
  perform set_config('request.jwt.claim.sub', actor::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', actor::text, 'role', 'authenticated')::text, true);
  if auth.uid() is distinct from actor or not public.can_manage_commercial_rates() then
    raise exception 'Runtime auth fixture failed: actor %, auth %, manage %', actor, auth.uid(), public.can_manage_commercial_rates();
  end if;

  select * into active_rate from public.commercial_exchange_rates
  where purpose = 'partner_price_usd_to_mdl' and is_active and is_published;
  if active_rate.id is null then
    insert into public.commercial_exchange_rates (
      source_code, base_currency, quote_currency, rate_direction, rate,
      effective_date, purpose, effective_at, source_updated_at, published_at,
      published_by, source_type, source_note, is_active, is_published
    ) values (
      'runtime-fixture', 'USD', 'MDL', 'quote_per_base', 17.500000,
      current_date, 'partner_price_usd_to_mdl', current_date::timestamptz,
      now(), now(), actor, 'manual_from_1c', 'Rollback-only initial fixture', true, true
    );
    select * into active_rate from public.commercial_exchange_rates
    where purpose = 'partner_price_usd_to_mdl' and is_active and is_published;
  end if;

  select count(*) into before_count from public.commercial_exchange_rates;
  result := public.save_manual_commercial_rate_verification(
    active_rate.purpose, active_rate.rate, active_rate.effective_at::date,
    'Rollback-only runtime verification', 'equal observation'
  );
  if result->'verification'->>'verification_status' <> 'VERIFIED_NO_CHANGE_REQUIRED' then
    raise exception 'Equal verify-only status mismatch: %', result;
  end if;
  if (select count(*) from public.commercial_exchange_rates) <> before_count then
    raise exception 'Verify-only changed publication rows';
  end if;

  result := public.save_manual_commercial_rate_verification(
    active_rate.purpose, active_rate.rate + 0.010000, active_rate.effective_at::date,
    'Rollback-only runtime verification', 'different observation'
  );
  if result->'verification'->>'verification_status' <> 'DIFFERS_FROM_1C' then
    raise exception 'Different verify-only status mismatch: %', result;
  end if;

  result := public.publish_verified_commercial_exchange_rate(
    active_rate.purpose, active_rate.rate + 0.020000, active_rate.effective_at::date,
    'Rollback-only publication verification', 'material change'
  );
  if result->>'publicationOutcome' <> 'published'
    or result->'verification'->>'verification_status' <> 'MATCHES_1C' then
    raise exception 'Material publish result mismatch: %', result;
  end if;

  result := public.publish_verified_commercial_exchange_rate(
    active_rate.purpose, active_rate.rate + 0.020000, active_rate.effective_at::date,
    'Rollback-only publication verification', 'material change'
  );
  if result->>'publicationOutcome' <> 'unchanged'
    or result->>'verificationOutcome' <> 'unchanged' then
    raise exception 'Semantic replay mismatch: %', result;
  end if;

  begin
    update public.commercial_exchange_rate_verifications set evidence_note = 'mutation' where id = (result->'verification'->>'id')::uuid;
    raise exception 'Immutable verification update unexpectedly succeeded';
  exception when sqlstate '55000' then null;
  end;

  if has_function_privilege('anon', 'public.save_manual_commercial_rate_verification(text,numeric,date,text,text)', 'EXECUTE') then
    raise exception 'anon can execute verification command';
  end if;
end;
$$;

rollback;
