begin;

alter table public.public_partner_directory_governance_events
  drop constraint if exists public_partner_directory_governance_events_event_type_check;

alter table public.public_partner_directory_governance_events
  add constraint public_partner_directory_governance_events_event_type_check check (event_type in (
    'public_directory_enabled',
    'public_directory_disabled',
    'public_display_name_changed',
    'public_logo_changed',
    'company_logo_uploaded',
    'company_logo_replaced',
    'company_logo_removed'
  ));

create or replace function public.update_admin_partner_company_logo(
  p_company_id uuid,
  p_expected_revision bigint,
  p_logo_asset_path text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.partner_companies%rowtype;
  target_path text := nullif(btrim(p_logo_asset_path), '');
  approved_logo_path text;
  next_revision bigint;
  audit_event_id uuid;
begin
  if auth.uid() is null or not public.has_internal_permission('admin.catalog.manage') then
    raise exception 'Company logo management denied.' using errcode = '42501';
  end if;
  if p_company_id is null or p_expected_revision is null or p_expected_revision < 1
     or p_correlation_id is null then
    raise exception 'ADMIN_COMPANY_LOGO_INPUT_INVALID' using errcode = '22023';
  end if;
  if target_path is not null
     and target_path !~ (
       '^' || p_company_id::text
       || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
       || '\.(png|jpg|webp)$'
     ) then
    raise exception 'ADMIN_COMPANY_LOGO_PATH_INVALID' using errcode = '22023';
  end if;

  select * into target
  from public.partner_companies company
  where company.id = p_company_id
  for update;

  if target.id is null then
    raise exception 'ADMIN_COMPANY_LOGO_COMPANY_NOT_FOUND' using errcode = 'P0002';
  end if;
  if target.status <> 'active' then
    raise exception 'ADMIN_COMPANY_LOGO_COMPANY_INACTIVE' using errcode = '22023';
  end if;
  if target.public_directory_revision <> p_expected_revision then
    raise exception 'ADMIN_COMPANY_LOGO_CONFLICT' using errcode = 'PT409';
  end if;
  if target.logo_asset_path is not distinct from target_path then
    return jsonb_build_object(
      'companyId', target.id,
      'previousLogoAssetPath', target.logo_asset_path,
      'logoAssetPath', target.logo_asset_path,
      'revision', target.public_directory_revision,
      'visible', target.public_directory_visible,
      'changed', false,
      'auditEventId', null,
      'correlationId', p_correlation_id
    );
  end if;

  approved_logo_path := case
    when target_path is null then null
    when target.public_directory_logo_asset_path is not null
      and target.public_directory_logo_asset_path = target.logo_asset_path then target_path
    else null
  end;
  next_revision := target.public_directory_revision + 1;

  update public.partner_companies
  set logo_asset_path = target_path,
      public_directory_logo_asset_path = approved_logo_path,
      public_directory_revision = next_revision,
      public_directory_updated_at = now(),
      public_directory_updated_by = auth.uid()
  where id = target.id;

  insert into public.public_partner_directory_governance_events (
    company_id, actor_user_id, event_type,
    previous_public_display_name, new_public_display_name,
    previous_logo_asset_path, new_logo_asset_path,
    previous_visible, new_visible, revision, correlation_id
  ) values (
    target.id, auth.uid(),
    case
      when target.logo_asset_path is null then 'company_logo_uploaded'
      when target_path is null then 'company_logo_removed'
      else 'company_logo_replaced'
    end,
    target.public_display_name, target.public_display_name,
    target.logo_asset_path, target_path,
    target.public_directory_visible, target.public_directory_visible,
    next_revision, p_correlation_id
  ) returning id into audit_event_id;

  return jsonb_build_object(
    'companyId', target.id,
    'previousLogoAssetPath', target.logo_asset_path,
    'logoAssetPath', target_path,
    'revision', next_revision,
    'visible', target.public_directory_visible,
    'changed', true,
    'auditEventId', audit_event_id,
    'correlationId', p_correlation_id
  );
end;
$$;

revoke all on function public.update_admin_partner_company_logo(uuid, bigint, text, uuid)
  from public, anon, authenticated;
grant execute on function public.update_admin_partner_company_logo(uuid, bigint, text, uuid)
  to authenticated;

comment on function public.update_admin_partner_company_logo(uuid, bigint, text, uuid) is
  'Atomic internal company-logo mutation with optimistic locking and immutable audit. Requires admin.catalog.manage.';

commit;
