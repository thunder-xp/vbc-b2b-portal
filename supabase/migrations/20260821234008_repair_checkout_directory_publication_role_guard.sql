create or replace function public.publish_one_c_counterparty_directory(p_sync_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  published_count integer;
  sync public.one_c_counterparty_directory_syncs%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Directory publication requires service role.' using errcode = '42501';
  end if;

  select * into sync
  from public.one_c_counterparty_directory_syncs
  where sync_id = p_sync_id and status = 'running'
  for update;

  if sync.sync_id is null then
    raise exception 'Active directory synchronization was not found.' using errcode = 'P0002';
  end if;
  if sync.fetched_counterparties <= 0 or sync.staged_counterparties <= 0
    or sync.duplicate_counterparty_rows <> 0
    or sync.fetched_counterparties <> sync.staged_counterparties + sync.skipped_counterparties
    or sync.pages_processed <= 0 then
    raise exception 'Directory synchronization is incomplete.' using errcode = '22023';
  end if;

  update public.one_c_counterparties set is_published = false where is_published;
  update public.one_c_counterparty_contracts set is_published = false where is_published;
  update public.one_c_counterparty_price_profiles set is_published = false where is_published;
  update public.one_c_delivery_carriers set is_published = false where is_published;

  update public.one_c_counterparties counterparty
  set is_published = true, portal_company_id = company.id, updated_at = now()
  from public.partner_companies company
  where counterparty.sync_id = p_sync_id
    and lower(company.external_1c_id) = lower(counterparty.external_1c_id);
  update public.one_c_counterparties set is_published = true, updated_at = now()
  where sync_id = p_sync_id and not is_published;
  update public.one_c_counterparty_contracts set is_published = true where sync_id = p_sync_id;
  update public.one_c_counterparty_price_profiles set is_published = true where sync_id = p_sync_id;
  update public.one_c_delivery_carriers set is_published = true where sync_id = p_sync_id;

  select count(*) into published_count
  from public.one_c_counterparties
  where sync_id = p_sync_id and is_published;

  update public.one_c_counterparty_directory_syncs
  set status = 'succeeded',
      finished_at = now(),
      lock_acquired_at = null,
      published_counterparties = published_count,
      portal_linked = (
        select count(*)
        from public.one_c_counterparties
        where sync_id = p_sync_id and portal_company_id is not null
      ),
      updated_at = now()
  where sync_id = p_sync_id;

  return jsonb_build_object(
    'published', published_count,
    'portalLinked', (
      select count(*)
      from public.one_c_counterparties
      where sync_id = p_sync_id and portal_company_id is not null
    ),
    'carriers', (
      select count(*)
      from public.one_c_delivery_carriers
      where sync_id = p_sync_id and is_published
    ),
    'syncId', p_sync_id
  );
end;
$$;

revoke all on function public.publish_one_c_counterparty_directory(uuid)
  from public, anon, authenticated;
grant execute on function public.publish_one_c_counterparty_directory(uuid)
  to service_role;
