create or replace function public.remove_estimate_items(
  target_estimate_id uuid,
  target_item_ids uuid[],
  expected_revision integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.estimates;
  requested_count integer;
  removed_count integer;
begin
  select * into target
  from public.estimates
  where id = target_estimate_id
  for update;

  if target.id is null or target.status <> 'draft'
     or not public.can_access_estimates(target.company_id, 'estimates.manage') then
    raise exception 'Estimate draft is not available.' using errcode = '42501';
  end if;
  if target.revision <> expected_revision then
    raise exception 'Estimate was changed by another session.' using errcode = '40001';
  end if;

  select count(distinct item_id) into requested_count
  from unnest(target_item_ids) item_id
  where item_id is not null;
  if requested_count < 1 or requested_count > 100
     or requested_count <> coalesce(array_length(target_item_ids, 1), 0) then
    raise exception 'Estimate line selection is invalid.' using errcode = '22023';
  end if;
  if requested_count <> (
    select count(*)
    from public.estimate_items
    where estimate_id = target.id and id = any(target_item_ids)
  ) then
    raise exception 'One or more estimate lines were not found.' using errcode = 'P0002';
  end if;

  perform set_config('app.estimate_batch_update', 'on', true);
  delete from public.estimate_items
  where estimate_id = target.id and id = any(target_item_ids);
  get diagnostics removed_count = row_count;

  with ordered as (
    select id, row_number() over (order by position, id) as next_position
    from public.estimate_items
    where estimate_id = target.id
  )
  update public.estimate_items item
  set position = ordered.next_position
  from ordered
  where item.id = ordered.id;

  perform set_config('app.estimate_batch_update', 'off', true);
  perform public.recalculate_estimate_totals(target.id);
  insert into public.estimate_events (estimate_id, actor_user_id, event_type)
  values (target.id, auth.uid(), 'line_removed');
  return removed_count;
end;
$$;

revoke all on function public.remove_estimate_items(uuid, uuid[], integer) from public, anon;
grant execute on function public.remove_estimate_items(uuid, uuid[], integer) to authenticated;

comment on function public.remove_estimate_items(uuid, uuid[], integer) is
  'Atomically removes a bounded set of company-authorized draft estimate lines under optimistic revision protection.';
