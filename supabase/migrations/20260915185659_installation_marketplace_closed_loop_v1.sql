begin;

-- Customer-owned marketplace projects are distinct from the paid Retail
-- installation requirement/execution contract. Both flows reuse the same
-- governed installation provider, public profile, competency and region truth.

create table public.installation_projects (
  id uuid primary key default gen_random_uuid(),
  customer_account_id uuid not null references public.customer_accounts(id) on delete restrict,
  customer_identity_id uuid not null references public.customer_identities(id) on delete restrict,
  source_type text not null check (source_type in ('PRODUCT','ORDER','CUSTOM')),
  source_order_id uuid null references public.retail_orders(id) on delete restrict,
  source_public_product_id uuid null references public.public_retail_product_identities(public_id) on delete restrict,
  system_type text not null default 'cctv' check (system_type = 'cctv'),
  object_type text not null check (object_type in ('APARTMENT','HOUSE','OFFICE','SHOP','WAREHOUSE','OTHER')),
  locality text not null check (char_length(btrim(locality)) between 2 and 160),
  region_id uuid null references public.installation_service_regions(id) on delete restrict,
  private_location jsonb null check (private_location is null or jsonb_typeof(private_location) = 'object'),
  need_type text not null check (need_type in ('INSTALL_PURCHASED_EQUIPMENT','DESIGN_AND_INSTALL','CONSULTATION')),
  description text null check (description is null or char_length(description) <= 1000),
  status text not null default 'DRAFT' check (status in (
    'DRAFT','PARTNER_PENDING','PARTNER_ACCEPTED','CONTACTED','SCHEDULED','INSTALLED',
    'CUSTOMER_CONFIRMED','CLOSED','PARTNER_DECLINED','CANCELLED','EXPIRED','DISPUTED'
  )),
  selected_assignment_id uuid null,
  contact_consent_at timestamptz null,
  creation_key uuid not null unique,
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (source_type = 'PRODUCT' and source_public_product_id is not null and source_order_id is null)
    or (source_type = 'ORDER' and source_order_id is not null and source_public_product_id is null)
    or (source_type = 'CUSTOM' and source_order_id is null and source_public_product_id is null)
  )
);

create table public.installation_project_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.installation_projects(id) on delete cascade,
  public_product_id uuid not null references public.public_retail_product_identities(public_id) on delete restrict,
  retail_order_line_id uuid null references public.retail_order_lines(id) on delete restrict,
  quantity numeric(12,3) not null default 1 check (quantity > 0 and quantity <= 20000),
  created_at timestamptz not null default now(),
  unique (project_id, public_product_id, retail_order_line_id)
);

create table public.installation_partner_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.installation_projects(id) on delete restrict,
  provider_id uuid not null references public.installation_providers(id) on delete restrict,
  partner_company_id uuid not null references public.partner_companies(id) on delete restrict,
  status text not null default 'PARTNER_PENDING' check (status in (
    'PARTNER_PENDING','PARTNER_ACCEPTED','PARTNER_DECLINED','WITHDRAWN','EXPIRED'
  )),
  decline_reason text null check (decline_reason is null or decline_reason in (
    'OUT_OF_AREA','NO_CAPACITY','NOT_MY_SPECIALIZATION','TIMING','OTHER'
  )),
  decline_note text null check (decline_note is null or char_length(decline_note) <= 300),
  selected_at timestamptz not null default now(),
  accepted_at timestamptz null,
  declined_at timestamptz null,
  contacted_at timestamptz null,
  scheduled_at timestamptz null,
  planned_for timestamptz null,
  completed_at timestamptz null,
  contact_shared_at timestamptz null,
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'PARTNER_ACCEPTED' and accepted_at is not null) or status <> 'PARTNER_ACCEPTED'),
  check ((status = 'PARTNER_DECLINED' and declined_at is not null and decline_reason is not null) or status <> 'PARTNER_DECLINED')
);

alter table public.installation_projects
  add constraint installation_projects_selected_assignment_fk
  foreign key (selected_assignment_id) references public.installation_partner_assignments(id) on delete restrict;

create table public.installation_project_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.installation_projects(id) on delete restrict,
  assignment_id uuid null references public.installation_partner_assignments(id) on delete restrict,
  actor_kind text not null check (actor_kind in ('CUSTOMER','PARTNER','ADMIN','SYSTEM')),
  actor_user_id uuid null references auth.users(id) on delete restrict,
  event_type text not null check (event_type in (
    'PROJECT_CREATED','PARTNER_SHOWN','PARTNER_SELECTED','PARTNER_ACCEPTED','PARTNER_DECLINED',
    'CONTACTED','SCHEDULED','INSTALLED','CUSTOMER_CONFIRMED','CANCELLED','EXPIRED',
    'DISPUTED','REVIEW_SUBMITTED','REVIEW_MODERATED'
  )),
  idempotency_key uuid null,
  safe_evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_evidence) = 'object'),
  created_at timestamptz not null default now()
);

create table public.installation_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.installation_projects(id) on delete restrict,
  assignment_id uuid not null unique references public.installation_partner_assignments(id) on delete restrict,
  customer_account_id uuid not null references public.customer_accounts(id) on delete restrict,
  partner_company_id uuid not null references public.partner_companies(id) on delete restrict,
  overall_rating smallint not null check (overall_rating between 1 and 5),
  workmanship_rating smallint not null check (workmanship_rating between 1 and 5),
  communication_rating smallint not null check (communication_rating between 1 and 5),
  agreement_rating smallint not null check (agreement_rating between 1 and 5),
  comment text null check (comment is null or char_length(comment) <= 1000),
  verification_status text not null default 'VERIFIED_INSTALLATION' check (verification_status = 'VERIFIED_INSTALLATION'),
  moderation_status text not null default 'PUBLISHED' check (moderation_status in ('PUBLISHED','PENDING_REVIEW','HIDDEN')),
  moderation_reason text null check (moderation_reason is null or char_length(moderation_reason) <= 500),
  moderated_by uuid null references auth.users(id) on delete restrict,
  moderated_at timestamptz null,
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index installation_partner_assignments_one_active_idx
  on public.installation_partner_assignments(project_id)
  where status in ('PARTNER_PENDING','PARTNER_ACCEPTED');
create index installation_projects_customer_idx
  on public.installation_projects(customer_account_id, updated_at desc, id desc);
create index installation_projects_admin_status_idx
  on public.installation_projects(status, updated_at desc, id desc);
create index installation_project_items_project_idx
  on public.installation_project_items(project_id, created_at, id);
create index installation_partner_assignments_company_idx
  on public.installation_partner_assignments(partner_company_id, status, updated_at desc, id desc);
create index installation_project_events_project_idx
  on public.installation_project_events(project_id, created_at, id);
create unique index installation_project_events_idempotency_idx
  on public.installation_project_events(idempotency_key)
  where idempotency_key is not null;
create index installation_reviews_public_partner_idx
  on public.installation_reviews(partner_company_id, moderation_status, created_at desc, id desc);

create or replace function private.prevent_installation_marketplace_history_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'Installation Marketplace history is append-only.' using errcode = '42501';
end;
$$;

create trigger prevent_installation_project_event_mutation
before update or delete on public.installation_project_events
for each row execute function private.prevent_installation_marketplace_history_mutation();

create trigger touch_installation_projects_updated_at
before update on public.installation_projects
for each row execute function private.touch_customer_identity_updated_at();
create trigger touch_installation_assignments_updated_at
before update on public.installation_partner_assignments
for each row execute function private.touch_customer_identity_updated_at();
create trigger touch_installation_reviews_updated_at
before update on public.installation_reviews
for each row execute function private.touch_customer_identity_updated_at();

alter table public.installation_projects enable row level security;
alter table public.installation_projects force row level security;
alter table public.installation_project_items enable row level security;
alter table public.installation_project_items force row level security;
alter table public.installation_partner_assignments enable row level security;
alter table public.installation_partner_assignments force row level security;
alter table public.installation_project_events enable row level security;
alter table public.installation_project_events force row level security;
alter table public.installation_reviews enable row level security;
alter table public.installation_reviews force row level security;

revoke all on table public.installation_projects, public.installation_project_items,
  public.installation_partner_assignments, public.installation_project_events,
  public.installation_reviews from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.installation_projects,
  public.installation_project_items, public.installation_partner_assignments,
  public.installation_project_events, public.installation_reviews to service_role;
grant select on table public.installation_projects, public.installation_project_items,
  public.installation_partner_assignments, public.installation_project_events,
  public.installation_reviews to authenticated;

create policy installation_projects_customer_select on public.installation_projects
for select to authenticated using (
  exists (select 1 from public.customer_accounts a
    where a.id = customer_account_id and a.auth_user_id = (select auth.uid()) and a.status = 'ACTIVE')
  or public.has_internal_permission('admin.retail_marketplace.view')
);
create policy installation_project_items_customer_select on public.installation_project_items
for select to authenticated using (
  exists (select 1 from public.installation_projects p join public.customer_accounts a on a.id = p.customer_account_id
    where p.id = project_id and a.auth_user_id = (select auth.uid()) and a.status = 'ACTIVE')
  or public.has_internal_permission('admin.retail_marketplace.view')
);
create policy installation_partner_assignments_scoped_select on public.installation_partner_assignments
for select to authenticated using (
  exists (select 1 from public.installation_projects p join public.customer_accounts a on a.id = p.customer_account_id
    where p.id = project_id and a.auth_user_id = (select auth.uid()) and a.status = 'ACTIVE')
  or exists (select 1 from public.company_memberships m
    where m.company_id = partner_company_id and m.user_id = (select auth.uid()) and m.status = 'active')
  or public.has_internal_permission('admin.retail_marketplace.view')
);
create policy installation_project_events_scoped_select on public.installation_project_events
for select to authenticated using (
  exists (select 1 from public.installation_projects p join public.customer_accounts a on a.id = p.customer_account_id
    where p.id = project_id and a.auth_user_id = (select auth.uid()) and a.status = 'ACTIVE')
  or exists (select 1 from public.installation_partner_assignments x join public.company_memberships m on m.company_id = x.partner_company_id
    where x.project_id = project_id and m.user_id = (select auth.uid()) and m.status = 'active')
  or public.has_internal_permission('admin.retail_marketplace.view')
);
create policy installation_reviews_scoped_select on public.installation_reviews
for select to authenticated using (
  exists (select 1 from public.customer_accounts a
    where a.id = customer_account_id and a.auth_user_id = (select auth.uid()) and a.status = 'ACTIVE')
  or exists (select 1 from public.company_memberships m
    where m.company_id = partner_company_id and m.user_id = (select auth.uid()) and m.status = 'active')
  or public.has_internal_permission('admin.retail_marketplace.view')
);

create or replace function public.create_customer_installation_project_v1(
  p_source_type text,
  p_source_order_id uuid,
  p_source_public_product_id uuid,
  p_object_type text,
  p_locality text,
  p_region_code text,
  p_need_type text,
  p_description text,
  p_contact_consent boolean,
  p_creation_key uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  account public.customer_accounts%rowtype;
  project_id uuid;
  resolved_region_id uuid;
  resolved_system_type text := 'cctv';
  normalized_locality text := left(btrim(coalesce(p_locality, '')), 160);
  normalized_description text := nullif(left(btrim(coalesce(p_description, '')), 1000), '');
  order_customer_identity uuid;
begin
  select * into account from public.customer_accounts a
  where a.auth_user_id = auth.uid() and a.status = 'ACTIVE' and a.customer_identity_id is not null;
  if account.id is null then raise exception 'CUSTOMER_ACCOUNT_REQUIRED' using errcode = '42501'; end if;
  if p_source_type not in ('PRODUCT','ORDER','CUSTOM')
    or p_object_type not in ('APARTMENT','HOUSE','OFFICE','SHOP','WAREHOUSE','OTHER')
    or p_need_type not in ('INSTALL_PURCHASED_EQUIPMENT','DESIGN_AND_INSTALL','CONSULTATION')
    or char_length(normalized_locality) < 2 or p_creation_key is null or not coalesce(p_contact_consent, false) then
    raise exception 'INSTALLATION_PROJECT_INPUT_INVALID' using errcode = '22023';
  end if;

  select p.id into project_id from public.installation_projects p where p.creation_key = p_creation_key;
  if project_id is not null then
    if not exists (select 1 from public.installation_projects p where p.id = project_id and p.customer_account_id = account.id) then
      raise exception 'INSTALLATION_PROJECT_IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;
    return jsonb_build_object('projectId', project_id, 'repeated', true);
  end if;

  if p_region_code is not null and btrim(p_region_code) <> '' then
    select r.id into resolved_region_id from public.installation_service_regions r
    where r.code = btrim(p_region_code) and r.active;
    if resolved_region_id is null then raise exception 'INSTALLATION_REGION_INVALID' using errcode = '22023'; end if;
  end if;

  if p_source_type = 'PRODUCT' then
    if p_source_public_product_id is null or p_source_order_id is not null or not exists (
      select 1 from public.public_retail_products product
      join public.public_retail_publications publication on publication.id = product.publication_id and publication.status = 'published'
      where product.public_id = p_source_public_product_id and cardinality(product.calculator_profile_keys) > 0
    ) then raise exception 'INSTALLATION_PRODUCT_NOT_ELIGIBLE' using errcode = '22023'; end if;
  elsif p_source_type = 'ORDER' then
    if p_source_order_id is null or p_source_public_product_id is not null then
      raise exception 'INSTALLATION_ORDER_INVALID' using errcode = '22023';
    end if;
    select customer.customer_identity_id into order_customer_identity
    from public.retail_orders orders join public.retail_customers customer on customer.id = orders.customer_id
    where orders.id = p_source_order_id;
    if order_customer_identity is distinct from account.customer_identity_id or not exists (
      select 1 from public.retail_order_lines line
      join public.public_retail_products product on product.public_id = line.public_product_id
      join public.public_retail_publications publication on publication.id = product.publication_id and publication.status = 'published'
      where line.order_id = p_source_order_id and line.unit_code <> 'service' and cardinality(product.calculator_profile_keys) > 0
    ) then raise exception 'INSTALLATION_ORDER_NOT_ELIGIBLE' using errcode = '42501'; end if;
  elsif p_source_order_id is not null or p_source_public_product_id is not null then
    raise exception 'INSTALLATION_CUSTOM_SOURCE_INVALID' using errcode = '22023';
  end if;

  insert into public.installation_projects (
    customer_account_id, customer_identity_id, source_type, source_order_id,
    source_public_product_id, system_type, object_type, locality, region_id,
    need_type, description, contact_consent_at, creation_key
  ) values (
    account.id, account.customer_identity_id, p_source_type, p_source_order_id,
    p_source_public_product_id, resolved_system_type, p_object_type, normalized_locality,
    resolved_region_id, p_need_type, normalized_description, now(), p_creation_key
  ) returning id into project_id;

  if p_source_type = 'PRODUCT' then
    insert into public.installation_project_items(project_id, public_product_id, quantity)
    values (project_id, p_source_public_product_id, 1);
  elsif p_source_type = 'ORDER' then
    insert into public.installation_project_items(project_id, public_product_id, retail_order_line_id, quantity)
    select project_id, line.public_product_id, line.id, line.quantity
    from public.retail_order_lines line
    join public.public_retail_products product on product.public_id = line.public_product_id
    join public.public_retail_publications publication on publication.id = product.publication_id and publication.status = 'published'
    where line.order_id = p_source_order_id and line.unit_code <> 'service'
      and cardinality(product.calculator_profile_keys) > 0
    order by line.line_number limit 50;
  end if;

  insert into public.installation_project_events(project_id, actor_kind, actor_user_id, event_type, idempotency_key,
    safe_evidence) values (project_id, 'CUSTOMER', auth.uid(), 'PROJECT_CREATED', p_creation_key,
      jsonb_build_object('sourceType', p_source_type, 'systemType', resolved_system_type));
  return jsonb_build_object('projectId', project_id, 'repeated', false);
end;
$$;

create or replace function public.customer_list_installation_projects_v1(p_limit integer default 20, p_offset integer default 0, p_locale text default 'ru')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare account_id uuid;
begin
  select a.id into account_id from public.customer_accounts a
  where a.auth_user_id = auth.uid() and a.status = 'ACTIVE';
  if account_id is null or p_locale not in ('ru','ro') then raise exception 'CUSTOMER_ACCOUNT_REQUIRED' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', p.id, 'sourceType', p.source_type, 'objectType', p.object_type,
    'locality', p.locality, 'needType', p.need_type, 'status', p.status,
    'revision', p.revision, 'createdAt', p.created_at, 'updatedAt', p.updated_at,
    'itemCount', (select count(*) from public.installation_project_items item where item.project_id = p.id),
    'partnerName', case when p_locale='ro' then profile.public_name_ro else profile.public_name_ru end
  ) order by p.updated_at desc, p.id desc)
  from (select * from public.installation_projects where customer_account_id = account_id
    order by updated_at desc, id desc limit least(greatest(coalesce(p_limit,20),1),50)
    offset greatest(coalesce(p_offset,0),0)) p
  left join public.installation_partner_assignments assignment on assignment.id = p.selected_assignment_id
  left join public.installation_provider_profiles profile on profile.provider_id = assignment.provider_id), '[]'::jsonb);
end;
$$;

create or replace function public.customer_get_installation_project_v1(p_project_id uuid, p_locale text default 'ru')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare account_id uuid; result jsonb;
begin
  select a.id into account_id from public.customer_accounts a
  where a.auth_user_id = auth.uid() and a.status = 'ACTIVE';
  if account_id is null or p_locale not in ('ru','ro') then raise exception 'INSTALLATION_PROJECT_DENIED' using errcode = '42501'; end if;
  select jsonb_build_object(
    'id', p.id, 'sourceType', p.source_type, 'sourceOrderId', p.source_order_id,
    'objectType', p.object_type, 'locality', p.locality, 'needType', p.need_type,
    'description', p.description, 'status', p.status, 'revision', p.revision,
    'contactConsent', p.contact_consent_at is not null, 'createdAt', p.created_at, 'updatedAt', p.updated_at,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'id', item.id, 'publicProductId', item.public_product_id, 'orderLineId', item.retail_order_line_id,
      'quantity', item.quantity, 'name', case when p_locale='ro' then coalesce(product.name_ro,product.name_ru) else product.name_ru end,
      'sku', product.sku, 'slug', product.slug, 'imageUrl', product.primary_image_url
    ) order by item.created_at, item.id)
    from public.installation_project_items item
    left join public.public_retail_publications publication on publication.status='published'
    left join public.public_retail_products product on product.publication_id=publication.id and product.public_id=item.public_product_id
    where item.project_id=p.id), '[]'::jsonb),
    'assignment', case when assignment.id is null then null else jsonb_build_object(
      'id', assignment.id, 'status', assignment.status, 'revision', assignment.revision,
      'selectedAt', assignment.selected_at, 'acceptedAt', assignment.accepted_at,
      'contactedAt', assignment.contacted_at, 'scheduledAt', assignment.scheduled_at,
      'plannedFor', assignment.planned_for, 'completedAt', assignment.completed_at,
      'declineReason', assignment.decline_reason,
      'partner', jsonb_build_object('providerId', provider.id,
        'displayName', case when p_locale='ro' then profile.public_name_ro else profile.public_name_ru end,
        'description', case when p_locale='ro' then profile.public_description_ro else profile.public_description_ru end,
        'logoPath', profile.logo_path,
        'verifiedReviewCount', (select count(*) from public.installation_reviews review where review.partner_company_id=assignment.partner_company_id and review.moderation_status='PUBLISHED'),
        'averageVerifiedRating', (select round(avg(review.overall_rating)::numeric,2) from public.installation_reviews review where review.partner_company_id=assignment.partner_company_id and review.moderation_status='PUBLISHED'),
        'completedVerifiedInstallations', (select count(*) from public.installation_projects complete join public.installation_partner_assignments accepted on accepted.id=complete.selected_assignment_id where accepted.partner_company_id=assignment.partner_company_id and complete.status in ('CUSTOMER_CONFIRMED','CLOSED'))
      )) end,
    'review', case when review.id is null then null else jsonb_build_object(
      'id', review.id, 'overallRating', review.overall_rating, 'workmanshipRating', review.workmanship_rating,
      'communicationRating', review.communication_rating, 'agreementRating', review.agreement_rating,
      'comment', review.comment, 'verificationStatus', review.verification_status,
      'moderationStatus', review.moderation_status, 'createdAt', review.created_at) end,
    'timeline', coalesce((select jsonb_agg(jsonb_build_object('id',event.id,'type',event.event_type,'createdAt',event.created_at) order by event.created_at,event.id)
      from public.installation_project_events event where event.project_id=p.id and event.event_type <> 'PARTNER_SHOWN'), '[]'::jsonb)
  ) into result
  from public.installation_projects p
  left join public.installation_partner_assignments assignment on assignment.id=p.selected_assignment_id
  left join public.installation_providers provider on provider.id=assignment.provider_id
  left join public.installation_provider_profiles profile on profile.provider_id=provider.id
  left join public.installation_reviews review on review.project_id=p.id
  where p.id=p_project_id and p.customer_account_id=account_id;
  return result;
end;
$$;

create or replace function public.customer_list_installation_partner_shortlist_v1(
  p_project_id uuid, p_locale text default 'ru', p_limit integer default 5
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare account_id uuid; project public.installation_projects%rowtype; result jsonb;
begin
  select a.id into account_id from public.customer_accounts a
  where a.auth_user_id=auth.uid() and a.status='ACTIVE';
  select * into project from public.installation_projects p
  where p.id=p_project_id and p.customer_account_id=account_id and p.status in ('DRAFT','PARTNER_DECLINED');
  if project.id is null or p_locale not in ('ru','ro') then raise exception 'INSTALLATION_PROJECT_DENIED' using errcode='42501'; end if;

  with eligible as (
    select provider.id, provider.partner_company_id, profile.*,
      exists(select 1 from public.installation_provider_regions pr where pr.provider_id=provider.id and pr.region_id=project.region_id and pr.active) as exact_region,
      company.public_directory_logo_asset_path as approved_logo
    from public.installation_providers provider
    join public.partner_companies company on company.id=provider.partner_company_id and company.status='active' and company.public_directory_visible
    join public.installation_provider_profiles profile on profile.provider_id=provider.id and profile.public_profile_status='published' and profile.availability_state in ('available','limited')
    join public.installation_provider_competencies competence on competence.provider_id=provider.id and competence.system_type=project.system_type and competence.active
    where provider.provider_type='partner_company' and provider.operational_status='active'
      and provider.approval_status='approved' and provider.marketplace_enabled
      and (project.region_id is null or exists(select 1 from public.installation_provider_regions pr where pr.provider_id=provider.id and pr.region_id=project.region_id and pr.active))
    order by exact_region desc, (profile.availability_state='available') desc,
      lower(case when p_locale='ro' then profile.public_name_ro else profile.public_name_ru end), provider.id
    limit least(greatest(coalesce(p_limit,5),1),5)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'providerId', e.id, 'displayName', case when p_locale='ro' then e.public_name_ro else e.public_name_ru end,
    'description', case when p_locale='ro' then e.public_description_ro else e.public_description_ru end,
    'logoPath', e.approved_logo, 'availability', e.availability_state,
    'coverage', project.locality, 'competencies', jsonb_build_array(project.system_type),
    'verifiedReviewCount', (select count(*) from public.installation_reviews r where r.partner_company_id=e.partner_company_id and r.moderation_status='PUBLISHED'),
    'averageVerifiedRating', (select round(avg(r.overall_rating)::numeric,2) from public.installation_reviews r where r.partner_company_id=e.partner_company_id and r.moderation_status='PUBLISHED'),
    'completedVerifiedInstallations', (select count(*) from public.installation_projects p2 join public.installation_partner_assignments a2 on a2.id=p2.selected_assignment_id where a2.partner_company_id=e.partner_company_id and p2.status in ('CUSTOMER_CONFIRMED','CLOSED'))
  ) order by e.exact_region desc, (e.availability_state='available') desc,
    lower(case when p_locale='ro' then e.public_name_ro else e.public_name_ru end), e.id), '[]'::jsonb)
  into result from eligible e;

  insert into public.installation_project_events(project_id, actor_kind, actor_user_id, event_type, safe_evidence)
  select project.id, 'CUSTOMER', auth.uid(), 'PARTNER_SHOWN', jsonb_build_object('providerId', provider.value->>'providerId')
  from jsonb_array_elements(result) provider;
  return result;
end;
$$;

create or replace function public.customer_select_installation_partner_v1(
  p_project_id uuid, p_provider_id uuid, p_expected_revision bigint, p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare account_id uuid; project public.installation_projects%rowtype; provider public.installation_providers%rowtype; assignment_id uuid;
begin
  select a.id into account_id from public.customer_accounts a where a.auth_user_id=auth.uid() and a.status='ACTIVE';
  if exists(select 1 from public.installation_project_events where idempotency_key=p_idempotency_key) then
    select p.selected_assignment_id into assignment_id from public.installation_projects p where p.id=p_project_id and p.customer_account_id=account_id;
    return jsonb_build_object('assignmentId',assignment_id,'status',(select status from public.installation_projects where id=p_project_id),'repeated',true);
  end if;
  select * into project from public.installation_projects p where p.id=p_project_id and p.customer_account_id=account_id for update;
  if project.id is null then raise exception 'INSTALLATION_PROJECT_DENIED' using errcode='42501'; end if;
  if project.revision<>p_expected_revision then raise exception 'INSTALLATION_PROJECT_CONFLICT' using errcode='PT409'; end if;
  if project.status not in ('DRAFT','PARTNER_DECLINED') then raise exception 'INSTALLATION_PROJECT_TRANSITION_INVALID' using errcode='22023'; end if;
  select ip.* into provider from public.installation_providers ip
  join public.partner_companies company on company.id=ip.partner_company_id and company.status='active' and company.public_directory_visible
  join public.installation_provider_profiles profile on profile.provider_id=ip.id and profile.public_profile_status='published' and profile.availability_state in ('available','limited')
  join public.installation_provider_competencies competency on competency.provider_id=ip.id and competency.system_type=project.system_type and competency.active
  where ip.id=p_provider_id and ip.provider_type='partner_company' and ip.operational_status='active' and ip.approval_status='approved' and ip.marketplace_enabled
    and (project.region_id is null or exists(select 1 from public.installation_provider_regions pr where pr.provider_id=ip.id and pr.region_id=project.region_id and pr.active));
  if provider.id is null then raise exception 'INSTALLATION_PARTNER_NOT_ELIGIBLE' using errcode='22023'; end if;
  insert into public.installation_partner_assignments(project_id,provider_id,partner_company_id)
  values(project.id,provider.id,provider.partner_company_id) returning id into assignment_id;
  update public.installation_projects set selected_assignment_id=assignment_id,status='PARTNER_PENDING',revision=revision+1 where id=project.id;
  insert into public.installation_project_events(project_id,assignment_id,actor_kind,actor_user_id,event_type,idempotency_key,safe_evidence)
  values(project.id,assignment_id,'CUSTOMER',auth.uid(),'PARTNER_SELECTED',p_idempotency_key,jsonb_build_object('providerId',provider.id));
  return jsonb_build_object('assignmentId',assignment_id,'status','PARTNER_PENDING','repeated',false);
end;
$$;

create or replace function public.partner_list_installation_projects_v1(
  p_company_id uuid, p_view text default 'new', p_limit integer default 25, p_offset integer default 0, p_locale text default 'ru'
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_view not in ('new','active','completed') or p_locale not in ('ru','ro') or not exists(
    select 1 from public.company_memberships m join public.partner_companies c on c.id=m.company_id
    where m.user_id=auth.uid() and m.company_id=p_company_id and m.status='active' and c.status='active'
  ) then raise exception 'INSTALLATION_PARTNER_DENIED' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'assignmentId', a.id, 'projectId', p.id, 'status', p.status, 'assignmentStatus', a.status,
    'revision', p.revision, 'assignmentRevision', a.revision, 'locality', p.locality,
    'objectType', p.object_type, 'needType', p.need_type, 'description', p.description,
    'selectedAt', a.selected_at, 'acceptedAt', a.accepted_at, 'plannedFor', a.planned_for,
    'items', coalesce((select jsonb_agg(jsonb_build_object('id',item.id,'publicProductId',item.public_product_id,
      'orderLineId',item.retail_order_line_id,'quantity',item.quantity,
      'name',case when p_locale='ro' then coalesce(product.name_ro,product.name_ru) else product.name_ru end,
      'sku',product.sku,'slug',product.slug,'imageUrl',product.primary_image_url)
      order by item.created_at,item.id)
      from public.installation_project_items item
      left join public.public_retail_publications publication on publication.status='published'
      left join public.public_retail_products product on product.publication_id=publication.id and product.public_id=item.public_product_id
      where item.project_id=p.id),'[]'::jsonb),
    'contact', case when a.status='PARTNER_ACCEPTED' and p.contact_consent_at is not null then jsonb_build_object(
      'name',coalesce(customer.display_name,''),'phone',auth_user.phone,'email',customer.email) else null end,
    'privateLocation', case when a.status='PARTNER_ACCEPTED' and p.contact_consent_at is not null then p.private_location else null end
  ) order by a.updated_at desc,a.id desc)
  from (select assignment.* from public.installation_partner_assignments assignment
    join public.installation_projects project on project.id=assignment.project_id
    where assignment.partner_company_id=p_company_id and case p_view
      when 'new' then assignment.status='PARTNER_PENDING'
      when 'active' then assignment.status='PARTNER_ACCEPTED' and project.status in ('PARTNER_ACCEPTED','CONTACTED','SCHEDULED','INSTALLED','DISPUTED')
      else assignment.status in ('PARTNER_DECLINED','WITHDRAWN','EXPIRED')
        or (assignment.status='PARTNER_ACCEPTED' and project.status in ('CUSTOMER_CONFIRMED','CLOSED','CANCELLED'))
    end order by assignment.updated_at desc,assignment.id desc
    limit least(greatest(coalesce(p_limit,25),1),50) offset greatest(coalesce(p_offset,0),0)) a
  join public.installation_projects p on p.id=a.project_id
  join public.customer_accounts customer on customer.id=p.customer_account_id
  join auth.users auth_user on auth_user.id=customer.auth_user_id), '[]'::jsonb);
end;
$$;

create or replace function public.partner_respond_installation_project_v1(
  p_company_id uuid, p_assignment_id uuid, p_decision text, p_reason text,
  p_reason_note text, p_expected_revision bigint, p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare assignment public.installation_partner_assignments%rowtype; next_status text; project_status text;
begin
  if not exists(select 1 from public.company_memberships m where m.user_id=auth.uid() and m.company_id=p_company_id and m.status='active')
    or p_decision not in ('ACCEPT','DECLINE') then raise exception 'INSTALLATION_PARTNER_DENIED' using errcode='42501'; end if;
  if exists(select 1 from public.installation_project_events where idempotency_key=p_idempotency_key) then
    return jsonb_build_object('assignmentId',p_assignment_id,'status',(select status from public.installation_partner_assignments where id=p_assignment_id),'repeated',true);
  end if;
  select * into assignment from public.installation_partner_assignments a where a.id=p_assignment_id and a.partner_company_id=p_company_id for update;
  if assignment.id is null then raise exception 'INSTALLATION_ASSIGNMENT_DENIED' using errcode='42501'; end if;
  if assignment.revision<>p_expected_revision then raise exception 'INSTALLATION_ASSIGNMENT_CONFLICT' using errcode='PT409'; end if;
  if assignment.status<>'PARTNER_PENDING' then raise exception 'INSTALLATION_ASSIGNMENT_TRANSITION_INVALID' using errcode='22023'; end if;
  if p_decision='DECLINE' and p_reason not in ('OUT_OF_AREA','NO_CAPACITY','NOT_MY_SPECIALIZATION','TIMING','OTHER') then
    raise exception 'INSTALLATION_DECLINE_REASON_REQUIRED' using errcode='22023'; end if;
  next_status:=case when p_decision='ACCEPT' then 'PARTNER_ACCEPTED' else 'PARTNER_DECLINED' end;
  project_status:=next_status;
  update public.installation_partner_assignments set status=next_status, accepted_at=case when p_decision='ACCEPT' then now() else null end,
    declined_at=case when p_decision='DECLINE' then now() else null end, decline_reason=case when p_decision='DECLINE' then p_reason else null end,
    decline_note=case when p_decision='DECLINE' then nullif(left(btrim(coalesce(p_reason_note,'')),300),'') else null end,
    contact_shared_at=case when p_decision='ACCEPT' and exists(select 1 from public.installation_projects p where p.id=assignment.project_id and p.contact_consent_at is not null) then now() else null end,
    revision=revision+1 where id=assignment.id;
  update public.installation_projects set status=project_status,
    selected_assignment_id=assignment.id, revision=revision+1 where id=assignment.project_id;
  insert into public.installation_project_events(project_id,assignment_id,actor_kind,actor_user_id,event_type,idempotency_key,safe_evidence)
  values(assignment.project_id,assignment.id,'PARTNER',auth.uid(),case when p_decision='ACCEPT' then 'PARTNER_ACCEPTED' else 'PARTNER_DECLINED' end,
    p_idempotency_key,case when p_decision='DECLINE' then jsonb_build_object('reason',p_reason) else '{}'::jsonb end);
  return jsonb_build_object('assignmentId',assignment.id,'status',next_status,'repeated',false);
end;
$$;

create or replace function public.partner_transition_installation_project_v1(
  p_company_id uuid, p_assignment_id uuid, p_command text, p_planned_for timestamptz,
  p_expected_revision bigint, p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare assignment public.installation_partner_assignments%rowtype; project public.installation_projects%rowtype; next_status text;
begin
  if not exists(select 1 from public.company_memberships m where m.user_id=auth.uid() and m.company_id=p_company_id and m.status='active')
    or p_command not in ('CONTACTED','SCHEDULED','INSTALLED') then raise exception 'INSTALLATION_PARTNER_DENIED' using errcode='42501'; end if;
  if exists(select 1 from public.installation_project_events where idempotency_key=p_idempotency_key) then
    return jsonb_build_object('projectId',(select project_id from public.installation_partner_assignments where id=p_assignment_id),'status',(select p.status from public.installation_projects p join public.installation_partner_assignments a on a.project_id=p.id where a.id=p_assignment_id),'repeated',true);
  end if;
  select * into assignment from public.installation_partner_assignments a where a.id=p_assignment_id and a.partner_company_id=p_company_id and a.status='PARTNER_ACCEPTED' for update;
  select * into project from public.installation_projects p where p.id=assignment.project_id for update;
  if assignment.id is null or project.id is null then raise exception 'INSTALLATION_ASSIGNMENT_DENIED' using errcode='42501'; end if;
  if project.revision<>p_expected_revision then raise exception 'INSTALLATION_PROJECT_CONFLICT' using errcode='PT409'; end if;
  if (p_command='CONTACTED' and project.status<>'PARTNER_ACCEPTED')
    or (p_command='SCHEDULED' and project.status not in ('PARTNER_ACCEPTED','CONTACTED'))
    or (p_command='INSTALLED' and project.status not in ('CONTACTED','SCHEDULED')) then
    raise exception 'INSTALLATION_PROJECT_TRANSITION_INVALID' using errcode='22023'; end if;
  if p_command='SCHEDULED' and p_planned_for is null then raise exception 'INSTALLATION_PLANNED_DATE_REQUIRED' using errcode='22023'; end if;
  next_status:=p_command;
  update public.installation_partner_assignments set contacted_at=case when p_command='CONTACTED' then now() else contacted_at end,
    scheduled_at=case when p_command='SCHEDULED' then now() else scheduled_at end,
    planned_for=case when p_command='SCHEDULED' then p_planned_for else planned_for end,
    completed_at=case when p_command='INSTALLED' then now() else completed_at end,
    revision=revision+1 where id=assignment.id;
  update public.installation_projects set status=next_status,revision=revision+1 where id=project.id;
  insert into public.installation_project_events(project_id,assignment_id,actor_kind,actor_user_id,event_type,idempotency_key)
  values(project.id,assignment.id,'PARTNER',auth.uid(),p_command,p_idempotency_key);
  return jsonb_build_object('projectId',project.id,'status',next_status,'repeated',false);
end;
$$;

create or replace function public.customer_transition_installation_project_v1(
  p_project_id uuid, p_command text, p_expected_revision bigint, p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare account_id uuid; project public.installation_projects%rowtype; next_status text; event_name text;
begin
  select a.id into account_id from public.customer_accounts a where a.auth_user_id=auth.uid() and a.status='ACTIVE';
  if p_command not in ('CONFIRM','DISPUTE','CANCEL') then raise exception 'INSTALLATION_PROJECT_INPUT_INVALID' using errcode='22023'; end if;
  if exists(select 1 from public.installation_project_events where idempotency_key=p_idempotency_key) then
    return jsonb_build_object('projectId',p_project_id,'status',(select status from public.installation_projects where id=p_project_id and customer_account_id=account_id),'repeated',true);
  end if;
  select * into project from public.installation_projects p where p.id=p_project_id and p.customer_account_id=account_id for update;
  if project.id is null then raise exception 'INSTALLATION_PROJECT_DENIED' using errcode='42501'; end if;
  if project.revision<>p_expected_revision then raise exception 'INSTALLATION_PROJECT_CONFLICT' using errcode='PT409'; end if;
  if p_command in ('CONFIRM','DISPUTE') and project.status<>'INSTALLED' then raise exception 'INSTALLATION_PROJECT_TRANSITION_INVALID' using errcode='22023'; end if;
  if p_command='CANCEL' and project.status in ('INSTALLED','CUSTOMER_CONFIRMED','CLOSED','CANCELLED') then raise exception 'INSTALLATION_PROJECT_TRANSITION_INVALID' using errcode='22023'; end if;
  next_status:=case p_command when 'CONFIRM' then 'CUSTOMER_CONFIRMED' when 'DISPUTE' then 'DISPUTED' else 'CANCELLED' end;
  event_name:=case p_command when 'CONFIRM' then 'CUSTOMER_CONFIRMED' when 'DISPUTE' then 'DISPUTED' else 'CANCELLED' end;
  if p_command='CANCEL' and project.selected_assignment_id is not null then
    update public.installation_partner_assignments set status='WITHDRAWN',revision=revision+1
    where id=project.selected_assignment_id and status='PARTNER_PENDING';
  end if;
  update public.installation_projects set status=next_status,revision=revision+1 where id=project.id;
  insert into public.installation_project_events(project_id,assignment_id,actor_kind,actor_user_id,event_type,idempotency_key)
  values(project.id,project.selected_assignment_id,'CUSTOMER',auth.uid(),event_name,p_idempotency_key);
  return jsonb_build_object('projectId',project.id,'status',next_status,'repeated',false);
end;
$$;

create or replace function public.customer_submit_installation_review_v1(
  p_project_id uuid, p_overall smallint, p_workmanship smallint, p_communication smallint,
  p_agreement smallint, p_comment text, p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare account_id uuid; project public.installation_projects%rowtype; assignment public.installation_partner_assignments%rowtype; review_id uuid;
begin
  select a.id into account_id from public.customer_accounts a where a.auth_user_id=auth.uid() and a.status='ACTIVE';
  select * into project from public.installation_projects p where p.id=p_project_id and p.customer_account_id=account_id for update;
  if project.id is null then raise exception 'INSTALLATION_PROJECT_DENIED' using errcode='42501'; end if;
  select * into assignment from public.installation_partner_assignments a where a.id=project.selected_assignment_id and a.status='PARTNER_ACCEPTED';
  if project.status not in ('CUSTOMER_CONFIRMED','CLOSED') or assignment.id is null or least(p_overall,p_workmanship,p_communication,p_agreement)<1 or greatest(p_overall,p_workmanship,p_communication,p_agreement)>5 then
    raise exception 'INSTALLATION_REVIEW_NOT_ELIGIBLE' using errcode='22023'; end if;
  select id into review_id from public.installation_reviews where project_id=project.id;
  if review_id is not null then return jsonb_build_object('reviewId',review_id,'repeated',true); end if;
  insert into public.installation_reviews(project_id,assignment_id,customer_account_id,partner_company_id,
    overall_rating,workmanship_rating,communication_rating,agreement_rating,comment)
  values(project.id,assignment.id,account_id,assignment.partner_company_id,p_overall,p_workmanship,p_communication,p_agreement,
    nullif(left(btrim(coalesce(p_comment,'')),1000),'')) returning id into review_id;
  update public.installation_projects set status='CLOSED',revision=revision+1 where id=project.id;
  insert into public.installation_project_events(project_id,assignment_id,actor_kind,actor_user_id,event_type,idempotency_key,
    safe_evidence) values(project.id,assignment.id,'CUSTOMER',auth.uid(),'REVIEW_SUBMITTED',p_idempotency_key,
      jsonb_build_object('reviewId',review_id,'verificationStatus','VERIFIED_INSTALLATION'));
  return jsonb_build_object('reviewId',review_id,'repeated',false);
end;
$$;

create or replace function public.admin_list_installation_marketplace_v1(p_limit integer default 100, p_status text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_internal_permission('admin.retail_marketplace.view') then raise exception 'INSTALLATION_ADMIN_DENIED' using errcode='42501'; end if;
  return jsonb_build_object(
    'projects',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'sourceType',p.source_type,'objectType',p.object_type,
      'locality',p.locality,'needType',p.need_type,'status',p.status,'revision',p.revision,'createdAt',p.created_at,
      'updatedAt',p.updated_at,'itemCount',(select count(*) from public.installation_project_items item where item.project_id=p.id),
      'partnerName',profile.public_name_ru,'assignmentId',assignment.id) order by p.updated_at desc,p.id desc)
      from (select * from public.installation_projects where p_status is null or status=p_status order by updated_at desc,id desc limit least(greatest(coalesce(p_limit,100),1),200)) p
      left join public.installation_partner_assignments assignment on assignment.id=p.selected_assignment_id
      left join public.installation_provider_profiles profile on profile.provider_id=assignment.provider_id),'[]'::jsonb),
    'reviews',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'projectId',r.project_id,'partnerCompanyId',r.partner_company_id,
      'overallRating',r.overall_rating,'comment',r.comment,'verificationStatus',r.verification_status,'moderationStatus',r.moderation_status,
      'revision',r.revision,'createdAt',r.created_at) order by r.created_at desc,r.id desc)
      from (select * from public.installation_reviews order by created_at desc,id desc limit 100) r),'[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_moderate_installation_review_v1(
  p_review_id uuid, p_status text, p_expected_revision bigint, p_reason text, p_correlation_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare review public.installation_reviews%rowtype;
begin
  if not public.has_internal_permission('admin.retail_marketplace.manage') then raise exception 'INSTALLATION_ADMIN_DENIED' using errcode='42501'; end if;
  if p_status not in ('PUBLISHED','PENDING_REVIEW','HIDDEN') or char_length(btrim(coalesce(p_reason,'')))<5 then raise exception 'INSTALLATION_MODERATION_INPUT_INVALID' using errcode='22023'; end if;
  select * into review from public.installation_reviews where id=p_review_id for update;
  if review.id is null then raise exception 'INSTALLATION_REVIEW_NOT_FOUND' using errcode='P0002'; end if;
  if review.revision<>p_expected_revision then raise exception 'INSTALLATION_REVIEW_CONFLICT' using errcode='PT409'; end if;
  update public.installation_reviews set moderation_status=p_status,moderation_reason=left(btrim(p_reason),500),moderated_by=auth.uid(),moderated_at=now(),revision=revision+1 where id=review.id;
  insert into public.installation_project_events(project_id,assignment_id,actor_kind,actor_user_id,event_type,idempotency_key,safe_evidence)
  values(review.project_id,review.assignment_id,'ADMIN',auth.uid(),'REVIEW_MODERATED',p_correlation_id,jsonb_build_object('reviewId',review.id,'status',p_status));
  return jsonb_build_object('reviewId',review.id,'status',p_status,'revision',review.revision+1);
end;
$$;

create or replace function public.get_public_installation_partner_reputation_v1(p_provider_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'providerId',provider.id,
    'verifiedReviewCount',(select count(*) from public.installation_reviews review where review.partner_company_id=provider.partner_company_id and review.moderation_status='PUBLISHED'),
    'averageVerifiedRating',(select round(avg(review.overall_rating)::numeric,2) from public.installation_reviews review where review.partner_company_id=provider.partner_company_id and review.moderation_status='PUBLISHED'),
    'completedVerifiedInstallations',(select count(*) from public.installation_projects project join public.installation_partner_assignments assignment on assignment.id=project.selected_assignment_id where assignment.partner_company_id=provider.partner_company_id and project.status in ('CUSTOMER_CONFIRMED','CLOSED'))
  )
  from public.installation_providers provider
  join public.partner_companies company on company.id=provider.partner_company_id and company.status='active' and company.public_directory_visible
  join public.installation_provider_profiles profile on profile.provider_id=provider.id and profile.public_profile_status='published'
  where provider.id=p_provider_id and provider.provider_type='partner_company' and provider.operational_status='active'
    and provider.approval_status='approved' and provider.marketplace_enabled;
$$;

-- Extend the existing public directory rather than creating a second partner catalog.
create or replace function public.list_public_partner_directory()
returns jsonb language sql stable security definer set search_path = '' as $$
  with companies as (
    select id,public_display_name,public_directory_logo_asset_path from public.partner_companies
    where status='active' and public_directory_visible=true and public_display_name is not null
    order by lower(public_display_name),id limit 100
  ), review_stats as (
    select review.partner_company_id,count(*) as review_count,round(avg(review.overall_rating)::numeric,2) as average_rating
    from public.installation_reviews review join companies company on company.id=review.partner_company_id
    where review.moderation_status='PUBLISHED' group by review.partner_company_id
  ), completion_stats as (
    select assignment.partner_company_id,count(*) as completed_count
    from public.installation_projects project
    join public.installation_partner_assignments assignment on assignment.id=project.selected_assignment_id
    join companies company on company.id=assignment.partner_company_id
    where project.status in ('CUSTOMER_CONFIRMED','CLOSED') group by assignment.partner_company_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('displayName',company.public_display_name,
    'logoAssetPath',company.public_directory_logo_asset_path,'providerId',provider.id,
    'verifiedReviewCount',coalesce(review_stats.review_count,0),'averageVerifiedRating',review_stats.average_rating,
    'completedVerifiedInstallations',coalesce(completion_stats.completed_count,0))
    order by lower(company.public_display_name),company.id),'[]'::jsonb)
  from companies company
  left join public.installation_providers provider on provider.partner_company_id=company.id
    and provider.provider_type='partner_company' and provider.operational_status='active'
    and provider.approval_status='approved' and provider.marketplace_enabled
  left join review_stats on review_stats.partner_company_id=company.id
  left join completion_stats on completion_stats.partner_company_id=company.id;
$$;

create or replace function public.list_public_installation_regions_v1(p_locale text default 'ru')
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when p_locale in ('ru','ro') then coalesce(jsonb_agg(jsonb_build_object(
    'code', region.code,
    'name', case when p_locale='ro' then region.name_ro else region.name_ru end
  ) order by case when region.code='MD-CU' then 0 else 1 end,
    lower(case when p_locale='ro' then region.name_ro else region.name_ru end), region.code), '[]'::jsonb) else '[]'::jsonb end
  from public.installation_service_regions region
  where region.active and region.region_type in ('municipality','district','locality');
$$;

create or replace function public.customer_order_installation_eligible_v1(p_order_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1
    from public.retail_orders orders
    join public.retail_customers retail_customer on retail_customer.id=orders.customer_id
    join public.customer_accounts account on account.customer_identity_id=retail_customer.customer_identity_id
      and account.auth_user_id=auth.uid() and account.status='ACTIVE'
    join public.retail_order_lines line on line.order_id=orders.id and line.unit_code<>'service'
    join public.public_retail_products product on product.public_id=line.public_product_id
    join public.public_retail_publications publication on publication.id=product.publication_id and publication.status='published'
    where orders.id=p_order_id and cardinality(product.calculator_profile_keys)>0
  );
$$;

revoke all on function private.prevent_installation_marketplace_history_mutation() from public,anon,authenticated,service_role;
revoke all on function public.create_customer_installation_project_v1(text,uuid,uuid,text,text,text,text,text,boolean,uuid) from public,anon,authenticated;
revoke all on function public.customer_list_installation_projects_v1(integer,integer,text) from public,anon,authenticated;
revoke all on function public.customer_get_installation_project_v1(uuid,text) from public,anon,authenticated;
revoke all on function public.customer_list_installation_partner_shortlist_v1(uuid,text,integer) from public,anon,authenticated;
revoke all on function public.customer_select_installation_partner_v1(uuid,uuid,bigint,uuid) from public,anon,authenticated;
revoke all on function public.partner_list_installation_projects_v1(uuid,text,integer,integer,text) from public,anon,authenticated;
revoke all on function public.partner_respond_installation_project_v1(uuid,uuid,text,text,text,bigint,uuid) from public,anon,authenticated;
revoke all on function public.partner_transition_installation_project_v1(uuid,uuid,text,timestamptz,bigint,uuid) from public,anon,authenticated;
revoke all on function public.customer_transition_installation_project_v1(uuid,text,bigint,uuid) from public,anon,authenticated;
revoke all on function public.customer_submit_installation_review_v1(uuid,smallint,smallint,smallint,smallint,text,uuid) from public,anon,authenticated;
revoke all on function public.admin_list_installation_marketplace_v1(integer,text) from public,anon,authenticated;
revoke all on function public.admin_moderate_installation_review_v1(uuid,text,bigint,text,uuid) from public,anon,authenticated;
revoke all on function public.get_public_installation_partner_reputation_v1(uuid) from public,anon,authenticated;
revoke all on function public.list_public_installation_regions_v1(text) from public,anon,authenticated;
revoke all on function public.customer_order_installation_eligible_v1(uuid) from public,anon,authenticated;
revoke all on function public.list_public_partner_directory() from public,anon,authenticated;

grant execute on function public.create_customer_installation_project_v1(text,uuid,uuid,text,text,text,text,text,boolean,uuid),
  public.customer_list_installation_projects_v1(integer,integer,text), public.customer_get_installation_project_v1(uuid,text),
  public.customer_list_installation_partner_shortlist_v1(uuid,text,integer), public.customer_select_installation_partner_v1(uuid,uuid,bigint,uuid),
  public.customer_transition_installation_project_v1(uuid,text,bigint,uuid),
  public.customer_submit_installation_review_v1(uuid,smallint,smallint,smallint,smallint,text,uuid),
  public.partner_list_installation_projects_v1(uuid,text,integer,integer,text),
  public.partner_respond_installation_project_v1(uuid,uuid,text,text,text,bigint,uuid),
  public.partner_transition_installation_project_v1(uuid,uuid,text,timestamptz,bigint,uuid),
  public.admin_list_installation_marketplace_v1(integer,text),
  public.admin_moderate_installation_review_v1(uuid,text,bigint,text,uuid),
  public.customer_order_installation_eligible_v1(uuid)
to authenticated;
grant execute on function public.get_public_installation_partner_reputation_v1(uuid),
  public.list_public_installation_regions_v1(text), public.list_public_partner_directory() to anon,authenticated;

comment on table public.installation_projects is 'Customer-owned Installation Marketplace job aggregate; independent from Commercial Agent attribution and from marketplace payments.';
comment on table public.installation_partner_assignments is 'History-preserving customer-selected Partner assignment. V1 permits only one active assignment.';
comment on table public.installation_reviews is 'Exactly one customer-authored verified installation review per confirmed project assignment.';
comment on function public.customer_list_installation_partner_shortlist_v1(uuid,text,integer) is 'Eligibility and relevance only: capability, region and stable neutral order. Ratings are display-only and never rank V1 results.';

commit;
