begin;

create or replace function public.preview_portal_localization_import(
  p_rows jsonb, p_locale text default 'ro'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if jsonb_typeof(p_rows) <> 'array'
    or jsonb_array_length(p_rows) not between 1 and 100
    or p_locale !~ '^[a-z]{2}(?:-[a-z]{2})?$'
  then
    raise exception 'LOCALIZATION_IMPORT_INPUT_INVALID' using errcode = '22023';
  end if;

  with input_rows as materialized (
    select
      ordinality::integer as row_index,
      value as row_data,
      value->>'entityType' as entity_type,
      nullif(value->>'entityId', '') as entity_id_text
    from jsonb_array_elements(p_rows) with ordinality
  ), normalized_rows as materialized (
    select
      input_rows.*,
      case
        when entity_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then entity_id_text::uuid
        else null
      end as entity_id
    from input_rows
  ), product_sources as materialized (
    select source.*
    from public.list_portal_localization_sources('product', p_locale) source
    where exists (select 1 from normalized_rows where entity_type = 'product')
  ), category_sources as materialized (
    select source.*
    from public.list_portal_localization_sources('category', p_locale) source
    where exists (select 1 from normalized_rows where entity_type = 'category')
  ), sources as materialized (
    select 'product'::text as entity_type, product_sources.* from product_sources
    union all
    select 'category'::text as entity_type, category_sources.* from category_sources
  ), evaluated as (
    select
      input.row_index,
      input.row_data,
      input.entity_type,
      input.entity_id,
      source.entity_reference,
      source.source_name,
      source.current_hash,
      case
        when input.entity_id is null then 'INVALID_ENTITY_ID'
        when input.entity_type not in ('product', 'category') then 'INVALID_ENTITY_TYPE'
        when coalesce(input.row_data->>'locale', '') <> p_locale then 'INVALID_LOCALE'
        when input.row_data->>'status' not in ('draft', 'reviewed') then 'INVALID_STATUS'
        when source.id is null then 'ENTITY_NOT_PUBLIC_OR_UNKNOWN'
        when input.row_data->>'sourceHash' is null
          or input.row_data->>'sourceHash' <> source.current_hash then 'SOURCE_HASH_MISMATCH'
        when nullif(btrim(input.row_data->>'localizedName'), '') is null
          or nullif(btrim(input.row_data->>'description'), '') is null
          or nullif(btrim(input.row_data->>'seoTitle'), '') is null
          or nullif(btrim(input.row_data->>'seoDescription'), '') is null then 'CONTENT_INCOMPLETE'
        when input.entity_type = 'product'
          and nullif(btrim(input.row_data->>'shortDescription'), '') is null then 'CONTENT_INCOMPLETE'
        else null
      end as reason
    from normalized_rows input
    left join sources source
      on source.entity_type = input.entity_type
      and source.id = input.entity_id
  )
  select jsonb_build_object(
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'row', row_index,
      'valid', reason is null,
      'reason', reason,
      'entityType', entity_type,
      'entityId', entity_id,
      'entityReference', row_data->>'entityReference',
      'sourceName', source_name,
      'currentHash', current_hash
    ) order by row_index), '[]'::jsonb),
    'validCount', count(*) filter (where reason is null),
    'invalidCount', count(*) filter (where reason is not null)
  )
  into result
  from evaluated;

  return result;
end;
$$;

create or replace function public.import_portal_localizations(
  p_rows jsonb, p_locale text, p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  preview jsonb;
  input_row jsonb;
  target_id uuid;
  source_hash text;
  expected_revision integer;
  imported_count integer := 0;
  action_name text;
begin
  if not exists (
    select 1 from public.user_profiles where id = p_actor_user_id and status = 'active'
  ) then
    raise exception 'LOCALIZATION_IMPORT_ACTOR_INVALID' using errcode = '22023';
  end if;

  preview := public.preview_portal_localization_import(p_rows, p_locale);
  if (preview->>'invalidCount')::integer > 0 then
    raise exception 'LOCALIZATION_IMPORT_CONFLICT' using errcode = 'PT409';
  end if;

  for input_row in select value from jsonb_array_elements(p_rows) loop
    target_id := (input_row->>'entityId')::uuid;
    source_hash := input_row->>'sourceHash';

    if input_row->>'entityType' = 'product' then
      select coalesce(localization.revision, 0)
      into expected_revision
      from public.catalog_products entity
      left join public.product_localizations localization
        on localization.product_id = entity.id and localization.locale = p_locale
      where entity.id = target_id;
    else
      select coalesce(localization.revision, 0)
      into expected_revision
      from public.catalog_categories entity
      left join public.category_localizations localization
        on localization.category_id = entity.id and localization.locale = p_locale
      where entity.id = target_id;
    end if;

    action_name := case when input_row->>'status' = 'reviewed' then 'review' else 'save_draft' end;
    perform public.manage_portal_localization(
      input_row->>'entityType',
      target_id,
      p_locale,
      action_name,
      source_hash,
      expected_revision,
      jsonb_build_object(
        'localizedName', input_row->>'localizedName',
        'shortDescription', input_row->>'shortDescription',
        case when input_row->>'entityType' = 'category' then 'intro' else 'description' end,
        input_row->>'description',
        'seoTitle', input_row->>'seoTitle',
        'seoDescription', input_row->>'seoDescription'
      ),
      p_actor_user_id
    );
    insert into public.localization_audit_events(
      entity_type, entity_id, locale, event_type, source_hash, actor_user_id, safe_metadata
    ) values (
      input_row->>'entityType', target_id, p_locale, 'imported', source_hash, p_actor_user_id,
      jsonb_build_object('status', input_row->>'status', 'contentSource', 'manual')
    );
    imported_count := imported_count + 1;
  end loop;

  return jsonb_build_object('importedCount', imported_count, 'locale', p_locale);
end;
$$;

revoke all on function public.preview_portal_localization_import(jsonb, text),
  public.import_portal_localizations(jsonb, text, uuid)
from public, anon, authenticated;

grant execute on function public.preview_portal_localization_import(jsonb, text),
  public.import_portal_localizations(jsonb, text, uuid)
to service_role;

comment on function public.preview_portal_localization_import(jsonb, text) is
  'Validates a bounded localization batch against one materialized public source projection per entity type.';
comment on function public.import_portal_localizations(jsonb, text, uuid) is
  'Transactional bounded localization import with set-based preview and per-row governed source-hash revalidation.';

commit;
