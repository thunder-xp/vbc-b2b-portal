begin;

create table public.partner_company_one_c_manual_sync_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  correlation_id uuid not null unique,
  sync_id uuid null references public.one_c_counterparty_directory_syncs(sync_id) on delete restrict,
  counterparty_external_1c_id text not null,
  outcome_code text not null check (outcome_code in ('published', 'unchanged')),
  snapshot_hash text not null,
  previous_values jsonb not null default '{}'::jsonb,
  proposed_values jsonb not null default '{}'::jsonb,
  reason text not null check (char_length(btrim(reason)) between 10 and 500),
  occurred_at timestamptz not null default now()
);

create index partner_company_one_c_manual_sync_events_company_idx
  on public.partner_company_one_c_manual_sync_events(company_id, occurred_at desc);

alter table public.partner_company_one_c_manual_sync_events enable row level security;
revoke all on table public.partner_company_one_c_manual_sync_events from public, anon, authenticated;

create trigger prevent_partner_company_one_c_manual_sync_event_mutation
before update or delete on public.partner_company_one_c_manual_sync_events
for each row execute function public.prevent_onboarding_history_mutation();

create or replace function public.publish_admin_partner_company_one_c_snapshot(
  p_company_id uuid,
  p_snapshot jsonb,
  p_previous_values jsonb,
  p_proposed_values jsonb,
  p_reason text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  company public.partner_companies%rowtype;
  bound_counterparty public.one_c_counterparties%rowtype;
  sync_id uuid := gen_random_uuid();
  counterparty jsonb := p_snapshot->'counterparty';
  contracts jsonb := coalesce(p_snapshot->'contracts', '[]'::jsonb);
  price_types jsonb := coalesce(p_snapshot->'priceTypes', '[]'::jsonb);
  counterparty_ref text := lower(btrim(coalesce(counterparty->>'reference', '')));
  snapshot_hash text := encode(extensions.digest(convert_to(p_snapshot::text, 'UTF8'), 'sha256'), 'hex');
  previous_event public.partner_company_one_c_manual_sync_events%rowtype;
  now_at timestamptz := now();
begin
  if actor_id is null
    or not public.has_internal_permission('admin.integrations.manage')
    or not public.has_internal_permission('admin.partner_integrity.manage') then
    raise exception 'Manual 1C synchronization is not allowed.' using errcode = '42501';
  end if;
  if p_company_id is null or p_correlation_id is null
    or char_length(btrim(coalesce(p_reason, ''))) not between 10 and 500
    or jsonb_typeof(counterparty) <> 'object'
    or jsonb_typeof(contracts) <> 'array'
    or jsonb_typeof(price_types) <> 'array'
    or jsonb_array_length(contracts) > 50
    or jsonb_array_length(price_types) > 50 then
    raise exception 'Invalid manual 1C synchronization request.' using errcode = '22023';
  end if;

  select * into previous_event
  from public.partner_company_one_c_manual_sync_events event
  where event.correlation_id = p_correlation_id;
  if previous_event.id is not null then
    return jsonb_build_object(
      'code', 'MANUAL_ONE_C_SNAPSHOT_PUBLISHED',
      'correlationId', p_correlation_id,
      'syncId', previous_event.sync_id,
      'unchanged', true
    );
  end if;

  select * into company from public.partner_companies where id = p_company_id for update;
  select * into bound_counterparty
  from public.one_c_counterparties source
  where source.is_published and lower(source.external_1c_id) = counterparty_ref
  order by source.synchronized_at desc, source.id desc
  limit 1;
  if company.id is null
    or counterparty_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or lower(coalesce(company.external_1c_id, '')) <> counterparty_ref
    or lower(coalesce(counterparty->>'reference', '')) <> counterparty_ref
    or nullif(btrim(counterparty->>'code'), '') is distinct from company.external_1c_code
    or (
      bound_counterparty.id is not null
      and bound_counterparty.normalized_fiscal_code is not null
      and regexp_replace(coalesce(counterparty->>'fiscalCode', ''), '[^0-9]', '', 'g')
        <> bound_counterparty.normalized_fiscal_code
    ) then
    return jsonb_build_object(
      'code', 'MANUAL_ONE_C_SNAPSHOT_CONFLICT',
      'correlationId', p_correlation_id,
      'unchanged', true
    );
  end if;

  if exists (
    select 1 from jsonb_array_elements(contracts) value
    where lower(coalesce(value->>'ownerReference', '')) <> counterparty_ref
      or coalesce(value->>'reference', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) or (
    select count(*) from jsonb_array_elements(contracts)
  ) <> (
    select count(distinct lower(value->>'reference')) from jsonb_array_elements(contracts) value
  ) then
    raise exception 'Invalid or duplicate contract snapshot.' using errcode = '22023';
  end if;

  select * into previous_event
  from public.partner_company_one_c_manual_sync_events event
  where event.company_id = company.id and event.outcome_code = 'published'
  order by event.occurred_at desc, event.id desc
  limit 1;
  if previous_event.snapshot_hash = snapshot_hash then
    insert into public.partner_company_one_c_manual_sync_events(
      company_id, actor_user_id, correlation_id, sync_id,
      counterparty_external_1c_id, outcome_code, snapshot_hash,
      previous_values, proposed_values, reason
    ) values (
      company.id, actor_id, p_correlation_id, previous_event.sync_id,
      counterparty_ref, 'unchanged', snapshot_hash,
      coalesce(p_previous_values, '{}'::jsonb), coalesce(p_proposed_values, '{}'::jsonb), btrim(p_reason)
    );
    return jsonb_build_object(
      'code', 'MANUAL_ONE_C_SNAPSHOT_PUBLISHED', 'correlationId', p_correlation_id,
      'syncId', previous_event.sync_id, 'unchanged', true
    );
  end if;

  insert into public.one_c_counterparty_directory_syncs(
    sync_id, status, started_at, finished_at, source_counterparties,
    active_counterparties, with_fiscal_code, without_fiscal_code,
    contracts, price_type_relationships, portal_linked, published_counterparties,
    fetched_counterparties, staged_counterparties, pages_processed
  ) values (
    sync_id, 'succeeded', now_at, now_at, 1,
    case when coalesce((counterparty->>'active')::boolean, false) then 1 else 0 end,
    case when nullif(btrim(counterparty->>'fiscalCode'), '') is null then 0 else 1 end,
    case when nullif(btrim(counterparty->>'fiscalCode'), '') is null then 1 else 0 end,
    jsonb_array_length(contracts), jsonb_array_length(price_types), 1, 1, 1, 1, 3
  );

  update public.one_c_counterparties
  set is_published = false, updated_at = now_at
  where is_published and lower(external_1c_id) = counterparty_ref;
  update public.one_c_counterparty_contracts
  set is_published = false
  where is_published and lower(counterparty_external_1c_id) = counterparty_ref;
  update public.one_c_counterparty_price_profiles
  set is_published = false
  where is_published and lower(counterparty_external_1c_id) = counterparty_ref;

  insert into public.one_c_counterparties(
    sync_id, external_1c_id, external_code, name, normalized_name,
    fiscal_code, normalized_fiscal_code, is_active, is_deleted,
    portal_company_id, synchronization_version, synchronized_at, is_published
  ) values (
    sync_id, counterparty_ref, counterparty->>'code', counterparty->>'name',
    lower(btrim(counterparty->>'name')), nullif(btrim(counterparty->>'fiscalCode'), ''),
    nullif(regexp_replace(coalesce(counterparty->>'fiscalCode', ''), '[^0-9]', '', 'g'), ''),
    coalesce((counterparty->>'active')::boolean, false), false,
    company.id, sync_id::text, now_at, true
  );

  insert into public.one_c_counterparty_contracts(
    sync_id, counterparty_external_1c_id, external_1c_id, code, name,
    contract_number, contract_date, contract_type, organization_external_1c_id,
    contract_currency_external_1c_id, is_signed, is_default,
    price_type_external_1c_id, is_active, is_deleted, synchronized_at, is_published
  )
  select sync_id, counterparty_ref, value->>'reference', nullif(value->>'code', ''),
    value->>'name', nullif(value->>'number', ''), nullif(value->>'date', ''),
    nullif(value->>'contractType', ''), nullif(value->>'organizationReference', ''),
    nullif(value->>'settlementCurrencyReference', ''), (value->>'signed')::boolean,
    coalesce((value->>'default')::boolean, false), nullif(value->>'priceTypeReference', ''),
    coalesce((value->>'active')::boolean, false), coalesce((value->>'deleted')::boolean, false),
    now_at, true
  from jsonb_array_elements(contracts) value;

  insert into public.one_c_counterparty_price_profiles(
    sync_id, counterparty_external_1c_id, external_1c_id, code, name,
    currency_external_1c_id, is_active, is_deleted, synchronized_at, is_published
  )
  select sync_id, counterparty_ref, value->>'reference', nullif(value->>'code', ''),
    value->>'name', nullif(value->>'currencyReference', ''),
    coalesce((value->>'active')::boolean, false), false, now_at, true
  from jsonb_array_elements(price_types) value;

  insert into public.partner_company_one_c_manual_sync_events(
    company_id, actor_user_id, correlation_id, sync_id,
    counterparty_external_1c_id, outcome_code, snapshot_hash,
    previous_values, proposed_values, reason
  ) values (
    company.id, actor_id, p_correlation_id, sync_id,
    counterparty_ref, 'published', snapshot_hash,
    coalesce(p_previous_values, '{}'::jsonb), coalesce(p_proposed_values, '{}'::jsonb), btrim(p_reason)
  );

  return jsonb_build_object(
    'code', 'MANUAL_ONE_C_SNAPSHOT_PUBLISHED', 'correlationId', p_correlation_id,
    'syncId', sync_id, 'unchanged', false
  );
end;
$$;

revoke all on function public.publish_admin_partner_company_one_c_snapshot(
  uuid, jsonb, jsonb, jsonb, text, uuid
) from public, anon;
grant execute on function public.publish_admin_partner_company_one_c_snapshot(
  uuid, jsonb, jsonb, jsonb, text, uuid
) to authenticated;

comment on table public.partner_company_one_c_manual_sync_events is
  'Append-only audit for bounded, explicit Partner Company 1C synchronizations.';
comment on function public.publish_admin_partner_company_one_c_snapshot(uuid, jsonb, jsonb, jsonb, text, uuid) is
  'Atomically refreshes only the verified bound counterparty read model; it never changes the binding or any unrelated 1C projection.';

create or replace function public.get_admin_partner_company_one_c_manual_sync_events(
  p_company_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select case
    when not public.has_internal_permission('admin.companies.view') then '[]'::jsonb
    else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', event.id,
        'outcomeCode', event.outcome_code,
        'counterpartyRef', event.counterparty_external_1c_id,
        'previousValues', event.previous_values,
        'proposedValues', event.proposed_values,
        'reason', event.reason,
        'occurredAt', event.occurred_at,
        'actorName', coalesce(nullif(btrim(profile.full_name), ''), profile.email)
      ) order by event.occurred_at desc, event.id desc)
      from (
        select source.*
        from public.partner_company_one_c_manual_sync_events source
        where source.company_id = p_company_id
        order by source.occurred_at desc, source.id desc
        limit 10
      ) event
      left join public.user_profiles profile on profile.id = event.actor_user_id
    ), '[]'::jsonb)
  end;
$$;

revoke all on function public.get_admin_partner_company_one_c_manual_sync_events(uuid)
  from public, anon;
grant execute on function public.get_admin_partner_company_one_c_manual_sync_events(uuid)
  to authenticated;

commit;
