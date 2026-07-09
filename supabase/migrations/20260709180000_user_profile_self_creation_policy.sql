-- Enables authenticated users to create only their own initial portal profile.
-- This is required for the first-login onboarding flow and does not grant any
-- admin, internal, or commercial access.

grant insert (id, email, full_name, phone, status, user_type)
on table public.user_profiles
to authenticated;

create policy "Users can create own initial external profile"
on public.user_profiles
for insert
to authenticated
with check (
  id = auth.uid()
  and email = (auth.jwt() ->> 'email')
  and status = 'registered'
  and user_type = 'external'
);
