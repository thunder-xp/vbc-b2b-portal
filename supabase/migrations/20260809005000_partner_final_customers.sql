-- Company-scoped final customers for estimates. This is a compact commercial identity domain, not CRM.
create table public.partner_final_customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  display_name text not null,
  customer_type text not null,
  fiscal_code text null,
  locality text null,
  industry text null,
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  updated_by uuid not null references public.user_profiles(id) on delete restrict,
  revision integer not null default 1,
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_final_customers_name_check check (char_length(btrim(display_name)) between 1 and 200),
  constraint partner_final_customers_type_check check (customer_type in ('company', 'individual')),
  constraint partner_final_customers_fiscal_check check (fiscal_code is null or (char_length(fiscal_code) between 2 and 32 and fiscal_code ~ '^[[:alnum:]/.-]+$')),
  constraint partner_final_customers_locality_check check (locality is null or char_length(locality) <= 120),
  constraint partner_final_customers_industry_check check (industry is null or char_length(industry) <= 120),
  constraint partner_final_customers_revision_check check (revision > 0)
);

create table public.partner_final_customer_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.partner_final_customers(id) on delete restrict,
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  actor_user_id uuid not null references public.user_profiles(id) on delete restrict,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint partner_final_customer_events_type_check check (event_type in ('created', 'updated', 'archived', 'estimate_attached')),
  constraint partner_final_customer_events_metadata_check check (jsonb_typeof(metadata) = 'object')
);

alter table public.estimates
  add column final_customer_id uuid null references public.partner_final_customers(id) on delete restrict;

create index partner_final_customers_company_name_idx
  on public.partner_final_customers (company_id, lower(display_name) text_pattern_ops, id)
  where archived_at is null;
create index partner_final_customers_company_fiscal_idx
  on public.partner_final_customers (company_id, fiscal_code)
  where archived_at is null and fiscal_code is not null;
create index partner_final_customer_events_customer_created_idx
  on public.partner_final_customer_events (customer_id, created_at desc);
create index estimates_final_customer_idx
  on public.estimates (final_customer_id, updated_at desc)
  where final_customer_id is not null;

create trigger set_partner_final_customers_updated_at
before update on public.partner_final_customers
for each row execute function public.set_updated_at();

create or replace function public.bump_partner_final_customer_revision()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.revision := old.revision + 1;
  return new;
end;
$$;

create trigger bump_partner_final_customer_revision_before_update
before update on public.partner_final_customers
for each row execute function public.bump_partner_final_customer_revision();

create or replace function public.prevent_partner_final_customer_event_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Final customer audit events are immutable.' using errcode = '42501';
end;
$$;

create trigger prevent_partner_final_customer_event_mutation
before update or delete on public.partner_final_customer_events
for each row execute function public.prevent_partner_final_customer_event_mutation();

alter table public.partner_final_customers enable row level security;
alter table public.partner_final_customer_events enable row level security;
revoke all on table public.partner_final_customers, public.partner_final_customer_events from public, anon, authenticated;
grant select on table public.partner_final_customers to authenticated;

create policy "Company members can view final customers"
on public.partner_final_customers for select to authenticated
using (archived_at is null and public.can_access_estimates(company_id, 'estimates.view'));

create or replace function public.search_partner_final_customers(
  target_company_id uuid,
  search_query text,
  result_limit integer default 8
)
returns setof public.partner_final_customers
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized_query text := lower(btrim(coalesce(search_query, '')));
  bounded_limit integer := least(greatest(coalesce(result_limit, 8), 1), 12);
begin
  if not public.can_access_estimates(target_company_id, 'estimates.view') then
    raise exception 'Final customers are not available.' using errcode = '42501';
  end if;
  if char_length(normalized_query) < 2 then return; end if;

  return query
  select customer.*
  from public.partner_final_customers customer
  where customer.company_id = target_company_id
    and customer.archived_at is null
    and (
      lower(customer.display_name) like normalized_query || '%'
      or lower(coalesce(customer.fiscal_code, '')) = normalized_query
    )
  order by
    (lower(coalesce(customer.fiscal_code, '')) = normalized_query) desc,
    (lower(customer.display_name) = normalized_query) desc,
    lower(customer.display_name), customer.id
  limit bounded_limit;
end;
$$;

create or replace function public.create_partner_final_customer(
  target_company_id uuid,
  target_display_name text,
  target_customer_type text,
  target_fiscal_code text default '',
  target_locality text default '',
  target_industry text default ''
)
returns public.partner_final_customers
language plpgsql
security definer
set search_path = public
as $$
declare created public.partner_final_customers;
begin
  if not public.can_access_estimates(target_company_id, 'estimates.manage') then
    raise exception 'Final customer is not available.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(target_display_name, ''))) not between 1 and 200
     or target_customer_type not in ('company', 'individual') then
    raise exception 'Final customer data is invalid.' using errcode = '22023';
  end if;

  insert into public.partner_final_customers (
    company_id, display_name, customer_type, fiscal_code, locality, industry, created_by, updated_by
  ) values (
    target_company_id, btrim(target_display_name), target_customer_type,
    nullif(upper(btrim(target_fiscal_code)), ''), nullif(btrim(target_locality), ''),
    nullif(btrim(target_industry), ''), auth.uid(), auth.uid()
  ) returning * into created;

  insert into public.partner_final_customer_events (customer_id, company_id, actor_user_id, event_type)
  values (created.id, created.company_id, auth.uid(), 'created');
  return created;
end;
$$;

create or replace function public.archive_partner_final_customer(target_customer_id uuid, expected_revision integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare target public.partner_final_customers;
begin
  select * into target from public.partner_final_customers where id = target_customer_id for update;
  if target.id is null or not public.can_access_estimates(target.company_id, 'estimates.manage') then
    raise exception 'Final customer is not available.' using errcode = '42501';
  end if;
  if target.revision <> expected_revision then
    raise exception 'Final customer changed in another session.' using errcode = '40001';
  end if;
  if exists (select 1 from public.estimates where final_customer_id = target.id and archived_at is null) then
    raise exception 'Final customer is used by an active estimate.' using errcode = '23514';
  end if;
  if target.archived_at is not null then return; end if;
  update public.partner_final_customers set archived_at = now(), updated_by = auth.uid() where id = target.id;
  insert into public.partner_final_customer_events (customer_id, company_id, actor_user_id, event_type)
  values (target.id, target.company_id, auth.uid(), 'archived');
end;
$$;

create or replace function public.update_partner_final_customer(
  target_company_id uuid,
  target_customer_id uuid,
  expected_revision integer,
  target_display_name text,
  target_customer_type text,
  target_fiscal_code text default '',
  target_locality text default '',
  target_industry text default ''
)
returns public.partner_final_customers
language plpgsql
security definer
set search_path = public
as $$
declare target public.partner_final_customers;
begin
  select * into target from public.partner_final_customers where id = target_customer_id for update;
  if target.id is null or target.company_id <> target_company_id or target.archived_at is not null
     or not public.can_access_estimates(target.company_id, 'estimates.manage') then
    raise exception 'Final customer is not available.' using errcode = '42501';
  end if;
  if target.revision <> expected_revision then
    raise exception 'Final customer changed in another session.' using errcode = '40001';
  end if;
  if char_length(btrim(coalesce(target_display_name, ''))) not between 1 and 200
     or target_customer_type not in ('company', 'individual') then
    raise exception 'Final customer data is invalid.' using errcode = '22023';
  end if;
  update public.partner_final_customers set
    display_name = btrim(target_display_name), customer_type = target_customer_type,
    fiscal_code = nullif(upper(btrim(target_fiscal_code)), ''),
    locality = nullif(btrim(target_locality), ''), industry = nullif(btrim(target_industry), ''),
    updated_by = auth.uid()
  where id = target.id returning * into target;
  insert into public.partner_final_customer_events (customer_id, company_id, actor_user_id, event_type)
  values (target.id, target.company_id, auth.uid(), 'updated');
  return target;
end;
$$;

create or replace function public.create_estimate_v3(
  target_company_id uuid,
  estimate_name text,
  target_final_customer_id uuid,
  target_customer_name text,
  target_project_name text,
  target_currency_code text,
  target_validity_days integer,
  request_key uuid
)
returns public.estimates
language plpgsql
security definer
set search_path = public
as $$
declare
  customer public.partner_final_customers;
  created public.estimates;
begin
  select * into customer from public.partner_final_customers
  where id = target_final_customer_id and company_id = target_company_id and archived_at is null;
  if customer.id is null then raise exception 'Final customer is not available.' using errcode = '42501'; end if;

  select * into created from public.create_estimate_v2(
    target_company_id, estimate_name, customer.display_name, target_project_name,
    target_currency_code, target_validity_days, request_key
  );
  if created.final_customer_id is not null and created.final_customer_id <> customer.id then
    raise exception 'Estimate request key was reused with another customer.' using errcode = '22023';
  end if;
  if created.final_customer_id is null then
    update public.estimates set final_customer_id = customer.id where id = created.id returning * into created;
    insert into public.partner_final_customer_events (customer_id, company_id, actor_user_id, event_type, metadata)
    values (customer.id, customer.company_id, auth.uid(), 'estimate_attached', jsonb_build_object('estimate_id', created.id));
  end if;
  return created;
end;
$$;

create or replace function public.update_estimate_draft_v2(
  target_estimate_id uuid,
  expected_revision integer,
  estimate_name text,
  target_final_customer_id uuid,
  target_customer_name text,
  target_project_name text,
  target_validity_days integer
)
returns public.estimates
language plpgsql
security definer
set search_path = public
as $$
declare target public.estimates; customer public.partner_final_customers;
begin
  select * into target from public.estimates where id = target_estimate_id;
  if target.id is null then raise exception 'Estimate draft is not available.' using errcode = '42501'; end if;
  if target_final_customer_id is not null then
    select * into customer from public.partner_final_customers
    where id = target_final_customer_id and company_id = target.company_id and archived_at is null;
    if customer.id is null then raise exception 'Final customer is not available.' using errcode = '42501'; end if;
  end if;
  select * into target from public.update_estimate_draft(
    target_estimate_id, expected_revision, estimate_name,
    coalesce(customer.display_name, target_customer_name), target_project_name, target_validity_days
  );
  if target.final_customer_id is distinct from target_final_customer_id then
    update public.estimates set final_customer_id = target_final_customer_id where id = target.id returning * into target;
  end if;
  return target;
end;
$$;

create or replace function public.save_estimate_commercial_draft_v2(
  target_estimate_id uuid,
  expected_revision integer,
  target_final_customer_id uuid,
  estimate_settings jsonb,
  section_payload jsonb,
  line_payload jsonb,
  charge_payload jsonb
)
returns public.estimates
language plpgsql
security definer
set search_path = public
as $$
declare target public.estimates; customer public.partner_final_customers; safe_settings jsonb;
begin
  select * into target from public.estimates where id = target_estimate_id;
  if target.id is null then raise exception 'Estimate draft is not available.' using errcode = '42501'; end if;
  if target_final_customer_id is not null then
    select * into customer from public.partner_final_customers
    where id = target_final_customer_id and company_id = target.company_id and archived_at is null;
    if customer.id is null then raise exception 'Final customer is not available.' using errcode = '42501'; end if;
  end if;
  safe_settings := jsonb_set(estimate_settings, '{customer_name}', to_jsonb(coalesce(customer.display_name, estimate_settings->>'customer_name', '')));
  select * into target from public.save_estimate_commercial_draft(
    target_estimate_id, expected_revision, safe_settings, section_payload, line_payload, charge_payload
  );
  if target.final_customer_id is distinct from target_final_customer_id then
    update public.estimates set final_customer_id = target_final_customer_id where id = target.id returning * into target;
  end if;
  return target;
end;
$$;

revoke all on function public.bump_partner_final_customer_revision() from public, anon, authenticated;
revoke all on function public.prevent_partner_final_customer_event_mutation() from public, anon, authenticated;
revoke all on function public.search_partner_final_customers(uuid, text, integer) from public, anon;
revoke all on function public.create_partner_final_customer(uuid, text, text, text, text, text) from public, anon;
revoke all on function public.archive_partner_final_customer(uuid, integer) from public, anon;
revoke all on function public.update_partner_final_customer(uuid, uuid, integer, text, text, text, text, text) from public, anon;
revoke all on function public.create_estimate_v3(uuid, text, uuid, text, text, text, integer, uuid) from public, anon;
revoke all on function public.update_estimate_draft_v2(uuid, integer, text, uuid, text, text, integer) from public, anon;
revoke all on function public.save_estimate_commercial_draft_v2(uuid, integer, uuid, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.search_partner_final_customers(uuid, text, integer) to authenticated;
grant execute on function public.create_partner_final_customer(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.archive_partner_final_customer(uuid, integer) to authenticated;
grant execute on function public.update_partner_final_customer(uuid, uuid, integer, text, text, text, text, text) to authenticated;
grant execute on function public.create_estimate_v3(uuid, text, uuid, text, text, text, integer, uuid) to authenticated;
grant execute on function public.update_estimate_draft_v2(uuid, integer, text, uuid, text, text, integer) to authenticated;
grant execute on function public.save_estimate_commercial_draft_v2(uuid, integer, uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;
