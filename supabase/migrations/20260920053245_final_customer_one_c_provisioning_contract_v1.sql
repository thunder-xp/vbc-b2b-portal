begin;

alter table public.customer_external_provisioning_jobs
  add column operation_key uuid not null default gen_random_uuid(),
  add column create_attempted_at timestamptz null,
  add column read_back_at timestamptz null,
  add column candidate_count integer null check (candidate_count between 0 and 20),
  add column provider_request_count integer not null default 0 check (provider_request_count between 0 and 1000),
  add column last_provider_duration_ms integer null check (last_provider_duration_ms >= 0),
  add column safe_diagnostics jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_diagnostics) = 'object');

create unique index customer_external_provisioning_jobs_operation_key_idx
  on public.customer_external_provisioning_jobs (operation_key);

create unique index customer_external_refs_identity_system_entity_active_idx
  on public.customer_external_refs (customer_identity_id, system, entity_type)
  where status = 'ACTIVE' and system = '1C' and entity_type = 'COUNTERPARTY';

create or replace function public.claim_customer_external_provisioning_jobs_v1(
  p_limit integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'External customer provisioning claim requires service role.' using errcode = '42501';
  end if;
  if p_limit not between 1 and 10 then
    raise exception 'Invalid external provisioning batch size.' using errcode = '22023';
  end if;

  with candidates as (
    select job.id
    from public.customer_external_provisioning_jobs job
    where (
      job.state in ('PENDING', 'FAILED_RETRYABLE')
      or (job.state = 'PROCESSING' and job.lease_expires_at < now())
    ) and job.available_at <= now()
    order by job.available_at, job.created_at, job.id
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.customer_external_provisioning_jobs job
    set state = 'PROCESSING',
      attempt_count = job.attempt_count + 1,
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + interval '2 minutes',
      safe_error_code = null
    from candidates
    where job.id = candidates.id
    returning job.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'jobId', claimed.id,
    'leaseToken', claimed.lease_token,
    'attemptCount', claimed.attempt_count,
    'customerIdentityId', claimed.customer_identity_id,
    'sourceOrderId', claimed.source_retail_order_id,
    'operationKey', claimed.operation_key,
    'createAttemptedAt', claimed.create_attempted_at,
    'customerKind', identity.identity_kind,
    'displayName', nullif(btrim(customer.name), ''),
    'verifiedPhone', customer.phone,
    'email', nullif(lower(btrim(coalesce(customer.email, ''))), ''),
    'existingExternalId', external_ref.external_id
  ) order by claimed.id), '[]'::jsonb)
  into v_result
  from claimed
  join public.customer_identities identity on identity.id = claimed.customer_identity_id
  join public.retail_orders retail_order on retail_order.id = claimed.source_retail_order_id
  join public.retail_customers customer on customer.id = retail_order.customer_id
  left join lateral (
    select ref.external_id
    from public.customer_external_refs ref
    where ref.customer_identity_id = claimed.customer_identity_id
      and ref.system = '1C' and ref.entity_type = 'COUNTERPARTY' and ref.status = 'ACTIVE'
    order by ref.created_at, ref.id
    limit 1
  ) external_ref on true;
  return v_result;
end;
$$;

create or replace function public.mark_customer_external_create_attempted_v1(
  p_job_id uuid,
  p_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'External customer create marker requires service role.' using errcode = '42501';
  end if;
  update public.customer_external_provisioning_jobs
  set create_attempted_at = coalesce(create_attempted_at, now()),
    provider_request_count = provider_request_count + 1
  where id = p_job_id and state = 'PROCESSING' and lease_token = p_lease_token;
  return found;
end;
$$;

create or replace function public.complete_customer_external_provisioning_v1(
  p_job_id uuid,
  p_lease_token uuid,
  p_outcome text,
  p_external_id text,
  p_candidate_count integer,
  p_provider_request_count integer,
  p_provider_duration_ms integer
)
returns text
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_job public.customer_external_provisioning_jobs%rowtype;
  v_conflict_identity uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'External customer completion requires service role.' using errcode = '42501';
  end if;
  if p_outcome not in ('MATCHED', 'NEW')
    or p_external_id !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    or p_external_id = '00000000-0000-0000-0000-000000000000'
    or p_candidate_count not between 0 and 20
    or p_provider_request_count not between 1 and 100
    or p_provider_duration_ms < 0 then
    raise exception 'Invalid external customer completion.' using errcode = '22023';
  end if;

  select * into v_job from public.customer_external_provisioning_jobs
  where id = p_job_id and state = 'PROCESSING' and lease_token = p_lease_token
  for update;
  if v_job.id is null then
    raise exception 'External customer provisioning claim is stale.' using errcode = '55000';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('customer-external-ref|1C|COUNTERPARTY|' || lower(p_external_id), 0));
  perform pg_advisory_xact_lock(hashtextextended('customer-external-root|' || v_job.customer_identity_id::text, 0));

  select ref.customer_identity_id into v_conflict_identity
  from public.customer_external_refs ref
  where ref.system = '1C' and ref.entity_type = 'COUNTERPARTY'
    and ref.external_id = lower(p_external_id) and ref.status = 'ACTIVE'
    and ref.customer_identity_id <> v_job.customer_identity_id
  limit 1;
  if v_conflict_identity is not null or exists (
    select 1 from public.customer_external_refs ref
    where ref.customer_identity_id = v_job.customer_identity_id
      and ref.system = '1C' and ref.entity_type = 'COUNTERPARTY'
      and ref.status = 'ACTIVE' and ref.external_id <> lower(p_external_id)
  ) then
    insert into public.customer_identity_reconciliation_cases (
      case_type, status, left_customer_identity_id, right_customer_identity_id,
      reason_code, safe_evidence
    ) values (
      'CONFLICT', 'CONFLICT', v_job.customer_identity_id, v_conflict_identity,
      'IDENTIFIER_CONFLICT', jsonb_build_object('source', '1C_PROVISIONING', 'jobId', v_job.id)
    );
    update public.customer_external_provisioning_jobs
    set state = 'CONFLICT', lease_token = null, lease_expires_at = null,
      completed_at = now(), safe_error_code = 'EXTERNAL_REFERENCE_CONFLICT',
      candidate_count = p_candidate_count,
      provider_request_count = provider_request_count + p_provider_request_count,
      last_provider_duration_ms = p_provider_duration_ms,
      read_back_at = now(),
      safe_diagnostics = jsonb_build_object('reviewRequired', true, 'candidateCount', p_candidate_count)
    where id = v_job.id;
    return 'CONFLICT';
  end if;

  insert into public.customer_external_refs (
    customer_identity_id, system, entity_type, external_id, verified_at, status
  ) values (
    v_job.customer_identity_id, '1C', 'COUNTERPARTY', lower(p_external_id), now(), 'ACTIVE'
  ) on conflict (system, entity_type, external_id) where status = 'ACTIVE' do nothing;

  if not exists (
    select 1 from public.customer_external_refs ref
    where ref.customer_identity_id = v_job.customer_identity_id
      and ref.system = '1C' and ref.entity_type = 'COUNTERPARTY'
      and ref.external_id = lower(p_external_id) and ref.status = 'ACTIVE'
  ) then
    raise exception 'External customer mapping could not be verified.' using errcode = '23505';
  end if;

  insert into public.customer_identity_events (
    customer_identity_id, event_type, source_context, source_record_id, safe_metadata
  ) values (
    v_job.customer_identity_id, 'EXTERNAL_REF_ATTACHED', '1C', v_job.id,
    jsonb_build_object('system', '1C', 'entityType', 'COUNTERPARTY', 'outcome', p_outcome)
  );

  update public.customer_external_provisioning_jobs
  set state = p_outcome, lease_token = null, lease_expires_at = null,
    completed_at = now(), safe_error_code = null, candidate_count = p_candidate_count,
    provider_request_count = provider_request_count + p_provider_request_count,
    last_provider_duration_ms = p_provider_duration_ms, read_back_at = now(),
    safe_diagnostics = jsonb_build_object('readBack', true, 'mappingPersisted', true, 'candidateCount', p_candidate_count)
  where id = v_job.id;
  return p_outcome;
end;
$$;

create or replace function public.review_customer_external_provisioning_v1(
  p_job_id uuid,
  p_lease_token uuid,
  p_state text,
  p_safe_error_code text,
  p_candidate_count integer,
  p_provider_request_count integer,
  p_provider_duration_ms integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_job public.customer_external_provisioning_jobs%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'External customer review requires service role.' using errcode = '42501';
  end if;
  if p_state not in ('AMBIGUOUS', 'CONFLICT')
    or p_safe_error_code !~ '^[A-Z0-9_]{2,80}$'
    or p_candidate_count not between 0 and 20
    or p_provider_request_count not between 0 and 100
    or p_provider_duration_ms < 0 then
    raise exception 'Invalid external customer review result.' using errcode = '22023';
  end if;
  select * into v_job from public.customer_external_provisioning_jobs
  where id = p_job_id and state = 'PROCESSING' and lease_token = p_lease_token
  for update;
  if v_job.id is null then return false; end if;

  insert into public.customer_identity_reconciliation_cases (
    case_type, status, left_customer_identity_id, reason_code, safe_evidence
  ) values (
    p_state, p_state, v_job.customer_identity_id,
    case when p_state = 'AMBIGUOUS' then 'MULTIPLE_MATCHES' else 'IDENTIFIER_CONFLICT' end,
    jsonb_build_object('source', '1C_PROVISIONING', 'jobId', v_job.id, 'candidateCount', p_candidate_count)
  );
  insert into public.customer_identity_events (
    customer_identity_id, event_type, source_context, source_record_id, safe_metadata
  ) values (
    v_job.customer_identity_id,
    case when p_state = 'AMBIGUOUS' then 'AMBIGUITY_DETECTED' else 'CONFLICT_DETECTED' end,
    '1C', v_job.id,
    jsonb_build_object('candidateCount', p_candidate_count, 'safeErrorCode', p_safe_error_code)
  );
  update public.customer_external_provisioning_jobs
  set state = p_state, lease_token = null, lease_expires_at = null,
    completed_at = now(), safe_error_code = p_safe_error_code,
    candidate_count = p_candidate_count,
    provider_request_count = provider_request_count + p_provider_request_count,
    last_provider_duration_ms = p_provider_duration_ms,
    safe_diagnostics = jsonb_build_object('reviewRequired', true, 'candidateCount', p_candidate_count)
  where id = v_job.id;
  return true;
end;
$$;

create or replace function public.fail_customer_external_provisioning_v1(
  p_job_id uuid,
  p_lease_token uuid,
  p_safe_error_code text,
  p_provider_request_count integer,
  p_provider_duration_ms integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'External customer failure requires service role.' using errcode = '42501';
  end if;
  if p_safe_error_code !~ '^[A-Z0-9_]{2,80}$'
    or p_provider_request_count not between 0 and 100 or p_provider_duration_ms < 0 then
    raise exception 'Invalid external customer failure.' using errcode = '22023';
  end if;
  update public.customer_external_provisioning_jobs
  set state = 'FAILED_RETRYABLE',
    available_at = now() + least(interval '30 minutes', interval '30 seconds' * power(2, least(attempt_count, 6))),
    lease_token = null, lease_expires_at = null, safe_error_code = p_safe_error_code,
    provider_request_count = provider_request_count + p_provider_request_count,
    last_provider_duration_ms = p_provider_duration_ms,
    safe_diagnostics = jsonb_build_object('retryScheduled', true)
  where id = p_job_id and state = 'PROCESSING' and lease_token = p_lease_token;
  return found;
end;
$$;

create or replace function public.list_customer_external_provisioning_jobs_admin_v1(
  p_limit integer default 50
)
returns table (
  job_id uuid, state text, attempt_count integer, candidate_count integer,
  create_attempted boolean, read_back_succeeded boolean, mapping_persisted boolean,
  safe_error_code text, age_seconds bigint, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.uid() is null or not public.has_internal_permission('admin.integrations.view') then
    raise exception 'Integration diagnostics permission required.' using errcode = '42501';
  end if;
  if p_limit not between 1 and 100 then
    raise exception 'Invalid diagnostics limit.' using errcode = '22023';
  end if;
  return query
  select job.id, job.state, job.attempt_count, job.candidate_count,
    job.create_attempted_at is not null, job.read_back_at is not null,
    exists (select 1 from public.customer_external_refs ref
      where ref.customer_identity_id = job.customer_identity_id
        and ref.system = '1C' and ref.entity_type = 'COUNTERPARTY' and ref.status = 'ACTIVE'),
    job.safe_error_code,
    extract(epoch from (now() - job.created_at))::bigint,
    job.updated_at
  from public.customer_external_provisioning_jobs job
  order by case when job.state in ('AMBIGUOUS', 'CONFLICT', 'FAILED_RETRYABLE') then 0 else 1 end,
    job.updated_at desc, job.id
  limit p_limit;
end;
$$;

revoke all on function public.claim_customer_external_provisioning_jobs_v1(integer),
  public.mark_customer_external_create_attempted_v1(uuid, uuid),
  public.complete_customer_external_provisioning_v1(uuid, uuid, text, text, integer, integer, integer),
  public.review_customer_external_provisioning_v1(uuid, uuid, text, text, integer, integer, integer),
  public.fail_customer_external_provisioning_v1(uuid, uuid, text, integer, integer),
  public.list_customer_external_provisioning_jobs_admin_v1(integer)
from public, anon, authenticated;

grant execute on function public.claim_customer_external_provisioning_jobs_v1(integer),
  public.mark_customer_external_create_attempted_v1(uuid, uuid),
  public.complete_customer_external_provisioning_v1(uuid, uuid, text, text, integer, integer, integer),
  public.review_customer_external_provisioning_v1(uuid, uuid, text, text, integer, integer, integer),
  public.fail_customer_external_provisioning_v1(uuid, uuid, text, integer, integer)
to service_role;

grant execute on function public.list_customer_external_provisioning_jobs_admin_v1(integer)
to authenticated;

commit;
