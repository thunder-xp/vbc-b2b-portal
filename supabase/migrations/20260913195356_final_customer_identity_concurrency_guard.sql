-- Make verified Shared Customer Identity creation idempotent under concurrent
-- first-login requests. Matching semantics remain owned by the existing
-- resolution service; this only serializes the final create-if-missing edge.

create unique index customer_identity_keys_verified_global_unique_idx
  on public.customer_identity_keys (key_type, key_version, key_hash)
  where revoked_at is null and verified;

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
  existing_identity_ids uuid[];
  evidence_lock_key text;
  normalized_external_1c_ref text := nullif(btrim(p_external_1c_ref), '');
begin
  if p_identity_kind not in ('PERSON', 'LEGAL_ENTITY')
    or jsonb_typeof(coalesce(p_keys, '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid customer identity evidence.' using errcode = '22023';
  end if;

  -- Stable ordering prevents deadlocks when requests contain several verified
  -- keys in different input orders. Raw evidence never enters logs or tables.
  for evidence_lock_key in
    select distinct
      evidence.key_type || ':' || evidence.key_version::text || ':' || evidence.key_hash
    from jsonb_to_recordset(coalesce(p_keys, '[]'::jsonb)) as evidence(
      key_type text,
      key_hash text,
      key_version integer,
      verified boolean
    )
    where evidence.verified
    order by 1
  loop
    perform pg_advisory_xact_lock(hashtextextended('customer-identity-key:' || evidence_lock_key, 104729));
  end loop;

  if normalized_external_1c_ref is not null then
    perform pg_advisory_xact_lock(
      hashtextextended('customer-external-ref:1C:COUNTERPARTY:' || normalized_external_1c_ref, 104729)
    );
  end if;

  select array_agg(distinct matched.customer_identity_id order by matched.customer_identity_id)
  into existing_identity_ids
  from (
    select key_row.customer_identity_id
    from public.customer_identity_keys key_row
    join jsonb_to_recordset(coalesce(p_keys, '[]'::jsonb)) as evidence(
      key_type text,
      key_hash text,
      key_version integer,
      verified boolean
    ) on evidence.verified
      and key_row.verified
      and key_row.revoked_at is null
      and key_row.key_type = evidence.key_type
      and key_row.key_hash = evidence.key_hash
      and key_row.key_version = evidence.key_version
    union
    select external_ref.customer_identity_id
    from public.customer_external_refs external_ref
    where normalized_external_1c_ref is not null
      and external_ref.system = '1C'
      and external_ref.entity_type = 'COUNTERPARTY'
      and external_ref.external_id = normalized_external_1c_ref
      and external_ref.status = 'ACTIVE'
  ) matched;

  if cardinality(existing_identity_ids) > 1 then
    raise exception 'Conflicting verified customer identity evidence.' using errcode = '23505';
  end if;
  if cardinality(existing_identity_ids) = 1 then
    return existing_identity_ids[1];
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

  if normalized_external_1c_ref is not null then
    insert into public.customer_external_refs (
      customer_identity_id, system, entity_type, external_id, verified_at, status
    ) values (
      created_identity_id, '1C', 'COUNTERPARTY', normalized_external_1c_ref, now(), 'ACTIVE'
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

revoke all on function public.create_customer_identity_with_evidence(text, jsonb, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_customer_identity_with_evidence(text, jsonb, text)
  to service_role;
