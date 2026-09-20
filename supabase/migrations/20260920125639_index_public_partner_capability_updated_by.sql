create index public_partner_capabilities_updated_by_idx
  on public.public_partner_capabilities(updated_by)
  where updated_by is not null;
