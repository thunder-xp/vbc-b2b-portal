-- Final commercial direction correction. Historical MDL-to-USD publications
-- remain auditable but cannot be active or newly published.

alter table public.commercial_exchange_rates
  drop constraint if exists commercial_exchange_rates_purpose_check,
  add constraint commercial_exchange_rates_purpose_check check (
    purpose is null or purpose in (
      'partner_price_usd_to_mdl',
      'retail_price_usd_to_mdl',
      'retail_price_mdl_to_usd'
    )
  );

-- Purpose-tagged manual rows remain auditable after they are superseded.
-- Publication state identifies the current snapshot, not whether metadata is valid.
alter table public.commercial_exchange_rates
  drop constraint if exists commercial_exchange_rates_manual_fields_check,
  add constraint commercial_exchange_rates_manual_fields_check check (
    purpose is null or (
      effective_at is not null
      and published_by is not null
      and source_type = 'manual_from_1c'
      and source_note is not null
    )
  );

alter table public.commercial_exchange_rate_audit_events
  drop constraint if exists commercial_exchange_rate_audit_events_purpose_check,
  add constraint commercial_exchange_rate_audit_events_purpose_check check (
    purpose in (
      'partner_price_usd_to_mdl',
      'retail_price_usd_to_mdl',
      'retail_price_mdl_to_usd'
    )
  );

update public.commercial_exchange_rates
set is_active = false,
    is_published = false,
    updated_at = now()
where purpose = 'retail_price_mdl_to_usd'
  and (is_active = true or is_published = true);

create or replace function public.publish_manual_commercial_exchange_rate_v2(
  p_purpose text,
  p_rate numeric,
  p_effective_at timestamptz,
  p_source_note text,
  p_evidence_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  current_rate public.commercial_exchange_rates%rowtype;
  published_rate public.commercial_exchange_rates%rowtype;
  normalized_source_note text := btrim(p_source_note);
  normalized_evidence_comment text := nullif(btrim(p_evidence_comment), '');
begin
  if actor_id is null or not public.can_manage_commercial_rates() then
    raise exception 'Commercial-rate publication is forbidden.' using errcode = '42501';
  end if;

  if p_purpose not in ('partner_price_usd_to_mdl', 'retail_price_usd_to_mdl')
    or p_rate is null
    or p_rate = 'NaN'::numeric
    or p_rate <= 0
    or p_rate > 1000
    or scale(p_rate) > 8
    or p_effective_at is null
    or p_effective_at > now() + interval '5 minutes'
    or char_length(normalized_source_note) not between 3 and 500
    or (normalized_evidence_comment is not null and char_length(normalized_evidence_comment) > 1000)
  then
    raise exception 'Invalid commercial-rate publication payload.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('manual_commercial_rate:' || p_purpose));

  select * into current_rate
  from public.commercial_exchange_rates
  where purpose = p_purpose
    and is_active = true
    and is_published = true
  for update;

  if current_rate.id is not null and p_effective_at < current_rate.effective_at then
    raise exception 'An older commercial rate cannot replace the active rate.' using errcode = '22023';
  end if;

  if current_rate.id is not null then
    update public.commercial_exchange_rates
    set is_active = false,
        is_published = false,
        updated_at = now()
    where id = current_rate.id;
  end if;

  insert into public.commercial_exchange_rates (
    source_code,
    base_currency,
    quote_currency,
    rate_direction,
    rate,
    effective_date,
    purpose,
    effective_at,
    source_updated_at,
    published_at,
    published_by,
    source_type,
    source_note,
    evidence_comment,
    previous_rate_id,
    is_active,
    is_published
  ) values (
    p_purpose || ':' || to_char(clock_timestamp() at time zone 'UTC', 'YYYYMMDDHH24MISSUS'),
    'USD',
    'MDL',
    'quote_per_base',
    p_rate,
    p_effective_at::date,
    p_purpose,
    p_effective_at,
    p_effective_at,
    now(),
    actor_id,
    'manual_from_1c',
    normalized_source_note,
    normalized_evidence_comment,
    current_rate.id,
    true,
    true
  )
  returning * into published_rate;

  insert into public.commercial_exchange_rate_audit_events (
    rate_id,
    purpose,
    event_type,
    actor_user_id
  ) values (
    published_rate.id,
    p_purpose,
    'published',
    actor_id
  );

  return to_jsonb(published_rate);
end;
$$;

revoke all on function public.publish_manual_commercial_exchange_rate_v2(text, numeric, timestamptz, text, text)
from public, anon, authenticated;
grant execute on function public.publish_manual_commercial_exchange_rate_v2(text, numeric, timestamptz, text, text)
to authenticated;

comment on column public.commercial_exchange_rates.purpose is
  'Stable formula purpose. retail_price_mdl_to_usd is retained only for historical audit and must not be active.';
