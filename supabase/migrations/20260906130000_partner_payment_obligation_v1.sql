begin;

alter table public.partner_finance_sync_state
  add column if not exists payment_obligation_count integer not null default 0,
  add column if not exists payment_exclusion_count integer not null default 0,
  add column if not exists source_call_count integer not null default 0,
  add column if not exists orders_received_count integer not null default 0;

create table public.partner_payment_obligations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete cascade,
  one_c_order_id text not null,
  order_number text not null,
  order_date date not null,
  one_c_counterparty_id text null,
  one_c_contract_id text null,
  one_c_organization_id text null,
  schedule_line_number bigint not null,
  source_order_data_version text null,
  payment_percent numeric(12, 4) not null,
  planned_amount numeric(20, 4) not null,
  vat_amount numeric(20, 4) not null,
  currency text not null,
  due_date date not null,
  payment_method text not null,
  bank_account_id text null,
  bank_account_name text null,
  paid_amount numeric(20, 4) not null,
  remaining_amount numeric(20, 4) not null,
  payment_status text not null,
  settlement_last_payment_at timestamptz null,
  order_posted boolean not null,
  order_deletion_mark boolean not null,
  order_status text null,
  reconciliation_status text not null,
  unsupported_reason text null,
  reconciliation_fingerprint text not null,
  source_modified_at timestamptz null,
  source_observed_at timestamptz not null,
  synced_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_payment_obligations_order_unique unique(company_id, one_c_order_id),
  constraint partner_payment_obligations_order_ref_check check (
    one_c_order_id ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  ),
  constraint partner_payment_obligations_amounts_check check (
    planned_amount >= 0 and vat_amount >= 0 and paid_amount >= 0 and remaining_amount >= 0
  ),
  constraint partner_payment_obligations_currency_check check (
    currency = upper(currency) and char_length(currency) between 3 and 16
  ),
  constraint partner_payment_obligations_payment_status_check check (
    payment_status in ('OPEN', 'PARTIAL', 'SETTLED')
  ),
  constraint partner_payment_obligations_reconciliation_check check (
    reconciliation_status in ('READY', 'UNSUPPORTED', 'NON_RECONCILING')
    and ((reconciliation_status = 'READY' and unsupported_reason is null)
      or (reconciliation_status <> 'READY' and unsupported_reason is not null))
  ),
  constraint partner_payment_obligations_reason_check check (
    unsupported_reason is null or unsupported_reason in (
      'MULTI_LINE_SCHEDULE_UNSUPPORTED', 'CURRENCY_MISMATCH', 'CURRENCY_UNRESOLVED',
      'COMPANY_UNRESOLVED', 'CONTRACT_UNRESOLVED', 'ORDER_UNPOSTED', 'ORDER_DELETED',
      'PAYMENT_CALENDAR_EMPTY', 'SETTLEMENT_UNRESOLVED', 'AMOUNT_NON_RECONCILING'
    )
  ),
  constraint partner_payment_obligations_fingerprint_check check (
    reconciliation_fingerprint ~ '^[0-9a-f]{64}$'
  )
);

create table public.partner_payment_obligation_exclusions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete cascade,
  one_c_order_id text not null,
  order_number text not null,
  source_order_data_version text null,
  schedule_line_count integer not null,
  reason text not null,
  source_observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, one_c_order_id),
  check (schedule_line_count >= 0),
  check (reason in ('MULTI_LINE_SCHEDULE_UNSUPPORTED', 'PAYMENT_CALENDAR_EMPTY'))
);

create index partner_payment_obligations_company_due_idx
  on public.partner_payment_obligations(company_id, reconciliation_status, payment_status, due_date, id);
create index partner_payment_obligations_active_due_idx
  on public.partner_payment_obligations(due_date, company_id)
  where reconciliation_status = 'READY' and payment_status in ('OPEN', 'PARTIAL');
create index partner_payment_obligation_exclusions_company_reason_idx
  on public.partner_payment_obligation_exclusions(company_id, reason, id);

create trigger set_partner_payment_obligations_updated_at
before update on public.partner_payment_obligations
for each row execute function public.set_updated_at();
create trigger set_partner_payment_obligation_exclusions_updated_at
before update on public.partner_payment_obligation_exclusions
for each row execute function public.set_updated_at();

alter table public.partner_payment_obligations enable row level security;
alter table public.partner_payment_obligation_exclusions enable row level security;
revoke all on public.partner_payment_obligations, public.partner_payment_obligation_exclusions
  from public, anon, authenticated;
grant select on public.partner_payment_obligations to authenticated;

create policy "Partners select permitted payment obligations"
on public.partner_payment_obligations for select to authenticated
using (
  reconciliation_status = 'READY'
  and public.has_permission(company_id, 'finance.view_company')
);

create or replace function public.publish_partner_finance_snapshot_v3(
  p_company_id uuid,
  p_counterparty_ref text,
  p_synchronized_at timestamptz,
  p_balance_rows jsonb,
  p_obligation_rows jsonb,
  p_exclusion_rows jsonb,
  p_balance_received_count integer,
  p_excluded_deleted_count integer,
  p_duration_ms integer,
  p_source_call_count integer,
  p_orders_received integer,
  p_trigger text,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  balance_count integer;
  obligation_count integer;
  exclusion_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Finance synchronization is server-only.' using errcode = '42501';
  end if;
  if p_trigger not in ('manual', 'scheduled')
    or p_duration_ms < 0 or p_source_call_count < 0 or p_orders_received < 0
    or jsonb_typeof(p_obligation_rows) <> 'array'
    or jsonb_typeof(p_exclusion_rows) <> 'array' then
    raise exception 'Finance snapshot is invalid.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.partner_companies company
    where company.id = p_company_id and company.status = 'active'
      and company.external_1c_id = p_counterparty_ref
  ) then
    raise exception 'Company mapping is invalid.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('partner_finance:' || p_company_id::text, 0));
  balance_count := public.publish_partner_contract_balances(
    p_company_id, p_counterparty_ref, p_synchronized_at, p_balance_rows
  );

  with source_rows as (
    select * from jsonb_to_recordset(p_obligation_rows) as source(
      one_c_order_id text, order_number text, order_date date,
      one_c_counterparty_id text, one_c_contract_id text, one_c_organization_id text,
      schedule_line_number bigint, source_order_data_version text,
      payment_percent numeric, planned_amount numeric, vat_amount numeric,
      currency text, due_date date, payment_method text,
      bank_account_id text, bank_account_name text, paid_amount numeric,
      remaining_amount numeric, payment_status text, settlement_last_payment_at timestamptz,
      order_posted boolean, order_deletion_mark boolean, order_status text,
      reconciliation_status text, unsupported_reason text,
      source_modified_at timestamptz, source_observed_at timestamptz, synced_at timestamptz
    )
  )
  insert into public.partner_payment_obligations(
    company_id, one_c_order_id, order_number, order_date, one_c_counterparty_id,
    one_c_contract_id, one_c_organization_id, schedule_line_number,
    source_order_data_version, payment_percent, planned_amount, vat_amount,
    currency, due_date, payment_method, bank_account_id, bank_account_name,
    paid_amount, remaining_amount, payment_status, settlement_last_payment_at,
    order_posted, order_deletion_mark, order_status, reconciliation_status,
    unsupported_reason, reconciliation_fingerprint, source_modified_at,
    source_observed_at, synced_at
  )
  select p_company_id, source.one_c_order_id, source.order_number, source.order_date,
    source.one_c_counterparty_id, source.one_c_contract_id, source.one_c_organization_id,
    source.schedule_line_number, source.source_order_data_version,
    source.payment_percent, source.planned_amount, source.vat_amount, upper(source.currency),
    source.due_date, source.payment_method, source.bank_account_id,
    nullif(btrim(source.bank_account_name), ''), source.paid_amount,
    source.remaining_amount, source.payment_status, source.settlement_last_payment_at,
    source.order_posted, source.order_deletion_mark, source.order_status,
    source.reconciliation_status, source.unsupported_reason,
    encode(extensions.digest(concat_ws('|', p_company_id::text, source.one_c_order_id,
      coalesce(source.source_order_data_version, ''), source.schedule_line_number::text,
      source.due_date::text, source.planned_amount::text, source.paid_amount::text,
      source.remaining_amount::text, upper(source.currency), source.reconciliation_status), 'sha256'), 'hex'),
    source.source_modified_at, source.source_observed_at, source.synced_at
  from source_rows source
  on conflict (company_id, one_c_order_id) do update set
    order_number = excluded.order_number, order_date = excluded.order_date,
    one_c_counterparty_id = excluded.one_c_counterparty_id,
    one_c_contract_id = excluded.one_c_contract_id,
    one_c_organization_id = excluded.one_c_organization_id,
    schedule_line_number = excluded.schedule_line_number,
    source_order_data_version = excluded.source_order_data_version,
    payment_percent = excluded.payment_percent, planned_amount = excluded.planned_amount,
    vat_amount = excluded.vat_amount, currency = excluded.currency, due_date = excluded.due_date,
    payment_method = excluded.payment_method, bank_account_id = excluded.bank_account_id,
    bank_account_name = excluded.bank_account_name, paid_amount = excluded.paid_amount,
    remaining_amount = excluded.remaining_amount, payment_status = excluded.payment_status,
    settlement_last_payment_at = excluded.settlement_last_payment_at,
    order_posted = excluded.order_posted, order_deletion_mark = excluded.order_deletion_mark,
    order_status = excluded.order_status, reconciliation_status = excluded.reconciliation_status,
    unsupported_reason = excluded.unsupported_reason,
    reconciliation_fingerprint = excluded.reconciliation_fingerprint,
    source_modified_at = excluded.source_modified_at,
    source_observed_at = excluded.source_observed_at, synced_at = excluded.synced_at;
  get diagnostics obligation_count = row_count;

  delete from public.partner_payment_obligations obligation
  where obligation.company_id = p_company_id
    and not exists (
      select 1 from jsonb_to_recordset(p_obligation_rows) source(one_c_order_id text)
      where source.one_c_order_id = obligation.one_c_order_id
    );

  insert into public.partner_payment_obligation_exclusions(
    company_id, one_c_order_id, order_number, source_order_data_version,
    schedule_line_count, reason, source_observed_at
  )
  select p_company_id, source.one_c_order_id, source.order_number,
    source.source_order_data_version, source.schedule_line_count, source.reason,
    source.source_observed_at
  from jsonb_to_recordset(p_exclusion_rows) as source(
    one_c_order_id text, order_number text, source_order_data_version text,
    schedule_line_count integer, reason text, source_observed_at timestamptz
  )
  on conflict (company_id, one_c_order_id) do update set
    order_number = excluded.order_number,
    source_order_data_version = excluded.source_order_data_version,
    schedule_line_count = excluded.schedule_line_count,
    reason = excluded.reason,
    source_observed_at = excluded.source_observed_at;
  get diagnostics exclusion_count = row_count;

  delete from public.partner_payment_obligation_exclusions exclusion
  where exclusion.company_id = p_company_id
    and not exists (
      select 1 from jsonb_to_recordset(p_exclusion_rows) source(one_c_order_id text)
      where source.one_c_order_id = exclusion.one_c_order_id
    );

  insert into public.partner_finance_sync_state(
    company_id, status, last_attempt_at, last_success_at, last_error_code,
    received_count, published_count, excluded_deleted_count, source_version,
    last_duration_ms, payment_obligation_count, payment_exclusion_count,
    source_call_count, orders_received_count, updated_at
  ) values (
    p_company_id, 'succeeded', now(), p_synchronized_at, null,
    p_balance_received_count, balance_count, p_excluded_deleted_count, null,
    p_duration_ms, obligation_count, exclusion_count,
    p_source_call_count, p_orders_received, now()
  ) on conflict (company_id) do update set
    status = excluded.status, last_attempt_at = excluded.last_attempt_at,
    last_success_at = excluded.last_success_at, last_error_code = null,
    received_count = excluded.received_count, published_count = excluded.published_count,
    excluded_deleted_count = excluded.excluded_deleted_count,
    last_duration_ms = excluded.last_duration_ms,
    payment_obligation_count = excluded.payment_obligation_count,
    payment_exclusion_count = excluded.payment_exclusion_count,
    source_call_count = excluded.source_call_count,
    orders_received_count = excluded.orders_received_count,
    updated_at = excluded.updated_at;

  insert into public.partner_finance_sync_events(
    company_id, event_type, trigger_type, actor_user_id, received_count,
    published_count, excluded_deleted_count, duration_ms
  ) values (
    p_company_id, 'succeeded', p_trigger, p_actor_user_id, p_orders_received,
    obligation_count, p_excluded_deleted_count, p_duration_ms
  );

  return jsonb_build_object('balances', balance_count, 'obligations', obligation_count, 'exclusions', exclusion_count);
end;
$$;

revoke all on function public.publish_partner_finance_snapshot_v3(
  uuid, text, timestamptz, jsonb, jsonb, jsonb, integer, integer,
  integer, integer, integer, text, uuid
) from public, anon, authenticated;
grant execute on function public.publish_partner_finance_snapshot_v3(
  uuid, text, timestamptz, jsonb, jsonb, jsonb, integer, integer,
  integer, integer, integer, text, uuid
) to service_role;

create or replace function public.get_partner_finance_overview(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
begin
  if not public.has_permission(p_company_id, 'finance.view_company') then
    raise exception 'Finance access denied.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'sync_state', (select to_jsonb(state) from public.partner_finance_sync_state state where state.company_id = p_company_id),
    'balances', coalesce((
      select jsonb_agg(to_jsonb(balance) order by balance.currency_code, balance.contract_name, balance.id)
      from public.partner_contract_balances balance
      where balance.company_id = p_company_id and balance.is_active
    ), '[]'::jsonb),
    'obligations', coalesce((
      select jsonb_agg(to_jsonb(obligation) order by obligation.due_date, obligation.order_number, obligation.id)
      from public.partner_payment_obligations obligation
      where obligation.company_id = p_company_id and obligation.reconciliation_status = 'READY'
    ), '[]'::jsonb),
    'unavailable_count',
      (select count(*) from public.partner_payment_obligations obligation
        where obligation.company_id = p_company_id and obligation.reconciliation_status <> 'READY')
      + (select count(*) from public.partner_payment_obligation_exclusions exclusion
        where exclusion.company_id = p_company_id)
  );
end;
$$;

revoke all on function public.get_partner_finance_overview(uuid) from public, anon;
grant execute on function public.get_partner_finance_overview(uuid) to authenticated;

create table public.partner_finance_reminder_runs (
  id uuid primary key default gen_random_uuid(),
  business_date date not null,
  policy_version text not null,
  outbound_mode text not null default 'DRY_RUN',
  status text not null default 'succeeded',
  eligible_company_count integer not null default 0,
  obligation_count integer not null default 0,
  projected_email_count integer not null default 0,
  projected_in_app_count integer not null default 0,
  future_sms_eligible_count integer not null default 0,
  suppressed_count integer not null default 0,
  duplicate_count integer not null default 0,
  duration_ms integer not null default 0,
  created_at timestamptz not null default now(),
  check (policy_version = 'FINANCE_REMINDER_V1'),
  check (outbound_mode = 'DRY_RUN'),
  check (status in ('succeeded', 'failed'))
);

create table public.partner_finance_reminder_projections (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.partner_finance_reminder_runs(id) on delete cascade,
  company_id uuid not null references public.partner_companies(id) on delete cascade,
  channel text not null,
  recipient_user_id uuid null references public.user_profiles(id) on delete restrict,
  recipient_email text null,
  locale text not null,
  milestone text not null,
  obligation_ids uuid[] not null,
  totals_by_currency jsonb not null,
  subject text not null,
  body text not null,
  fingerprint text not null unique,
  projected_at timestamptz not null default now(),
  check (channel in ('email', 'in_app', 'sms_future')),
  check (locale in ('ru', 'ro')),
  check (cardinality(obligation_ids) > 0),
  check (jsonb_typeof(totals_by_currency) = 'object'),
  check (fingerprint ~ '^[0-9a-f]{64}$')
);

create table public.partner_finance_reminder_suppressions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.partner_finance_reminder_runs(id) on delete cascade,
  company_id uuid not null references public.partner_companies(id) on delete cascade,
  obligation_id uuid null references public.partner_payment_obligations(id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now(),
  check (reason in ('SETTLED', 'NO_OUTSTANDING_BALANCE', 'FINANCE_DATA_STALE',
    'UNSUPPORTED_OBLIGATION', 'NON_RECONCILING', 'NO_VALID_EMAIL', 'DUPLICATE',
    'NOT_IN_REMINDER_WINDOW'))
);

create index partner_finance_reminder_runs_created_idx on public.partner_finance_reminder_runs(created_at desc);
create index partner_finance_reminder_projections_run_idx on public.partner_finance_reminder_projections(run_id, channel, company_id);
create index partner_finance_reminder_suppressions_run_idx on public.partner_finance_reminder_suppressions(run_id, reason, company_id);

alter table public.partner_finance_reminder_runs enable row level security;
alter table public.partner_finance_reminder_projections enable row level security;
alter table public.partner_finance_reminder_suppressions enable row level security;
revoke all on public.partner_finance_reminder_runs, public.partner_finance_reminder_projections,
  public.partner_finance_reminder_suppressions from public, anon, authenticated;
grant all on public.partner_finance_reminder_runs, public.partner_finance_reminder_projections,
  public.partner_finance_reminder_suppressions to service_role;

create or replace function public.get_finance_reminder_dry_run_input()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Finance reminder simulation is server-only.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'obligation', to_jsonb(obligation),
      'companyName', company.display_name,
      'financeDataFresh', state.last_success_at is not null
        and state.last_success_at >= now() - interval '3 hours'
        and state.status = 'succeeded',
      'recipientUserId', recipient.user_id,
      'recipientEmail', recipient.email,
      'recipientRole', recipient.role_code
    ) order by company.id, obligation.due_date, obligation.id)
    from public.partner_payment_obligations obligation
    join public.partner_companies company on company.id = obligation.company_id and company.status = 'active'
    left join public.partner_finance_sync_state state on state.company_id = obligation.company_id
    left join lateral (
      select membership.user_id, profile.email, role.code role_code
      from public.company_memberships membership
      join public.roles role on role.id = membership.role_id
      join public.user_profiles profile on profile.id = membership.user_id and profile.status = 'active'
      join public.permissions permission on permission.code = 'finance.view_company'
      join public.role_permissions role_permission
        on role_permission.role_id = role.id and role_permission.permission_id = permission.id
      join public.partner_company_capabilities capability
        on capability.company_id = membership.company_id and capability.permission_id = permission.id
      where membership.company_id = obligation.company_id and membership.status = 'active'
        and role.code in ('partner_accounting', 'partner_owner')
        and profile.email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        and not exists (
          select 1 from public.membership_permission_overrides denied
          where denied.membership_id = membership.id
            and denied.permission_id = permission.id and denied.effect = 'deny'
        )
      order by case role.code when 'partner_accounting' then 1 else 2 end,
        membership.created_at, membership.id
      limit 1
    ) recipient on true
  ), '[]'::jsonb);
end;
$$;

create or replace function public.publish_finance_reminder_dry_run(
  p_business_date date,
  p_duration_ms integer,
  p_projections jsonb,
  p_suppressions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_run_id uuid;
  v_duplicate_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Finance reminder simulation is server-only.' using errcode = '42501';
  end if;
  if p_duration_ms < 0 or jsonb_typeof(p_projections) <> 'array' or jsonb_typeof(p_suppressions) <> 'array' then
    raise exception 'Finance reminder dry-run input is invalid.' using errcode = '22023';
  end if;
  select count(*) into v_duplicate_count
  from jsonb_to_recordset(p_projections) source(fingerprint text)
  where exists (
    select 1 from public.partner_finance_reminder_projections projection
    where projection.fingerprint = source.fingerprint
  );

  insert into public.partner_finance_reminder_runs(business_date, policy_version, duration_ms)
  values (p_business_date, 'FINANCE_REMINDER_V1', p_duration_ms)
  returning id into v_run_id;

  insert into public.partner_finance_reminder_suppressions(run_id, company_id, obligation_id, reason)
  select v_run_id, source.company_id, obligation_id, 'DUPLICATE'
  from jsonb_to_recordset(p_projections) source(
    company_id uuid, obligation_ids uuid[], fingerprint text
  )
  cross join lateral unnest(source.obligation_ids) obligation_id
  where exists (
    select 1 from public.partner_finance_reminder_projections projection
    where projection.fingerprint = source.fingerprint
  );

  insert into public.partner_finance_reminder_projections(
    run_id, company_id, channel, recipient_user_id, recipient_email, locale,
    milestone, obligation_ids, totals_by_currency, subject, body, fingerprint
  )
  select v_run_id, source.company_id, source.channel, source.recipient_user_id,
    nullif(lower(btrim(source.recipient_email)), ''), source.locale, source.milestone,
    source.obligation_ids, source.totals_by_currency, source.subject, source.body,
    source.fingerprint
  from jsonb_to_recordset(p_projections) source(
    company_id uuid, channel text, recipient_user_id uuid, recipient_email text,
    locale text, milestone text, obligation_ids uuid[], totals_by_currency jsonb,
    subject text, body text, fingerprint text
  )
  on conflict (fingerprint) do nothing;

  insert into public.partner_finance_reminder_suppressions(run_id, company_id, obligation_id, reason)
  select v_run_id, source.company_id, source.obligation_id, source.reason
  from jsonb_to_recordset(p_suppressions) source(company_id uuid, obligation_id uuid, reason text);

  update public.partner_finance_reminder_runs run set
    eligible_company_count = (select count(distinct company_id) from public.partner_finance_reminder_projections where run_id = run.id and channel in ('email', 'in_app')),
    obligation_count = (select coalesce(sum(cardinality(obligation_ids)), 0) from public.partner_finance_reminder_projections where run_id = run.id and channel = 'in_app'),
    projected_email_count = (select count(*) from public.partner_finance_reminder_projections where run_id = run.id and channel = 'email'),
    projected_in_app_count = (select count(*) from public.partner_finance_reminder_projections where run_id = run.id and channel = 'in_app'),
    future_sms_eligible_count = (select count(*) from public.partner_finance_reminder_projections where run_id = run.id and channel = 'sms_future'),
    suppressed_count = (select count(*) from public.partner_finance_reminder_suppressions where run_id = run.id),
    duplicate_count = v_duplicate_count
  where run.id = v_run_id;

  return (select to_jsonb(run) from public.partner_finance_reminder_runs run where run.id = v_run_id);
end;
$$;

revoke all on function public.get_finance_reminder_dry_run_input() from public, anon, authenticated;
revoke all on function public.publish_finance_reminder_dry_run(date, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.get_finance_reminder_dry_run_input() to service_role;
grant execute on function public.publish_finance_reminder_dry_run(date, integer, jsonb, jsonb) to service_role;

create or replace function public.get_admin_finance_operations()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
begin
  if not public.has_internal_permission('admin.finance.view') then
    raise exception 'Finance operations access denied.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'fresh', (select count(*) from public.partner_companies company
      join public.partner_finance_sync_state state on state.company_id = company.id
      where company.status = 'active' and state.last_success_at >= now() - interval '3 hours' and state.status = 'succeeded'),
    'stale', (select count(*) from public.partner_companies company
      left join public.partner_finance_sync_state state on state.company_id = company.id
      where company.status = 'active' and nullif(btrim(company.external_1c_id), '') is not null
        and (state.last_success_at is null or state.last_success_at < now() - interval '3 hours' or state.status <> 'succeeded')),
    'missingEmail', (select count(distinct candidate.company_id)
      from public.partner_payment_obligations candidate
      where candidate.reconciliation_status = 'READY' and candidate.payment_status <> 'SETTLED'
        and candidate.remaining_amount > 0
        and not exists (
          select 1 from public.company_memberships membership
          join public.roles role on role.id = membership.role_id
          join public.user_profiles profile on profile.id = membership.user_id and profile.status = 'active'
          join public.permissions permission on permission.code = 'finance.view_company'
          join public.role_permissions role_permission
            on role_permission.role_id = role.id and role_permission.permission_id = permission.id
          join public.partner_company_capabilities capability
            on capability.company_id = membership.company_id and capability.permission_id = permission.id
          where membership.company_id = candidate.company_id and membership.status = 'active'
            and role.code in ('partner_accounting', 'partner_owner')
            and profile.email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
            and not exists (
              select 1 from public.membership_permission_overrides denied
              where denied.membership_id = membership.id
                and denied.permission_id = permission.id and denied.effect = 'deny'
            )
        )),
    'supported', count(*) filter (where obligation.reconciliation_status = 'READY'),
    'open', count(*) filter (where obligation.reconciliation_status = 'READY' and obligation.payment_status = 'OPEN'),
    'partial', count(*) filter (where obligation.reconciliation_status = 'READY' and obligation.payment_status = 'PARTIAL'),
    'settled', count(*) filter (where obligation.reconciliation_status = 'READY' and obligation.payment_status = 'SETTLED'),
    'overdue', count(*) filter (where obligation.reconciliation_status = 'READY' and obligation.payment_status <> 'SETTLED' and obligation.due_date < current_date),
    'dueToday', count(*) filter (where obligation.reconciliation_status = 'READY' and obligation.payment_status <> 'SETTLED' and obligation.due_date = current_date),
    'dueNext7', count(*) filter (where obligation.reconciliation_status = 'READY' and obligation.payment_status <> 'SETTLED' and obligation.due_date > current_date and obligation.due_date <= current_date + 7),
    'dueNext30', count(*) filter (where obligation.reconciliation_status = 'READY' and obligation.payment_status <> 'SETTLED' and obligation.due_date > current_date and obligation.due_date <= current_date + 30),
    'nonReconciling', count(*) filter (where obligation.reconciliation_status = 'NON_RECONCILING'),
    'unsupported', count(*) filter (where obligation.reconciliation_status = 'UNSUPPORTED')
      + (select count(*) from public.partner_payment_obligation_exclusions),
    'companiesOverdue', count(distinct obligation.company_id) filter (where obligation.reconciliation_status = 'READY' and obligation.payment_status <> 'SETTLED' and obligation.due_date < current_date),
    'overdueByCurrency', coalesce((select jsonb_object_agg(currency, total) from (
      select currency, sum(remaining_amount) total from public.partner_payment_obligations
      where reconciliation_status = 'READY' and payment_status <> 'SETTLED' and due_date < current_date
      group by currency order by currency
    ) totals), '{}'::jsonb),
    'unsupportedByReason', coalesce((select jsonb_object_agg(reason, total) from (
      select reason, sum(total) total from (
        select unsupported_reason reason, count(*) total from public.partner_payment_obligations
        where unsupported_reason is not null group by unsupported_reason
        union all
        select reason, count(*) total from public.partner_payment_obligation_exclusions group by reason
      ) reasons group by reason order by reason
    ) totals), '{}'::jsonb),
    'ageing', jsonb_build_object(
      '1-3', count(*) filter (where obligation.reconciliation_status = 'READY' and obligation.payment_status <> 'SETTLED' and current_date - obligation.due_date between 1 and 3),
      '4-7', count(*) filter (where obligation.reconciliation_status = 'READY' and obligation.payment_status <> 'SETTLED' and current_date - obligation.due_date between 4 and 7),
      '8-14', count(*) filter (where obligation.reconciliation_status = 'READY' and obligation.payment_status <> 'SETTLED' and current_date - obligation.due_date between 8 and 14),
      '15-30', count(*) filter (where obligation.reconciliation_status = 'READY' and obligation.payment_status <> 'SETTLED' and current_date - obligation.due_date between 15 and 30),
      '30+', count(*) filter (where obligation.reconciliation_status = 'READY' and obligation.payment_status <> 'SETTLED' and current_date - obligation.due_date > 30)
    ),
    'latestDryRun', (select to_jsonb(run) from public.partner_finance_reminder_runs run order by run.created_at desc limit 1)
  )
  from public.partner_payment_obligations obligation
  left join public.partner_finance_sync_state sync_state on sync_state.company_id = obligation.company_id;
end;
$$;

revoke all on function public.get_admin_finance_operations() from public, anon;
grant execute on function public.get_admin_finance_operations() to authenticated;

alter table public.partner_notification_events drop constraint if exists partner_notification_events_code_check;
alter table public.partner_notification_events add constraint partner_notification_events_code_check check (
  event_code in ('order_submitted','order_confirmed','order_requires_attention','order_readback_failed',
    'order_reconciliation_required','order_posted','order_cancelled','shipment_due_in_3_days',
    'shipment_due_today','shipment_overdue','shipment_date_changed','date_change_approved',
    'date_change_rejected','date_change_cancelled','invitation_expiring','invitation_accepted',
    'employee_suspended','role_changed','price_access_changed','onboarding_approved',
    'onboarding_access_opened','watched_product_back_in_stock','watched_product_expected_arrival_added',
    'watched_product_arrived','watched_product_price_changed','cart_product_price_changed',
    'cart_product_availability_changed','campaign_started','campaign_ending_soon','new_invoice_available',
    'reconciliation_statement_available','order_document_available','product_document_updated',
    'document_expiring','warehouse_arrival_completed','service_case_created','service_case_accepted',
    'service_information_requested','service_equipment_expected','service_equipment_received',
    'service_diagnosis_started','service_diagnosis_completed','service_repair_started',
    'service_replacement_approved','service_replacement_waiting','service_ready_for_pickup',
    'service_case_closed','service_case_rejected','service_case_cancelled','support_ticket_created',
    'support_ticket_accepted','support_ticket_reply','support_information_requested','support_solution_proposed',
    'support_ticket_resolved','support_ticket_closed','support_ticket_rejected','service_history_accepted',
    'service_history_ready_for_pickup','service_history_issued','installation_offer','finance_payment_due')
);
alter table public.partner_notifications drop constraint if exists partner_notifications_event_code_check;
alter table public.partner_notifications add constraint partner_notifications_event_code_check check (
  event_code = any(array['order_submitted','order_confirmed','order_requires_attention',
    'order_readback_failed','order_reconciliation_required','order_posted','order_cancelled',
    'shipment_due_in_3_days','shipment_due_today','shipment_overdue','shipment_date_changed',
    'date_change_approved','date_change_rejected','date_change_cancelled','invitation_expiring',
    'invitation_accepted','employee_suspended','role_changed','price_access_changed','onboarding_approved',
    'onboarding_access_opened','watched_product_back_in_stock','watched_product_expected_arrival_added',
    'watched_product_arrived','watched_product_price_changed','cart_product_price_changed',
    'cart_product_availability_changed','campaign_started','campaign_ending_soon','new_invoice_available',
    'reconciliation_statement_available','order_document_available','product_document_updated',
    'document_expiring','warehouse_arrival_completed','service_case_created','service_case_accepted',
    'service_information_requested','service_equipment_expected','service_equipment_received',
    'service_diagnosis_started','service_diagnosis_completed','service_repair_started',
    'service_replacement_approved','service_replacement_waiting','service_ready_for_pickup',
    'service_case_closed','service_case_rejected','service_case_cancelled','support_ticket_created',
    'support_ticket_accepted','support_ticket_reply','support_information_requested','support_solution_proposed',
    'support_ticket_resolved','support_ticket_closed','support_ticket_rejected','service_history_accepted',
    'service_history_ready_for_pickup','service_history_issued','installation_offer','finance_payment_due'])
);
alter table public.partner_notification_events drop constraint if exists partner_notification_events_group_check;
alter table public.partner_notification_events add constraint partner_notification_events_group_check check (
  event_group in ('orders','shipments','company_access','products','commercial','documents','service','support','installation','finance')
);
alter table public.partner_notifications drop constraint if exists partner_notifications_group_check;
alter table public.partner_notifications add constraint partner_notifications_group_check check (
  event_group in ('orders','shipments','company_access','products','commercial','documents','service','support','installation','finance')
);
alter table public.partner_notification_preferences drop constraint if exists partner_notification_preferences_group_check;
alter table public.partner_notification_preferences add constraint partner_notification_preferences_group_check check (
  event_group in ('orders','shipments','company_access','products','commercial','documents','service','support','installation','finance')
);

create or replace function public.is_allowed_partner_notification_url(value text)
returns boolean language sql immutable set search_path = '' as $$
  select value ~ '^/cabinet/orders/[0-9a-f-]{36}(\?tab=date-change)?$'
    or value ~ '^/cabinet/catalog/[a-z0-9-]+$'
    or value in ('/cabinet/reservation-requests','/cabinet/company/users','/cabinet/cart',
      '/cabinet/campaigns','/cabinet/documents','/cabinet/service','/cabinet/support','/cabinet/finance');
$$;

comment on table public.partner_payment_obligations is
  'Company-scoped current read model for proven single-line 1C payment obligations. 1C remains authoritative.';
comment on column public.partner_payment_obligations.schedule_line_number is
  'Current source snapshot position only; it is not a durable accounting identity.';
comment on table public.partner_finance_reminder_projections is
  'Dry-run-only FINANCE_REMINDER_V1 channel projections. No row authorizes outbound delivery.';

commit;
