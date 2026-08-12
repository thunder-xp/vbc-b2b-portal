begin;

create temporary table public_retail_smoke_state (
  first_publication_id uuid,
  second_publication_id uuid,
  failed_publication_id uuid,
  first_metrics jsonb,
  second_metrics jsonb
) on commit drop;

do $$
declare
  first_id uuid;
  metrics jsonb;
  started_at timestamptz := clock_timestamp();
begin
  first_id := public.start_public_retail_publication();
  metrics := public.build_public_retail_candidate(first_id);
  if coalesce((metrics->>'eligibleProducts')::integer, 0) = 0
    or metrics->>'checksum' !~ '^[0-9a-f]{64}$' then
    raise exception 'First Public Retail candidate is invalid.';
  end if;
  perform public.publish_public_retail_candidate(first_id, metrics->>'checksum');
  insert into public_retail_smoke_state(first_publication_id, first_metrics)
  values(first_id, metrics);
  raise notice 'public_retail_first_publication_ms=%',
    extract(milliseconds from clock_timestamp() - started_at)::integer;
end;
$$;

do $$
declare payload jsonb;
begin
  payload := public.list_public_retail_products('ru', null, null, null, '{}'::jsonb, 24, 0);
  if jsonb_array_length(payload->'items') = 0 or (payload->>'totalCount')::integer = 0 then
    raise exception 'Anonymous Public Retail listing is empty.';
  end if;
  if payload::text ~* 'external_1c|company_id|partner_price|available_quantity|warehouse|contract|debt' then
    raise exception 'Sensitive field leaked through Public Retail listing.';
  end if;
end;
$$;

set local role anon;
select jsonb_array_length(public.list_public_retail_categories('ro')) as anonymous_category_count;
select (public.list_public_retail_products('ru', null, null, null, '{}'::jsonb, 1, 0)->>'totalCount')::integer
  as anonymous_product_count;
reset role;

do $$
begin
  if has_table_privilege('anon', 'public.public_retail_products', 'select')
    or has_table_privilege('authenticated', 'public.public_retail_products', 'select')
    or has_table_privilege('anon', 'public.public_retail_product_identities', 'select') then
    raise exception 'Public Retail source table privilege leaked.';
  end if;
end;
$$;

do $$
declare
  second_id uuid;
  failed_id uuid;
  metrics jsonb;
  current_id uuid;
begin
  second_id := public.start_public_retail_publication();
  metrics := public.build_public_retail_candidate(second_id);
  perform public.publish_public_retail_candidate(second_id, metrics->>'checksum');

  select id into current_id from public.public_retail_publications where status = 'published';
  if current_id <> second_id or not exists (
    select 1 from public.public_retail_publications
    where id = (select first_publication_id from public_retail_smoke_state) and status = 'superseded'
  ) then
    raise exception 'Atomic Public Retail version switch failed.';
  end if;

  failed_id := public.start_public_retail_publication();
  perform public.fail_public_retail_candidate(failed_id, 'CONTROLLED_SMOKE_FAILURE');
  select id into current_id from public.public_retail_publications where status = 'published';
  if current_id <> second_id then
    raise exception 'Failed refresh replaced the valid Public Retail publication.';
  end if;

  update public_retail_smoke_state set second_publication_id = second_id,
    failed_publication_id = failed_id, second_metrics = metrics;
end;
$$;

do $$
begin
  begin
    update public.public_retail_products set name_ru = name_ru
    where publication_id = (select second_publication_id from public_retail_smoke_state)
      and public_id = (select public_id from public.public_retail_products
        where publication_id = (select second_publication_id from public_retail_smoke_state) limit 1);
    raise exception 'Published Public Retail snapshot was mutable.';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

select first_metrics, second_metrics from public_retail_smoke_state;

rollback;
