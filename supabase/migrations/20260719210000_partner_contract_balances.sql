begin;

create table if not exists public.partner_contract_balances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete cascade,
  external_counterparty_ref text not null,
  external_contract_ref text not null,
  contract_number text not null,
  contract_name text not null,
  currency_ref text not null,
  currency_code text not null,
  signed_balance numeric(20, 4) not null,
  source_version text null,
  synchronized_at timestamptz not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_contract_balances_identity_unique
    unique(company_id, external_contract_ref, currency_ref),
  constraint partner_contract_balances_nonzero_check check (signed_balance <> 0),
  constraint partner_contract_balances_currency_check check (currency_code = upper(currency_code))
);

create index if not exists partner_contract_balances_company_active_idx
  on public.partner_contract_balances(company_id, currency_code, contract_name, id)
  where is_active;

drop trigger if exists set_partner_contract_balances_updated_at on public.partner_contract_balances;
create trigger set_partner_contract_balances_updated_at before update on public.partner_contract_balances
for each row execute function public.set_updated_at();

alter table public.partner_contract_balances enable row level security;
revoke all on table public.partner_contract_balances from anon, authenticated;
grant select on table public.partner_contract_balances to authenticated;

drop policy if exists "Partners select permitted contract balances" on public.partner_contract_balances;
create policy "Partners select permitted contract balances"
on public.partner_contract_balances for select to authenticated
using (is_active and public.has_permission(company_id, 'finance.view_company'));

create or replace function public.publish_partner_contract_balances(
  p_company_id uuid,
  p_counterparty_ref text,
  p_synchronized_at timestamptz,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare published_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Finance synchronization is server-only.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Contract balance snapshot is invalid.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.partner_companies company
    where company.id = p_company_id
      and company.status = 'active'
      and company.external_1c_id = p_counterparty_ref
  ) then
    raise exception 'Company mapping is invalid.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('partner_contract_balances:' || p_company_id::text, 0));

  with source_rows as (
    select * from jsonb_to_recordset(p_rows) as source(
      external_contract_ref text,
      contract_number text,
      contract_name text,
      currency_ref text,
      currency_code text,
      signed_balance numeric,
      source_version text
    )
  ), validated as (
    select * from source_rows
    where nullif(btrim(external_contract_ref), '') is not null
      and nullif(btrim(currency_ref), '') is not null
      and nullif(btrim(currency_code), '') is not null
      and signed_balance <> 0
  )
  insert into public.partner_contract_balances (
    company_id, external_counterparty_ref, external_contract_ref,
    contract_number, contract_name, currency_ref, currency_code,
    signed_balance, source_version, synchronized_at, is_active
  )
  select p_company_id, p_counterparty_ref, external_contract_ref,
    contract_number, contract_name, currency_ref, upper(currency_code),
    signed_balance, source_version, p_synchronized_at, true
  from validated
  on conflict (company_id, external_contract_ref, currency_ref) do update set
    external_counterparty_ref = excluded.external_counterparty_ref,
    contract_number = excluded.contract_number,
    contract_name = excluded.contract_name,
    currency_code = excluded.currency_code,
    signed_balance = excluded.signed_balance,
    source_version = excluded.source_version,
    synchronized_at = excluded.synchronized_at,
    is_active = true;

  get diagnostics published_count = row_count;

  update public.partner_contract_balances balance
  set is_active = false, synchronized_at = p_synchronized_at
  where balance.company_id = p_company_id
    and balance.is_active
    and not exists (
      select 1
      from jsonb_to_recordset(p_rows) as source(external_contract_ref text, currency_ref text)
      where source.external_contract_ref = balance.external_contract_ref
        and source.currency_ref = balance.currency_ref
    );

  return published_count;
end;
$$;

revoke all on function public.publish_partner_contract_balances(uuid, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.publish_partner_contract_balances(uuid, text, timestamptz, jsonb) to service_role;

comment on table public.partner_contract_balances is
  'Read-only partner contract-balance cache. 1C AccumulationRegister_РасчетыСПокупателями Balance remains the sole financial source of truth.';
comment on column public.partner_contract_balances.signed_balance is
  'Signed 1C source value: positive means partner receivable; negative means partner advance or overpayment.';

commit;
