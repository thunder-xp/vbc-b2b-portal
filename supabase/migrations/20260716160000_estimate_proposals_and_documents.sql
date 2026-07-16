-- Customer-facing proposal settings, reusable templates, and private generated PDFs.

alter table public.estimates
  add column if not exists proposal_template_id uuid null,
  add column if not exists proposal_settings jsonb not null default '{}'::jsonb;

create table if not exists public.proposal_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid null references public.partner_companies(id) on delete cascade,
  template_key text not null,
  name text not null,
  configuration jsonb not null,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_by uuid null references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proposal_templates_owner_check check ((is_system and company_id is null) or (not is_system and company_id is not null)),
  constraint proposal_templates_key_check check (template_key ~ '^[a-z0-9_-]{2,64}$'),
  constraint proposal_templates_configuration_check check (jsonb_typeof(configuration) = 'object'),
  unique nulls not distinct (company_id, template_key)
);

alter table public.estimates
  drop constraint if exists estimates_proposal_template_id_fkey;
alter table public.estimates
  add constraint estimates_proposal_template_id_fkey
  foreign key (proposal_template_id) references public.proposal_templates(id) on delete set null;

create table if not exists public.company_proposal_profiles (
  company_id uuid primary key references public.partner_companies(id) on delete cascade,
  legal_name text null,
  contact_name text null,
  phone text null,
  email text null,
  website text null,
  fiscal_information text null,
  address text null,
  logo_url text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generated_estimate_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete cascade,
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  estimate_revision integer not null,
  template_id uuid null references public.proposal_templates(id) on delete set null,
  generation_fingerprint text not null,
  status text not null default 'queued',
  storage_bucket text null,
  storage_key text null,
  prepared_dto jsonb not null,
  page_count integer null,
  file_size_bytes bigint null,
  checksum_sha256 text null,
  safe_error text null,
  generated_by uuid not null references public.user_profiles(id),
  generated_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint generated_estimate_documents_status_check check (status in ('queued', 'generating', 'ready', 'failed')),
  constraint generated_estimate_documents_fingerprint_check check (generation_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint generated_estimate_documents_prepared_dto_check check (jsonb_typeof(prepared_dto) = 'object'),
  unique (company_id, generation_fingerprint)
);

create index if not exists proposal_templates_company_active_idx on public.proposal_templates(company_id, is_active, name);
create index if not exists generated_estimate_documents_estimate_idx on public.generated_estimate_documents(estimate_id, created_at desc);

drop trigger if exists set_proposal_templates_updated_at on public.proposal_templates;
create trigger set_proposal_templates_updated_at before update on public.proposal_templates
for each row execute function public.set_updated_at();
drop trigger if exists set_company_proposal_profiles_updated_at on public.company_proposal_profiles;
create trigger set_company_proposal_profiles_updated_at before update on public.company_proposal_profiles
for each row execute function public.set_updated_at();
drop trigger if exists set_generated_estimate_documents_updated_at on public.generated_estimate_documents;
create trigger set_generated_estimate_documents_updated_at before update on public.generated_estimate_documents
for each row execute function public.set_updated_at();

insert into public.proposal_templates (template_key, name, configuration, is_system)
values
  ('equipment_supply', 'Поставка оборудования', '{"title":"Коммерческое предложение","introduction":"Предлагаем поставку оборудования для вашего проекта.","showProductImages":true,"showSku":true,"showUnitPrice":true,"showLineDiscount":true,"showSectionSubtotals":true,"showVatBreakdown":true,"showPartnerLogo":true}'::jsonb, true),
  ('equipment_installation', 'Оборудование и монтаж', '{"title":"Коммерческое предложение","introduction":"Предлагаем комплекс поставки оборудования и монтажных работ.","installationNotes":"Объём и сроки монтажных работ уточняются после обследования объекта.","showProductImages":true,"showSku":true,"showUnitPrice":true,"showLineDiscount":true,"showSectionSubtotals":true,"showVatBreakdown":true,"showPartnerLogo":true}'::jsonb, true),
  ('integrated_solution', 'Комплексное решение', '{"title":"Комплексное решение","introduction":"Предлагаем комплексное техническое решение для объекта.","showProductImages":true,"showSku":true,"showUnitPrice":true,"showLineDiscount":true,"showSectionSubtotals":true,"showVatBreakdown":true,"showPartnerLogo":true}'::jsonb, true),
  ('service_offer', 'Сервисное предложение', '{"title":"Сервисное предложение","introduction":"Предлагаем профессиональные работы и сервисное сопровождение.","showProductImages":false,"showSku":false,"showUnitPrice":true,"showLineDiscount":true,"showSectionSubtotals":true,"showVatBreakdown":true,"showPartnerLogo":true}'::jsonb, true)
on conflict (company_id, template_key) do update
set name = excluded.name, configuration = excluded.configuration, is_active = true;

with grants(role_code, permission_code) as (
  values
    ('partner_owner', 'estimates.generate_pdf'),
    ('partner_manager', 'estimates.generate_pdf'),
    ('partner_buyer', 'estimates.generate_pdf'),
    ('novotech_admin', 'estimates.generate_pdf'),
    ('novotech_sales', 'estimates.generate_pdf'),
    ('partner_owner', 'proposal_templates.manage'),
    ('partner_manager', 'proposal_templates.manage'),
    ('novotech_admin', 'proposal_templates.manage')
)
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id from grants
join public.roles role on role.code = grants.role_code
join public.permissions permission on permission.code = grants.permission_code
on conflict (role_id, permission_id) do nothing;

create or replace function public.save_estimate_proposal_settings(
  target_estimate_id uuid,
  expected_revision integer,
  target_template_id uuid,
  settings_payload jsonb
)
returns public.estimates
language plpgsql security definer set search_path = public
as $$
declare target public.estimates;
begin
  select * into target from public.estimates where id = target_estimate_id for update;
  if target.id is null or target.status <> 'draft' or not public.can_access_estimates(target.company_id, 'estimates.manage') then
    raise exception 'Estimate proposal is not available.' using errcode = '42501';
  end if;
  if target.revision <> expected_revision then raise exception 'Estimate was changed.' using errcode = '40001'; end if;
  if jsonb_typeof(settings_payload) <> 'object' or octet_length(settings_payload::text) > 20000 then
    raise exception 'Proposal settings are invalid.' using errcode = '22023';
  end if;
  if target_template_id is not null and not exists (
    select 1 from public.proposal_templates t where t.id = target_template_id and t.is_active and (t.is_system or t.company_id = target.company_id)
  ) then raise exception 'Proposal template is unavailable.' using errcode = '22023'; end if;
  update public.estimates set proposal_template_id = target_template_id, proposal_settings = settings_payload, revision = revision + 1 where id = target.id returning * into target;
  return target;
end;
$$;
revoke all on function public.save_estimate_proposal_settings(uuid, integer, uuid, jsonb) from public, anon;
grant execute on function public.save_estimate_proposal_settings(uuid, integer, uuid, jsonb) to authenticated;

create or replace function public.copy_proposal_template(target_company_id uuid, source_template_id uuid, target_name text)
returns public.proposal_templates
language plpgsql security definer set search_path = public
as $$
declare source public.proposal_templates; created public.proposal_templates;
begin
  if not public.can_access_estimates(target_company_id, 'proposal_templates.manage') then
    raise exception 'Proposal template is not available.' using errcode = '42501';
  end if;
  select * into source from public.proposal_templates
  where id = source_template_id and is_active and (is_system or company_id = target_company_id);
  if source.id is null or nullif(trim(target_name), '') is null or length(trim(target_name)) > 120 then
    raise exception 'Proposal template is invalid.' using errcode = '22023';
  end if;
  insert into public.proposal_templates(company_id, template_key, name, configuration, is_system, created_by)
  values(target_company_id, 'custom_' || replace(gen_random_uuid()::text, '-', ''), trim(target_name), source.configuration, false, auth.uid())
  returning * into created;
  return created;
end;
$$;
revoke all on function public.copy_proposal_template(uuid, uuid, text) from public, anon;
grant execute on function public.copy_proposal_template(uuid, uuid, text) to authenticated;

create or replace function public.claim_estimate_document_generation(
  target_estimate_id uuid,
  target_revision integer,
  target_template_id uuid,
  target_fingerprint text,
  target_prepared_dto jsonb
)
returns public.generated_estimate_documents
language plpgsql security definer set search_path = public
as $$
declare target public.estimates; claimed public.generated_estimate_documents;
begin
  select * into target from public.estimates where id = target_estimate_id;
  if target.id is null or target.revision <> target_revision or target.has_incomplete_pricing
     or not public.can_access_estimates(target.company_id, 'estimates.generate_pdf') then
    raise exception 'Estimate PDF cannot be generated.' using errcode = '42501';
  end if;
  insert into public.generated_estimate_documents(company_id, estimate_id, estimate_revision, template_id, generation_fingerprint, prepared_dto, generated_by)
  values(target.company_id, target.id, target.revision, target_template_id, target_fingerprint, target_prepared_dto, auth.uid())
  on conflict (company_id, generation_fingerprint) do update set updated_at = public.generated_estimate_documents.updated_at
  returning * into claimed;
  return claimed;
end;
$$;
revoke all on function public.claim_estimate_document_generation(uuid, integer, uuid, text, jsonb) from public, anon;
grant execute on function public.claim_estimate_document_generation(uuid, integer, uuid, text, jsonb) to authenticated;

alter table public.proposal_templates enable row level security;
alter table public.company_proposal_profiles enable row level security;
alter table public.generated_estimate_documents enable row level security;
revoke all on table public.proposal_templates, public.company_proposal_profiles, public.generated_estimate_documents from anon, authenticated;
grant select on table public.proposal_templates, public.company_proposal_profiles, public.generated_estimate_documents to authenticated;

create policy "Company members view proposal templates" on public.proposal_templates for select to authenticated
using (is_active and (is_system or public.can_access_estimates(company_id, 'estimates.view')));
create policy "Company members view proposal profile" on public.company_proposal_profiles for select to authenticated
using (public.can_access_estimates(company_id, 'estimates.view'));
create policy "Company members view generated estimate documents" on public.generated_estimate_documents for select to authenticated
using (public.can_access_estimates(company_id, 'estimates.view'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('estimate-proposals', 'estimate-proposals', false, 15728640, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

comment on table public.generated_estimate_documents is 'Immutable metadata and customer-safe snapshot for privately stored generated proposal PDFs.';
comment on column public.generated_estimate_documents.prepared_dto is 'Allowlisted customer-facing snapshot; internal costs, margins, permissions, and ERP identifiers are forbidden.';
