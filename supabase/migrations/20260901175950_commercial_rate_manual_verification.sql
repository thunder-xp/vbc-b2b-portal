create table public.commercial_exchange_rate_verifications (
  id uuid primary key default gen_random_uuid(),
  purpose text not null check (purpose in ('partner_price_usd_to_mdl', 'retail_price_usd_to_mdl')),
  portal_rate_id uuid not null references public.commercial_exchange_rates(id) on delete restrict,
  active_portal_rate numeric(18, 6) not null check (active_portal_rate > 0),
  active_portal_effective_date date not null,
  observed_1c_rate numeric(18, 6) not null check (observed_1c_rate > 0),
  observed_1c_effective_date date not null,
  evidence_note text not null check (char_length(btrim(evidence_note)) between 3 and 500),
  verification_comment text check (verification_comment is null or char_length(verification_comment) <= 1000),
  verification_status text not null check (verification_status in ('MATCHES_1C', 'DIFFERS_FROM_1C', 'VERIFIED_NO_CHANGE_REQUIRED')),
  verified_by uuid not null references public.user_profiles(id) on delete restrict,
  verified_at timestamptz not null default now()
);

create index commercial_exchange_rate_verifications_purpose_time_idx
  on public.commercial_exchange_rate_verifications (purpose, verified_at desc);

alter table public.commercial_exchange_rate_verifications enable row level security;
revoke all on table public.commercial_exchange_rate_verifications from public, anon, authenticated;

create policy commercial_rate_verifications_manager_read
on public.commercial_exchange_rate_verifications for select to authenticated
using (public.can_manage_commercial_rates());

grant select on table public.commercial_exchange_rate_verifications to authenticated;

create function public.prevent_commercial_rate_verification_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Commercial-rate verification history is immutable.' using errcode = '55000';
end;
$$;

create trigger prevent_commercial_rate_verification_mutation
before update or delete on public.commercial_exchange_rate_verifications
for each row execute function public.prevent_commercial_rate_verification_mutation();

create function public.save_manual_commercial_rate_verification(
  p_purpose text,
  p_observed_1c_rate numeric,
  p_observed_1c_effective_date date,
  p_evidence_note text,
  p_verification_comment text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid := auth.uid();
  portal_rate public.commercial_exchange_rates%rowtype;
  existing public.commercial_exchange_rate_verifications%rowtype;
  saved public.commercial_exchange_rate_verifications%rowtype;
  normalized_evidence text := btrim(p_evidence_note);
  normalized_comment text := nullif(btrim(p_verification_comment), '');
  result_status text;
begin
  if actor_id is null or not public.can_manage_commercial_rates() then
    raise exception 'Commercial-rate verification is forbidden.' using errcode = '42501';
  end if;
  if p_purpose not in ('partner_price_usd_to_mdl', 'retail_price_usd_to_mdl')
    or p_observed_1c_rate is null or p_observed_1c_rate = 'NaN'::numeric
    or p_observed_1c_rate <= 0 or p_observed_1c_rate > 1000 or scale(p_observed_1c_rate) > 8
    or p_observed_1c_effective_date is null or p_observed_1c_effective_date > current_date
    or char_length(normalized_evidence) not between 3 and 500
    or (normalized_comment is not null and char_length(normalized_comment) > 1000)
  then raise exception 'Invalid commercial-rate verification payload.' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtext('manual_commercial_rate:' || p_purpose));
  select * into portal_rate from public.commercial_exchange_rates
  where purpose = p_purpose and is_active = true and is_published = true for share;
  if portal_rate.id is null then raise exception 'No active portal commercial rate.' using errcode = 'P0002'; end if;

  result_status := case
    when portal_rate.rate = p_observed_1c_rate::numeric(18, 6)
      and portal_rate.effective_at::date = p_observed_1c_effective_date
      then 'VERIFIED_NO_CHANGE_REQUIRED'
    else 'DIFFERS_FROM_1C' end;

  select * into existing from public.commercial_exchange_rate_verifications
  where purpose = p_purpose and portal_rate_id = portal_rate.id
    and observed_1c_rate = p_observed_1c_rate::numeric(18, 6)
    and observed_1c_effective_date = p_observed_1c_effective_date
    and evidence_note = normalized_evidence
    and verification_comment is not distinct from normalized_comment
    and verification_status = result_status
  order by verified_at desc, id desc limit 1;
  if existing.id is not null then return jsonb_build_object('outcome', 'unchanged', 'verification', to_jsonb(existing)); end if;

  insert into public.commercial_exchange_rate_verifications (
    purpose, portal_rate_id, active_portal_rate, active_portal_effective_date,
    observed_1c_rate, observed_1c_effective_date, evidence_note,
    verification_comment, verification_status, verified_by
  ) values (
    p_purpose, portal_rate.id, portal_rate.rate, portal_rate.effective_at::date,
    p_observed_1c_rate, p_observed_1c_effective_date, normalized_evidence,
    normalized_comment, result_status, actor_id
  ) returning * into saved;
  return jsonb_build_object('outcome', 'saved', 'verification', to_jsonb(saved));
end;
$$;

create function public.publish_verified_commercial_exchange_rate(
  p_purpose text,
  p_observed_1c_rate numeric,
  p_observed_1c_effective_date date,
  p_evidence_note text,
  p_verification_comment text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  before_rate public.commercial_exchange_rates%rowtype;
  published jsonb;
  verification_result jsonb;
  saved public.commercial_exchange_rate_verifications%rowtype;
  existing public.commercial_exchange_rate_verifications%rowtype;
  normalized_evidence text := btrim(p_evidence_note);
  normalized_comment text := nullif(btrim(p_verification_comment), '');
begin
  if auth.uid() is null or not public.can_manage_commercial_rates() then
    raise exception 'Commercial-rate publication is forbidden.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('manual_commercial_rate:' || p_purpose));
  select rate.* into before_rate from public.commercial_exchange_rates rate
  where rate.purpose = p_purpose and rate.is_active = true and rate.is_published = true for update;
  if before_rate.id is not null
    and before_rate.rate = p_observed_1c_rate::numeric(18, 6)
    and before_rate.effective_at::date = p_observed_1c_effective_date
    and before_rate.source_note = normalized_evidence
    and before_rate.evidence_comment is not distinct from normalized_comment
  then
    select * into existing from public.commercial_exchange_rate_verifications
    where purpose = p_purpose and portal_rate_id = before_rate.id
      and observed_1c_rate = p_observed_1c_rate::numeric(18, 6)
      and observed_1c_effective_date = p_observed_1c_effective_date
      and evidence_note = normalized_evidence
      and verification_comment is not distinct from normalized_comment
    order by case verification_status when 'MATCHES_1C' then 0 else 1 end, verified_at desc, id desc limit 1;
    if existing.id is not null
    then
      verification_result := jsonb_build_object('outcome', 'unchanged', 'verification', to_jsonb(existing));
    else
      verification_result := public.save_manual_commercial_rate_verification(
        p_purpose, p_observed_1c_rate, p_observed_1c_effective_date,
        p_evidence_note, p_verification_comment
      );
    end if;
    return jsonb_build_object(
      'publicationOutcome', 'unchanged', 'rate', to_jsonb(before_rate),
      'verificationOutcome', verification_result->>'outcome',
      'verification', verification_result->'verification'
    );
  end if;
  published := public.publish_manual_commercial_exchange_rate_v2(
    p_purpose, p_observed_1c_rate, p_observed_1c_effective_date::timestamptz,
    btrim(p_evidence_note), nullif(btrim(p_verification_comment), '')
  );
  if before_rate.id is distinct from (published->>'id')::uuid then
    insert into public.commercial_exchange_rate_verifications (
      purpose, portal_rate_id, active_portal_rate, active_portal_effective_date,
      observed_1c_rate, observed_1c_effective_date, evidence_note,
      verification_comment, verification_status, verified_by
    ) values (
      p_purpose, (published->>'id')::uuid, p_observed_1c_rate, p_observed_1c_effective_date,
      p_observed_1c_rate, p_observed_1c_effective_date, normalized_evidence,
      normalized_comment, 'MATCHES_1C', auth.uid()
    ) returning * into saved;
    verification_result := jsonb_build_object('outcome', 'saved', 'verification', to_jsonb(saved));
  else
    verification_result := public.save_manual_commercial_rate_verification(
      p_purpose, p_observed_1c_rate, p_observed_1c_effective_date,
      p_evidence_note, p_verification_comment
    );
  end if;
  return jsonb_build_object(
    'publicationOutcome', case when before_rate.id = (published->>'id')::uuid then 'unchanged' else 'published' end,
    'rate', published,
    'verificationOutcome', verification_result->>'outcome',
    'verification', verification_result->'verification'
  );
end;
$$;

create function public.list_commercial_rate_verifications(p_limit integer default 40)
returns table (
  id uuid, purpose text, portal_rate_id uuid, active_portal_rate numeric,
  active_portal_effective_date date, observed_1c_rate numeric,
  observed_1c_effective_date date, evidence_note text, verification_comment text,
  verification_status text, verified_by uuid, verified_at timestamptz,
  verifier_name text, verifier_email text
)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.can_manage_commercial_rates() then
    raise exception 'Commercial-rate verification is forbidden.' using errcode = '42501';
  end if;
  return query select v.id, v.purpose, v.portal_rate_id, v.active_portal_rate,
    v.active_portal_effective_date, v.observed_1c_rate, v.observed_1c_effective_date,
    v.evidence_note, v.verification_comment, v.verification_status, v.verified_by,
    v.verified_at, p.full_name, p.email
  from public.commercial_exchange_rate_verifications v
  left join public.user_profiles p on p.id = v.verified_by
  order by v.verified_at desc limit greatest(1, least(coalesce(p_limit, 40), 100));
end;
$$;

revoke all on function public.prevent_commercial_rate_verification_mutation() from public, anon, authenticated;
revoke all on function public.save_manual_commercial_rate_verification(text,numeric,date,text,text) from public, anon, authenticated;
revoke all on function public.publish_verified_commercial_exchange_rate(text,numeric,date,text,text) from public, anon, authenticated;
revoke all on function public.list_commercial_rate_verifications(integer) from public, anon, authenticated;
grant execute on function public.save_manual_commercial_rate_verification(text,numeric,date,text,text) to authenticated;
grant execute on function public.publish_verified_commercial_exchange_rate(text,numeric,date,text,text) to authenticated;
grant execute on function public.list_commercial_rate_verifications(integer) to authenticated;

comment on table public.commercial_exchange_rate_verifications is 'Append-only manual evidence comparing active portal commercial rates with observed 1C values.';
