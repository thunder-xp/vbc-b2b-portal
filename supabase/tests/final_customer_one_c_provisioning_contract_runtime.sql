begin;

do $$
begin
  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.customer_external_provisioning_jobs'::regclass
      and attname = 'operation_key' and not attisdropped
  ) or not exists (
    select 1 from pg_attribute
    where attrelid = 'public.customer_external_provisioning_jobs'::regclass
      and attname = 'create_attempted_at' and not attisdropped
  ) then
    raise exception 'External provisioning recovery evidence columns are missing.';
  end if;

  if not exists (
    select 1 from pg_index index_meta
    join pg_class index_class on index_class.oid = index_meta.indexrelid
    where index_class.relname = 'customer_external_refs_identity_system_entity_active_idx'
      and index_meta.indisunique and index_meta.indpred is not null
  ) then
    raise exception 'Identity-side active 1C mapping uniqueness is missing.';
  end if;

  if has_table_privilege('anon', 'public.customer_external_provisioning_jobs', 'select')
    or has_table_privilege('authenticated', 'public.customer_external_provisioning_jobs', 'select')
    or has_table_privilege('authenticated', 'public.customer_external_provisioning_jobs', 'update') then
    raise exception 'External provisioning jobs are exposed to browser roles.';
  end if;

  if has_function_privilege('anon', 'public.claim_customer_external_provisioning_jobs_v1(integer)', 'execute')
    or has_function_privilege('authenticated', 'public.claim_customer_external_provisioning_jobs_v1(integer)', 'execute')
    or not has_function_privilege('service_role', 'public.claim_customer_external_provisioning_jobs_v1(integer)', 'execute') then
    raise exception 'External provisioning claim grants are invalid.';
  end if;
end;
$$;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

do $$
begin
  if public.claim_customer_external_provisioning_jobs_v1(5) <> '[]'::jsonb then
    raise exception 'Empty external provisioning claim is not a fast no-op.';
  end if;
end;
$$;

rollback;
