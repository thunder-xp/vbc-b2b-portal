begin;

-- Public Retail snapshots are immutable after publication. Keep the existing
-- building-publication hydrator intact, but make later shared-badge refreshes
-- a deliberate no-op for published/superseded snapshots. A future normal
-- Retail publication will read the current automated TOP assignments.
alter function public.hydrate_public_retail_product_presentation(uuid)
  rename to hydrate_public_retail_product_presentation_building;

create function public.hydrate_public_retail_product_presentation(
  p_publication_id uuid
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.public_retail_publications publication
    where publication.id = p_publication_id
      and publication.status in ('published', 'superseded')
  ) then
    return;
  end if;

  perform public.hydrate_public_retail_product_presentation_building(
    p_publication_id
  );
end;
$$;

revoke all on function
  public.hydrate_public_retail_product_presentation_building(uuid),
  public.hydrate_public_retail_product_presentation(uuid)
from public, anon, authenticated;

grant execute on function
  public.hydrate_public_retail_product_presentation_building(uuid),
  public.hydrate_public_retail_product_presentation(uuid)
to service_role;

comment on function public.hydrate_public_retail_product_presentation(uuid) is
  'Hydrates only mutable Public Retail builds; immutable published snapshots are preserved and receive current shared badges on the next normal publication.';

commit;
