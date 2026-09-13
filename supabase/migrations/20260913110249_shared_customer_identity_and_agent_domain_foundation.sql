-- Additive shared customer identity correlation root.
-- Existing Partner/Estimate and Retail runtime identities remain authoritative
-- inside their bounded contexts. This layer never owns commercial truth.

create schema if not exists private;

create table public.customer_identities (
  id uuid primary key default gen_random_uuid(),
  identity_kind text not null,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_identities_kind_check
    check (identity_kind in ('PERSON', 'LEGAL_ENTITY')),
  constraint customer_identities_status_check
    check (status in ('ACTIVE', 'REVIEW_REQUIRED', 'RESOLVED', 'RETIRED'))
);

comment on table public.customer_identities is
  'Minimal Portal-owned customer identity correlation root. It owns no profile, order, price, debt, estimate, attribution, or accounting truth.';

create table public.customer_identity_keys (
  id uuid primary key default gen_random_uuid(),
  customer_identity_id uuid not null references public.customer_identities(id) on delete restrict,
  key_type text not null,
  key_hash text not null,
  key_version integer not null,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  revoked_at timestamptz null,
  constraint customer_identity_keys_type_check
    check (key_type in ('PHONE', 'EMAIL', 'LEGAL_IDENTIFIER')),
  constraint customer_identity_keys_hash_check
    check (key_hash ~ '^[0-9a-f]{64}$'),
  constraint customer_identity_keys_version_check check (key_version > 0),
  constraint customer_identity_keys_revocation_check
    check (revoked_at is null or revoked_at >= created_at)
);

comment on table public.customer_identity_keys is
  'Versioned keyed-HMAC identity evidence. Plain normalized identifiers are never stored in this shared table.';

create table public.customer_external_refs (
  id uuid primary key default gen_random_uuid(),
  customer_identity_id uuid not null references public.customer_identities(id) on delete restrict,
  system text not null,
  entity_type text not null,
  external_id text not null,
  verified_at timestamptz null,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  revoked_at timestamptz null,
  constraint customer_external_refs_system_check
    check (char_length(btrim(system)) between 1 and 40),
  constraint customer_external_refs_entity_check
    check (char_length(btrim(entity_type)) between 1 and 80),
  constraint customer_external_refs_id_check
    check (char_length(btrim(external_id)) between 1 and 200),
  constraint customer_external_refs_status_check
    check (status in ('ACTIVE', 'REVOKED', 'CONFLICT')),
  constraint customer_external_refs_revocation_check
    check ((status = 'REVOKED') = (revoked_at is not null))
);

comment on table public.customer_external_refs is
  'Governed external identity mappings such as 1C counterparties. The shared root remains source-system neutral.';

create table public.customer_identity_reconciliation_cases (
  id uuid primary key default gen_random_uuid(),
  case_type text not null,
  status text not null default 'UNREVIEWED',
  left_customer_identity_id uuid null references public.customer_identities(id) on delete restrict,
  right_customer_identity_id uuid null references public.customer_identities(id) on delete restrict,
  reason_code text not null,
  safe_evidence jsonb not null default '{}'::jsonb,
  resolved_by uuid null references public.user_profiles(id) on delete restrict,
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint customer_identity_reconciliation_type_check
    check (case_type in ('AMBIGUOUS', 'CONFLICT')),
  constraint customer_identity_reconciliation_status_check
    check (status in ('UNREVIEWED', 'MATCHED', 'AMBIGUOUS', 'CONFLICT', 'RESOLVED')),
  constraint customer_identity_reconciliation_reason_check
    check (reason_code in ('MULTIPLE_MATCHES', 'IDENTIFIER_CONFLICT')),
  constraint customer_identity_reconciliation_evidence_check
    check (jsonb_typeof(safe_evidence) = 'object'),
  constraint customer_identity_reconciliation_resolution_check
    check ((resolved_at is null and resolved_by is null) or (resolved_at is not null and resolved_by is not null)),
  constraint customer_identity_reconciliation_distinct_roots_check
    check (left_customer_identity_id is null or right_customer_identity_id is null or left_customer_identity_id <> right_customer_identity_id)
);

create table public.customer_identity_events (
  id uuid primary key default gen_random_uuid(),
  customer_identity_id uuid not null references public.customer_identities(id) on delete restrict,
  actor_user_id uuid null references public.user_profiles(id) on delete restrict,
  event_type text not null,
  source_context text null,
  source_record_id uuid null,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint customer_identity_events_type_check check (event_type in (
    'IDENTITY_CREATED', 'KEY_ATTACHED', 'KEY_REVOKED', 'EXTERNAL_REF_ATTACHED',
    'EXTERNAL_REF_REVOKED', 'CONTEXT_LINKED', 'CONTEXT_UNLINKED',
    'CONTEXT_RELINKED', 'AMBIGUITY_DETECTED', 'CONFLICT_DETECTED',
    'ADMIN_RESOLUTION'
  )),
  constraint customer_identity_events_context_check
    check (source_context is null or source_context in ('PARTNER_FINAL_CUSTOMER', 'RETAIL_CUSTOMER', 'AGENT_REFERRAL', 'FINAL_CUSTOMER_ACCOUNT', '1C')),
  constraint customer_identity_events_metadata_check
    check (jsonb_typeof(safe_metadata) = 'object')
);

alter table public.partner_final_customers
  add column customer_identity_id uuid null references public.customer_identities(id) on delete restrict;

alter table public.retail_customers
  add column customer_identity_id uuid null references public.customer_identities(id) on delete restrict;

create index customer_identity_keys_lookup_idx
  on public.customer_identity_keys (key_type, key_version, key_hash, verified, customer_identity_id)
  where revoked_at is null;
create unique index customer_identity_keys_root_unique_idx
  on public.customer_identity_keys (customer_identity_id, key_type, key_version, key_hash)
  where revoked_at is null;
create index customer_identity_keys_identity_idx
  on public.customer_identity_keys (customer_identity_id, created_at desc);

create unique index customer_external_refs_active_unique_idx
  on public.customer_external_refs (system, entity_type, external_id)
  where status = 'ACTIVE';
create index customer_external_refs_identity_idx
  on public.customer_external_refs (customer_identity_id, created_at desc);

create index customer_identity_reconciliation_status_idx
  on public.customer_identity_reconciliation_cases (status, created_at, id)
  where status <> 'RESOLVED';
create index customer_identity_reconciliation_left_idx
  on public.customer_identity_reconciliation_cases (left_customer_identity_id, created_at desc)
  where left_customer_identity_id is not null;
create index customer_identity_reconciliation_right_idx
  on public.customer_identity_reconciliation_cases (right_customer_identity_id, created_at desc)
  where right_customer_identity_id is not null;

create index customer_identity_events_identity_created_idx
  on public.customer_identity_events (customer_identity_id, created_at, id);
create index customer_identity_events_actor_idx
  on public.customer_identity_events (actor_user_id, created_at desc)
  where actor_user_id is not null;

create index partner_final_customers_shared_identity_idx
  on public.partner_final_customers (customer_identity_id)
  where customer_identity_id is not null;
create index retail_customers_shared_identity_idx
  on public.retail_customers (customer_identity_id)
  where customer_identity_id is not null;

create or replace function private.touch_customer_identity_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger touch_customer_identity_updated_at
before update on public.customer_identities
for each row execute function private.touch_customer_identity_updated_at();

create or replace function private.prevent_customer_identity_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Customer identity audit events are append-only.' using errcode = '42501';
end;
$$;

create trigger prevent_customer_identity_event_mutation
before update or delete on public.customer_identity_events
for each row execute function private.prevent_customer_identity_event_mutation();

-- Existing context rows get distinct additive roots. The approved dry-run found
-- no authoritative cross-context key suitable for automatic merging. Replays
-- are idempotent because only unlinked rows are processed.
do $$
declare
  source_record record;
  created_identity_id uuid;
begin
  lock table public.partner_final_customers in share row exclusive mode;
  lock table public.retail_customers in share row exclusive mode;

  for source_record in
    select id, customer_type
    from public.partner_final_customers
    where customer_identity_id is null
    order by id
  loop
    insert into public.customer_identities (identity_kind)
    values (case when source_record.customer_type = 'company' then 'LEGAL_ENTITY' else 'PERSON' end)
    returning id into created_identity_id;

    update public.partner_final_customers
    set customer_identity_id = created_identity_id
    where id = source_record.id and customer_identity_id is null;

    insert into public.customer_identity_events (
      customer_identity_id, event_type, source_context, source_record_id,
      safe_metadata
    ) values (
      created_identity_id, 'IDENTITY_CREATED', 'PARTNER_FINAL_CUSTOMER',
      source_record.id, jsonb_build_object('origin', 'ADDITIVE_BACKFILL')
    );
    insert into public.customer_identity_events (
      customer_identity_id, event_type, source_context, source_record_id,
      safe_metadata
    ) values (
      created_identity_id, 'CONTEXT_LINKED', 'PARTNER_FINAL_CUSTOMER',
      source_record.id, jsonb_build_object('origin', 'ADDITIVE_BACKFILL')
    );
  end loop;

  for source_record in
    select id
    from public.retail_customers
    where customer_identity_id is null
    order by id
  loop
    insert into public.customer_identities (identity_kind)
    values ('PERSON')
    returning id into created_identity_id;

    update public.retail_customers
    set customer_identity_id = created_identity_id
    where id = source_record.id and customer_identity_id is null;

    insert into public.customer_identity_events (
      customer_identity_id, event_type, source_context, source_record_id,
      safe_metadata
    ) values (
      created_identity_id, 'IDENTITY_CREATED', 'RETAIL_CUSTOMER',
      source_record.id, jsonb_build_object('origin', 'ADDITIVE_BACKFILL')
    );
    insert into public.customer_identity_events (
      customer_identity_id, event_type, source_context, source_record_id,
      safe_metadata
    ) values (
      created_identity_id, 'CONTEXT_LINKED', 'RETAIL_CUSTOMER',
      source_record.id, jsonb_build_object('origin', 'ADDITIVE_BACKFILL')
    );
  end loop;
end;
$$;

create or replace function private.ensure_customer_context_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_identity_id uuid;
  resolved_kind text;
  resolved_context text;
begin
  if new.customer_identity_id is not null then
    return new;
  end if;

  if tg_table_name = 'partner_final_customers' then
    resolved_kind := case when new.customer_type = 'company' then 'LEGAL_ENTITY' else 'PERSON' end;
    resolved_context := 'PARTNER_FINAL_CUSTOMER';
  elsif tg_table_name = 'retail_customers' then
    resolved_kind := 'PERSON';
    resolved_context := 'RETAIL_CUSTOMER';
  else
    raise exception 'Unsupported customer identity context.' using errcode = '22023';
  end if;

  insert into public.customer_identities (identity_kind)
  values (resolved_kind)
  returning id into created_identity_id;

  new.customer_identity_id := created_identity_id;

  insert into public.customer_identity_events (
    customer_identity_id, actor_user_id, event_type, source_context,
    source_record_id, safe_metadata
  ) values (
    created_identity_id, auth.uid(), 'IDENTITY_CREATED', resolved_context,
    new.id, jsonb_build_object('origin', 'CONTEXT_CREATE')
  );
  insert into public.customer_identity_events (
    customer_identity_id, actor_user_id, event_type, source_context,
    source_record_id, safe_metadata
  ) values (
    created_identity_id, auth.uid(), 'CONTEXT_LINKED', resolved_context,
    new.id, jsonb_build_object('origin', 'CONTEXT_CREATE')
  );

  return new;
end;
$$;

create trigger ensure_partner_final_customer_identity
before insert on public.partner_final_customers
for each row execute function private.ensure_customer_context_identity();
create trigger ensure_retail_customer_identity
before insert on public.retail_customers
for each row execute function private.ensure_customer_context_identity();

create or replace function public.create_customer_identity_with_evidence(
  p_identity_kind text,
  p_keys jsonb default '[]'::jsonb,
  p_external_1c_ref text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_identity_id uuid;
begin
  if p_identity_kind not in ('PERSON', 'LEGAL_ENTITY')
    or jsonb_typeof(coalesce(p_keys, '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid customer identity evidence.' using errcode = '22023';
  end if;

  insert into public.customer_identities (identity_kind)
  values (p_identity_kind)
  returning id into created_identity_id;

  insert into public.customer_identity_keys (
    customer_identity_id, key_type, key_hash, key_version, verified
  )
  select
    created_identity_id,
    evidence.key_type,
    evidence.key_hash,
    evidence.key_version,
    evidence.verified
  from jsonb_to_recordset(coalesce(p_keys, '[]'::jsonb)) as evidence(
    key_type text,
    key_hash text,
    key_version integer,
    verified boolean
  );

  insert into public.customer_identity_events (
    customer_identity_id, event_type, safe_metadata
  )
  select
    created_identity_id, 'KEY_ATTACHED',
    jsonb_build_object(
      'key_type', evidence.key_type,
      'key_version', evidence.key_version,
      'verified', evidence.verified,
      'origin', 'IDENTITY_RESOLUTION_SERVICE'
    )
  from jsonb_to_recordset(coalesce(p_keys, '[]'::jsonb)) as evidence(
    key_type text,
    key_hash text,
    key_version integer,
    verified boolean
  );

  if nullif(btrim(p_external_1c_ref), '') is not null then
    insert into public.customer_external_refs (
      customer_identity_id, system, entity_type, external_id, verified_at, status
    ) values (
      created_identity_id, '1C', 'COUNTERPARTY', btrim(p_external_1c_ref), now(), 'ACTIVE'
    );
    insert into public.customer_identity_events (
      customer_identity_id, event_type, source_context, safe_metadata
    ) values (
      created_identity_id, 'EXTERNAL_REF_ATTACHED', '1C',
      jsonb_build_object('system', '1C', 'entity_type', 'COUNTERPARTY')
    );
  end if;

  insert into public.customer_identity_events (
    customer_identity_id, event_type, safe_metadata
  ) values (
    created_identity_id, 'IDENTITY_CREATED',
    jsonb_build_object('origin', 'IDENTITY_RESOLUTION_SERVICE')
  );

  return created_identity_id;
end;
$$;

alter table public.customer_identities enable row level security;
alter table public.customer_identities force row level security;
alter table public.customer_identity_keys enable row level security;
alter table public.customer_identity_keys force row level security;
alter table public.customer_external_refs enable row level security;
alter table public.customer_external_refs force row level security;
alter table public.customer_identity_reconciliation_cases enable row level security;
alter table public.customer_identity_reconciliation_cases force row level security;
alter table public.customer_identity_events enable row level security;
alter table public.customer_identity_events force row level security;

revoke all on table public.customer_identities from public, anon, authenticated, service_role;
revoke all on table public.customer_identity_keys from public, anon, authenticated, service_role;
revoke all on table public.customer_external_refs from public, anon, authenticated, service_role;
revoke all on table public.customer_identity_reconciliation_cases from public, anon, authenticated, service_role;
revoke all on table public.customer_identity_events from public, anon, authenticated, service_role;

grant select, insert, update on table public.customer_identities to service_role;
grant select, insert, update on table public.customer_identity_keys to service_role;
grant select, insert, update on table public.customer_external_refs to service_role;
grant select, insert, update on table public.customer_identity_reconciliation_cases to service_role;
grant select, insert on table public.customer_identity_events to service_role;

revoke all on function private.touch_customer_identity_updated_at() from public, anon, authenticated, service_role;
revoke all on function private.prevent_customer_identity_event_mutation() from public, anon, authenticated, service_role;
revoke all on function private.ensure_customer_context_identity() from public, anon, authenticated, service_role;
revoke all on function public.create_customer_identity_with_evidence(text, jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.create_customer_identity_with_evidence(text, jsonb, text) to service_role;

comment on column public.partner_final_customers.customer_identity_id is
  'Additive shared identity correlation. Existing Estimate/customer runtime ownership remains unchanged.';
comment on column public.retail_customers.customer_identity_id is
  'Additive shared identity correlation. Existing Retail Order/customer runtime ownership remains unchanged.';
