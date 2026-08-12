alter table public.estimate_versions
  add column if not exists creation_request_key uuid null,
  add column if not exists creation_request_fingerprint text null;

alter table public.estimate_versions
  drop constraint if exists estimate_versions_creation_fingerprint_check;
alter table public.estimate_versions
  add constraint estimate_versions_creation_fingerprint_check
  check (creation_request_fingerprint is null or creation_request_fingerprint ~ '^[0-9a-f]{64}$');

create unique index if not exists estimate_versions_creation_request_unique
  on public.estimate_versions(creation_request_key)
  where creation_request_key is not null;

create table if not exists public.estimate_version_commands (
  request_key uuid primary key,
  estimate_id uuid not null references public.estimates(id) on delete restrict,
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  actor_user_id uuid not null references public.user_profiles(id) on delete restrict,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  expected_revision integer not null check (expected_revision > 0),
  current_revision integer not null check (current_revision > 0),
  status text not null check (status in ('created', 'conflict')),
  version_id uuid null references public.estimate_versions(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint estimate_version_commands_result_check check (
    (status = 'created' and version_id is not null)
    or (status = 'conflict' and version_id is null)
  )
);

create index if not exists estimate_version_commands_estimate_created_idx
  on public.estimate_version_commands(estimate_id, created_at desc);

alter table public.estimate_version_commands enable row level security;
revoke all on public.estimate_version_commands from public, anon, authenticated;

create or replace function public.prevent_estimate_version_command_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Estimate version commands are immutable.' using errcode = '55000';
end;
$$;

drop trigger if exists prevent_estimate_version_command_mutation on public.estimate_version_commands;
create trigger prevent_estimate_version_command_mutation
before update or delete on public.estimate_version_commands
for each row execute function public.prevent_estimate_version_command_mutation();

create or replace function public.create_estimate_version_v2(
  target_estimate_id uuid,
  expected_revision integer,
  target_request_key uuid,
  target_request_fingerprint text,
  target_note text,
  target_change_reason text,
  target_customer_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.estimates;
  created public.estimate_versions;
  prior_command public.estimate_version_commands;
  prior_version public.estimate_versions;
  next_version integer;
begin
  if target_request_key is null
     or target_request_fingerprint !~ '^[0-9a-f]{64}$'
     or expected_revision < 1 then
    raise exception 'Invalid estimate version command.' using errcode = '22023';
  end if;

  select * into target from public.estimates where id = target_estimate_id for update;
  if target.id is null or not public.can_access_estimates(target.company_id, 'estimates.manage') then
    raise exception 'Estimate is not available.' using errcode = '42501';
  end if;

  select * into prior_command
  from public.estimate_version_commands command
  where command.request_key = target_request_key;

  if prior_command.request_key is not null then
    if prior_command.estimate_id <> target.id
       or prior_command.actor_user_id <> auth.uid()
       or prior_command.request_fingerprint <> target_request_fingerprint then
      raise exception 'Estimate version idempotency conflict.' using errcode = 'PT409';
    end if;
    if prior_command.status = 'conflict' then
      return jsonb_build_object(
        'status', 'conflict',
        'code', 'ESTIMATE_VERSION_CONFLICT',
        'currentRevision', prior_command.current_revision,
        'repeated', true
      );
    end if;
    select * into prior_version from public.estimate_versions where id = prior_command.version_id;
    return jsonb_build_object('status', 'created', 'version', to_jsonb(prior_version), 'repeated', true);
  end if;

  if target.status not in ('draft', 'ready') or target.revision <> expected_revision then
    insert into public.estimate_version_commands(
      request_key, estimate_id, company_id, actor_user_id, request_fingerprint,
      expected_revision, current_revision, status
    ) values (
      target_request_key, target.id, target.company_id, auth.uid(), target_request_fingerprint,
      expected_revision, target.revision, 'conflict'
    );
    return jsonb_build_object(
      'status', 'conflict',
      'code', 'ESTIMATE_VERSION_CONFLICT',
      'currentRevision', target.revision,
      'repeated', false
    );
  end if;

  if target.has_incomplete_pricing or target.total_amount < 0
     or not exists (select 1 from public.estimate_items where estimate_id = target.id) then
    raise exception 'Estimate is not ready for a version.' using errcode = '23514';
  end if;
  if jsonb_typeof(target_customer_snapshot) <> 'object'
     or coalesce((target_customer_snapshot #>> '{totals,total}')::numeric, -1) <> target.total_amount
     or coalesce(target_customer_snapshot ->> 'currencyCode', '') <> target.currency_code
     or coalesce(target_customer_snapshot ->> 'estimateNumber', '') <> target.estimate_number then
    raise exception 'Customer proposal snapshot does not match estimate.' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.estimate_versions version
    where version.estimate_id = target.id and version.estimate_revision = target.revision
  ) then
    insert into public.estimate_version_commands(
      request_key, estimate_id, company_id, actor_user_id, request_fingerprint,
      expected_revision, current_revision, status
    ) values (
      target_request_key, target.id, target.company_id, auth.uid(), target_request_fingerprint,
      expected_revision, target.revision, 'conflict'
    );
    return jsonb_build_object(
      'status', 'conflict',
      'code', 'ESTIMATE_VERSION_CONFLICT',
      'currentRevision', target.revision,
      'repeated', false
    );
  end if;

  select coalesce(max(version_number), 0) + 1 into next_version
  from public.estimate_versions where estimate_id = target.id;

  insert into public.estimate_versions (
    estimate_id, company_id, version_number, estimate_revision, estimate_number, currency_code,
    total_amount, snapshot, customer_proposal_snapshot, proposal_template_id, note, change_reason,
    created_by, creation_request_key, creation_request_fingerprint
  ) values (
    target.id, target.company_id, next_version, target.revision, target.estimate_number, target.currency_code,
    target.total_amount, public.capture_estimate_snapshot(target.id), target_customer_snapshot,
    target.proposal_template_id, nullif(btrim(target_note), ''), nullif(btrim(target_change_reason), ''),
    auth.uid(), target_request_key, target_request_fingerprint
  ) returning * into created;

  insert into public.estimate_events(estimate_id, actor_user_id, event_type)
  values (target.id, auth.uid(), 'version_created');

  insert into public.estimate_version_commands(
    request_key, estimate_id, company_id, actor_user_id, request_fingerprint,
    expected_revision, current_revision, status, version_id
  ) values (
    target_request_key, target.id, target.company_id, auth.uid(), target_request_fingerprint,
    expected_revision, target.revision, 'created', created.id
  );

  return jsonb_build_object('status', 'created', 'version', to_jsonb(created), 'repeated', false);
end;
$$;

create or replace function public.create_estimate_version(
  target_estimate_id uuid,
  expected_revision integer,
  target_note text,
  target_change_reason text,
  target_customer_snapshot jsonb
)
returns public.estimate_versions
language plpgsql
security definer
set search_path = public
as $$
declare result jsonb; created public.estimate_versions;
begin
  result := public.create_estimate_version_v2(
    target_estimate_id,
    expected_revision,
    gen_random_uuid(),
    encode(gen_random_bytes(32), 'hex'),
    target_note,
    target_change_reason,
    target_customer_snapshot
  );
  if result ->> 'status' = 'conflict' then
    raise exception 'ESTIMATE_VERSION_CONFLICT' using errcode = 'PT409';
  end if;
  select * into created from jsonb_populate_record(null::public.estimate_versions, result -> 'version');
  return created;
end;
$$;

revoke all on function public.prevent_estimate_version_command_mutation() from public, anon, authenticated;
revoke all on function public.create_estimate_version_v2(uuid,integer,uuid,text,text,text,jsonb) from public, anon;
revoke all on function public.create_estimate_version(uuid,integer,text,text,jsonb) from public, anon;
grant execute on function public.create_estimate_version_v2(uuid,integer,uuid,text,text,text,jsonb) to authenticated;
grant execute on function public.create_estimate_version(uuid,integer,text,text,jsonb) to authenticated;

comment on table public.estimate_version_commands is
  'Immutable idempotency outcomes for governed estimate proposal-version creation.';
