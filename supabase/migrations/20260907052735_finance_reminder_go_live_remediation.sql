begin;

alter table public.partner_finance_reminder_projections
  drop constraint if exists partner_finance_reminder_projections_fingerprint_key;

alter table public.partner_finance_reminder_projections
  add column timing_states text[] not null default '{}'::text[],
  add column from_name text null,
  add column from_email text null,
  add column cta_label text not null default '',
  add column cta_target text not null default '/cabinet/finance',
  add column content_payload jsonb not null default '{}'::jsonb,
  add column delivery_identity text null;

update public.partner_finance_reminder_projections
set delivery_identity = encode(extensions.digest('LEGACY_DRY_RUN|' || fingerprint, 'sha256'), 'hex')
where delivery_identity is null;

alter table public.partner_finance_reminder_projections
  alter column delivery_identity set not null,
  add constraint partner_finance_reminder_projections_timing_states_check
    check (timing_states <@ array['UPCOMING', 'DUE_TODAY', 'OVERDUE']::text[]),
  add constraint partner_finance_reminder_projections_from_name_check
    check (from_name is null or (char_length(from_name) between 1 and 120 and from_name !~ E'[\\r\\n]')),
  add constraint partner_finance_reminder_projections_from_email_check
    check (from_email is null or (char_length(from_email) between 3 and 254 and from_email = lower(btrim(from_email)))),
  add constraint partner_finance_reminder_projections_cta_label_check
    check (char_length(cta_label) <= 120 and cta_label !~ E'[\\r\\n]'),
  add constraint partner_finance_reminder_projections_cta_target_check
    check (cta_target = '/cabinet/finance'),
  add constraint partner_finance_reminder_projections_content_payload_check
    check (jsonb_typeof(content_payload) = 'object' and octet_length(content_payload::text) <= 65536),
  add constraint partner_finance_reminder_projections_delivery_identity_check
    check (delivery_identity ~ '^[0-9a-f]{64}$');

create unique index partner_finance_reminder_projections_run_review_identity_idx
  on public.partner_finance_reminder_projections(run_id, fingerprint);
create index partner_finance_reminder_projections_delivery_identity_idx
  on public.partner_finance_reminder_projections(delivery_identity);

comment on column public.partner_finance_reminder_projections.fingerprint is
  'DRY_RUN review identity. Scoped to one run and never consulted for LIVE delivery suppression.';
comment on column public.partner_finance_reminder_projections.delivery_identity is
  'Deterministic LIVE delivery identity. Repeated DRY_RUN rows may share it safely.';

create table public.partner_finance_reminder_delivery_receipts (
  id uuid primary key default gen_random_uuid(),
  delivery_identity text not null unique,
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  channel text not null,
  recipient_user_id uuid null references public.user_profiles(id) on delete restrict,
  recipient text null,
  obligation_ids uuid[] not null,
  provider_message_id text null,
  delivered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint partner_finance_reminder_delivery_receipts_identity_check
    check (delivery_identity ~ '^[0-9a-f]{64}$'),
  constraint partner_finance_reminder_delivery_receipts_channel_check
    check (channel in ('email', 'in_app', 'sms_future')),
  constraint partner_finance_reminder_delivery_receipts_obligations_check
    check (cardinality(obligation_ids) > 0),
  constraint partner_finance_reminder_delivery_receipts_recipient_check
    check (recipient is null or (char_length(recipient) between 3 and 320 and recipient = lower(btrim(recipient)))),
  constraint partner_finance_reminder_delivery_receipts_provider_check
    check (provider_message_id is null or char_length(provider_message_id) <= 300)
);

create index partner_finance_reminder_delivery_receipts_company_delivered_idx
  on public.partner_finance_reminder_delivery_receipts(company_id, delivered_at desc);

create function public.prevent_finance_reminder_delivery_receipt_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Finance reminder delivery receipts are append-only.' using errcode = '55000';
end;
$$;

create trigger prevent_finance_reminder_delivery_receipt_mutation
before update or delete on public.partner_finance_reminder_delivery_receipts
for each row execute function public.prevent_finance_reminder_delivery_receipt_mutation();

alter table public.partner_finance_reminder_delivery_receipts enable row level security;
revoke all on table public.partner_finance_reminder_delivery_receipts from public, anon, authenticated;
grant select, insert on table public.partner_finance_reminder_delivery_receipts to service_role;
revoke all on function public.prevent_finance_reminder_delivery_receipt_mutation() from public, anon, authenticated;

create function public.get_finance_reminder_delivered_identities(p_delivery_identities text[])
returns text[]
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Finance reminder delivery evidence is server-only.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_delivery_identities), 0) > 2000 then
    raise exception 'Finance reminder delivery identity batch is too large.' using errcode = '22023';
  end if;
  return coalesce(array(
    select receipt.delivery_identity
    from public.partner_finance_reminder_delivery_receipts receipt
    where receipt.delivery_identity = any(coalesce(p_delivery_identities, '{}'::text[]))
    order by receipt.delivery_identity
  ), '{}'::text[]);
end;
$$;

revoke all on function public.get_finance_reminder_delivered_identities(text[]) from public, anon, authenticated;
grant execute on function public.get_finance_reminder_delivered_identities(text[]) to service_role;

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
      'recipientRole', recipient.role_code,
      'locale', coalesce(recipient.preferred_locale, 'ru')
    ) order by company.id, obligation.due_date, obligation.id)
    from public.partner_payment_obligations obligation
    join public.partner_companies company on company.id = obligation.company_id and company.status = 'active'
    left join public.partner_finance_sync_state state on state.company_id = obligation.company_id
    left join lateral (
      select membership.user_id, profile.email, profile.preferred_locale, role.code role_code
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

  select coalesce(sum(grouped.row_count - 1), 0)::integer into v_duplicate_count
  from (
    select count(*) row_count
    from jsonb_to_recordset(p_projections) source(fingerprint text)
    group by source.fingerprint
    having count(*) > 1
  ) grouped;

  insert into public.partner_finance_reminder_runs(business_date, policy_version, duration_ms)
  values (p_business_date, 'FINANCE_REMINDER_V1', p_duration_ms)
  returning id into v_run_id;

  insert into public.partner_finance_reminder_projections(
    run_id, company_id, channel, recipient_user_id, recipient_email, locale,
    milestone, timing_states, obligation_ids, totals_by_currency, subject, body,
    from_name, from_email, cta_label, cta_target, content_payload, delivery_identity, fingerprint
  )
  select v_run_id, source.company_id, source.channel, source.recipient_user_id,
    nullif(lower(btrim(source.recipient_email)), ''), source.locale, source.milestone,
    coalesce(source.timing_states, '{}'::text[]), source.obligation_ids, source.totals_by_currency, source.subject, source.body,
    nullif(btrim(source.from_name), ''), nullif(lower(btrim(source.from_email)), ''),
    coalesce(source.cta_label, ''), coalesce(source.cta_target, '/cabinet/finance'),
    coalesce(source.content_payload, '{}'::jsonb),
    coalesce(source.delivery_identity, encode(extensions.digest('LEGACY_COMPAT|' || source.fingerprint, 'sha256'), 'hex')),
    source.fingerprint
  from jsonb_to_recordset(p_projections) source(
    company_id uuid, channel text, recipient_user_id uuid, recipient_email text,
    locale text, milestone text, timing_states text[], obligation_ids uuid[], totals_by_currency jsonb,
    subject text, body text, from_name text, from_email text, cta_label text, cta_target text,
    content_payload jsonb, delivery_identity text, fingerprint text
  )
  on conflict (run_id, fingerprint) do nothing;

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

comment on table public.partner_finance_reminder_delivery_receipts is
  'Append-only evidence of successful LIVE delivery. DRY_RUN never writes this table.';

commit;
