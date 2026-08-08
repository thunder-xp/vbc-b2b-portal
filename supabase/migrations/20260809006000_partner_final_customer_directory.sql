-- Partner-facing final-customer directory and governed market taxonomy. This remains an Estimates read model, not CRM.
alter table public.partner_final_customers
  add column industry_code text null,
  add constraint partner_final_customers_industry_code_check check (
    industry_code is null or industry_code in (
      'retail', 'horeca', 'manufacturing', 'logistics', 'construction',
      'residential', 'office_commercial', 'banking_finance', 'education',
      'healthcare', 'government_public', 'critical_infrastructure',
      'agriculture', 'security_integrator', 'other'
    )
  );

create index partner_final_customers_company_industry_idx
  on public.partner_final_customers (company_id, industry_code, lower(display_name), id)
  where archived_at is null;

create index partner_final_customers_company_locality_idx
  on public.partner_final_customers (company_id, lower(locality), id)
  where archived_at is null and locality is not null;

create unique index partner_final_customers_company_fiscal_unique_idx
  on public.partner_final_customers (company_id, upper(fiscal_code))
  where archived_at is null and fiscal_code is not null;

create or replace function public.list_partner_final_customers(
  target_company_id uuid,
  search_query text default '',
  industry_filter text default null,
  result_limit integer default 20,
  result_offset integer default 0
)
returns table (
  id uuid,
  company_id uuid,
  display_name text,
  customer_type text,
  fiscal_code text,
  locality text,
  industry text,
  industry_code text,
  created_by uuid,
  updated_by uuid,
  revision integer,
  archived_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  estimate_count bigint,
  last_estimate_at timestamptz,
  last_estimate_id uuid,
  last_estimate_number text,
  last_project_name text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized_query text := lower(btrim(coalesce(search_query, '')));
  bounded_limit integer := least(greatest(coalesce(result_limit, 20), 1), 50);
  bounded_offset integer := greatest(coalesce(result_offset, 0), 0);
begin
  if not public.can_access_estimates(target_company_id, 'estimates.view') then
    raise exception 'Final customers are not available.' using errcode = '42501';
  end if;
  if industry_filter is not null and industry_filter not in (
    'retail', 'horeca', 'manufacturing', 'logistics', 'construction',
    'residential', 'office_commercial', 'banking_finance', 'education',
    'healthcare', 'government_public', 'critical_infrastructure',
    'agriculture', 'security_integrator', 'other'
  ) then
    raise exception 'Final customer industry is invalid.' using errcode = '22023';
  end if;

  return query
  with eligible as (
    select customer.*, count(*) over () as matched_count
    from public.partner_final_customers customer
    where customer.company_id = target_company_id
      and customer.archived_at is null
      and (industry_filter is null or customer.industry_code = industry_filter)
      and (
        normalized_query = ''
        or lower(customer.display_name) like normalized_query || '%'
        or lower(coalesce(customer.fiscal_code, '')) = normalized_query
      )
    order by lower(customer.display_name), customer.id
    limit bounded_limit offset bounded_offset
  ), usage_stats as (
    select estimate.final_customer_id, count(*) as estimate_count, max(estimate.updated_at) as last_estimate_at
    from public.estimates estimate
    where estimate.final_customer_id in (select eligible.id from eligible)
      and estimate.archived_at is null
    group by estimate.final_customer_id
  ), latest_estimate as (
    select distinct on (estimate.final_customer_id)
      estimate.final_customer_id, estimate.id, estimate.estimate_number, estimate.project_name
    from public.estimates estimate
    where estimate.final_customer_id in (select eligible.id from eligible)
      and estimate.archived_at is null
    order by estimate.final_customer_id, estimate.updated_at desc, estimate.id
  )
  select eligible.id, eligible.company_id, eligible.display_name, eligible.customer_type,
    eligible.fiscal_code, eligible.locality, eligible.industry, eligible.industry_code,
    eligible.created_by, eligible.updated_by, eligible.revision, eligible.archived_at,
    eligible.created_at, eligible.updated_at, coalesce(usage_stats.estimate_count, 0),
    usage_stats.last_estimate_at, latest_estimate.id, latest_estimate.estimate_number,
    latest_estimate.project_name, eligible.matched_count
  from eligible
  left join usage_stats on usage_stats.final_customer_id = eligible.id
  left join latest_estimate on latest_estimate.final_customer_id = eligible.id
  order by lower(eligible.display_name), eligible.id;
end;
$$;

create or replace function public.search_partner_final_customers(
  target_company_id uuid,
  search_query text,
  result_limit integer default 8
)
returns setof public.partner_final_customers
language sql
stable
security definer
set search_path = public
as $$
  select customer.*
  from public.list_partner_final_customers(
    target_company_id,
    search_query,
    null,
    least(greatest(coalesce(result_limit, 8), 1), 12),
    0
  ) result
  join public.partner_final_customers customer on customer.id = result.id
  order by lower(customer.display_name), customer.id;
$$;

create or replace function public.get_partner_final_customer_detail(
  target_company_id uuid,
  target_customer_id uuid,
  estimate_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  customer public.partner_final_customers;
  related_estimates jsonb;
  last_activity timestamptz;
begin
  if not public.can_access_estimates(target_company_id, 'estimates.view') then
    raise exception 'Final customer is not available.' using errcode = '42501';
  end if;
  select * into customer
  from public.partner_final_customers
  where id = target_customer_id and company_id = target_company_id and archived_at is null;
  if customer.id is null then return null; end if;

  select coalesce(jsonb_agg(to_jsonb(estimate_row) order by estimate_row.updated_at desc), '[]'::jsonb),
         max(estimate_row.updated_at)
    into related_estimates, last_activity
  from (
    select estimate.id, estimate.estimate_number, estimate.name, estimate.project_name,
      estimate.status, estimate.updated_at
    from public.estimates estimate
    where estimate.final_customer_id = customer.id and estimate.archived_at is null
    order by estimate.updated_at desc, estimate.id
    limit least(greatest(coalesce(estimate_limit, 50), 1), 100)
  ) estimate_row;

  return jsonb_build_object(
    'customer', to_jsonb(customer),
    'estimates', related_estimates,
    'last_activity_at', last_activity
  );
end;
$$;

create or replace function public.create_partner_final_customer_v2(
  target_company_id uuid,
  target_display_name text,
  target_customer_type text,
  target_fiscal_code text default '',
  target_locality text default '',
  target_industry_code text default null
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
     or target_customer_type not in ('company', 'individual')
     or (target_industry_code is not null and target_industry_code not in (
       'retail', 'horeca', 'manufacturing', 'logistics', 'construction', 'residential',
       'office_commercial', 'banking_finance', 'education', 'healthcare',
       'government_public', 'critical_infrastructure', 'agriculture', 'security_integrator', 'other'
     )) then
    raise exception 'Final customer data is invalid.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.partner_final_customers existing
    where existing.company_id = target_company_id and existing.archived_at is null
      and (lower(btrim(existing.display_name)) = lower(btrim(target_display_name))
        or (nullif(btrim(target_fiscal_code), '') is not null and upper(existing.fiscal_code) = upper(btrim(target_fiscal_code))))
  ) then
    raise exception 'A matching final customer already exists.' using errcode = '23505';
  end if;

  insert into public.partner_final_customers (
    company_id, display_name, customer_type, fiscal_code, locality, industry_code, created_by, updated_by
  ) values (
    target_company_id, btrim(target_display_name), target_customer_type,
    nullif(upper(btrim(target_fiscal_code)), ''), nullif(btrim(target_locality), ''),
    target_industry_code, auth.uid(), auth.uid()
  ) returning * into created;
  insert into public.partner_final_customer_events (customer_id, company_id, actor_user_id, event_type, metadata)
  values (created.id, created.company_id, auth.uid(), 'created', jsonb_build_object('industryCode', created.industry_code));
  return created;
end;
$$;

create or replace function public.update_partner_final_customer_v2(
  target_company_id uuid,
  target_customer_id uuid,
  expected_revision integer,
  target_display_name text,
  target_customer_type text,
  target_fiscal_code text default '',
  target_locality text default '',
  target_industry_code text default null
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
     or target_customer_type not in ('company', 'individual')
     or (target_industry_code is not null and target_industry_code not in (
       'retail', 'horeca', 'manufacturing', 'logistics', 'construction', 'residential',
       'office_commercial', 'banking_finance', 'education', 'healthcare',
       'government_public', 'critical_infrastructure', 'agriculture', 'security_integrator', 'other'
     )) then
    raise exception 'Final customer data is invalid.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.partner_final_customers existing
    where existing.company_id = target_company_id and existing.archived_at is null and existing.id <> target.id
      and (lower(btrim(existing.display_name)) = lower(btrim(target_display_name))
        or (nullif(btrim(target_fiscal_code), '') is not null and upper(existing.fiscal_code) = upper(btrim(target_fiscal_code))))
  ) then
    raise exception 'A matching final customer already exists.' using errcode = '23505';
  end if;

  update public.partner_final_customers set
    display_name = btrim(target_display_name), customer_type = target_customer_type,
    fiscal_code = nullif(upper(btrim(target_fiscal_code)), ''),
    locality = nullif(btrim(target_locality), ''), industry_code = target_industry_code,
    updated_by = auth.uid()
  where id = target.id returning * into target;
  insert into public.partner_final_customer_events (customer_id, company_id, actor_user_id, event_type, metadata)
  values (target.id, target.company_id, auth.uid(), 'updated', jsonb_build_object('industryCode', target.industry_code));
  return target;
end;
$$;

revoke all on function public.list_partner_final_customers(uuid, text, text, integer, integer) from public, anon;
revoke all on function public.get_partner_final_customer_detail(uuid, uuid, integer) from public, anon;
revoke all on function public.create_partner_final_customer_v2(uuid, text, text, text, text, text) from public, anon;
revoke all on function public.update_partner_final_customer_v2(uuid, uuid, integer, text, text, text, text, text) from public, anon;
revoke all on function public.search_partner_final_customers(uuid, text, integer) from public, anon;

grant execute on function public.list_partner_final_customers(uuid, text, text, integer, integer) to authenticated;
grant execute on function public.get_partner_final_customer_detail(uuid, uuid, integer) to authenticated;
grant execute on function public.create_partner_final_customer_v2(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.update_partner_final_customer_v2(uuid, uuid, integer, text, text, text, text, text) to authenticated;
grant execute on function public.search_partner_final_customers(uuid, text, integer) to authenticated;
