begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Owner-safe activation follows a successful production backfill/diagnostic of
-- 20260910193509. Historical manual rows remain intact for audit.
select private.refresh_automated_hot_product_ranking();

update public.product_merchandising_assignments
set is_active=false,is_curated_visible=false,revoked_at=clock_timestamp(),updated_at=clock_timestamp(),
  reason=concat(reason,case when nullif(btrim(reason),'') is null then '' else ' | ' end,
    'Retired by automated HOT activation')
where label_code='HOT' and is_active and revoked_at is null;

update private.automated_hot_product_state
set automated_hot_activated=true where singleton_key=1;

do $migration$
declare definition text; changed text;
begin
  select pg_get_functiondef(procedure.oid) into definition
  from pg_proc procedure join pg_namespace namespace on namespace.oid=procedure.pronamespace
  where namespace.nspname='public' and procedure.proname='manage_product_merchandising_v3';
  changed := replace(definition,
    $$  if p_label_code = 'NEW' and coalesce(($$,
    $$  if p_label_code = 'HOT' then
    raise exception 'MERCHANDISING_HOT_SYSTEM_MANAGED' using errcode = '23514';
  end if;
  if p_label_code = 'NEW' and coalesce(($$);
  if changed=definition or changed not like '%MERCHANDISING_HOT_SYSTEM_MANAGED%' then
    raise exception 'Could not install HOT mutation guard.';
  end if;
  execute changed;
end
$migration$;

commit;
