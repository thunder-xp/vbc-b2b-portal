-- Cache the 1C counterparty code alongside its canonical Ref_Key.
alter table public.partner_companies
add column if not exists external_1c_code text null;

comment on column public.partner_companies.external_1c_code is
  '1C counterparty Code cached for internal traceability. external_1c_id remains the canonical Ref_Key.';

grant select (external_1c_code) on table public.partner_companies to authenticated;
grant insert (external_1c_code) on table public.partner_companies to authenticated;
grant update (external_1c_code) on table public.partner_companies to authenticated;
