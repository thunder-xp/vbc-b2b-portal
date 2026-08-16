-- Publish the business-approved default CCTV installation tariff set.
-- This is governed Retail pricing, not a reuse of B2B partner service prices.
do $$
declare
  v_actor_id uuid;
  v_tariff_set_id uuid;
  v_previous_id uuid;
  v_version integer;
  v_effective_from timestamptz := clock_timestamp();
begin
  if exists (
    select 1
    from public.installation_tariff_sets tariff_set
    where tariff_set.system_type = 'cctv'
      and tariff_set.status = 'published'
      and tariff_set.currency = 'MDL'
      and tariff_set.vat_treatment = 'included'
      and (select jsonb_object_agg(tariff.service_type, tariff.customer_unit_price)
           from public.installation_tariffs tariff
           where tariff.tariff_set_id = tariff_set.id) =
          '{"camera_installation":600.00,"cable_laying":35.00,"commissioning":250.00,"remote_configuration":150.00}'::jsonb
  ) then
    return;
  end if;

  select assignment.user_id
  into v_actor_id
  from public.internal_user_role_assignments assignment
  join public.roles role on role.id = assignment.role_id
  join public.user_profiles profile on profile.id = assignment.user_id
  where assignment.revoked_at is null
    and role.code = 'novotech_admin'
    and role.scope = 'internal'
    and profile.status = 'active'
  order by assignment.assigned_at, assignment.id
  limit 1;

  if v_actor_id is null then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('retail-installation-tariff:cctv'));

  select id
  into v_previous_id
  from public.installation_tariff_sets
  where system_type = 'cctv' and status = 'published'
  for update;

  if v_previous_id is not null then
    update public.installation_tariff_sets
    set status = 'superseded', effective_to = v_effective_from,
        revision = revision + 1, updated_at = now()
    where id = v_previous_id;

    insert into public.retail_marketplace_events(
      aggregate_type, aggregate_id, event_type, actor_user_id, safe_evidence
    ) values (
      'tariff_set', v_previous_id, 'tariff_superseded', v_actor_id,
      jsonb_build_object('reason', 'Approved default Retail CCTV installation tariffs')
    );
  end if;

  select coalesce(max(version), 0) + 1
  into v_version
  from public.installation_tariff_sets
  where system_type = 'cctv';

  insert into public.installation_tariff_sets(
    system_type, version, status, currency, vat_treatment, effective_from,
    revision, created_by, published_by, published_at
  ) values (
    'cctv', v_version, 'draft', 'MDL', 'included', v_effective_from,
    0, v_actor_id, null, null
  ) returning id into v_tariff_set_id;

  insert into public.installation_tariffs(
    tariff_set_id, service_type, unit_code, customer_unit_price
  ) values
    (v_tariff_set_id, 'camera_installation', 'piece', 600.00),
    (v_tariff_set_id, 'cable_laying', 'meter', 35.00),
    (v_tariff_set_id, 'commissioning', 'piece', 250.00),
    (v_tariff_set_id, 'remote_configuration', 'service', 150.00);

  update public.installation_tariff_sets
  set status = 'published', published_by = v_actor_id, published_at = now(),
      revision = 1, updated_at = now()
  where id = v_tariff_set_id;

  insert into public.retail_marketplace_events(
    aggregate_type, aggregate_id, event_type, actor_user_id, safe_evidence
  ) values (
    'tariff_set', v_tariff_set_id, 'tariff_published', v_actor_id,
    jsonb_build_object(
      'reason', 'Approved default Retail CCTV installation tariffs',
      'version', v_version,
      'currency', 'MDL',
      'vatTreatment', 'included',
      'lineCount', 4
    )
  );
end;
$$;

create or replace function public.admin_publish_installation_tariff_set(
  p_tariff_set_id uuid,
  p_expected_revision bigint,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.installation_tariff_sets;
  required_count integer;
  previous_id uuid;
begin
  if not public.has_internal_permission('admin.retail_marketplace.manage') then
    raise exception 'Forbidden.' using errcode = '42501';
  end if;
  if char_length(btrim(p_reason)) < 5 then
    raise exception 'Publication reason required.' using errcode = '22023';
  end if;

  select * into target
  from public.installation_tariff_sets
  where id = p_tariff_set_id and status = 'draft' and revision = p_expected_revision
  for update;
  if target.id is null then
    raise exception 'Tariff revision conflict.' using errcode = '40001';
  end if;

  select count(*) into required_count
  from public.installation_tariffs
  where tariff_set_id = target.id
    and (service_type, unit_code) in (
      ('camera_installation', 'piece'),
      ('cable_laying', 'meter'),
      ('commissioning', 'piece'),
      ('remote_configuration', 'service')
    );
  if required_count <> 4 then
    raise exception 'Complete CCTV tariff set required.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('retail-installation-tariff:cctv'));
  select id into previous_id
  from public.installation_tariff_sets
  where system_type = target.system_type and status = 'published'
  for update;
  if previous_id is not null then
    update public.installation_tariff_sets
    set status = 'superseded', effective_to = target.effective_from,
        revision = revision + 1, updated_at = now()
    where id = previous_id;
    insert into public.retail_marketplace_events(
      aggregate_type, aggregate_id, event_type, actor_user_id, safe_evidence
    ) values (
      'tariff_set', previous_id, 'tariff_superseded', auth.uid(),
      jsonb_build_object('replacementId', target.id)
    );
  end if;

  update public.installation_tariff_sets
  set status = 'published', published_by = auth.uid(), published_at = now(),
      revision = revision + 1, updated_at = now()
  where id = target.id;
  insert into public.retail_marketplace_events(
    aggregate_type, aggregate_id, event_type, actor_user_id, safe_evidence
  ) values (
    'tariff_set', target.id, 'tariff_published', auth.uid(),
    jsonb_build_object('reason', btrim(p_reason), 'version', target.version)
  );
end;
$$;

revoke all on function public.admin_publish_installation_tariff_set(uuid, bigint, text)
  from public, anon;
grant execute on function public.admin_publish_installation_tariff_set(uuid, bigint, text)
  to authenticated, service_role;
