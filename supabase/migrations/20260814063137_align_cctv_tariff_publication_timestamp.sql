-- Keep the inline publication boundary transaction-stable so the RPC returns its own new version.

create or replace function public.admin_save_cctv_service_configuration(
  target_object_type text,
  target_service_code text,
  target_unit_price numeric,
  target_enabled boolean,
  target_calculator_default boolean,
  target_display_order smallint,
  target_notes text,
  expected_binding_version integer,
  expected_tariff_set_id uuid,
  expected_tariff_version integer,
  target_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  definition public.cctv_service_definitions;
  binding public.cctv_object_service_bindings;
  saved_binding public.cctv_object_service_bindings;
  other_binding public.cctv_object_service_bindings;
  saved_other public.cctv_object_service_bindings;
  current_tariff public.installation_tariff_sets;
  new_tariff_id uuid;
  next_version integer;
  current_price numeric(14,2);
  effective_price numeric(14,2);
  price_changed boolean;
  binding_changed boolean;
  published_at_value timestamptz := now();
  required_count integer;
begin
  if not public.has_internal_permission('admin.retail_marketplace.manage')
    or not public.has_internal_permission('admin.integrations.manage')
    or not public.has_internal_permission('admin.estimates.view') then
    raise exception 'Forbidden.' using errcode = '42501';
  end if;
  if target_object_type not in ('apartment','house','office','retail','warehouse','industrial','horeca','other')
    or target_display_order not between 1 and 100
    or char_length(coalesce(target_notes,'')) > 1000
    or char_length(btrim(coalesce(target_reason,''))) < 5
    or expected_binding_version < 1
    or expected_tariff_version < 1
    or target_unit_price is not null and (
      target_unit_price <= 0 or target_unit_price > 999999999999.99
      or round(target_unit_price,2) <> target_unit_price
    ) then
    raise exception 'Invalid CCTV service configuration.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('retail-installation-tariff:cctv'));

  select * into current_tariff
  from public.installation_tariff_sets
  where system_type = 'cctv' and status = 'published'
  for update;
  if current_tariff.id is null or current_tariff.id <> expected_tariff_set_id
    or current_tariff.version <> expected_tariff_version then
    raise exception 'CCTV_TARIFF_CONFLICT' using errcode = 'PT409';
  end if;

  select * into definition
  from public.cctv_service_definitions
  where code = target_service_code and active;
  select * into binding
  from public.cctv_object_service_bindings
  where object_type = target_object_type and service_code = target_service_code
  for update;
  if definition.code is null or binding.id is null or binding.version <> expected_binding_version then
    raise exception 'CCTV_SERVICE_BINDING_CONFLICT' using errcode = 'PT409';
  end if;

  select customer_unit_price into current_price
  from public.installation_tariffs
  where tariff_set_id = current_tariff.id and service_type = definition.tariff_service_type;
  if current_price is not null and target_unit_price is null then
    raise exception 'Published tariff price cannot be cleared.' using errcode = '22023';
  end if;
  effective_price := coalesce(target_unit_price,current_price);
  if target_enabled and (effective_price is null or definition.partner_service_id is null) then
    raise exception 'Enabled service requires an active tariff and B2B mapping.' using errcode = '22023';
  end if;
  if target_calculator_default and not target_enabled then
    raise exception 'Default service must be enabled.' using errcode = '22023';
  end if;

  price_changed := current_price is distinct from target_unit_price and target_unit_price is not null;
  binding_changed := binding.enabled is distinct from target_enabled
    or binding.calculator_default is distinct from (target_calculator_default and target_enabled)
    or binding.display_order is distinct from target_display_order
    or binding.notes is distinct from nullif(btrim(coalesce(target_notes,'')),'');

  if price_changed then
    select coalesce(max(version),0)+1 into next_version
    from public.installation_tariff_sets where system_type = 'cctv';
    insert into public.installation_tariff_sets(
      system_type,version,status,currency,vat_treatment,effective_from,created_by
    ) values (
      'cctv',next_version,'draft',current_tariff.currency,current_tariff.vat_treatment,
      published_at_value,auth.uid()
    ) returning id into new_tariff_id;

    insert into public.retail_marketplace_events(
      aggregate_type,aggregate_id,event_type,actor_user_id,safe_evidence
    ) values (
      'tariff_set',new_tariff_id,'tariff_draft_created',auth.uid(),
      jsonb_build_object('reason',btrim(target_reason),'serviceCode',definition.code,
        'serviceType',definition.tariff_service_type,'previousPrice',current_price,'newPrice',target_unit_price)
    );

    insert into public.installation_tariffs(tariff_set_id,service_type,unit_code,customer_unit_price)
    select new_tariff_id,line.service_type,line.unit_code,line.customer_unit_price
    from public.installation_tariffs line
    where line.tariff_set_id = current_tariff.id and line.service_type <> definition.tariff_service_type;
    insert into public.installation_tariffs(tariff_set_id,service_type,unit_code,customer_unit_price)
    values(new_tariff_id,definition.tariff_service_type,definition.unit_code,target_unit_price);

    select count(*) into required_count
    from public.installation_tariffs
    where tariff_set_id = new_tariff_id and (service_type,unit_code) in (
      ('camera_installation','piece'),('cable_laying','meter'),
      ('commissioning','piece'),('remote_configuration','service')
    );
    if required_count <> 4 then
      raise exception 'Complete CCTV tariff set required.' using errcode = '22023';
    end if;

    update public.installation_tariff_sets
    set status='superseded',effective_to=published_at_value,revision=revision+1,updated_at=published_at_value
    where id=current_tariff.id;
    insert into public.retail_marketplace_events(
      aggregate_type,aggregate_id,event_type,actor_user_id,safe_evidence
    ) values (
      'tariff_set',current_tariff.id,'tariff_superseded',auth.uid(),
      jsonb_build_object('replacementId',new_tariff_id,'serviceCode',definition.code,
        'previousPrice',current_price,'newPrice',target_unit_price)
    );
    update public.installation_tariff_sets
    set status='published',published_by=auth.uid(),published_at=published_at_value,
      revision=revision+1,updated_at=published_at_value
    where id=new_tariff_id;
    insert into public.retail_marketplace_events(
      aggregate_type,aggregate_id,event_type,actor_user_id,safe_evidence
    ) values (
      'tariff_set',new_tariff_id,'tariff_published',auth.uid(),
      jsonb_build_object('reason',btrim(target_reason),'version',next_version,'serviceCode',definition.code,
        'serviceType',definition.tariff_service_type,'previousPrice',current_price,'newPrice',target_unit_price)
    );
  end if;

  if binding_changed then
    if target_calculator_default and target_enabled then
      for other_binding in
        select other.* from public.cctv_object_service_bindings other
        join public.cctv_service_definitions current_definition on current_definition.code=other.service_code
        where other.object_type=target_object_type and other.id<>binding.id
          and current_definition.family=definition.family and other.calculator_default
        for update of other
      loop
        update public.cctv_object_service_bindings
        set calculator_default=false,version=version+1,updated_by=auth.uid(),updated_at=now()
        where id=other_binding.id returning * into saved_other;
        insert into public.cctv_object_service_binding_events(
          binding_id,event_type,actor_user_id,previous_snapshot,resulting_snapshot
        ) values(other_binding.id,'default_changed',auth.uid(),to_jsonb(other_binding),to_jsonb(saved_other));
      end loop;
    end if;

    update public.cctv_object_service_bindings
    set enabled=target_enabled,
      calculator_default=case when target_enabled then target_calculator_default else false end,
      display_order=target_display_order,notes=nullif(btrim(coalesce(target_notes,'')),''),
      version=version+1,updated_by=auth.uid(),updated_at=now()
    where id=binding.id returning * into saved_binding;
    insert into public.cctv_object_service_binding_events(
      binding_id,event_type,actor_user_id,previous_snapshot,resulting_snapshot
    ) values(
      saved_binding.id,
      case when binding.enabled and not saved_binding.enabled then 'binding_disabled'
        when not binding.enabled and saved_binding.enabled then 'binding_enabled'
        when binding.calculator_default is distinct from saved_binding.calculator_default then 'default_changed'
        else 'binding_updated' end,
      auth.uid(),to_jsonb(binding),to_jsonb(saved_binding)
    );
  end if;

  return public.get_all_cctv_object_configurations();
end;
$$;

revoke all on function public.admin_save_cctv_service_configuration(
  text,text,numeric,boolean,boolean,smallint,text,integer,uuid,integer,text
) from public,anon;
grant execute on function public.admin_save_cctv_service_configuration(
  text,text,numeric,boolean,boolean,smallint,text,integer,uuid,integer,text
) to authenticated,service_role;
