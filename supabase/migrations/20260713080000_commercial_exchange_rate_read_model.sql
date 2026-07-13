-- Minimal 1C/BCRU exchange-rate read model for server-side commercial calculations.
-- The integration layer must normalize source values to MDL per 1 USD before publishing.
create table if not exists public.commercial_exchange_rates (
  id uuid primary key default gen_random_uuid(),
  source_code text not null,
  base_currency text not null,
  quote_currency text not null,
  rate_direction text not null,
  rate numeric(18, 6) not null,
  effective_date date not null,
  source_updated_at timestamptz,
  published_at timestamptz not null default now(),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_exchange_rates_source_key unique (source_code, base_currency, quote_currency, effective_date),
  constraint commercial_exchange_rates_rate_positive check (rate > 0),
  constraint commercial_exchange_rates_direction_check check (rate_direction = 'quote_per_base')
);

comment on table public.commercial_exchange_rates is
  'Read-only portal cache of 1C/BCRU exchange rates. 1C remains the source of truth; no fallback or seeded rate is permitted.';

create index if not exists commercial_exchange_rates_latest_idx
  on public.commercial_exchange_rates(source_code, base_currency, quote_currency, effective_date desc)
  where is_published = true;

drop trigger if exists set_commercial_exchange_rates_updated_at on public.commercial_exchange_rates;
create trigger set_commercial_exchange_rates_updated_at
before update on public.commercial_exchange_rates
for each row execute function public.set_updated_at();

alter table public.commercial_exchange_rates enable row level security;
revoke all on table public.commercial_exchange_rates from anon, authenticated;
grant select on table public.commercial_exchange_rates to authenticated;

drop policy if exists "Approved users can select published commercial exchange rates" on public.commercial_exchange_rates;
create policy "Approved users can select published commercial exchange rates"
on public.commercial_exchange_rates
for select
to authenticated
using (
  is_published = true
  and exists (
    select 1
    from public.company_memberships cm
    join public.partner_companies pc on pc.id = cm.company_id
    join public.user_profiles up on up.id = cm.user_id
    join public.role_permissions rp on rp.role_id = cm.role_id
    join public.permissions p on p.id = rp.permission_id
    where cm.user_id = auth.uid()
      and cm.status = 'active'
      and pc.status = 'active'
      and up.status = 'active'
      and p.code = 'prices.view'
  )
);
