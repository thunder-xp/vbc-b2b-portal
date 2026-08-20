-- Allow the permission-checked facet aggregate to read the private current
-- replenishment snapshot without exposing that snapshot to partner sessions.
alter function public.catalog_partner_facets_v2(
  uuid, uuid, uuid, text, text, jsonb, text, integer
) security definer;

alter function public.catalog_partner_facets_v2(
  uuid, uuid, uuid, text, text, jsonb, text, integer
) set search_path = public;

revoke all on function public.catalog_partner_facets_v2(
  uuid, uuid, uuid, text, text, jsonb, text, integer
) from public, anon;

grant execute on function public.catalog_partner_facets_v2(
  uuid, uuid, uuid, text, text, jsonb, text, integer
) to authenticated;

comment on function public.catalog_partner_facets_v2(
  uuid, uuid, uuid, text, text, jsonb, text, integer
) is
  'Returns permission-checked partner catalog facets scoped to an optional governed selection, including the private current replenishment snapshot.';
