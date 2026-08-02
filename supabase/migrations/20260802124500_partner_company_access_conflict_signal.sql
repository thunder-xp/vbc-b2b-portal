begin;

create or replace function public.update_admin_partner_company_access(
  p_company_id uuid,
  p_expected_version integer,
  p_preset_code text,
  p_enabled_permission_codes text[],
  p_note text,
  p_correlation_id uuid
)
returns jsonb language plpgsql security definer set search_path = public set row_security = off as $$
declare actor uuid := auth.uid(); current_policy public.partner_company_access_policies%rowtype;
declare requested_codes text[]; next_codes text[]; invalid_codes text[]; next_version integer;
begin
  if actor is null or not public.has_internal_permission('admin.permissions.manage') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_correlation_id is null or p_expected_version < 1
    or p_preset_code not in ('full_partner_access', 'orders_only', 'catalog_only', 'custom') then
    raise exception 'Invalid access update' using errcode = '22023';
  end if;

  select * into current_policy from public.partner_company_access_policies
  where company_id = p_company_id for update;
  if current_policy.company_id is null then raise exception 'Company access not found' using errcode = 'P0002'; end if;
  if current_policy.version <> p_expected_version then
    raise exception 'stale_company_access_version' using errcode = 'PT409';
  end if;

  if p_preset_code = 'custom' then
    select coalesce(array_agg(distinct code order by code), '{}') into requested_codes
    from unnest(coalesce(p_enabled_permission_codes, '{}')) code;

    select coalesce(array_agg(code order by code), '{}') into invalid_codes
    from unnest(requested_codes) code
    where code in ('company_users.manage', 'prices.view') or not exists (
      select 1 from public.partner_access_preset_capabilities capability
      join public.permissions permission on permission.id = capability.permission_id
      where capability.preset_code = 'full_partner_access' and permission.code = code
    );
    if cardinality(invalid_codes) > 0 then
      raise exception 'Unsupported company capability' using errcode = '22023';
    end if;

    next_codes := requested_codes;
    if requested_codes && array['pricing.partner_price.view', 'pricing.retail_price.view']::text[] then
      next_codes := array(
        select distinct code
        from unnest(requested_codes || array['prices.view']) code
        order by code
      );
    end if;
  else
    select coalesce(array_agg(permission.code order by permission.code), '{}') into next_codes
    from public.partner_access_preset_capabilities capability
    join public.permissions permission on permission.id = capability.permission_id
    where capability.preset_code = p_preset_code;
  end if;

  next_version := current_policy.version + 1;
  delete from public.partner_company_capabilities where company_id = p_company_id;
  insert into public.partner_company_capabilities(company_id, permission_id, enabled_by)
  select p_company_id, permission.id, actor from public.permissions permission
  where permission.code = any(next_codes);

  update public.partner_company_access_policies
  set preset_code = p_preset_code, version = next_version, changed_by = actor,
    change_note = nullif(left(btrim(coalesce(p_note, '')), 500), ''), changed_at = now()
  where company_id = p_company_id;

  insert into public.partner_company_access_events(
    company_id, actor_user_id, event_type, previous_preset_code, next_preset_code,
    previous_version, next_version, enabled_permission_codes, note, correlation_id
  ) values (
    p_company_id, actor, 'access_updated', current_policy.preset_code, p_preset_code,
    current_policy.version, next_version, next_codes,
    nullif(left(btrim(coalesce(p_note, '')), 500), ''), p_correlation_id
  );
  return jsonb_build_object('version', next_version, 'correlationId', p_correlation_id);
end;
$$;

revoke all on function public.update_admin_partner_company_access(uuid, integer, text, text[], text, uuid)
  from public, anon;
grant execute on function public.update_admin_partner_company_access(uuid, integer, text, text[], text, uuid)
  to authenticated;

comment on function public.update_admin_partner_company_access(uuid, integer, text, text[], text, uuid) is
  'Atomically updates company capability policy. A stale version returns PT409 without transaction retry.';

commit;
