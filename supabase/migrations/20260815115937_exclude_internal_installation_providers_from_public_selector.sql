create or replace function public.retail_installation_checkout_options(p_locale text default 'ru')
returns jsonb language sql stable security definer set search_path = public set row_security = off as $$
  with eligible as (
    select region.code region_code,
      case when p_locale='ro' then region.name_ro else region.name_ru end region_name,
      provider.id provider_id,
      case when p_locale='ro' then profile.public_name_ro else profile.public_name_ru end display_name,
      case when p_locale='ro' then profile.public_description_ro else profile.public_description_ru end description,
      profile.logo_path,
      profile.availability_state availability
    from public.installation_providers provider
    join public.installation_provider_profiles profile on profile.provider_id=provider.id
    join public.installation_provider_competencies competence on competence.provider_id=provider.id
      and competence.system_type='cctv' and competence.active
    join public.installation_provider_regions coverage on coverage.provider_id=provider.id and coverage.active
    join public.installation_service_regions region on region.id=coverage.region_id and region.active
    left join public.installation_provider_workloads workload on workload.provider_id=provider.id
    where p_locale in ('ru','ro') and provider.provider_type='partner_company'
      and provider.operational_status='active'
      and provider.approval_status='approved' and provider.marketplace_enabled
      and profile.public_profile_status='published' and profile.availability_state in ('available','limited')
      and (profile.max_concurrent_jobs is null or coalesce(workload.active_jobs,0) < profile.max_concurrent_jobs)
  )
  select jsonb_build_object(
    'regions',coalesce((select jsonb_agg(distinct jsonb_build_object('code',region_code,'name',region_name)) from eligible),'[]'::jsonb),
    'providers',coalesce((select jsonb_agg(jsonb_build_object('providerId',provider_id,'regionCode',region_code,
      'displayName',display_name,'description',description,'logoPath',logo_path,'availability',availability)
      order by region_name,display_name,provider_id) from eligible),'[]'::jsonb)
  );
$$;
