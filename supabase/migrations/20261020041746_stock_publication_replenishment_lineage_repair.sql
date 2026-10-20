begin;

-- 20260820191441 added this single-arrival projection writer. The schema and
-- projection moved to latest-three, fully attributed shipments in
-- 20260912080603. The outer source-recovery publisher already reconciles that
-- projection after stock/arrival publication, under the publication lock.
-- Keep the historical function identity, caller contract and invoker rights;
-- bypass only its obsolete projection and notification mutations.
create or replace function public.publish_exact_stock_snapshot_replenishment_day_base(
  p_sync_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions
as $$
begin
  return public.publish_exact_stock_snapshot_current_replenishment_base(p_sync_id);
end;
$$;

revoke all on function public.publish_exact_stock_snapshot_replenishment_day_base(uuid)
  from public, anon, authenticated;
grant execute on function public.publish_exact_stock_snapshot_replenishment_day_base(uuid)
  to service_role;

comment on function public.publish_exact_stock_snapshot_replenishment_day_base(uuid) is
  'Compatibility delegate: stock and immutable arrival publication only. The outer publisher owns canonical latest-three replenishment reconciliation.';

commit;
