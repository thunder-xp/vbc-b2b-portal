create table public.estimate_section_insertions (
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  request_key uuid not null,
  request_fingerprint text not null,
  section_id uuid not null references public.estimate_sections(id) on delete cascade,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  primary key (estimate_id, request_key),
  constraint estimate_section_insertions_fingerprint_check
    check (request_fingerprint ~ '^[0-9a-f]{64}$')
);

comment on table public.estimate_section_insertions is
  'Private idempotency ledger for governed estimate section creation.';

alter table public.estimate_section_insertions enable row level security;
revoke all on table public.estimate_section_insertions from public, anon, authenticated;

create or replace function public.add_estimate_section_v2(
  target_estimate_id uuid,
  expected_revision integer,
  target_request_key uuid,
  target_request_fingerprint text,
  target_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.estimates;
  prior public.estimate_section_insertions;
  created_section public.estimate_sections;
  next_sort_order integer;
begin
  if target_request_key is null
     or target_request_fingerprint is null
     or target_request_fingerprint !~ '^[0-9a-f]{64}$'
     or target_name is null
     or char_length(btrim(target_name)) not between 1 and 120 then
    raise exception 'Estimate section request is invalid.' using errcode = '22023';
  end if;

  select * into target
  from public.estimates
  where id = target_estimate_id
  for update;

  if target.id is null or target.status <> 'draft'
     or not public.can_access_estimates(target.company_id, 'estimates.manage')
     or not public.can_access_estimates(target.company_id, 'estimates.pricing.manage') then
    raise exception 'Estimate draft is not available.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(auth.uid()::text || ':' || target.id::text || ':' || target_request_key::text, 0)
  );

  select * into prior
  from public.estimate_section_insertions
  where estimate_id = target.id and request_key = target_request_key;

  if prior.estimate_id is not null then
    if prior.created_by <> auth.uid()
       or prior.request_fingerprint <> target_request_fingerprint then
      raise exception 'Estimate section request key was reused with different data.' using errcode = '22023';
    end if;
    return jsonb_build_object('section_id', prior.section_id, 'repeated', true);
  end if;

  if target.revision <> expected_revision then
    raise exception 'Estimate was changed by another session.' using errcode = '40001';
  end if;
  if (select count(*) from public.estimate_sections where estimate_id = target.id) >= 100 then
    raise exception 'Estimate section limit was reached.' using errcode = '22023';
  end if;

  select coalesce(max(sort_order), -1) + 1 into next_sort_order
  from public.estimate_sections
  where estimate_id = target.id;

  insert into public.estimate_sections (estimate_id, name, sort_order, show_subtotal, discount_percent)
  values (target.id, btrim(target_name), next_sort_order, true, 0)
  returning * into created_section;

  update public.estimates set updated_at = now() where id = target.id;

  insert into public.estimate_section_insertions (
    estimate_id, request_key, request_fingerprint, section_id, created_by
  ) values (
    target.id, target_request_key, target_request_fingerprint, created_section.id, auth.uid()
  );

  insert into public.estimate_events (estimate_id, actor_user_id, event_type)
  values (target.id, auth.uid(), 'section_created');

  return jsonb_build_object('section_id', created_section.id, 'repeated', false);
end;
$$;

revoke all on function public.add_estimate_section_v2(uuid, integer, uuid, text, text)
  from public, anon;
grant execute on function public.add_estimate_section_v2(uuid, integer, uuid, text, text)
  to authenticated;
