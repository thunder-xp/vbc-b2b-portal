\set ON_ERROR_STOP on

begin;

select plan(1);

insert into auth.users(id, aud, role, email, created_at, updated_at)
values (
  '7b000000-0000-4000-8000-000000000010',
  'authenticated',
  'authenticated',
  'public-community-admin@example.test',
  now(),
  now()
);

insert into public.user_profiles(id, email, full_name, status, user_type)
values (
  '7b000000-0000-4000-8000-000000000010',
  'public-community-admin@example.test',
  'Public Community Admin',
  'active',
  'internal'
);

insert into public.internal_user_role_assignments(user_id, role_id, assigned_by)
select '7b000000-0000-4000-8000-000000000010', role.id, null
from public.roles role
where role.code = 'novotech_admin';

insert into public.partner_companies (
  id,
  external_1c_id,
  display_name,
  status,
  public_directory_visible,
  public_display_name,
  public_slug,
  public_description_ru,
  public_description_ro,
  public_location_label,
  public_email,
  public_phone,
  public_website,
  public_directory_updated_at
) values
  (
    '7b000000-0000-4000-8000-000000000001',
    'public-community-runtime-minimal',
    'Runtime Minimal Legal Name',
    'active',
    true,
    'Alpha Partner',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    now()
  ),
  (
    '7b000000-0000-4000-8000-000000000002',
    'public-community-runtime-full',
    'Runtime Full Legal Name',
    'active',
    true,
    'Beta Systems',
    'beta-systems',
    'Профессиональные системы безопасности.',
    'Sisteme profesionale de securitate.',
    'Chișinău',
    'public@example.test',
    '+37360000000',
    'https://example.test',
    now()
  ),
  (
    '7b000000-0000-4000-8000-000000000003',
    'public-community-runtime-hidden',
    'Runtime Hidden Legal Name',
    'active',
    false,
    'Hidden Partner',
    'hidden-partner',
    'Не опубликовано.',
    'Nepublicat.',
    'Chișinău',
    'hidden@example.test',
    '+37360000001',
    'https://hidden.example.test',
    now()
  );

insert into public.public_partner_capabilities (
  company_id,
  capability_code,
  evidence_status
) values
  ('7b000000-0000-4000-8000-000000000002', 'CCTV', 'VERIFIED'),
  ('7b000000-0000-4000-8000-000000000002', 'NETWORK', 'SELF_DECLARED'),
  ('7b000000-0000-4000-8000-000000000003', 'ALARM', 'VERIFIED');

do $$
begin
  if has_table_privilege('anon', 'public.public_partner_capabilities', 'select')
    or has_table_privilege('authenticated', 'public.public_partner_capabilities', 'select')
    or has_table_privilege('anon', 'public.public_partner_capabilities', 'insert')
    or has_table_privilege('authenticated', 'public.public_partner_capabilities', 'insert') then
    raise exception 'Capability table direct privilege boundary is too broad.';
  end if;
  if not has_function_privilege(
    'anon',
    'public.list_public_partner_directory(text,text,text,integer)',
    'execute'
  ) or not has_function_privilege(
    'anon',
    'public.get_public_partner_profile(text)',
    'execute'
  ) then
    raise exception 'Public function execution grants are missing.';
  end if;
end;
$$;

set local role anon;

do $$
declare
  directory jsonb;
  filtered jsonb;
  invalid_filter jsonb;
  profile jsonb;
begin
  directory := public.list_public_partner_directory(null, null, null, 100);

  if jsonb_array_length(directory->'items') <> 2 then
    raise exception 'Published-only directory boundary failed: %', directory;
  end if;
  if not exists (
    select 1
    from jsonb_array_elements(directory->'items') item
    where item->>'displayName' = 'Alpha Partner'
      and item->'slug' = 'null'::jsonb
      and item->'capabilities' = '[]'::jsonb
  ) then
    raise exception 'Minimal published profile was not preserved safely: %', directory;
  end if;
  if exists (
    select 1
    from jsonb_array_elements(directory->'items') item
    where item->>'displayName' = 'Hidden Partner'
  ) then
    raise exception 'Unpublished profile leaked into the directory.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(directory->'items') item
    where item ?| array[
      'marketplaceProviderId',
      'rankingScore',
      'availability',
      'serviceAreaCodes',
      'marketplaceState'
    ]
  ) then
    raise exception 'Marketplace-owned fields leaked into the Community projection.';
  end if;

  filtered := public.list_public_partner_directory('beta', 'chișinău', 'CCTV', 100);
  if jsonb_array_length(filtered->'items') <> 1
    or filtered->'items'->0->>'slug' <> 'beta-systems'
    or filtered->'items'->0->'capabilities'->0->>'evidenceStatus' <> 'VERIFIED' then
    raise exception 'Search/locality/capability filters failed: %', filtered;
  end if;

  invalid_filter := public.list_public_partner_directory(null, null, 'NOT_GOVERNED', 100);
  if invalid_filter <> '{"items":[],"localities":[],"capabilities":[]}'::jsonb then
    raise exception 'Invalid capability filter did not fail closed: %', invalid_filter;
  end if;

  profile := public.get_public_partner_profile('beta-systems');
  if profile->>'displayName' <> 'Beta Systems'
    or profile->>'descriptionRu' <> 'Профессиональные системы безопасности.'
    or profile->>'descriptionRo' <> 'Sisteme profesionale de securitate.'
    or profile->>'publicEmail' <> 'public@example.test'
    or profile->>'publicPhone' <> '+37360000000'
    or profile->>'publicWebsite' <> 'https://example.test'
    or jsonb_array_length(profile->'capabilities') <> 2 then
    raise exception 'Published profile projection is incomplete or incorrect: %', profile;
  end if;
  if public.get_public_partner_profile('hidden-partner') is not null then
    raise exception 'Unpublished slug resolved through the public detail function.';
  end if;
end;
$$;

reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '7b000000-0000-4000-8000-000000000010', true);

do $$
declare
  updated jsonb;
  repeated jsonb;
  admin_page jsonb;
begin
  if not public.has_internal_permission('admin.catalog.manage') then
    raise exception 'Admin permission fixture did not resolve through the canonical authorization path.';
  end if;

  updated := public.update_admin_public_partner_directory(
    '7b000000-0000-4000-8000-000000000002',
    1,
    'Beta Systems Community',
    'beta-systems-pro',
    'Профессиональные решения безопасности.',
    'Sisteme profesionale de securitate.',
    'Chișinău',
    'community@example.test',
    '+37360000000',
    'https://example.test',
    '[{"code":"CCTV","evidenceStatus":"SELF_DECLARED"},{"code":"NETWORK","evidenceStatus":"SELF_DECLARED"}]'::jsonb,
    true,
    false,
    '7b000000-0000-4000-8000-000000000020'
  );

  if updated->>'changed' <> 'true' or updated->>'revision' <> '2' then
    raise exception 'Governed Admin update did not produce the expected revision: %', updated;
  end if;

  repeated := public.update_admin_public_partner_directory(
    '7b000000-0000-4000-8000-000000000002',
    2,
    'Beta Systems Community',
    'beta-systems-pro',
    'Профессиональные решения безопасности.',
    'Sisteme profesionale de securitate.',
    'Chișinău',
    'community@example.test',
    '+37360000000',
    'https://example.test',
    '[{"code":"CCTV","evidenceStatus":"SELF_DECLARED"},{"code":"NETWORK","evidenceStatus":"SELF_DECLARED"}]'::jsonb,
    true,
    false,
    '7b000000-0000-4000-8000-000000000021'
  );
  if repeated->>'changed' <> 'false' or repeated->>'revision' <> '2' then
    raise exception 'Governed Admin update is not idempotent: %', repeated;
  end if;

  admin_page := public.list_admin_public_partner_directory(1, 25, 'beta-systems-pro', 'all');
  if jsonb_array_length(admin_page->'records') <> 1
    or admin_page->'records'->0->>'publicSlug' <> 'beta-systems-pro'
    or admin_page->'records'->0->'completeness'->>'descriptionRu' <> 'true' then
    raise exception 'Admin governance projection did not return the updated public profile: %', admin_page;
  end if;

  begin
    perform public.update_admin_public_partner_directory(
      '7b000000-0000-4000-8000-000000000002', 1, 'Conflict', 'conflict', null, null,
      null, null, null, null, '[]'::jsonb, false, false,
      '7b000000-0000-4000-8000-000000000022'
    );
    raise exception 'Stale optimistic revision was accepted.';
  exception when sqlstate 'PT409' then
    null;
  end;
end;
$$;

reset role;

do $$
begin
  if (select count(*) from public.public_partner_directory_governance_events
      where company_id = '7b000000-0000-4000-8000-000000000002') <> 5 then
    raise exception 'Governed Admin update did not emit the exact audit event set.';
  end if;
  if not exists (
    select 1 from public.public_partner_directory_governance_events
    where company_id = '7b000000-0000-4000-8000-000000000002'
      and event_type = 'public_descriptions_changed'
      and changed_fields = array['DESCRIPTION_RU']
  ) or not exists (
    select 1 from public.public_partner_directory_governance_events
    where company_id = '7b000000-0000-4000-8000-000000000002'
      and event_type = 'public_contact_changed'
      and changed_fields = array['PUBLIC_EMAIL']
  ) or not exists (
    select 1 from public.public_partner_directory_governance_events
    where company_id = '7b000000-0000-4000-8000-000000000002'
      and event_type = 'public_capabilities_changed'
      and changed_fields = array['CAPABILITY:CCTV:EVIDENCE']
  ) then
    raise exception 'Audit changed-field evidence is not exact.';
  end if;
end;
$$;

select pass('Public Partner Community published projection, filters, detail, and privilege boundaries pass.');
select * from finish();

rollback;
