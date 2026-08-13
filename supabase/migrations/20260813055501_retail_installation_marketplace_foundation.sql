-- Retail Marketplace foundation. Novotech owns customer installation tariffs;
-- provider eligibility remains separate from B2B company authorization.

insert into public.permissions(code, description, scope, delegable_by_partner_owner, sensitive, category)
values
  ('admin.retail_marketplace.view', 'View Retail Marketplace tariff and provider governance.', 'internal', false, true, 'admin'),
  ('admin.retail_marketplace.manage', 'Manage Retail Marketplace tariffs and provider eligibility.', 'internal', false, true, 'admin')
on conflict(code) do nothing;

insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id from public.roles role cross join public.permissions permission
where role.code='novotech_admin' and permission.code in ('admin.retail_marketplace.view','admin.retail_marketplace.manage')
on conflict do nothing;

create table public.installation_tariff_sets (
  id uuid primary key default gen_random_uuid(),
  system_type text not null check(system_type='cctv'),
  version integer not null check(version>0),
  status text not null default 'draft' check(status in ('draft','published','superseded','archived')),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  vat_treatment text not null check(vat_treatment in ('included','excluded','not_specified')),
  effective_from timestamptz not null,
  effective_to timestamptz null,
  revision bigint not null default 0 check(revision>=0),
  created_by uuid not null references auth.users(id) on delete restrict,
  published_by uuid null references auth.users(id) on delete restrict,
  published_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(system_type,version),
  check(effective_to is null or effective_to>effective_from),
  check((status='published' and published_by is not null and published_at is not null) or status<>'published')
);
create unique index installation_tariff_sets_one_published_idx on public.installation_tariff_sets(system_type) where status='published';
create index installation_tariff_sets_current_idx on public.installation_tariff_sets(system_type,status,effective_from desc,id);

create table public.installation_tariffs (
  id uuid primary key default gen_random_uuid(),
  tariff_set_id uuid not null references public.installation_tariff_sets(id) on delete restrict,
  service_type text not null check(service_type in ('camera_installation','cable_laying','commissioning','remote_configuration')),
  unit_code text not null check(unit_code in ('piece','meter','service')),
  customer_unit_price numeric(14,2) not null check(customer_unit_price>=0),
  created_at timestamptz not null default now(),
  unique(tariff_set_id,service_type)
);
create index installation_tariffs_set_idx on public.installation_tariffs(tariff_set_id,service_type);

create table public.installation_service_regions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check(code ~ '^MD(-[A-Z0-9]{1,8})?$'),
  parent_id uuid null references public.installation_service_regions(id) on delete restrict,
  region_type text not null check(region_type in ('country','municipality','district','locality')),
  name_ru text not null,
  name_ro text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check((region_type='country' and parent_id is null) or (region_type<>'country' and parent_id is not null))
);
create index installation_service_regions_parent_idx on public.installation_service_regions(parent_id,active,code);
insert into public.installation_service_regions(code,region_type,name_ru,name_ro) values('MD','country','Молдова','Moldova');
insert into public.installation_service_regions(code,parent_id,region_type,name_ru,name_ro)
select 'MD-CU',id,'municipality','Кишинёв','Chișinău' from public.installation_service_regions where code='MD';

create table public.internal_installation_teams (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check(code ~ '^[a-z0-9_-]{3,80}$'),
  name text not null check(char_length(btrim(name)) between 2 and 160),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.installation_providers (
  id uuid primary key default gen_random_uuid(),
  provider_type text not null check(provider_type in ('partner_company','internal_team')),
  partner_company_id uuid null references public.partner_companies(id) on delete restrict,
  internal_team_id uuid null references public.internal_installation_teams(id) on delete restrict,
  operational_status text not null default 'inactive' check(operational_status in ('active','inactive','suspended')),
  approval_status text not null default 'pending' check(approval_status in ('pending','approved','rejected')),
  marketplace_enabled boolean not null default false,
  revision bigint not null default 0 check(revision>=0),
  suspension_reason text null check(suspension_reason is null or char_length(suspension_reason)<=500),
  created_by uuid null references auth.users(id) on delete restrict,
  updated_by uuid null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check((provider_type='partner_company' and partner_company_id is not null and internal_team_id is null)
     or (provider_type='internal_team' and internal_team_id is not null and partner_company_id is null))
);
create unique index installation_providers_partner_unique on public.installation_providers(partner_company_id) where partner_company_id is not null;
create unique index installation_providers_team_unique on public.installation_providers(internal_team_id) where internal_team_id is not null;
create index installation_providers_eligibility_idx on public.installation_providers(approval_status,operational_status,marketplace_enabled,id);

create table public.installation_provider_profiles (
  provider_id uuid primary key references public.installation_providers(id) on delete cascade,
  public_name_ru text not null check(char_length(btrim(public_name_ru)) between 2 and 160),
  public_name_ro text not null check(char_length(btrim(public_name_ro)) between 2 and 160),
  public_description_ru text null check(public_description_ru is null or char_length(public_description_ru)<=1000),
  public_description_ro text null check(public_description_ro is null or char_length(public_description_ro)<=1000),
  logo_path text null check(logo_path is null or char_length(logo_path)<=500),
  public_profile_status text not null default 'draft' check(public_profile_status in ('draft','published')),
  availability_state text not null default 'unavailable' check(availability_state in ('available','limited','unavailable')),
  max_concurrent_jobs integer null check(max_concurrent_jobs between 1 and 1000),
  acceptance_sla_minutes integer not null default 120 check(acceptance_sla_minutes between 5 and 10080),
  updated_at timestamptz not null default now()
);

create table public.installation_provider_competencies (
  provider_id uuid not null references public.installation_providers(id) on delete cascade,
  system_type text not null check(system_type='cctv'),
  active boolean not null default true,
  approved_at timestamptz not null default now(),
  primary key(provider_id,system_type)
);
create index installation_provider_competencies_active_idx on public.installation_provider_competencies(system_type,provider_id) where active;

create table public.installation_provider_regions (
  provider_id uuid not null references public.installation_providers(id) on delete cascade,
  region_id uuid not null references public.installation_service_regions(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key(provider_id,region_id)
);
create index installation_provider_regions_region_idx on public.installation_provider_regions(region_id,provider_id) where active;

create table public.retail_marketplace_events (
  id uuid primary key default gen_random_uuid(),
  aggregate_type text not null check(aggregate_type in ('tariff_set','provider')),
  aggregate_id uuid not null,
  event_type text not null check(event_type in ('tariff_draft_created','tariff_draft_updated','tariff_published','tariff_superseded','provider_created','provider_updated','provider_approved','provider_suspended','region_changed','competence_changed','capacity_changed')),
  actor_user_id uuid null references auth.users(id) on delete restrict,
  safe_evidence jsonb not null default '{}'::jsonb check(jsonb_typeof(safe_evidence)='object'),
  created_at timestamptz not null default now()
);
create index retail_marketplace_events_aggregate_idx on public.retail_marketplace_events(aggregate_type,aggregate_id,created_at desc,id);

alter table public.retail_cart_bundles
  add column installation_tariff_set_id uuid null references public.installation_tariff_sets(id) on delete restrict,
  add column installation_price_snapshot jsonb null check(installation_price_snapshot is null or jsonb_typeof(installation_price_snapshot)='object');
alter table public.retail_orders
  add column installation_tariff_set_id uuid null references public.installation_tariff_sets(id) on delete restrict,
  add column installation_work_lines_snapshot jsonb not null default '[]'::jsonb check(jsonb_typeof(installation_work_lines_snapshot)='array'),
  add column installation_subtotal numeric(14,2) null check(installation_subtotal is null or installation_subtotal>=0);

create or replace function public.prevent_published_installation_tariff_mutation() returns trigger language plpgsql set search_path=public as $$
begin
  if tg_table_name='installation_tariffs' then
    if exists(select 1 from public.installation_tariff_sets s
      where s.id=case when tg_op='DELETE' then old.tariff_set_id else new.tariff_set_id end and s.status<>'draft') then
      raise exception 'Published installation tariff lines are immutable.' using errcode='42501';
    end if;
    return case when tg_op='DELETE' then old else new end;
  end if;
  if old.status<>'draft' then
    if tg_op='DELETE' or new.system_type<>old.system_type or new.version<>old.version or new.currency<>old.currency
      or new.vat_treatment<>old.vat_treatment or new.effective_from<>old.effective_from or new.created_by<>old.created_by
      or not(old.status='published' and new.status='superseded' and old.effective_to is null
        and new.effective_to is not null and new.effective_to>=old.effective_from) then
      raise exception 'Published installation tariff versions are immutable.' using errcode='42501';
    end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end; $$;
create trigger protect_installation_tariff_sets before update or delete on public.installation_tariff_sets for each row execute function public.prevent_published_installation_tariff_mutation();
create trigger protect_installation_tariffs before update or delete on public.installation_tariffs for each row execute function public.prevent_published_installation_tariff_mutation();

create or replace function public.prevent_retail_marketplace_event_mutation() returns trigger language plpgsql set search_path=public as $$
begin raise exception 'Retail Marketplace events are append-only.' using errcode='42501'; end; $$;
create trigger protect_retail_marketplace_events before update or delete on public.retail_marketplace_events for each row execute function public.prevent_retail_marketplace_event_mutation();

create or replace function public.get_current_public_installation_tariffs(p_system_type text default 'cctv') returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object('tariffSetId',s.id,'version',s.version,'systemType',s.system_type,'currency',s.currency,
    'vatTreatment',s.vat_treatment,'effectiveFrom',s.effective_from,
    'lines',coalesce((select jsonb_agg(jsonb_build_object('serviceType',t.service_type,'unitCode',t.unit_code,'unitPrice',t.customer_unit_price) order by t.service_type) from public.installation_tariffs t where t.tariff_set_id=s.id),'[]'::jsonb))
  from public.installation_tariff_sets s where s.system_type=p_system_type and s.status in ('published','superseded')
    and s.effective_from<=now() and (s.effective_to is null or s.effective_to>now()) limit 1;
$$;

create or replace function public.list_public_installation_providers(p_system_type text,p_region_code text,p_locale text default 'ru') returns jsonb
language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('providerId',p.id,'displayName',case when p_locale='ro' then profile.public_name_ro else profile.public_name_ru end,
    'description',case when p_locale='ro' then profile.public_description_ro else profile.public_description_ru end,
    'logoPath',profile.logo_path,'coverage',case when p_locale='ro' then region.name_ro else region.name_ru end,
    'systemType',competence.system_type,'availability',profile.availability_state) order by case when p_locale='ro' then profile.public_name_ro else profile.public_name_ru end,p.id),'[]'::jsonb)
  from public.installation_providers p join public.installation_provider_profiles profile on profile.provider_id=p.id
  join public.installation_provider_competencies competence on competence.provider_id=p.id and competence.system_type=p_system_type and competence.active
  join public.installation_provider_regions coverage on coverage.provider_id=p.id and coverage.active
  join public.installation_service_regions region on region.id=coverage.region_id and region.active and region.code=p_region_code
  where p.operational_status='active' and p.approval_status='approved' and p.marketplace_enabled
    and profile.public_profile_status='published' and profile.availability_state<>'unavailable' and p_locale in ('ru','ro');
$$;

create or replace function public.admin_get_retail_installation_marketplace() returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_internal_permission('admin.retail_marketplace.view') then raise exception 'Forbidden.' using errcode='42501'; end if;
  return jsonb_build_object(
    'tariffSets',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'version',s.version,'systemType',s.system_type,'status',s.status,'currency',s.currency,'vatTreatment',s.vat_treatment,'effectiveFrom',s.effective_from,'effectiveTo',s.effective_to,'revision',s.revision,'lines',(select coalesce(jsonb_agg(jsonb_build_object('serviceType',t.service_type,'unitCode',t.unit_code,'unitPrice',t.customer_unit_price) order by t.service_type),'[]'::jsonb) from public.installation_tariffs t where t.tariff_set_id=s.id)) order by s.version desc) from public.installation_tariff_sets s),'[]'::jsonb),
    'providers',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'providerType',p.provider_type,'backingName',coalesce(company.display_name,team.name),'operationalStatus',p.operational_status,'approvalStatus',p.approval_status,'marketplaceEnabled',p.marketplace_enabled,'revision',p.revision,'publicNameRu',profile.public_name_ru,'publicNameRo',profile.public_name_ro,'publicProfileStatus',profile.public_profile_status,'availability',profile.availability_state,'maxConcurrentJobs',profile.max_concurrent_jobs,'acceptanceSlaMinutes',profile.acceptance_sla_minutes,'competencies',coalesce((select jsonb_agg(c.system_type order by c.system_type) from public.installation_provider_competencies c where c.provider_id=p.id and c.active),'[]'::jsonb),'regions',coalesce((select jsonb_agg(r.code order by r.code) from public.installation_provider_regions pr join public.installation_service_regions r on r.id=pr.region_id where pr.provider_id=p.id and pr.active),'[]'::jsonb)) order by coalesce(company.display_name,team.name),p.id) from public.installation_providers p left join public.partner_companies company on company.id=p.partner_company_id left join public.internal_installation_teams team on team.id=p.internal_team_id join public.installation_provider_profiles profile on profile.provider_id=p.id),'[]'::jsonb),
    'regions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'code',code,'nameRu',name_ru,'nameRo',name_ro,'regionType',region_type) order by code) from public.installation_service_regions where active),'[]'::jsonb),
    'partnerCompanies',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',display_name) order by display_name) from public.partner_companies where status='active'),'[]'::jsonb),
    'internalTeams',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from public.internal_installation_teams where active),'[]'::jsonb)
  );
end; $$;

create or replace function public.admin_save_installation_tariff_draft(p_tariff_set_id uuid,p_effective_from timestamptz,p_currency text,p_vat_treatment text,p_lines jsonb,p_expected_revision bigint,p_reason text) returns uuid
language plpgsql security definer set search_path=public as $$
declare target_id uuid; next_version integer; affected integer;
begin
  if not public.has_internal_permission('admin.retail_marketplace.manage') then raise exception 'Forbidden.' using errcode='42501'; end if;
  if p_currency !~ '^[A-Z]{3}$' or p_vat_treatment not in ('included','excluded','not_specified') or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 1 and 4 or char_length(btrim(p_reason))<5 then raise exception 'Invalid tariff draft.' using errcode='22023'; end if;
  if exists(select 1 from jsonb_to_recordset(p_lines) x(service_type text,unit_code text,unit_price numeric) where service_type not in ('camera_installation','cable_laying','commissioning','remote_configuration') or unit_code not in ('piece','meter','service') or unit_price<0) then raise exception 'Invalid tariff line.' using errcode='22023'; end if;
  if (select count(distinct service_type) from jsonb_to_recordset(p_lines) x(service_type text))<>jsonb_array_length(p_lines) then raise exception 'Duplicate tariff line.' using errcode='22023'; end if;
  if p_tariff_set_id is null then
    select coalesce(max(version),0)+1 into next_version from public.installation_tariff_sets where system_type='cctv';
    insert into public.installation_tariff_sets(system_type,version,currency,vat_treatment,effective_from,created_by) values('cctv',next_version,p_currency,p_vat_treatment,p_effective_from,auth.uid()) returning id into target_id;
    insert into public.retail_marketplace_events(aggregate_type,aggregate_id,event_type,actor_user_id,safe_evidence) values('tariff_set',target_id,'tariff_draft_created',auth.uid(),jsonb_build_object('reason',btrim(p_reason),'lineCount',jsonb_array_length(p_lines)));
  else
    update public.installation_tariff_sets set currency=p_currency,vat_treatment=p_vat_treatment,effective_from=p_effective_from,revision=revision+1,updated_at=now() where id=p_tariff_set_id and status='draft' and revision=p_expected_revision returning id into target_id;
    get diagnostics affected=row_count; if affected<>1 then raise exception 'Tariff revision conflict.' using errcode='40001'; end if;
    delete from public.installation_tariffs where tariff_set_id=target_id;
    insert into public.retail_marketplace_events(aggregate_type,aggregate_id,event_type,actor_user_id,safe_evidence) values('tariff_set',target_id,'tariff_draft_updated',auth.uid(),jsonb_build_object('reason',btrim(p_reason),'lineCount',jsonb_array_length(p_lines)));
  end if;
  insert into public.installation_tariffs(tariff_set_id,service_type,unit_code,customer_unit_price) select target_id,service_type,unit_code,unit_price from jsonb_to_recordset(p_lines) x(service_type text,unit_code text,unit_price numeric);
  return target_id;
end; $$;

create or replace function public.admin_publish_installation_tariff_set(p_tariff_set_id uuid,p_expected_revision bigint,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
declare target public.installation_tariff_sets; required_count integer; previous_id uuid;
begin
  if not public.has_internal_permission('admin.retail_marketplace.manage') then raise exception 'Forbidden.' using errcode='42501'; end if;
  if char_length(btrim(p_reason))<5 then raise exception 'Publication reason required.' using errcode='22023'; end if;
  select * into target from public.installation_tariff_sets where id=p_tariff_set_id and status='draft' and revision=p_expected_revision for update;
  if target.id is null then raise exception 'Tariff revision conflict.' using errcode='40001'; end if;
  select count(*) into required_count from public.installation_tariffs where tariff_set_id=target.id and (service_type,unit_code) in (('camera_installation','piece'),('cable_laying','meter'),('commissioning','service'),('remote_configuration','service'));
  if required_count<>4 then raise exception 'Complete CCTV tariff set required.' using errcode='22023'; end if;
  select id into previous_id from public.installation_tariff_sets where system_type=target.system_type and status='published' for update;
  if previous_id is not null then
    update public.installation_tariff_sets set status='superseded',effective_to=target.effective_from,revision=revision+1,updated_at=now() where id=previous_id;
    insert into public.retail_marketplace_events(aggregate_type,aggregate_id,event_type,actor_user_id,safe_evidence) values('tariff_set',previous_id,'tariff_superseded',auth.uid(),jsonb_build_object('replacementId',target.id));
  end if;
  update public.installation_tariff_sets set status='published',published_by=auth.uid(),published_at=now(),revision=revision+1,updated_at=now() where id=target.id;
  insert into public.retail_marketplace_events(aggregate_type,aggregate_id,event_type,actor_user_id,safe_evidence) values('tariff_set',target.id,'tariff_published',auth.uid(),jsonb_build_object('reason',btrim(p_reason),'version',target.version));
end; $$;

create or replace function public.admin_save_installation_provider(p_provider_id uuid,p_provider_type text,p_backing_id uuid,p_profile jsonb,p_competencies text[],p_region_codes text[],p_expected_revision bigint,p_reason text) returns uuid
language plpgsql security definer set search_path=public as $$
declare target_id uuid; affected integer; old_state record; event_name text;
begin
  if not public.has_internal_permission('admin.retail_marketplace.manage') then raise exception 'Forbidden.' using errcode='42501'; end if;
  if p_provider_type not in ('partner_company','internal_team') or char_length(btrim(p_reason))<5 or jsonb_typeof(p_profile)<>'object'
    or coalesce(p_profile->>'operationalStatus','') not in ('active','inactive','suspended') or coalesce(p_profile->>'approvalStatus','') not in ('pending','approved','rejected')
    or coalesce(p_profile->>'publicProfileStatus','') not in ('draft','published') or coalesce(p_profile->>'availability','') not in ('available','limited','unavailable')
    or char_length(btrim(coalesce(p_profile->>'publicNameRu','')))<2 or char_length(btrim(coalesce(p_profile->>'publicNameRo','')))<2
    or coalesce((p_profile->>'acceptanceSlaMinutes')::integer,0) not between 5 and 10080
    or coalesce(array_length(p_competencies,1),0)>1 or coalesce(array_length(p_region_codes,1),0)>100 then raise exception 'Invalid provider command.' using errcode='22023'; end if;
  if p_competencies is not null and exists(select 1 from unnest(p_competencies) x where x<>'cctv') then raise exception 'Invalid competency.' using errcode='22023'; end if;
  if p_region_codes is not null and exists(select 1 from unnest(p_region_codes) x left join public.installation_service_regions r on r.code=x and r.active where r.id is null) then raise exception 'Invalid service region.' using errcode='22023'; end if;
  if p_provider_type='partner_company' and not exists(select 1 from public.partner_companies where id=p_backing_id and status='active') then raise exception 'Active partner company required.' using errcode='22023'; end if;
  if p_provider_type='internal_team' and not exists(select 1 from public.internal_installation_teams where id=p_backing_id and active) then raise exception 'Active internal team required.' using errcode='22023'; end if;
  if p_provider_id is null then
    insert into public.installation_providers(provider_type,partner_company_id,internal_team_id,operational_status,approval_status,marketplace_enabled,suspension_reason,created_by,updated_by)
    values(p_provider_type,case when p_provider_type='partner_company' then p_backing_id end,case when p_provider_type='internal_team' then p_backing_id end,p_profile->>'operationalStatus',p_profile->>'approvalStatus',coalesce((p_profile->>'marketplaceEnabled')::boolean,false),nullif(btrim(coalesce(p_profile->>'suspensionReason','')),''),auth.uid(),auth.uid()) returning id into target_id;
    event_name:='provider_created';
  else
    select operational_status,approval_status into old_state from public.installation_providers where id=p_provider_id;
    update public.installation_providers set operational_status=p_profile->>'operationalStatus',approval_status=p_profile->>'approvalStatus',marketplace_enabled=coalesce((p_profile->>'marketplaceEnabled')::boolean,false),suspension_reason=nullif(btrim(coalesce(p_profile->>'suspensionReason','')),''),revision=revision+1,updated_by=auth.uid(),updated_at=now() where id=p_provider_id and provider_type=p_provider_type and revision=p_expected_revision returning id into target_id;
    get diagnostics affected=row_count; if affected<>1 then raise exception 'Provider revision conflict.' using errcode='40001'; end if;
    event_name:=case when p_profile->>'operationalStatus'='suspended' and old_state.operational_status<>'suspended' then 'provider_suspended' when p_profile->>'approvalStatus'='approved' and old_state.approval_status<>'approved' then 'provider_approved' else 'provider_updated' end;
  end if;
  insert into public.installation_provider_profiles(provider_id,public_name_ru,public_name_ro,public_description_ru,public_description_ro,logo_path,public_profile_status,availability_state,max_concurrent_jobs,acceptance_sla_minutes)
  values(target_id,btrim(p_profile->>'publicNameRu'),btrim(p_profile->>'publicNameRo'),nullif(btrim(coalesce(p_profile->>'publicDescriptionRu','')),''),nullif(btrim(coalesce(p_profile->>'publicDescriptionRo','')),''),nullif(btrim(coalesce(p_profile->>'logoPath','')),''),p_profile->>'publicProfileStatus',p_profile->>'availability',nullif(p_profile->>'maxConcurrentJobs','')::integer,(p_profile->>'acceptanceSlaMinutes')::integer)
  on conflict(provider_id) do update set public_name_ru=excluded.public_name_ru,public_name_ro=excluded.public_name_ro,public_description_ru=excluded.public_description_ru,public_description_ro=excluded.public_description_ro,logo_path=excluded.logo_path,public_profile_status=excluded.public_profile_status,availability_state=excluded.availability_state,max_concurrent_jobs=excluded.max_concurrent_jobs,acceptance_sla_minutes=excluded.acceptance_sla_minutes,updated_at=now();
  delete from public.installation_provider_competencies where provider_id=target_id; insert into public.installation_provider_competencies(provider_id,system_type) select target_id,x from unnest(coalesce(p_competencies,array[]::text[])) x;
  delete from public.installation_provider_regions where provider_id=target_id; insert into public.installation_provider_regions(provider_id,region_id) select target_id,r.id from unnest(coalesce(p_region_codes,array[]::text[])) x join public.installation_service_regions r on r.code=x;
  insert into public.retail_marketplace_events(aggregate_type,aggregate_id,event_type,actor_user_id,safe_evidence) values('provider',target_id,event_name,auth.uid(),jsonb_build_object('reason',btrim(p_reason),'competencyCount',coalesce(array_length(p_competencies,1),0),'regionCount',coalesce(array_length(p_region_codes,1),0)));
  return target_id;
end; $$;

-- The browser supplies tariff evidence for idempotency only. This RPC rebuilds the
-- commercial snapshot from governed published rows before the bundle is stored.
create or replace function public.add_public_retail_cart_cctv_bundle_v3(
  p_token_hash text,p_items jsonb,p_installation_intent jsonb,p_calculator_input jsonb,
  p_work_scope jsonb,p_installation_pricing jsonb,p_request_id uuid,p_fingerprint text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare tariff_set public.installation_tariff_sets; canonical_pricing jsonb; response jsonb;
  previous_response jsonb; previous_fingerprint text;
  scope_count integer; priced_count integer; calculated_subtotal numeric(14,2);
begin
  select request.response,request.fingerprint into previous_response,previous_fingerprint
    from public.retail_carts cart join public.retail_cart_requests request on request.cart_id=cart.id and request.request_id=p_request_id
    where cart.token_hash=p_token_hash and cart.status='active' and cart.expires_at>now();
  if previous_response is not null then
    if previous_fingerprint<>p_fingerprint then raise exception 'Idempotency conflict.' using errcode='23505'; end if;
    return previous_response;
  end if;
  if p_work_scope is null or jsonb_typeof(p_work_scope)<>'array' then raise exception 'Invalid work scope.' using errcode='22023'; end if;
  scope_count:=jsonb_array_length(p_work_scope);
  if scope_count=0 then
    if p_installation_pricing is not null then raise exception 'Unexpected installation pricing.' using errcode='22023'; end if;
  else
    if jsonb_typeof(p_installation_pricing)<>'object' then raise exception 'Installation tariff unavailable.' using errcode='P0002'; end if;
    select * into tariff_set from public.installation_tariff_sets s
      where s.id=(p_installation_pricing->>'tariffSetId')::uuid and s.system_type='cctv' and s.status in ('published','superseded')
        and s.effective_from<=now() and (s.effective_to is null or s.effective_to>now());
    if tariff_set.id is null or (p_installation_pricing->>'tariffVersion')::integer<>tariff_set.version then
      raise exception 'Installation tariff changed.' using errcode='P0002';
    end if;
    with scope as (
      select kind,quantity,unit_code from jsonb_to_recordset(p_work_scope) x(kind text,quantity numeric,unit_code text)
    ), priced as (
      select scope.kind service_type,scope.quantity,scope.unit_code,tariff.customer_unit_price,
        round(scope.quantity*tariff.customer_unit_price,2) amount
      from scope join public.installation_tariffs tariff on tariff.tariff_set_id=tariff_set.id
        and tariff.service_type=scope.kind and tariff.unit_code=scope.unit_code
      where scope.kind in ('camera_installation','cable_laying','commissioning','remote_configuration')
        and scope.quantity>0 and scope.quantity<=20000
    ) select count(*),coalesce(sum(amount),0),jsonb_build_object(
      'tariffSetId',tariff_set.id,'tariffVersion',tariff_set.version,'currency',tariff_set.currency,
      'vatTreatment',tariff_set.vat_treatment,'lines',coalesce(jsonb_agg(jsonb_build_object(
        'serviceType',service_type,'quantity',quantity,'unitCode',unit_code,
        'unitPrice',customer_unit_price,'amount',amount) order by service_type),'[]'::jsonb),
      'subtotal',coalesce(sum(amount),0))
      into priced_count,calculated_subtotal,canonical_pricing from priced;
    if priced_count<>scope_count or calculated_subtotal<>(p_installation_pricing->>'subtotal')::numeric then
      raise exception 'Installation pricing changed.' using errcode='P0002';
    end if;
  end if;
  response:=public.add_public_retail_cart_cctv_bundle_v2(p_token_hash,p_items,p_installation_intent,
    p_calculator_input,p_work_scope,p_request_id,p_fingerprint);
  if scope_count>0 then
    update public.retail_cart_bundles set installation_tariff_set_id=tariff_set.id,
      installation_price_snapshot=canonical_pricing where id=(response->>'bundleId')::uuid;
  end if;
  return response;
end; $$;

create or replace function public.get_public_retail_cart(p_token_hash text,p_locale text default 'ru') returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare cart_row public.retail_carts; result jsonb;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' or p_locale not in ('ru','ro') then return null; end if;
  select * into cart_row from public.retail_carts where token_hash=p_token_hash and status='active' and expires_at>now();
  if cart_row.id is null then return null; end if;
  with current_publication as (select id from public.public_retail_publications where status='published'),
  enriched as (
    select item.*,product.public_id current_id,product.slug current_slug,product.sku current_sku,
      case when p_locale='ro' then coalesce(product.name_ro,product.name_ru) else product.name_ru end current_name,
      product.primary_image_url current_image,product.retail_price_amount current_price,product.retail_price_currency current_currency,
      product.vat_presentation,product.availability current_availability
    from public.retail_cart_items item left join current_publication publication on true
    left join public.public_retail_products product on product.publication_id=publication.id and product.public_id=item.public_product_id
    where item.cart_id=cart_row.id
  ), currency_state as (select count(distinct current_currency) filter(where current_id is not null) currencies,bool_or(current_id is null) stale from enriched),
  totals as (select sum(current_price*quantity) filter(where commercial_group='equipment') equipment,sum(current_price*quantity) filter(where commercial_group='materials') materials from enriched),
  installation as (select coalesce(sum((installation_price_snapshot->>'subtotal')::numeric),0) amount,
    count(distinct installation_price_snapshot->>'currency') currencies,
    min(installation_price_snapshot->>'currency') currency from public.retail_cart_bundles where cart_id=cart_row.id and installation_price_snapshot is not null),
  item_json as (select coalesce(jsonb_agg(jsonb_build_object(
    'publicProductId',public_product_id,'bundleId',bundle_id,'source',source,'commercialGroup',commercial_group,
    'slug',current_slug,'sku',coalesce(current_sku,snapshot_sku),'name',coalesce(current_name,case when p_locale='ro' then coalesce(snapshot_name_ro,snapshot_name_ru) else snapshot_name_ru end),
    'image',case when coalesce(current_image,snapshot_image_url) is null then null else jsonb_build_object('url',coalesce(current_image,snapshot_image_url),'alt',coalesce(current_name,snapshot_name_ru)) end,
    'quantity',quantity,'unitCode',unit_code,'price',case when current_id is null then null else jsonb_build_object('amount',current_price,'currency',current_currency,'vatPresentation',vat_presentation) end,
    'availability',coalesce(current_availability,'unavailable'),'lineAmount',case when current_id is null then null else current_price*quantity end,
    'stale',current_id is null,'priceChanged',current_id is not null and (current_price<>observed_price_amount or current_currency<>observed_currency)
  ) order by created_at,id),'[]'::jsonb) value from enriched),
  bundle_json as (select coalesce(jsonb_agg(jsonb_build_object('id',id,'source',source,'installationIntent',installation_intent,
    'calculatorVersion',calculator_version,'calculatorInput',calculator_input,'workScope',work_scope,
    'installationPricing',installation_price_snapshot) order by created_at,id),'[]'::jsonb) value from public.retail_cart_bundles where cart_id=cart_row.id)
  select jsonb_build_object('revision',cart_row.revision,'distinctItemCount',(select count(*) from enriched),'totalQuantity',(select coalesce(sum(quantity),0) from enriched),
    'items',(select value from item_json),'bundles',(select value from bundle_json),'totals',jsonb_build_object(
      'equipment',case when (select coalesce(stale,false) or currencies>1 from currency_state) then null else coalesce((select equipment from totals),0) end,
      'materials',case when (select coalesce(stale,false) or currencies>1 from currency_state) then null else coalesce((select materials from totals),0) end,
      'installation',case when (select currencies>1 from installation) then null else (select amount from installation) end,
      'total',case when (select coalesce(stale,false) or currencies>1 from currency_state) or (select currencies>1 from installation)
        or ((select currencies from installation)=1 and (select currency from installation) is distinct from (select min(current_currency) from enriched)) then null
        else coalesce((select equipment from totals),0)+coalesce((select materials from totals),0)+(select amount from installation) end,
      'currency',case when (select coalesce(stale,false) or currencies<>1 from currency_state) then null else (select min(current_currency) from enriched) end)) into result;
  return result;
end; $$;

alter table public.installation_tariff_sets enable row level security;
alter table public.installation_tariffs enable row level security;
alter table public.installation_service_regions enable row level security;
alter table public.internal_installation_teams enable row level security;
alter table public.installation_providers enable row level security;
alter table public.installation_provider_profiles enable row level security;
alter table public.installation_provider_competencies enable row level security;
alter table public.installation_provider_regions enable row level security;
alter table public.retail_marketplace_events enable row level security;
revoke all on public.installation_tariff_sets,public.installation_tariffs,public.installation_service_regions,public.internal_installation_teams,public.installation_providers,public.installation_provider_profiles,public.installation_provider_competencies,public.installation_provider_regions,public.retail_marketplace_events from public,anon,authenticated;
grant select on public.installation_tariff_sets,public.installation_tariffs,public.installation_service_regions,public.internal_installation_teams,public.installation_providers,public.installation_provider_profiles,public.installation_provider_competencies,public.installation_provider_regions,public.retail_marketplace_events to authenticated;
create policy installation_marketplace_admin_tariff_sets on public.installation_tariff_sets for select to authenticated using(public.has_internal_permission('admin.retail_marketplace.view'));
create policy installation_marketplace_admin_tariffs on public.installation_tariffs for select to authenticated using(public.has_internal_permission('admin.retail_marketplace.view'));
create policy installation_marketplace_admin_regions on public.installation_service_regions for select to authenticated using(public.has_internal_permission('admin.retail_marketplace.view'));
create policy installation_marketplace_admin_teams on public.internal_installation_teams for select to authenticated using(public.has_internal_permission('admin.retail_marketplace.view'));
create policy installation_marketplace_admin_providers on public.installation_providers for select to authenticated using(public.has_internal_permission('admin.retail_marketplace.view'));
create policy installation_marketplace_admin_profiles on public.installation_provider_profiles for select to authenticated using(public.has_internal_permission('admin.retail_marketplace.view'));
create policy installation_marketplace_admin_competencies on public.installation_provider_competencies for select to authenticated using(public.has_internal_permission('admin.retail_marketplace.view'));
create policy installation_marketplace_admin_provider_regions on public.installation_provider_regions for select to authenticated using(public.has_internal_permission('admin.retail_marketplace.view'));
create policy installation_marketplace_admin_events on public.retail_marketplace_events for select to authenticated using(public.has_internal_permission('admin.retail_marketplace.view'));

revoke all on function public.prevent_published_installation_tariff_mutation(),public.prevent_retail_marketplace_event_mutation() from public,anon,authenticated;
revoke all on function public.get_current_public_installation_tariffs(text),public.list_public_installation_providers(text,text,text) from public,authenticated;
grant execute on function public.get_current_public_installation_tariffs(text),public.list_public_installation_providers(text,text,text) to anon,service_role;
revoke all on function public.add_public_retail_cart_cctv_bundle_v3(text,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,text) from public,authenticated;
grant execute on function public.add_public_retail_cart_cctv_bundle_v3(text,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,text) to anon,service_role;
revoke all on function public.admin_get_retail_installation_marketplace(),public.admin_save_installation_tariff_draft(uuid,timestamptz,text,text,jsonb,bigint,text),public.admin_publish_installation_tariff_set(uuid,bigint,text),public.admin_save_installation_provider(uuid,text,uuid,jsonb,text[],text[],bigint,text) from public,anon;
grant execute on function public.admin_get_retail_installation_marketplace(),public.admin_save_installation_tariff_draft(uuid,timestamptz,text,text,jsonb,bigint,text),public.admin_publish_installation_tariff_set(uuid,bigint,text),public.admin_save_installation_provider(uuid,text,uuid,jsonb,text[],text[],bigint,text) to authenticated,service_role;

insert into public.internal_installation_teams(code,name) values('novotech-installation','Novotech Installation') on conflict(code) do nothing;
with team as (select id,name from public.internal_installation_teams where code='novotech-installation'), provider as (
  insert into public.installation_providers(provider_type,internal_team_id,operational_status,approval_status,marketplace_enabled)
  select 'internal_team',id,'inactive','pending',false from team on conflict do nothing returning id
), selected as (select id from provider union all select p.id from public.installation_providers p join team on team.id=p.internal_team_id limit 1)
insert into public.installation_provider_profiles(provider_id,public_name_ru,public_name_ro,public_profile_status,availability_state,acceptance_sla_minutes)
select id,'Монтажная служба Novotech','Serviciul de instalare Novotech','draft','unavailable',120 from selected on conflict(provider_id) do nothing;
