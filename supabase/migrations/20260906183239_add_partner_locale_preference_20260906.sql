alter table public.user_profiles
  add column if not exists preferred_locale text;

alter table public.user_profiles
  drop constraint if exists user_profiles_preferred_locale_check;

alter table public.user_profiles
  add constraint user_profiles_preferred_locale_check
  check (preferred_locale is null or preferred_locale in ('ru', 'ro'));

grant select (preferred_locale) on public.user_profiles to authenticated;
grant update (preferred_locale) on public.user_profiles to authenticated;

comment on column public.user_profiles.preferred_locale is
  'Partner UI locale persisted for the authenticated account.';
