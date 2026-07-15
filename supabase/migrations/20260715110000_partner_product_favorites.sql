create table if not exists public.partner_product_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  company_id uuid not null references public.partner_companies(id) on delete cascade,
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint partner_product_favorites_owner_product_unique unique (user_id, company_id, product_id)
);

comment on table public.partner_product_favorites is
  'Portal-owned partner favorite products. Product and company identities remain subject to catalog and membership access.';

create index if not exists partner_product_favorites_owner_idx
  on public.partner_product_favorites(user_id, company_id, created_at desc);

alter table public.partner_product_favorites enable row level security;
revoke all on table public.partner_product_favorites from anon, authenticated;
grant select, insert, delete on table public.partner_product_favorites to authenticated;

drop policy if exists partner_product_favorites_select_own on public.partner_product_favorites;
create policy partner_product_favorites_select_own
on public.partner_product_favorites for select to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1 from public.company_memberships membership
    join public.partner_companies company on company.id = membership.company_id
    where membership.user_id = auth.uid()
      and membership.company_id = partner_product_favorites.company_id
      and membership.status = 'active'
      and company.status = 'active'
  )
);

drop policy if exists partner_product_favorites_insert_own on public.partner_product_favorites;
create policy partner_product_favorites_insert_own
on public.partner_product_favorites for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.company_memberships membership
    join public.partner_companies company on company.id = membership.company_id
    join public.catalog_products product on product.id = partner_product_favorites.product_id
    where membership.user_id = auth.uid()
      and membership.company_id = partner_product_favorites.company_id
      and membership.status = 'active'
      and company.status = 'active'
      and product.is_active = true
      and product.is_visible = true
  )
);

drop policy if exists partner_product_favorites_delete_own on public.partner_product_favorites;
create policy partner_product_favorites_delete_own
on public.partner_product_favorites for delete to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1 from public.company_memberships membership
    where membership.user_id = auth.uid()
      and membership.company_id = partner_product_favorites.company_id
      and membership.status = 'active'
  )
);
