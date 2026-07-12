create table if not exists public.price_types (
  id uuid primary key default gen_random_uuid(), external_ref text not null unique, external_code text, name text not null,
  currency_ref text, currency_code text, currency_status text not null default 'unresolved', is_active boolean not null default true,
  source_updated_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (currency_status in ('resolved','unresolved'))
);
alter table public.price_types enable row level security;
revoke all on public.price_types from anon, authenticated;
grant select, insert, update on public.price_types to authenticated;
create policy "Internal users manage price types" on public.price_types for all to authenticated using (public.can_sync_catalog_read_model()) with check (public.can_sync_catalog_read_model());
grant insert, update on public.product_prices to authenticated;
create policy "Internal users insert product prices" on public.product_prices for insert to authenticated with check (public.can_sync_catalog_read_model());
create policy "Internal users update product prices" on public.product_prices for update to authenticated using (public.can_sync_catalog_read_model()) with check (public.can_sync_catalog_read_model());
alter table public.product_prices add column if not exists price_type_id uuid references public.price_types(id), add column if not exists external_product_ref text, add column if not exists effective_at timestamptz, add column if not exists synced_at timestamptz, add column if not exists source_version text, add column if not exists currency_status text not null default 'unresolved', add column if not exists last_seen_sync_id uuid, add column if not exists is_published boolean not null default true;
alter table public.product_prices drop constraint if exists product_prices_currency_format_check;
alter table public.product_prices add constraint product_prices_currency_status_check check (currency_status in ('resolved','unresolved'));
create unique index if not exists product_prices_product_price_type_unique on public.product_prices(product_id, external_1c_price_type_id);
create index if not exists product_prices_external_product_idx on public.product_prices(external_product_ref);
create index if not exists product_prices_external_price_type_idx on public.product_prices(external_1c_price_type_id);
create or replace function public.resolve_product_price_type_id() returns trigger language plpgsql as $$
begin
  select id into new.price_type_id from public.price_types where external_ref = new.external_1c_price_type_id and is_active = true;
  return new;
end; $$;
drop trigger if exists resolve_product_price_type_id_trigger on public.product_prices;
create trigger resolve_product_price_type_id_trigger before insert or update of external_1c_price_type_id on public.product_prices for each row execute function public.resolve_product_price_type_id();
create or replace function public.finalize_product_price_snapshot(p_sync_id uuid) returns integer language plpgsql security definer set search_path = public as $$
declare deactivated integer;
begin
  if not public.can_sync_catalog_read_model() then raise exception 'forbidden'; end if;
  update public.product_prices set is_published = true where last_seen_sync_id = p_sync_id;
  update public.product_prices set is_active = false where is_active = true and is_published = true and last_seen_sync_id is distinct from p_sync_id;
  get diagnostics deactivated = row_count;
  return deactivated;
end; $$;
revoke all on function public.finalize_product_price_snapshot(uuid) from public;
grant execute on function public.finalize_product_price_snapshot(uuid) to authenticated;
drop policy if exists "Approved users can select permitted active product prices" on public.product_prices;
create policy "Approved users can select permitted active product prices" on public.product_prices for select to authenticated using (
  is_active and is_published and valid_from <= now() and (valid_to is null or valid_to >= now())
  and public.can_select_product_commercial_data(product_id, company_id, 'prices.view')
);
