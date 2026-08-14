begin;

alter table public.partner_companies
  add column if not exists public_directory_visible boolean not null default false,
  add column if not exists public_directory_logo_asset_path text null;

alter table public.partner_companies
  add constraint partner_companies_public_directory_logo_path_check
  check (
    public_directory_logo_asset_path is null
    or public_directory_logo_asset_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.(png|jpg|webp)$')
  );

comment on column public.partner_companies.public_directory_visible is
  'Explicit internal approval for anonymous public-directory publication. Active portal status alone never grants public visibility.';
comment on column public.partner_companies.public_directory_logo_asset_path is
  'Approved public logo snapshot. Partner-managed logo changes revoke directory publication until reviewed again.';

create index partner_companies_public_directory_name_idx
  on public.partner_companies ((lower(display_name)), id)
  where public_directory_visible = true and status = 'active';

create or replace function public.revoke_public_partner_directory_on_logo_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.logo_asset_path is distinct from new.logo_asset_path
     and new.public_directory_logo_asset_path is distinct from new.logo_asset_path then
    new.public_directory_visible := false;
    new.public_directory_logo_asset_path := null;
  end if;
  return new;
end;
$$;

create trigger revoke_public_partner_directory_on_logo_change
before update of logo_asset_path on public.partner_companies
for each row execute function public.revoke_public_partner_directory_on_logo_change();

create or replace function public.list_public_partner_directory()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'displayName', company.display_name,
    'logoAssetPath', company.public_directory_logo_asset_path
  ) order by lower(company.display_name), company.id), '[]'::jsonb)
  from (
    select id, display_name, public_directory_logo_asset_path
    from public.partner_companies
    where status = 'active' and public_directory_visible = true
    order by lower(display_name), id
    limit 100
  ) company;
$$;

revoke all on function public.revoke_public_partner_directory_on_logo_change() from public, anon, authenticated;
revoke all on function public.list_public_partner_directory() from public, anon, authenticated;
grant execute on function public.list_public_partner_directory() to anon;

comment on function public.list_public_partner_directory() is
  'Bounded anonymous allowlist returning only explicitly approved company display names and approved public logo paths.';

commit;
