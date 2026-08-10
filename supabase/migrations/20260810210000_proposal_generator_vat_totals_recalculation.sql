create or replace function public.create_estimate_from_generator_v3(
  target_company_id uuid,
  target_session_id uuid,
  target_final_customer_id uuid,
  estimate_name text,
  target_project_name text,
  target_currency_code text,
  target_vat_mode text,
  target_validity_days integer,
  target_request_key uuid,
  target_request_fingerprint text,
  generated_lines jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_estimate_id uuid;
  created_estimate_id uuid;
begin
  if target_vat_mode not in ('none', 'included') then
    raise exception 'Estimate VAT mode is invalid.' using errcode = '22023';
  end if;

  select estimate_id
  into existing_estimate_id
  from public.estimate_generator_sessions
  where id = target_session_id;

  created_estimate_id := public.create_estimate_from_generator_v2(
    target_company_id,
    target_session_id,
    target_final_customer_id,
    estimate_name,
    target_project_name,
    target_currency_code,
    'none',
    target_validity_days,
    target_request_key,
    target_request_fingerprint,
    generated_lines
  );

  if existing_estimate_id is not null then
    return created_estimate_id;
  end if;

  update public.estimates
  set vat_mode = target_vat_mode,
      vat_rate_percent = case when target_vat_mode = 'included' then 20 else 0 end
  where id = created_estimate_id
    and company_id = target_company_id;

  perform public.recalculate_estimate_totals(created_estimate_id);

  return created_estimate_id;
end;
$$;

revoke all on function public.create_estimate_from_generator_v3(
  uuid, uuid, uuid, text, text, text, text, integer, uuid, text, jsonb
) from public, anon;

grant execute on function public.create_estimate_from_generator_v3(
  uuid, uuid, uuid, text, text, text, text, integer, uuid, text, jsonb
) to authenticated;
