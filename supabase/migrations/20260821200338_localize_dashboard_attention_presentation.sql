-- Presentation copy is reconstructed from stable attention kinds in the application.
-- Keep the database wrapper responsible only for the canonical destination route.
create or replace function public.get_partner_workspace_dashboard_v5(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  result jsonb;
  adjusted jsonb;
begin
  result := public.get_partner_workspace_dashboard_v4(p_company_id);

  select coalesce(jsonb_agg(
    case when item->>'kind' = 'notification_warehouse_arrival_completed'
      then item || jsonb_build_object('href', '/cabinet/catalog/replenishment')
      else item
    end order by ordinal
  ), '[]'::jsonb)
  into adjusted
  from jsonb_array_elements(coalesce(result->'attentionItems', '[]'::jsonb))
    with ordinality as entries(item, ordinal);

  return jsonb_set(result, '{attentionItems}', adjusted);
end;
$$;
