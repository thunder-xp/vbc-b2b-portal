-- Serialize concurrent retries for the same user-scoped estimate creation key.
create or replace function public.create_estimate_v2(
  target_company_id uuid,
  estimate_name text,
  target_customer_name text,
  target_project_name text,
  target_currency_code text,
  target_validity_days integer,
  target_request_key uuid
)
returns public.estimates
language plpgsql
security definer
set search_path = public
as $$
declare
  created public.estimates;
begin
  if target_request_key is null then
    raise exception 'Estimate request key is required.' using errcode = '22023';
  end if;
  if not public.can_access_estimates(target_company_id, 'estimates.manage') then
    raise exception 'Estimate is not available.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.price_types price_type
    where price_type.is_active = true
      and price_type.currency_status = 'resolved'
      and price_type.currency_code = target_currency_code
  ) then
    raise exception 'Estimate currency is not available.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(auth.uid()::text || ':' || target_request_key::text, 0)
  );

  select * into created
  from public.estimates
  where created_by = auth.uid() and creation_request_key = target_request_key;

  if created.id is not null then
    if created.company_id <> target_company_id
      or created.name <> estimate_name
      or created.currency_code <> target_currency_code
      or created.validity_days <> target_validity_days
      or coalesce(created.customer_name, '') <> coalesce(nullif(target_customer_name, ''), '')
      or coalesce(created.project_name, '') <> coalesce(nullif(target_project_name, ''), '')
    then
      raise exception 'Estimate request key was reused with different data.' using errcode = '22023';
    end if;
    return created;
  end if;

  insert into public.estimates (
    company_id, created_by, name, customer_name, project_name, currency_code,
    validity_days, creation_request_key
  ) values (
    target_company_id, auth.uid(), estimate_name, nullif(target_customer_name, ''),
    nullif(target_project_name, ''), target_currency_code, target_validity_days,
    target_request_key
  )
  returning * into created;

  insert into public.estimate_sections (estimate_id, name, sort_order)
  values (created.id, 'Оборудование и услуги', 0);
  insert into public.estimate_events (estimate_id, actor_user_id, event_type)
  values (created.id, auth.uid(), 'created');
  return created;
end;
$$;

revoke all on function public.create_estimate_v2(uuid, text, text, text, text, integer, uuid) from public, anon;
grant execute on function public.create_estimate_v2(uuid, text, text, text, text, integer, uuid) to authenticated;
