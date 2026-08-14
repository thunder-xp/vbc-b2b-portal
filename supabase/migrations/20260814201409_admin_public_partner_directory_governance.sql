begin;

alter table public.partner_companies
  add column public_display_name text null,
  add column public_directory_revision bigint not null default 1,
  add column public_directory_updated_at timestamptz null,
  add column public_directory_updated_by uuid null
    references public.user_profiles(id) on delete restrict,
  add column public_directory_published_at timestamptz null;

alter table public.partner_companies
  add constraint partner_companies_public_display_name_check check (
    public_display_name is null
    or (
      public_display_name = btrim(public_display_name)
      and char_length(public_display_name) between 2 and 160
    )
  ),
  add constraint partner_companies_public_directory_revision_check
    check (public_directory_revision > 0),
  add constraint partner_companies_public_directory_publication_check check (
    not public_directory_visible
    or (
      status = 'active'
      and public_display_name is not null
      and char_length(btrim(public_display_name)) between 2 and 160
    )
  );

comment on column public.partner_companies.public_display_name is
  'Explicitly approved customer-facing company name for the anonymous partner directory.';
comment on column public.partner_companies.public_directory_revision is
  'Optimistic concurrency revision for public partner-directory governance.';

create table public.public_partner_directory_governance_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  actor_user_id uuid null references public.user_profiles(id) on delete restrict,
  event_type text not null check (event_type in (
    'public_directory_enabled',
    'public_directory_disabled',
    'public_display_name_changed',
    'public_logo_changed'
  )),
  previous_public_display_name text null,
  new_public_display_name text null,
  previous_logo_asset_path text null,
  new_logo_asset_path text null,
  previous_visible boolean not null,
  new_visible boolean not null,
  revision bigint not null check (revision > 0),
  correlation_id uuid not null,
  occurred_at timestamptz not null default now()
);

create index public_partner_directory_governance_events_company_idx
  on public.public_partner_directory_governance_events(company_id, occurred_at desc, id desc);
create index public_partner_directory_governance_events_actor_idx
  on public.public_partner_directory_governance_events(actor_user_id, occurred_at desc)
  where actor_user_id is not null;
create index partner_companies_public_directory_updated_by_idx
  on public.partner_companies(public_directory_updated_by)
  where public_directory_updated_by is not null;

alter table public.public_partner_directory_governance_events enable row level security;
revoke all on table public.public_partner_directory_governance_events
  from public, anon, authenticated;

comment on table public.public_partner_directory_governance_events is
  'Append-only internal audit history for anonymous partner-directory presentation governance.';

create or replace function public.prevent_public_partner_directory_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Public partner-directory governance events are immutable.'
    using errcode = '23514';
end;
$$;

create trigger prevent_public_partner_directory_event_mutation
before update or delete on public.public_partner_directory_governance_events
for each row execute function public.prevent_public_partner_directory_event_mutation();

revoke all on function public.prevent_public_partner_directory_event_mutation()
  from public, anon, authenticated;

create or replace function public.revoke_public_partner_directory_on_logo_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_revision bigint;
  event_correlation_id uuid := gen_random_uuid();
begin
  if old.logo_asset_path is distinct from new.logo_asset_path
     and old.public_directory_logo_asset_path is not null
     and new.public_directory_logo_asset_path is distinct from new.logo_asset_path then
    next_revision := old.public_directory_revision + 1;
    new.public_directory_visible := false;
    new.public_directory_logo_asset_path := null;
    new.public_directory_revision := next_revision;
    new.public_directory_updated_at := now();
    new.public_directory_updated_by := auth.uid();

    insert into public.public_partner_directory_governance_events (
      company_id, actor_user_id, event_type,
      previous_public_display_name, new_public_display_name,
      previous_logo_asset_path, new_logo_asset_path,
      previous_visible, new_visible, revision, correlation_id
    ) values (
      old.id, auth.uid(), 'public_logo_changed',
      old.public_display_name, old.public_display_name,
      old.public_directory_logo_asset_path, null,
      old.public_directory_visible, false, next_revision, event_correlation_id
    );

    if old.public_directory_visible then
      insert into public.public_partner_directory_governance_events (
        company_id, actor_user_id, event_type,
        previous_public_display_name, new_public_display_name,
        previous_logo_asset_path, new_logo_asset_path,
        previous_visible, new_visible, revision, correlation_id
      ) values (
        old.id, auth.uid(), 'public_directory_disabled',
        old.public_display_name, old.public_display_name,
        old.public_directory_logo_asset_path, null,
        true, false, next_revision, event_correlation_id
      );
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.revoke_public_partner_directory_on_logo_change()
  from public, anon, authenticated;

drop index if exists public.partner_companies_public_directory_name_idx;
create index partner_companies_public_directory_name_idx
  on public.partner_companies ((lower(public_display_name)), id)
  where public_directory_visible = true
    and status = 'active'
    and public_display_name is not null;

create or replace function public.list_public_partner_directory()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'displayName', company.public_display_name,
    'logoAssetPath', company.public_directory_logo_asset_path
  ) order by lower(company.public_display_name), company.id), '[]'::jsonb)
  from (
    select id, public_display_name, public_directory_logo_asset_path
    from public.partner_companies
    where status = 'active'
      and public_directory_visible = true
      and public_display_name is not null
      and char_length(btrim(public_display_name)) between 2 and 160
    order by lower(public_display_name), id
    limit 100
  ) company;
$$;

revoke all on function public.list_public_partner_directory()
  from public, anon, authenticated;
grant execute on function public.list_public_partner_directory() to anon;

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
  if normalized_filter not in ('all', 'visible', 'hidden', 'missing_logo', 'missing_public_name') then
    raise exception 'Public partner-directory filter is invalid.' using errcode = '22023';
  end if;

  select count(*) into published_count
  from public.partner_companies company
  where company.status = 'active'
    and company.public_directory_visible;

  select count(*) into total_count
  from public.partner_companies company
  where company.status = 'active'
    and (
      normalized_search = ''
      or lower(company.display_name) like '%' || normalized_search || '%'
      or lower(coalesce(company.public_display_name, '')) like '%' || normalized_search || '%'
    )
    and case normalized_filter
      when 'visible' then company.public_directory_visible
      when 'hidden' then not company.public_directory_visible
      when 'missing_logo' then company.logo_asset_path is null
      when 'missing_public_name' then company.public_display_name is null
      else true
    end;

  select coalesce(jsonb_agg(jsonb_build_object(
    'companyId', company.id,
    'companyName', company.display_name,
    'publicDisplayName', company.public_display_name,
    'logoAssetPath', company.logo_asset_path,
    'approvedLogoAssetPath', company.public_directory_logo_asset_path,
    'visible', company.public_directory_visible,
    'revision', company.public_directory_revision,
    'updatedAt', company.public_directory_updated_at,
    'publishedAt', company.public_directory_published_at
  ) order by lower(company.display_name), company.id), '[]'::jsonb)
  into records
  from (
    select company.*
    from public.partner_companies company
    where company.status = 'active'
      and (
        normalized_search = ''
        or lower(company.display_name) like '%' || normalized_search || '%'
        or lower(coalesce(company.public_display_name, '')) like '%' || normalized_search || '%'
      )
      and case normalized_filter
        when 'visible' then company.public_directory_visible
        when 'hidden' then not company.public_directory_visible
        when 'missing_logo' then company.logo_asset_path is null
        when 'missing_public_name' then company.public_display_name is null
        else true
      end
    order by lower(company.display_name), company.id
    limit normalized_page_size
    offset (normalized_page - 1) * normalized_page_size
  ) company;

  return jsonb_build_object(
    'records', records,
    'totalCount', total_count,
    'publishedCount', published_count,
    'page', normalized_page,
    'pageSize', normalized_page_size
  );
end;
$$;

create or replace function public.update_admin_public_partner_directory(
  p_company_id uuid,
  p_expected_revision bigint,
  p_public_display_name text,
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
  approved_logo_path text;
  next_revision bigint;
begin
  if auth.uid() is null or not public.has_internal_permission('admin.catalog.manage') then
    raise exception 'Public partner-directory governance denied.' using errcode = '42501';
  end if;
  if p_company_id is null or p_expected_revision is null or p_expected_revision < 1
     or p_visible is null or p_use_current_logo is null or p_correlation_id is null then
    raise exception 'Public partner-directory input is invalid.' using errcode = '22023';
  end if;
  if normalized_name is not null and char_length(normalized_name) not between 2 and 160 then
    raise exception 'PUBLIC_PARTNER_NAME_INVALID' using errcode = '22023';
  end if;
  if p_visible and normalized_name is null then
    raise exception 'PUBLIC_PARTNER_NAME_REQUIRED' using errcode = '22023';
  end if;

  select * into target
  from public.partner_companies company
  where company.id = p_company_id
  for update;

  if target.id is null then
    raise exception 'PUBLIC_PARTNER_COMPANY_NOT_FOUND' using errcode = 'P0002';
  end if;
  if target.status <> 'active' then
    raise exception 'PUBLIC_PARTNER_COMPANY_INACTIVE' using errcode = '22023';
  end if;
  if target.public_directory_revision <> p_expected_revision then
    raise exception 'PUBLIC_PARTNER_DIRECTORY_CONFLICT' using errcode = 'PT409';
  end if;

  approved_logo_path := case when p_use_current_logo then target.logo_asset_path else null end;
  if target.public_display_name is not distinct from normalized_name
     and target.public_directory_visible = p_visible
     and target.public_directory_logo_asset_path is not distinct from approved_logo_path then
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
      company_id, actor_user_id, event_type,
      previous_public_display_name, new_public_display_name,
      previous_logo_asset_path, new_logo_asset_path,
      previous_visible, new_visible, revision, correlation_id
    ) values (
      target.id, auth.uid(), 'public_display_name_changed',
      target.public_display_name, normalized_name,
      target.public_directory_logo_asset_path, approved_logo_path,
      target.public_directory_visible, p_visible, next_revision, p_correlation_id
    );
  end if;

  if target.public_directory_logo_asset_path is distinct from approved_logo_path then
    insert into public.public_partner_directory_governance_events (
      company_id, actor_user_id, event_type,
      previous_public_display_name, new_public_display_name,
      previous_logo_asset_path, new_logo_asset_path,
      previous_visible, new_visible, revision, correlation_id
    ) values (
      target.id, auth.uid(), 'public_logo_changed',
      target.public_display_name, normalized_name,
      target.public_directory_logo_asset_path, approved_logo_path,
      target.public_directory_visible, p_visible, next_revision, p_correlation_id
    );
  end if;

  if target.public_directory_visible is distinct from p_visible then
    insert into public.public_partner_directory_governance_events (
      company_id, actor_user_id, event_type,
      previous_public_display_name, new_public_display_name,
      previous_logo_asset_path, new_logo_asset_path,
      previous_visible, new_visible, revision, correlation_id
    ) values (
      target.id, auth.uid(),
      case when p_visible then 'public_directory_enabled' else 'public_directory_disabled' end,
      target.public_display_name, normalized_name,
      target.public_directory_logo_asset_path, approved_logo_path,
      target.public_directory_visible, p_visible, next_revision, p_correlation_id
    );
  end if;

  update public.partner_companies
  set public_display_name = normalized_name,
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

  return jsonb_build_object(
    'companyId', target.id,
    'revision', next_revision,
    'visible', p_visible,
    'changed', true,
    'correlationId', p_correlation_id
  );
end;
$$;

revoke all on function public.list_admin_public_partner_directory(integer, integer, text, text)
  from public, anon, authenticated;
revoke all on function public.update_admin_public_partner_directory(uuid, bigint, text, boolean, boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.list_admin_public_partner_directory(integer, integer, text, text)
  to authenticated;
grant execute on function public.update_admin_public_partner_directory(uuid, bigint, text, boolean, boolean, uuid)
  to authenticated;

comment on function public.list_admin_public_partner_directory(integer, integer, text, text) is
  'Bounded internal public-directory governance projection. Requires admin.catalog.manage.';
comment on function public.update_admin_public_partner_directory(uuid, bigint, text, boolean, boolean, uuid) is
  'Atomic audited public-directory mutation with optimistic concurrency. Requires admin.catalog.manage.';

commit;
