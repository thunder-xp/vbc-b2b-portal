begin;

do $$
declare
  target_company_id constant uuid := 'd87bf391-3dc1-428c-af55-9d10d1f21017';
  stale_contract_ref constant text := 'bb09717a-a7a0-11e9-b792-000c2988d323';
  expected_contract_ref constant text := '8d042d4c-4491-11e9-aab5-000c29411cbe';
  latest_sync_id uuid;
  first_version integer;
  second_version integer;
  classification text;
begin
  select sync.sync_id into strict latest_sync_id
  from public.one_c_counterparty_directory_syncs sync
  where sync.status = 'succeeded'
  order by sync.finished_at desc, sync.sync_id desc
  limit 1;

  update public.partner_companies company
  set external_1c_contract_id = stale_contract_ref,
      commercial_profile_state = 'aligned',
      commercial_profile_verified_at = now()
  where company.id = target_company_id;

  select readiness.readiness_class into strict classification
  from public.get_partner_commercial_readiness(array[target_company_id], false) readiness;
  assert classification = 'REPAIRABLE_STALE_PROFILE',
    'old contract plus current canonical default must be repairable';

  perform public.reconcile_partner_company_commercial_profiles_from_directory(
    latest_sync_id,
    array[target_company_id]
  );

  select company.commercial_profile_version into strict first_version
  from public.partner_companies company
  where company.id = target_company_id
    and lower(company.external_1c_contract_id) = lower(expected_contract_ref)
    and company.commercial_profile_state = 'aligned'
    and company.commercial_profile_verified_at is not null;

  perform public.reconcile_partner_company_commercial_profiles_from_directory(
    latest_sync_id,
    array[target_company_id]
  );

  select company.commercial_profile_version into strict second_version
  from public.partner_companies company
  where company.id = target_company_id;
  assert second_version = first_version,
    'already aligned current-snapshot profile must not receive an unnecessary write';
end;
$$;

select 'proactive commercial readiness runtime assertions passed' as result;

rollback;
