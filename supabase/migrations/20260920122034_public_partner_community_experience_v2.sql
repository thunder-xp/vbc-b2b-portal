begin;

alter table public.partner_companies
  add column public_slug text null,
  add column public_description_ru text null,
  add column public_description_ro text null,
  add column public_location_label text null,
  add column public_email text null,
  add column public_phone text null,
  add column public_website text null;

alter table public.partner_companies
  add constraint partner_companies_public_slug_check check (
    public_slug is null
    or (
      public_slug = lower(btrim(public_slug))
      and public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      and char_length(public_slug) between 2 and 120
    )
  ),
  add constraint partner_companies_public_description_ru_check check (
    public_description_ru is null
    or (public_description_ru = btrim(public_description_ru) and char_length(public_description_ru) between 2 and 2000)
  ),
  add constraint partner_companies_public_description_ro_check check (
    public_description_ro is null
    or (public_description_ro = btrim(public_description_ro) and char_length(public_description_ro) between 2 and 2000)
  ),
  add constraint partner_companies_public_location_label_check check (
    public_location_label is null
    or (public_location_label = btrim(public_location_label) and char_length(public_location_label) between 2 and 120)
  ),
  add constraint partner_companies_public_email_check check (
    public_email is null
    or (
      public_email = lower(btrim(public_email))
      and char_length(public_email) <= 254
      and public_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  ),
  add constraint partner_companies_public_phone_check check (
    public_phone is null
    or (public_phone = btrim(public_phone) and public_phone ~ '^\+[1-9][0-9]{7,14}$')
  ),
  add constraint partner_companies_public_website_check check (
    public_website is null
    or (
      public_website = btrim(public_website)
      and char_length(public_website) <= 500
      and public_website ~ '^https://[^[:space:]]+$'
    )
  );

create unique index partner_companies_public_slug_uidx
  on public.partner_companies(public_slug)
  where public_slug is not null;

comment on column public.partner_companies.public_slug is
  'Stable Admin-governed slug for the published public Partner profile. Never inferred from private company data.';
comment on column public.partner_companies.public_description_ru is
  'Explicitly approved Russian public Partner description.';
comment on column public.partner_companies.public_description_ro is
  'Explicitly approved Romanian public Partner description.';
comment on column public.partner_companies.public_location_label is
  'Explicitly approved public locality label; never derived from legal or billing addresses.';
comment on column public.partner_companies.public_email is
  'Independently approved public contact email. Null means not published.';
comment on column public.partner_companies.public_phone is
  'Independently approved public contact phone. Null means not published.';
comment on column public.partner_companies.public_website is
  'Independently approved HTTPS website. Null means not published.';

create table public.public_partner_capabilities (
  company_id uuid not null references public.partner_companies(id) on delete cascade,
  capability_code text not null check (capability_code in (
    'CCTV', 'ALARM', 'ACCESS_CONTROL', 'INTERCOM', 'NETWORK', 'OTHER'
  )),
  evidence_status text not null check (evidence_status in ('SELF_DECLARED', 'VERIFIED')),
  updated_at timestamptz not null default now(),
  updated_by uuid null references public.user_profiles(id) on delete restrict,
  primary key (company_id, capability_code)
);

create index public_partner_capabilities_code_company_idx
  on public.public_partner_capabilities(capability_code, company_id);

alter table public.public_partner_capabilities enable row level security;
revoke all on table public.public_partner_capabilities from public, anon, authenticated;

comment on table public.public_partner_capabilities is
  'Admin-governed public Partner capability evidence. Independent from Installation Marketplace operational data.';

alter table public.public_partner_directory_governance_events
  drop constraint public_partner_directory_governance_events_event_type_check;

alter table public.public_partner_directory_governance_events
  add column changed_fields text[] not null default '{}'::text[],
  add constraint public_partner_directory_governance_events_changed_fields_check
    check (cardinality(changed_fields) <= 32),
  add constraint public_partner_directory_governance_events_event_type_check check (event_type in (
    'public_directory_enabled',
    'public_directory_disabled',
    'public_display_name_changed',
    'public_logo_changed',
    'public_slug_changed',
    'public_descriptions_changed',
    'public_location_changed',
    'public_contact_changed',
    'public_website_changed',
    'public_capabilities_changed'
  ));

comment on column public.public_partner_directory_governance_events.changed_fields is
  'Names of public presentation fields changed; values are intentionally not duplicated into audit storage.';

drop function public.list_public_partner_directory();

create function public.list_public_partner_directory(
  p_search text default null,
  p_locality text default null,
  p_capability text default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_search text := lower(left(btrim(coalesce(p_search, '')), 100));
  normalized_locality text := lower(left(btrim(coalesce(p_locality, '')), 120));
  normalized_capability text := upper(left(btrim(coalesce(p_capability, '')), 40));
  normalized_limit integer := least(greatest(coalesce(p_limit, 100), 1), 100);
begin
  if normalized_capability <> '' and normalized_capability not in (
    'CCTV', 'ALARM', 'ACCESS_CONTROL', 'INTERCOM', 'NETWORK', 'OTHER'
  ) then
    return jsonb_build_object('items', '[]'::jsonb, 'localities', '[]'::jsonb, 'capabilities', '[]'::jsonb);
  end if;

  return (
    with published as materialized (
      select company.id, company.public_slug, company.public_display_name,
        company.public_directory_logo_asset_path, company.public_location_label,
        company.public_directory_updated_at
      from public.partner_companies company
      where company.status = 'active'
        and company.public_directory_visible = true
        and company.public_display_name is not null
        and char_length(btrim(company.public_display_name)) between 2 and 160
      order by lower(company.public_display_name), company.id
      limit 100
    ), capability_summary as materialized (
      select capability.company_id,
        jsonb_agg(jsonb_build_object(
          'code', capability.capability_code,
          'evidenceStatus', capability.evidence_status
        ) order by capability.capability_code) as capabilities
      from public.public_partner_capabilities capability
      join published on published.id = capability.company_id
      group by capability.company_id
    ), filtered as (
      select published.*, coalesce(capability_summary.capabilities, '[]'::jsonb) as capabilities
      from published
      left join capability_summary on capability_summary.company_id = published.id
      where (
        normalized_search = ''
        or strpos(lower(published.public_display_name), normalized_search) > 0
        or strpos(lower(coalesce(published.public_location_label, '')), normalized_search) > 0
      )
      and (normalized_locality = '' or lower(coalesce(published.public_location_label, '')) = normalized_locality)
      and (
        normalized_capability = ''
        or exists (
          select 1 from public.public_partner_capabilities capability
          where capability.company_id = published.id
            and capability.capability_code = normalized_capability
        )
      )
      order by lower(published.public_display_name), published.id
      limit normalized_limit
    )
    select jsonb_build_object(
      'items', coalesce((select jsonb_agg(jsonb_build_object(
        'slug', filtered.public_slug,
        'displayName', filtered.public_display_name,
        'logoAssetPath', filtered.public_directory_logo_asset_path,
        'locality', filtered.public_location_label,
        'capabilities', filtered.capabilities,
        'updatedAt', filtered.public_directory_updated_at
      ) order by lower(filtered.public_display_name), filtered.id) from filtered), '[]'::jsonb),
      'localities', coalesce((select jsonb_agg(locality order by lower(locality)) from (
        select distinct public_location_label as locality
        from published where public_location_label is not null
      ) values_by_locality), '[]'::jsonb),
      'capabilities', coalesce((select jsonb_agg(capability_code order by capability_code) from (
        select distinct capability.capability_code
        from public.public_partner_capabilities capability
        join published on published.id = capability.company_id
      ) values_by_capability), '[]'::jsonb)
    )
  );
end;
$$;

create function public.get_public_partner_profile(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'slug', company.public_slug,
    'displayName', company.public_display_name,
    'logoAssetPath', company.public_directory_logo_asset_path,
    'descriptionRu', company.public_description_ru,
    'descriptionRo', company.public_description_ro,
    'locality', company.public_location_label,
    'publicEmail', company.public_email,
    'publicPhone', company.public_phone,
    'publicWebsite', company.public_website,
    'capabilities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', capability.capability_code,
        'evidenceStatus', capability.evidence_status
      ) order by capability.capability_code)
      from public.public_partner_capabilities capability
      where capability.company_id = company.id
    ), '[]'::jsonb),
    'updatedAt', company.public_directory_updated_at
  )
  from public.partner_companies company
  where company.status = 'active'
    and company.public_directory_visible = true
    and company.public_slug = lower(btrim(p_slug))
    and company.public_display_name is not null
    and char_length(btrim(company.public_display_name)) between 2 and 160
  limit 1;
$$;

create or replace function public.list_admin_public_partner_directory(
  p_page integer default 1,
  p_page_size integer default 25,
  p_search text default null,
  p_filter text default 'all'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_page integer := greatest(coalesce(p_page, 1), 1);
  normalized_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 50);
  normalized_search text := lower(left(btrim(coalesce(p_search, '')), 100));
  normalized_filter text := coalesce(nullif(btrim(p_filter), ''), 'all');
  total_count integer;
  published_count integer;
  records jsonb;
begin
  if auth.uid() is null or not public.has_internal_permission('admin.catalog.manage') then
    raise exception 'Public partner-directory governance denied.' using errcode = '42501';
  end if;
  if normalized_filter not in (
    'all', 'visible', 'hidden', 'missing_logo', 'missing_public_name', 'incomplete', 'name_review'
  ) then
    raise exception 'Public partner-directory filter is invalid.' using errcode = '22023';
  end if;

  select count(*) into published_count
  from public.partner_companies company
  where company.status = 'active' and company.public_directory_visible;

  with capability_counts as (
    select capability.company_id, count(*)::integer as capability_count
    from public.public_partner_capabilities capability
    group by capability.company_id
  )
  select count(*) into total_count
  from public.partner_companies company
  left join capability_counts on capability_counts.company_id = company.id
  where company.status = 'active'
    and (
      normalized_search = ''
      or strpos(lower(company.display_name), normalized_search) > 0
      or strpos(lower(coalesce(company.public_display_name, '')), normalized_search) > 0
      or strpos(lower(coalesce(company.public_slug, '')), normalized_search) > 0
    )
    and case normalized_filter
      when 'visible' then company.public_directory_visible
      when 'hidden' then not company.public_directory_visible
      when 'missing_logo' then company.public_directory_logo_asset_path is null
      when 'missing_public_name' then company.public_display_name is null
      when 'name_review' then char_length(coalesce(company.public_display_name, '')) > 60
      when 'incomplete' then
        company.public_display_name is null
        or company.public_directory_logo_asset_path is null
        or company.public_description_ru is null
        or company.public_description_ro is null
        or company.public_location_label is null
        or coalesce(capability_counts.capability_count, 0) = 0
        or (company.public_email is null and company.public_phone is null)
        or company.public_website is null
      else true
    end;

  with capability_summary as (
    select capability.company_id,
      jsonb_agg(jsonb_build_object(
        'code', capability.capability_code,
        'evidenceStatus', capability.evidence_status
      ) order by capability.capability_code) as capabilities,
      count(*)::integer as capability_count
    from public.public_partner_capabilities capability
    group by capability.company_id
  ), selected as (
    select company.*, coalesce(capability_summary.capabilities, '[]'::jsonb) as capabilities,
      coalesce(capability_summary.capability_count, 0) as capability_count
    from public.partner_companies company
    left join capability_summary on capability_summary.company_id = company.id
    where company.status = 'active'
      and (
        normalized_search = ''
        or strpos(lower(company.display_name), normalized_search) > 0
        or strpos(lower(coalesce(company.public_display_name, '')), normalized_search) > 0
        or strpos(lower(coalesce(company.public_slug, '')), normalized_search) > 0
      )
      and case normalized_filter
        when 'visible' then company.public_directory_visible
        when 'hidden' then not company.public_directory_visible
        when 'missing_logo' then company.public_directory_logo_asset_path is null
        when 'missing_public_name' then company.public_display_name is null
        when 'name_review' then char_length(coalesce(company.public_display_name, '')) > 60
        when 'incomplete' then
          company.public_display_name is null
          or company.public_directory_logo_asset_path is null
          or company.public_description_ru is null
          or company.public_description_ro is null
          or company.public_location_label is null
          or coalesce(capability_summary.capability_count, 0) = 0
          or (company.public_email is null and company.public_phone is null)
          or company.public_website is null
        else true
      end
    order by lower(company.display_name), company.id
    limit normalized_page_size
    offset (normalized_page - 1) * normalized_page_size
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'companyId', selected.id,
    'companyName', selected.display_name,
    'publicDisplayName', selected.public_display_name,
    'publicSlug', selected.public_slug,
    'descriptionRu', selected.public_description_ru,
    'descriptionRo', selected.public_description_ro,
    'locality', selected.public_location_label,
    'publicEmail', selected.public_email,
    'publicPhone', selected.public_phone,
    'publicWebsite', selected.public_website,
    'logoAssetPath', selected.logo_asset_path,
    'approvedLogoAssetPath', selected.public_directory_logo_asset_path,
    'capabilities', selected.capabilities,
    'visible', selected.public_directory_visible,
    'revision', selected.public_directory_revision,
    'updatedAt', selected.public_directory_updated_at,
    'publishedAt', selected.public_directory_published_at,
    'publicNameReview', char_length(coalesce(selected.public_display_name, '')) > 60,
    'completeness', jsonb_build_object(
      'publicName', selected.public_display_name is not null,
      'logo', selected.public_directory_logo_asset_path is not null,
      'descriptionRu', selected.public_description_ru is not null,
      'descriptionRo', selected.public_description_ro is not null,
      'locality', selected.public_location_label is not null,
      'capabilities', selected.capability_count > 0,
      'publicContact', selected.public_email is not null or selected.public_phone is not null,
      'website', selected.public_website is not null
    )
  ) order by lower(selected.display_name), selected.id), '[]'::jsonb)
  into records
  from selected;

  return jsonb_build_object(
    'records', records,
    'totalCount', total_count,
    'publishedCount', published_count,
    'page', normalized_page,
    'pageSize', normalized_page_size
  );
end;
$$;

drop function public.update_admin_public_partner_directory(uuid, bigint, text, boolean, boolean, uuid);

create function public.update_admin_public_partner_directory(
  p_company_id uuid,
  p_expected_revision bigint,
  p_public_display_name text,
  p_public_slug text,
  p_description_ru text,
  p_description_ro text,
  p_locality text,
  p_public_email text,
  p_public_phone text,
  p_public_website text,
  p_capabilities jsonb,
  p_visible boolean,
  p_use_current_logo boolean,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.partner_companies%rowtype;
  normalized_name text := nullif(btrim(coalesce(p_public_display_name, '')), '');
  normalized_slug text := nullif(lower(btrim(coalesce(p_public_slug, ''))), '');
  normalized_description_ru text := nullif(btrim(coalesce(p_description_ru, '')), '');
  normalized_description_ro text := nullif(btrim(coalesce(p_description_ro, '')), '');
  normalized_locality text := nullif(btrim(coalesce(p_locality, '')), '');
  normalized_email text := nullif(lower(btrim(coalesce(p_public_email, ''))), '');
  normalized_phone text := nullif(btrim(coalesce(p_public_phone, '')), '');
  normalized_website text := nullif(btrim(coalesce(p_public_website, '')), '');
  normalized_capabilities jsonb;
  current_capabilities jsonb;
  capability_changed_fields text[];
  approved_logo_path text;
  next_revision bigint;
begin
  if auth.uid() is null or not public.has_internal_permission('admin.catalog.manage') then
    raise exception 'Public partner-directory governance denied.' using errcode = '42501';
  end if;
  if p_company_id is null or p_expected_revision is null or p_expected_revision < 1
     or p_visible is null or p_use_current_logo is null or p_correlation_id is null
     or p_capabilities is null or jsonb_typeof(p_capabilities) <> 'array' then
    raise exception 'PUBLIC_PARTNER_INPUT_INVALID' using errcode = '22023';
  end if;
  if jsonb_array_length(p_capabilities) > 6 then
    raise exception 'PUBLIC_PARTNER_INPUT_INVALID' using errcode = '22023';
  end if;
  if normalized_name is not null and char_length(normalized_name) not between 2 and 160 then
    raise exception 'PUBLIC_PARTNER_NAME_INVALID' using errcode = '22023';
  end if;
  if p_visible and normalized_name is null then
    raise exception 'PUBLIC_PARTNER_NAME_REQUIRED' using errcode = '22023';
  end if;
  if normalized_slug is not null and (
    char_length(normalized_slug) not between 2 and 120
    or normalized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ) then raise exception 'PUBLIC_PARTNER_SLUG_INVALID' using errcode = '22023'; end if;
  if normalized_description_ru is not null and char_length(normalized_description_ru) not between 2 and 2000 then
    raise exception 'PUBLIC_PARTNER_DESCRIPTION_INVALID' using errcode = '22023';
  end if;
  if normalized_description_ro is not null and char_length(normalized_description_ro) not between 2 and 2000 then
    raise exception 'PUBLIC_PARTNER_DESCRIPTION_INVALID' using errcode = '22023';
  end if;
  if normalized_locality is not null and char_length(normalized_locality) not between 2 and 120 then
    raise exception 'PUBLIC_PARTNER_LOCALITY_INVALID' using errcode = '22023';
  end if;
  if normalized_email is not null and (
    char_length(normalized_email) > 254
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then raise exception 'PUBLIC_PARTNER_EMAIL_INVALID' using errcode = '22023'; end if;
  if normalized_phone is not null and normalized_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'PUBLIC_PARTNER_PHONE_INVALID' using errcode = '22023';
  end if;
  if normalized_website is not null and (
    char_length(normalized_website) > 500 or normalized_website !~ '^https://[^[:space:]]+$'
  ) then raise exception 'PUBLIC_PARTNER_WEBSITE_INVALID' using errcode = '22023'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_capabilities) item
    where jsonb_typeof(item) <> 'object'
      or item - array['code', 'evidenceStatus'] <> '{}'::jsonb
      or item->>'code' not in ('CCTV', 'ALARM', 'ACCESS_CONTROL', 'INTERCOM', 'NETWORK', 'OTHER')
      or item->>'evidenceStatus' not in ('SELF_DECLARED', 'VERIFIED')
  ) or (
    select count(*) <> count(distinct item->>'code') from jsonb_array_elements(p_capabilities) item
  ) then raise exception 'PUBLIC_PARTNER_CAPABILITIES_INVALID' using errcode = '22023'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'code', item->>'code', 'evidenceStatus', item->>'evidenceStatus'
  ) order by item->>'code'), '[]'::jsonb)
  into normalized_capabilities
  from jsonb_array_elements(p_capabilities) item;

  select * into target
  from public.partner_companies company
  where company.id = p_company_id
  for update;

  if target.id is null then raise exception 'PUBLIC_PARTNER_COMPANY_NOT_FOUND' using errcode = 'P0002'; end if;
  if target.status <> 'active' then raise exception 'PUBLIC_PARTNER_COMPANY_INACTIVE' using errcode = '22023'; end if;
  if target.public_directory_revision <> p_expected_revision then
    raise exception 'PUBLIC_PARTNER_DIRECTORY_CONFLICT' using errcode = 'PT409';
  end if;
  if normalized_slug is not null and exists (
    select 1 from public.partner_companies company
    where company.public_slug = normalized_slug and company.id <> target.id
  ) then raise exception 'PUBLIC_PARTNER_SLUG_CONFLICT' using errcode = '23505'; end if;

  approved_logo_path := case when p_use_current_logo then target.logo_asset_path else null end;
  select coalesce(jsonb_agg(jsonb_build_object(
    'code', capability.capability_code, 'evidenceStatus', capability.evidence_status
  ) order by capability.capability_code), '[]'::jsonb)
  into current_capabilities
  from public.public_partner_capabilities capability
  where capability.company_id = target.id;

  if target.public_display_name is not distinct from normalized_name
     and target.public_slug is not distinct from normalized_slug
     and target.public_description_ru is not distinct from normalized_description_ru
     and target.public_description_ro is not distinct from normalized_description_ro
     and target.public_location_label is not distinct from normalized_locality
     and target.public_email is not distinct from normalized_email
     and target.public_phone is not distinct from normalized_phone
     and target.public_website is not distinct from normalized_website
     and target.public_directory_visible = p_visible
     and target.public_directory_logo_asset_path is not distinct from approved_logo_path
     and current_capabilities = normalized_capabilities then
    return jsonb_build_object(
      'companyId', target.id,
      'revision', target.public_directory_revision,
      'visible', target.public_directory_visible,
      'changed', false,
      'correlationId', p_correlation_id
    );
  end if;

  next_revision := target.public_directory_revision + 1;

  if target.public_display_name is distinct from normalized_name then
    insert into public.public_partner_directory_governance_events (
      company_id, actor_user_id, event_type, previous_public_display_name, new_public_display_name,
      previous_logo_asset_path, new_logo_asset_path, previous_visible, new_visible, revision,
      correlation_id, changed_fields
    ) values (
      target.id, auth.uid(), 'public_display_name_changed', target.public_display_name, normalized_name,
      target.public_directory_logo_asset_path, approved_logo_path, target.public_directory_visible, p_visible,
      next_revision, p_correlation_id, array['PUBLIC_NAME']
    );
  end if;
  if target.public_directory_logo_asset_path is distinct from approved_logo_path then
    insert into public.public_partner_directory_governance_events (
      company_id, actor_user_id, event_type, previous_public_display_name, new_public_display_name,
      previous_logo_asset_path, new_logo_asset_path, previous_visible, new_visible, revision,
      correlation_id, changed_fields
    ) values (
      target.id, auth.uid(), 'public_logo_changed', target.public_display_name, normalized_name,
      target.public_directory_logo_asset_path, approved_logo_path, target.public_directory_visible, p_visible,
      next_revision, p_correlation_id, array['LOGO']
    );
  end if;
  if target.public_slug is distinct from normalized_slug then
    insert into public.public_partner_directory_governance_events (
      company_id, actor_user_id, event_type, previous_public_display_name, new_public_display_name,
      previous_logo_asset_path, new_logo_asset_path, previous_visible, new_visible, revision,
      correlation_id, changed_fields
    ) values (target.id, auth.uid(), 'public_slug_changed', target.public_display_name, normalized_name,
      target.public_directory_logo_asset_path, approved_logo_path, target.public_directory_visible, p_visible,
      next_revision, p_correlation_id, array['SLUG']);
  end if;
  if target.public_description_ru is distinct from normalized_description_ru
     or target.public_description_ro is distinct from normalized_description_ro then
    insert into public.public_partner_directory_governance_events (
      company_id, actor_user_id, event_type, previous_public_display_name, new_public_display_name,
      previous_logo_asset_path, new_logo_asset_path, previous_visible, new_visible, revision,
      correlation_id, changed_fields
    ) values (target.id, auth.uid(), 'public_descriptions_changed', target.public_display_name, normalized_name,
      target.public_directory_logo_asset_path, approved_logo_path, target.public_directory_visible, p_visible,
      next_revision, p_correlation_id, array_remove(array[
        case when target.public_description_ru is distinct from normalized_description_ru then 'DESCRIPTION_RU' end,
        case when target.public_description_ro is distinct from normalized_description_ro then 'DESCRIPTION_RO' end
      ], null));
  end if;
  if target.public_location_label is distinct from normalized_locality then
    insert into public.public_partner_directory_governance_events (
      company_id, actor_user_id, event_type, previous_public_display_name, new_public_display_name,
      previous_logo_asset_path, new_logo_asset_path, previous_visible, new_visible, revision,
      correlation_id, changed_fields
    ) values (target.id, auth.uid(), 'public_location_changed', target.public_display_name, normalized_name,
      target.public_directory_logo_asset_path, approved_logo_path, target.public_directory_visible, p_visible,
      next_revision, p_correlation_id, array['LOCALITY']);
  end if;
  if target.public_email is distinct from normalized_email or target.public_phone is distinct from normalized_phone then
    insert into public.public_partner_directory_governance_events (
      company_id, actor_user_id, event_type, previous_public_display_name, new_public_display_name,
      previous_logo_asset_path, new_logo_asset_path, previous_visible, new_visible, revision,
      correlation_id, changed_fields
    ) values (target.id, auth.uid(), 'public_contact_changed', target.public_display_name, normalized_name,
      target.public_directory_logo_asset_path, approved_logo_path, target.public_directory_visible, p_visible,
      next_revision, p_correlation_id, array_remove(array[
        case when target.public_email is distinct from normalized_email then 'PUBLIC_EMAIL' end,
        case when target.public_phone is distinct from normalized_phone then 'PUBLIC_PHONE' end
      ], null));
  end if;
  if target.public_website is distinct from normalized_website then
    insert into public.public_partner_directory_governance_events (
      company_id, actor_user_id, event_type, previous_public_display_name, new_public_display_name,
      previous_logo_asset_path, new_logo_asset_path, previous_visible, new_visible, revision,
      correlation_id, changed_fields
    ) values (target.id, auth.uid(), 'public_website_changed', target.public_display_name, normalized_name,
      target.public_directory_logo_asset_path, approved_logo_path, target.public_directory_visible, p_visible,
      next_revision, p_correlation_id, array['WEBSITE']);
  end if;
  if current_capabilities <> normalized_capabilities then
    select coalesce(array_agg(field order by field), array['CAPABILITIES']) into capability_changed_fields
    from (
      select 'CAPABILITY:' || coalesce(old_item->>'code', new_item->>'code') || ':' ||
        case when old_item is null or new_item is null then 'ASSIGNMENT' else 'EVIDENCE' end as field
      from jsonb_array_elements(current_capabilities) old_item
      full join jsonb_array_elements(normalized_capabilities) new_item
        on old_item->>'code' = new_item->>'code'
      where old_item is null or new_item is null
        or old_item->>'evidenceStatus' is distinct from new_item->>'evidenceStatus'
    ) changes;
    insert into public.public_partner_directory_governance_events (
      company_id, actor_user_id, event_type, previous_public_display_name, new_public_display_name,
      previous_logo_asset_path, new_logo_asset_path, previous_visible, new_visible, revision,
      correlation_id, changed_fields
    ) values (target.id, auth.uid(), 'public_capabilities_changed', target.public_display_name, normalized_name,
      target.public_directory_logo_asset_path, approved_logo_path, target.public_directory_visible, p_visible,
      next_revision, p_correlation_id, capability_changed_fields);
  end if;
  if target.public_directory_visible is distinct from p_visible then
    insert into public.public_partner_directory_governance_events (
      company_id, actor_user_id, event_type, previous_public_display_name, new_public_display_name,
      previous_logo_asset_path, new_logo_asset_path, previous_visible, new_visible, revision,
      correlation_id, changed_fields
    ) values (target.id, auth.uid(), case when p_visible then 'public_directory_enabled' else 'public_directory_disabled' end,
      target.public_display_name, normalized_name, target.public_directory_logo_asset_path, approved_logo_path,
      target.public_directory_visible, p_visible, next_revision, p_correlation_id, array['PUBLICATION_STATE']);
  end if;

  update public.partner_companies
  set public_display_name = normalized_name,
      public_slug = normalized_slug,
      public_description_ru = normalized_description_ru,
      public_description_ro = normalized_description_ro,
      public_location_label = normalized_locality,
      public_email = normalized_email,
      public_phone = normalized_phone,
      public_website = normalized_website,
      public_directory_logo_asset_path = approved_logo_path,
      public_directory_visible = p_visible,
      public_directory_revision = next_revision,
      public_directory_updated_at = now(),
      public_directory_updated_by = auth.uid(),
      public_directory_published_at = case
        when p_visible and not target.public_directory_visible then now()
        else target.public_directory_published_at
      end
  where id = target.id;

  if current_capabilities <> normalized_capabilities then
    delete from public.public_partner_capabilities where company_id = target.id;
    insert into public.public_partner_capabilities(company_id, capability_code, evidence_status, updated_by)
    select target.id, item->>'code', item->>'evidenceStatus', auth.uid()
    from jsonb_array_elements(normalized_capabilities) item;
  end if;

  return jsonb_build_object(
    'companyId', target.id,
    'revision', next_revision,
    'visible', p_visible,
    'changed', true,
    'correlationId', p_correlation_id
  );
end;
$$;

revoke all on function public.list_public_partner_directory(text, text, text, integer) from public, anon, authenticated;
revoke all on function public.get_public_partner_profile(text) from public, anon, authenticated;
revoke all on function public.list_admin_public_partner_directory(integer, integer, text, text) from public, anon, authenticated;
revoke all on function public.update_admin_public_partner_directory(
  uuid, bigint, text, text, text, text, text, text, text, text, jsonb, boolean, boolean, uuid
) from public, anon, authenticated;

grant execute on function public.list_public_partner_directory(text, text, text, integer) to anon, authenticated;
grant execute on function public.get_public_partner_profile(text) to anon, authenticated;
grant execute on function public.list_admin_public_partner_directory(integer, integer, text, text) to authenticated;
grant execute on function public.update_admin_public_partner_directory(
  uuid, bigint, text, text, text, text, text, text, text, text, jsonb, boolean, boolean, uuid
) to authenticated;

comment on function public.list_public_partner_directory(text, text, text, integer) is
  'One bounded published-only Community directory read. Contains no Installation Marketplace fields or joins.';
comment on function public.get_public_partner_profile(text) is
  'Published-only public Partner profile lookup by governed slug. Returns only approved public fields.';
comment on function public.update_admin_public_partner_directory(
  uuid, bigint, text, text, text, text, text, text, text, text, jsonb, boolean, boolean, uuid
) is 'Atomic audited public Partner presentation governance with optimistic concurrency. Requires admin.catalog.manage.';

commit;
