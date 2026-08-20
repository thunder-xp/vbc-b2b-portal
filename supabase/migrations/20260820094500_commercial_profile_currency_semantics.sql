-- Customer contracts may settle in MDL while their governed price type is USD.
-- Validate both source currencies, but only compare the price-type currency with
-- the local price-type projection used by catalog pricing.
create or replace function public.publish_partner_commercial_profile_sync(
  p_run_id uuid,
  p_source jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  run public.partner_company_commercial_profile_sync_runs%rowtype;
  company public.partner_companies%rowtype;
  local_price_type public.price_types%rowtype;
  previous_status text;
  next_status text;
  next_ref text := lower(nullif(btrim(p_source ->> 'priceTypeReference'), ''));
  source_counterparty text := lower(nullif(btrim(p_source ->> 'counterpartyReference'), ''));
  source_contract text := lower(nullif(btrim(p_source ->> 'contractReference'), ''));
  source_organization text := lower(nullif(btrim(p_source ->> 'organizationReference'), ''));
  source_contract_currency text := lower(nullif(btrim(p_source ->> 'contractCurrencyReference'), ''));
  source_price_currency text := lower(nullif(btrim(p_source ->> 'priceTypeCurrencyReference'), ''));
  price_count integer;
  price_synced_at timestamptz;
  next_version integer;
  outcome text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Commercial profile publication requires service role.' using errcode = '42501';
  end if;

  select * into run from public.partner_company_commercial_profile_sync_runs where id = p_run_id for update;
  if run.id is null then
    raise exception 'Commercial profile synchronization run was not found.' using errcode = 'P0002';
  end if;
  if run.status <> 'running' then
    return jsonb_build_object(
      'code', run.result_code, 'correlationId', run.correlation_id,
      'version', run.expected_version, 'idempotent', true
    );
  end if;
  if run.lease_expires_at <= now() then
    update public.partner_company_commercial_profile_sync_runs
    set status = 'failed', result_code = 'COMMERCIAL_PROFILE_SYNC_FAILED',
        safe_failure_reason = 'lease_expired', finished_at = now()
    where id = run.id;
    return jsonb_build_object('code', 'COMMERCIAL_PROFILE_SYNC_FAILED', 'correlationId', run.correlation_id);
  end if;

  select * into company from public.partner_companies where id = run.company_id for update;
  if company.id is null or company.commercial_profile_version <> run.expected_version then
    outcome := 'COMMERCIAL_PROFILE_MISMATCH';
  elsif source_contract is null or source_contract <> lower(run.contract_ref)
    or source_counterparty is null or source_counterparty <> lower(coalesce(company.external_1c_id, ''))
    or source_contract <> lower(coalesce(company.external_1c_contract_id, ''))
    or source_organization <> '4643d461-aa49-4b70-9486-a59f80ee6af8'
    or lower(regexp_replace(coalesce(p_source ->> 'contractType', ''), '[^[:alpha:]]', '', 'g')) <> 'спокупателем'
    or coalesce((p_source ->> 'default')::boolean, false) is not true
    or coalesce((p_source ->> 'active')::boolean, false) is not true
    or coalesce((p_source ->> 'deleted')::boolean, false) is true then
    outcome := 'COMMERCIAL_CONTRACT_INVALID';
  elsif next_ref is null then
    outcome := 'COMMERCIAL_PRICE_TYPE_MISSING';
  elsif coalesce((p_source ->> 'priceTypeActive')::boolean, false) is not true then
    outcome := 'COMMERCIAL_PRICE_TYPE_UNKNOWN';
  else
    select * into local_price_type from public.price_types
    where lower(external_ref) = next_ref and is_active limit 1;
    if local_price_type.id is null then
      outcome := 'COMMERCIAL_PRICE_TYPE_UNKNOWN';
    elsif source_contract_currency is null or source_price_currency is null
      or source_price_currency <> lower(coalesce(local_price_type.currency_ref, '')) then
      outcome := 'COMMERCIAL_CURRENCY_MISMATCH';
    else
      select count(*), max(price.synced_at) into price_count, price_synced_at
      from public.product_prices price
      where price.is_published and price.is_active and price.currency_status = 'resolved'
        and lower(price.external_1c_price_type_id) = next_ref;
      if price_count = 0 or price_synced_at is null
        or price_synced_at < now() - interval '36 hours' then
        outcome := 'COMMERCIAL_PRICE_DATA_STALE';
      else
        outcome := 'COMMERCIAL_PROFILE_SYNC_SUCCESS';
      end if;
    end if;
  end if;

  if outcome <> 'COMMERCIAL_PROFILE_SYNC_SUCCESS' then
    update public.partner_company_commercial_profile_sync_runs
    set status = 'failed', result_code = outcome, next_price_type_ref = next_ref,
        source_evidence = p_source, safe_failure_reason = lower(outcome), finished_at = now()
    where id = run.id;
    update public.partner_companies
    set commercial_profile_state = case
      when outcome = 'COMMERCIAL_CONTRACT_INVALID' then 'contract_invalid'
      when outcome in ('COMMERCIAL_PRICE_TYPE_MISSING', 'COMMERCIAL_PRICE_TYPE_UNKNOWN') then 'price_type_unknown'
      when outcome = 'COMMERCIAL_PRICE_DATA_STALE' then 'price_data_stale'
      else commercial_profile_state
    end
    where id = company.id;
    return jsonb_build_object('code', outcome, 'correlationId', run.correlation_id, 'version', company.commercial_profile_version);
  end if;

  select name into previous_status from public.price_types
  where lower(external_ref) = lower(company.external_1c_price_type_id) limit 1;
  next_status := local_price_type.name;
  next_version := company.commercial_profile_version + 1;

  update public.partner_companies
  set external_1c_price_type_id = next_ref,
      commercial_profile_version = next_version,
      commercial_profile_state = 'aligned',
      commercial_profile_verified_at = (p_source ->> 'verifiedAt')::timestamptz,
      updated_at = now()
  where id = company.id;

  insert into public.partner_company_commercial_profile_events(
    company_id, contract_ref, previous_price_type_ref, next_price_type_ref,
    previous_derived_status, next_derived_status, actor_user_id, source,
    reason, correlation_id, profile_version
  ) values (
    company.id, source_contract, company.external_1c_price_type_id, next_ref,
    previous_status, next_status, run.actor_user_id, '1C', run.reason,
    run.correlation_id, next_version
  );

  update public.partner_company_commercial_profile_sync_runs
  set status = 'succeeded', result_code = 'COMMERCIAL_PROFILE_SYNC_SUCCESS',
      next_price_type_ref = next_ref, source_evidence = p_source, finished_at = now()
  where id = run.id;

  return jsonb_build_object(
    'code', 'COMMERCIAL_PROFILE_SYNC_SUCCESS', 'correlationId', run.correlation_id,
    'companyId', company.id, 'contractRef', source_contract,
    'previousPriceTypeRef', company.external_1c_price_type_id,
    'nextPriceTypeRef', next_ref, 'derivedStatus', next_status,
    'currencyCode', local_price_type.currency_code, 'version', next_version,
    'unchanged', lower(coalesce(company.external_1c_price_type_id, '')) = next_ref,
    'idempotent', false
  );
end;
$$;

revoke all on function public.publish_partner_commercial_profile_sync(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_partner_commercial_profile_sync(uuid, jsonb) to service_role;
