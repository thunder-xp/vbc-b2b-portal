alter function public.save_estimate_commercial_draft(uuid, integer, jsonb, jsonb, jsonb, jsonb)
rename to save_estimate_commercial_draft_impl;

revoke all on function public.save_estimate_commercial_draft_impl(uuid, integer, jsonb, jsonb, jsonb, jsonb)
from public, anon, authenticated;

create function public.save_estimate_commercial_draft(
  target_estimate_id uuid,
  expected_revision integer,
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
declare
  current_section_count integer;
  result public.estimates;
begin
  if jsonb_typeof(section_payload) <> 'array' then
    raise exception 'Estimate sections are invalid.' using errcode = '22023';
  end if;

  select count(*) into current_section_count
  from public.estimate_sections
  where estimate_id = target_estimate_id;

  if current_section_count > jsonb_array_length(section_payload)
     or exists (
       select 1
       from public.estimate_sections section
       where section.estimate_id = target_estimate_id
         and not exists (
           select 1 from jsonb_array_elements(section_payload) value
           where value->>'id' = section.id::text
         )
     ) then
    raise exception 'All existing estimate sections must be retained.' using errcode = '22023';
  end if;

  select public.save_estimate_commercial_draft_impl(
    target_estimate_id,
    expected_revision,
    estimate_settings,
    section_payload,
    line_payload,
    charge_payload
  ) into result;
  return result;
end;
$$;

revoke all on function public.save_estimate_commercial_draft(uuid, integer, jsonb, jsonb, jsonb, jsonb)
from public, anon;
grant execute on function public.save_estimate_commercial_draft(uuid, integer, jsonb, jsonb, jsonb, jsonb)
to authenticated;
