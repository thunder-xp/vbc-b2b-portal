begin;

create table public.product_localizations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.catalog_products(id) on delete restrict,
  locale text not null check (locale ~ '^[a-z]{2}(?:-[a-z]{2})?$'),
  localized_name text null check (localized_name is null or char_length(btrim(localized_name)) between 1 and 500),
  short_description text null check (short_description is null or char_length(short_description) <= 2000),
  description text null check (description is null or char_length(description) <= 50000),
  seo_title text null check (seo_title is null or char_length(btrim(seo_title)) between 1 and 200),
  seo_description text null check (seo_description is null or char_length(btrim(seo_description)) between 1 and 500),
  translation_status text not null check (translation_status in ('machine_draft','reviewed','outdated')),
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  outdated_against_hash text null check (outdated_against_hash is null or outdated_against_hash ~ '^[0-9a-f]{64}$'),
  translation_version integer not null default 1 check (translation_version > 0),
  revision integer not null default 1 check (revision > 0),
  provider_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(provider_metadata) = 'object'),
  translated_at timestamptz null,
  reviewed_at timestamptz null,
  reviewed_by uuid null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, locale)
);

create table public.category_localizations (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.catalog_categories(id) on delete restrict,
  locale text not null check (locale ~ '^[a-z]{2}(?:-[a-z]{2})?$'),
  localized_name text null check (localized_name is null or char_length(btrim(localized_name)) between 1 and 500),
  intro text null check (intro is null or char_length(intro) <= 10000),
  seo_title text null check (seo_title is null or char_length(btrim(seo_title)) between 1 and 200),
  seo_description text null check (seo_description is null or char_length(btrim(seo_description)) between 1 and 500),
  translation_status text not null check (translation_status in ('machine_draft','reviewed','outdated')),
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  outdated_against_hash text null check (outdated_against_hash is null or outdated_against_hash ~ '^[0-9a-f]{64}$'),
  translation_version integer not null default 1 check (translation_version > 0),
  revision integer not null default 1 check (revision > 0),
  provider_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(provider_metadata) = 'object'),
  translated_at timestamptz null,
  reviewed_at timestamptz null,
  reviewed_by uuid null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, locale)
);

create table public.localization_terminology (
  id uuid primary key default gen_random_uuid(),
  source_locale text not null default 'ru' check (source_locale ~ '^[a-z]{2}(?:-[a-z]{2})?$'),
  target_locale text not null check (target_locale ~ '^[a-z]{2}(?:-[a-z]{2})?$'),
  source_term text not null check (char_length(btrim(source_term)) between 1 and 300),
  localized_term text not null check (char_length(btrim(localized_term)) between 1 and 300),
  context text not null default 'technical' check (context in ('technical','category','marketing')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_locale, target_locale, source_term, context)
);

create table public.localization_translation_settings (
  locale text primary key check (locale ~ '^[a-z]{2}(?:-[a-z]{2})?$'),
  historical_backfill_mode text not null default 'paused' check (historical_backfill_mode in ('paused','all')),
  automatic_missing_after timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.localization_translation_runs (
  id uuid primary key default gen_random_uuid(),
  locale text not null check (locale ~ '^[a-z]{2}(?:-[a-z]{2})?$'),
  status text not null default 'running' check (status in ('running','succeeded','partial_success','failed')),
  claimed_count integer not null default 0 check (claimed_count >= 0),
  completed_count integer not null default 0 check (completed_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  stale_count integer not null default 0 check (stale_count >= 0),
  duration_ms integer null check (duration_ms is null or duration_ms >= 0),
  safe_error_code text null check (safe_error_code is null or char_length(safe_error_code) <= 120),
  publication_status text not null default 'not_required'
    check (publication_status in ('not_required','pending','publishing','succeeded','failed')),
  publication_attempt_count integer not null default 0 check (publication_attempt_count between 0 and 5),
  publication_available_at timestamptz not null default now(),
  publication_started_at timestamptz null,
  publication_completed_at timestamptz null,
  publication_error_code text null check (publication_error_code is null or char_length(publication_error_code) <= 120),
  started_at timestamptz not null default now(),
  completed_at timestamptz null
);

create table public.localization_translation_jobs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('product','category')),
  entity_id uuid not null,
  locale text not null check (locale ~ '^[a-z]{2}(?:-[a-z]{2})?$'),
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','superseded')),
  priority integer not null default 100 check (priority between 0 and 1000),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  last_error_code text null check (last_error_code is null or char_length(last_error_code) <= 120),
  run_id uuid null references public.localization_translation_runs(id) on delete restrict,
  available_at timestamptz not null default now(),
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_type, entity_id, locale, source_hash)
);

create table public.localization_revisions (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('product','category')),
  entity_id uuid not null,
  locale text not null,
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  translation_status text not null check (translation_status in ('machine_draft','reviewed','outdated')),
  translation_version integer not null check (translation_version > 0),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  provider_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(provider_metadata) = 'object'),
  actor_user_id uuid null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.localization_audit_events (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('product','category')),
  entity_id uuid not null,
  locale text not null,
  event_type text not null check (event_type in (
    'translated','draft_saved','reviewed','reverted_to_machine_draft','marked_outdated','retranslation_requested','stale_result_ignored'
  )),
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  actor_user_id uuid null references public.user_profiles(id) on delete restrict,
  safe_metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(safe_metadata) = 'object'
    and not (safe_metadata ?| array['token','secret','credential','rawPayload','price','stock','contract'])
  ),
  created_at timestamptz not null default now()
);

create index product_localizations_status_idx on public.product_localizations(locale, translation_status, updated_at, product_id);
create index category_localizations_status_idx on public.category_localizations(locale, translation_status, updated_at, category_id);
create index product_localizations_reviewed_by_idx on public.product_localizations(reviewed_by) where reviewed_by is not null;
create index category_localizations_reviewed_by_idx on public.category_localizations(reviewed_by) where reviewed_by is not null;
create index localization_translation_jobs_claim_idx on public.localization_translation_jobs(locale, priority, available_at, created_at, id)
  where status in ('queued','failed');
create index localization_translation_jobs_entity_idx on public.localization_translation_jobs(entity_type, entity_id, locale, created_at desc);
create index localization_translation_jobs_run_idx on public.localization_translation_jobs(run_id) where run_id is not null;
create index localization_revisions_entity_idx on public.localization_revisions(entity_type, entity_id, locale, created_at desc, id);
create index localization_revisions_actor_idx on public.localization_revisions(actor_user_id) where actor_user_id is not null;
create index localization_audit_events_entity_idx on public.localization_audit_events(entity_type, entity_id, locale, created_at desc, id);
create index localization_audit_events_actor_idx on public.localization_audit_events(actor_user_id) where actor_user_id is not null;
create index localization_translation_runs_started_idx on public.localization_translation_runs(started_at desc, id);
create index localization_translation_runs_publication_idx
  on public.localization_translation_runs(locale, publication_available_at, started_at, id)
  where publication_status in ('pending','failed','publishing');

alter table public.product_localizations enable row level security;
alter table public.category_localizations enable row level security;
alter table public.localization_terminology enable row level security;
alter table public.localization_translation_settings enable row level security;
alter table public.localization_translation_runs enable row level security;
alter table public.localization_translation_jobs enable row level security;
alter table public.localization_revisions enable row level security;
alter table public.localization_audit_events enable row level security;

revoke all on table public.product_localizations, public.category_localizations,
  public.localization_terminology, public.localization_translation_settings, public.localization_translation_runs,
  public.localization_translation_jobs, public.localization_revisions,
  public.localization_audit_events from public, anon, authenticated;
grant select, insert, update, delete on table public.product_localizations,
  public.category_localizations, public.localization_terminology,
  public.localization_translation_settings, public.localization_translation_runs,
  public.localization_translation_jobs to service_role;
grant select, insert on table public.localization_revisions, public.localization_audit_events to service_role;

create or replace function public.prevent_localization_history_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Localization history is append-only.' using errcode = '55000';
end;
$$;

create trigger prevent_localization_revision_mutation
before update or delete on public.localization_revisions
for each row execute function public.prevent_localization_history_mutation();
create trigger prevent_localization_audit_mutation
before update or delete on public.localization_audit_events
for each row execute function public.prevent_localization_history_mutation();

create or replace function public.normalize_localization_source_text(p_value text)
returns text language sql immutable set search_path = '' as $$
  select regexp_replace(btrim(coalesce(p_value, '')), '[[:space:]]+', ' ', 'g');
$$;

create or replace function public.localization_category_path_payload(p_category_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  current_id uuid := p_category_id;
  current_row record;
  result jsonb := '[]'::jsonb;
  seen uuid[] := array[]::uuid[];
begin
  while current_id is not null and not current_id = any(seen) loop
    seen := array_append(seen, current_id);
    select category.id, category.parent_id, category.name into current_row
    from public.catalog_categories category where category.id = current_id;
    exit when current_row.id is null;
    result := jsonb_build_array(jsonb_build_object(
      'id', current_row.id,
      'name', public.normalize_localization_source_text(current_row.name)
    )) || result;
    current_id := current_row.parent_id;
  end loop;
  return result;
end;
$$;

create or replace function public.product_localization_source_hash(p_product_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select encode(extensions.digest(jsonb_build_object(
    'name', public.normalize_localization_source_text(product.name),
    'shortDescription', public.normalize_localization_source_text(product.short_description),
    'description', public.normalize_localization_source_text(coalesce(product.full_description, product.description)),
    'categoryPath', public.localization_category_path_payload(product.category_id),
    'specifications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', attribute.attribute_key,
        'label', public.normalize_localization_source_text(attribute.label),
        'value', public.normalize_localization_source_text(coalesce(attribute.resolved_display_value, attribute.display_value))
      ) order by attribute.attribute_key, attribute.label, coalesce(attribute.resolved_display_value, attribute.display_value))
      from public.catalog_product_attributes attribute
      where attribute.product_id = product.id and attribute.is_visible
        and attribute.resolution_status in ('not_required','resolved')
    ), '[]'::jsonb)
  )::text, 'sha256'), 'hex')
  from public.catalog_products product where product.id = p_product_id;
$$;

create or replace function public.category_localization_source_hash(p_category_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select encode(extensions.digest(jsonb_build_object(
    'name', public.normalize_localization_source_text(category.name),
    'description', public.normalize_localization_source_text(category.description),
    'path', public.localization_category_path_payload(category.id),
    'children', coalesce((
      select jsonb_agg(public.normalize_localization_source_text(child.name) order by child.sort_order, child.name, child.id)
      from public.catalog_categories child where child.parent_id = category.id and child.is_active
    ), '[]'::jsonb)
  )::text, 'sha256'), 'hex')
  from public.catalog_categories category where category.id = p_category_id;
$$;

create or replace function public.reconcile_portal_localization_sources(
  p_locale text default 'ro', p_limit integer default 2000
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  item record;
  current_hash text;
  previous_hash text;
  previous_status text;
  previous_outdated_hash text;
  localization_exists boolean;
  historical_backfill_mode text;
  automatic_missing_after timestamptz;
  queued_count integer := 0;
  outdated_count integer := 0;
  inspected_count integer := 0;
begin
  if p_locale !~ '^[a-z]{2}(?:-[a-z]{2})?$' or p_limit not between 1 and 5000 then
    raise exception 'LOCALIZATION_RECONCILIATION_INPUT_INVALID' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('portal_localization_reconciliation:' || p_locale, 0));
  select settings.historical_backfill_mode,settings.automatic_missing_after
  into historical_backfill_mode,automatic_missing_after
  from public.localization_translation_settings settings where settings.locale=p_locale;
  historical_backfill_mode:=coalesce(historical_backfill_mode,'paused');
  automatic_missing_after:=coalesce(automatic_missing_after,now());

  for item in
    select source.entity_type, source.entity_id, source.priority, source.created_at
    from (
      select 'category'::text entity_type, category.id entity_id, 10 priority, category.sort_order sort_key,
        category.created_at
      from public.catalog_categories category where category.is_active
      union all
      select 'product', product.id,
        case when exists (
          select 1 from public.product_merchandising_assignments assignment
          where assignment.product_id = product.id and assignment.is_active
            and assignment.is_curated_visible and assignment.revoked_at is null
            and assignment.starts_at <= now() and (assignment.ends_at is null or assignment.ends_at > now())
        ) then 20 else 100 end,
        product.sort_order,product.created_at
      from public.catalog_products product where product.is_active and product.is_visible
    ) source
    order by source.priority, source.sort_key, source.entity_id
    limit p_limit
  loop
    inspected_count := inspected_count + 1;
    previous_hash:=null; previous_status:=null; previous_outdated_hash:=null; localization_exists:=false;
    current_hash := case when item.entity_type = 'product'
      then public.product_localization_source_hash(item.entity_id)
      else public.category_localization_source_hash(item.entity_id) end;
    if current_hash is null then continue; end if;

    if item.entity_type = 'product' then
      select localization.source_hash, localization.translation_status, localization.outdated_against_hash
      into previous_hash, previous_status, previous_outdated_hash
      from public.product_localizations localization
      where localization.product_id = item.entity_id and localization.locale = p_locale
      for update;
      localization_exists:=found;
      if found and previous_hash <> current_hash then
        update public.product_localizations set
          translation_status = 'outdated', outdated_against_hash = current_hash,
          revision = revision + case when outdated_against_hash is distinct from current_hash then 1 else 0 end,
          updated_at = now()
        where product_id = item.entity_id and locale = p_locale;
        if previous_status <> 'outdated' or previous_outdated_hash is distinct from current_hash then
          insert into public.localization_audit_events(entity_type, entity_id, locale, event_type, source_hash)
          values('product', item.entity_id, p_locale, 'marked_outdated', current_hash);
        end if;
        outdated_count := outdated_count + 1;
      end if;
    else
      select localization.source_hash, localization.translation_status, localization.outdated_against_hash
      into previous_hash, previous_status, previous_outdated_hash
      from public.category_localizations localization
      where localization.category_id = item.entity_id and localization.locale = p_locale
      for update;
      localization_exists:=found;
      if found and previous_hash <> current_hash then
        update public.category_localizations set
          translation_status = 'outdated', outdated_against_hash = current_hash,
          revision = revision + case when outdated_against_hash is distinct from current_hash then 1 else 0 end,
          updated_at = now()
        where category_id = item.entity_id and locale = p_locale;
        if previous_status <> 'outdated' or previous_outdated_hash is distinct from current_hash then
          insert into public.localization_audit_events(entity_type, entity_id, locale, event_type, source_hash)
          values('category', item.entity_id, p_locale, 'marked_outdated', current_hash);
        end if;
        outdated_count := outdated_count + 1;
      end if;
    end if;

    update public.localization_translation_jobs set status = 'superseded', completed_at = now(), updated_at = now()
    where entity_type = item.entity_type and entity_id = item.entity_id and locale = p_locale
      and source_hash <> current_hash and status in ('queued','running','failed');

    if (localization_exists or item.created_at >= automatic_missing_after or historical_backfill_mode='all') and not exists (
      select 1 from public.product_localizations localization
      where item.entity_type = 'product' and localization.product_id = item.entity_id
        and localization.locale = p_locale and localization.source_hash = current_hash
        and localization.translation_status in ('machine_draft','reviewed')
      union all
      select 1 from public.category_localizations localization
      where item.entity_type = 'category' and localization.category_id = item.entity_id
        and localization.locale = p_locale and localization.source_hash = current_hash
        and localization.translation_status in ('machine_draft','reviewed')
    ) then
      insert into public.localization_translation_jobs(entity_type, entity_id, locale, source_hash, priority)
      values(item.entity_type, item.entity_id, p_locale, current_hash, item.priority)
      on conflict(entity_type, entity_id, locale, source_hash) do update set
        status = case when localization_translation_jobs.status in ('failed','superseded')
          and localization_translation_jobs.attempt_count < 5 then 'queued' else localization_translation_jobs.status end,
        available_at = case when localization_translation_jobs.status in ('failed','superseded')
          then now() else localization_translation_jobs.available_at end,
        priority = least(localization_translation_jobs.priority, excluded.priority),
        updated_at = now();
      queued_count := queued_count + 1;
    end if;
  end loop;

  return jsonb_build_object('locale', p_locale, 'inspected', inspected_count,
    'queuedOrPending', queued_count, 'outdated', outdated_count);
end;
$$;

create or replace function public.claim_portal_localization_jobs(p_locale text default 'ro', p_limit integer default 10)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target_run_id uuid;
  jobs jsonb;
  claimed integer;
begin
  if p_locale !~ '^[a-z]{2}(?:-[a-z]{2})?$' or p_limit not between 1 and 25 then
    raise exception 'LOCALIZATION_JOB_INPUT_INVALID' using errcode = '22023';
  end if;
  update public.localization_translation_jobs set status = 'queued', run_id = null,
    available_at = now(), started_at = null, updated_at = now(), last_error_code = 'LEASE_EXPIRED'
  where status = 'running' and started_at < now() - interval '15 minutes' and attempt_count < 5;
  update public.localization_translation_jobs set status = 'failed', completed_at = now(), updated_at = now(),
    last_error_code = 'ATTEMPT_LIMIT_REACHED'
  where status in ('queued','running') and attempt_count >= 5;

  insert into public.localization_translation_runs(locale) values(p_locale) returning id into target_run_id;
  with candidates as (
    select job.id from public.localization_translation_jobs job
    where job.locale = p_locale and job.status in ('queued','failed')
      and job.attempt_count < 5 and job.available_at <= now()
    order by job.priority, job.available_at, job.created_at, job.id
    limit p_limit for update skip locked
  ), claimed_jobs as (
    update public.localization_translation_jobs job set
      status = 'running', run_id = target_run_id, started_at = now(), completed_at = null,
      attempt_count = job.attempt_count + 1, last_error_code = null, updated_at = now()
    from candidates where job.id = candidates.id returning job.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', job.id, 'entityType', job.entity_type, 'entityId', job.entity_id,
    'locale', job.locale, 'sourceHash', job.source_hash,
    'source', case when job.entity_type = 'product' then (
      select jsonb_build_object(
        'sku', product.sku, 'name', product.name,
        'shortDescription', product.short_description,
        'description', coalesce(product.full_description, product.description),
        'categoryPath', public.localization_category_path_payload(product.category_id),
        'specifications', coalesce((select jsonb_agg(jsonb_build_object(
          'key', attribute.attribute_key, 'label', attribute.label,
          'value', coalesce(attribute.resolved_display_value, attribute.display_value)
        ) order by attribute.attribute_key, attribute.label)
        from public.catalog_product_attributes attribute
        where attribute.product_id = product.id and attribute.is_visible
          and attribute.resolution_status in ('not_required','resolved')), '[]'::jsonb)
      ) from public.catalog_products product where product.id = job.entity_id
    ) else (
      select jsonb_build_object(
        'name', category.name, 'description', category.description,
        'path', public.localization_category_path_payload(category.id),
        'children', coalesce((select jsonb_agg(child.name order by child.sort_order, child.name)
          from public.catalog_categories child where child.parent_id = category.id and child.is_active), '[]'::jsonb)
      ) from public.catalog_categories category where category.id = job.entity_id
    ) end
  ) order by job.priority, job.created_at, job.id), '[]'::jsonb), count(*)::integer
  into jobs, claimed from claimed_jobs job;
  update public.localization_translation_runs set claimed_count = claimed where id = target_run_id;
  return jsonb_build_object(
    'runId', target_run_id,
    'jobs', jobs,
    'terminology', coalesce((select jsonb_object_agg(term.source_term, term.localized_term order by term.source_term)
      from public.localization_terminology term
      where term.source_locale = 'ru' and term.target_locale = p_locale and term.is_active), '{}'::jsonb)
  );
end;
$$;

create or replace function public.complete_portal_localization_job(
  p_job_id uuid, p_source_hash text, p_content jsonb, p_provider_metadata jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  job public.localization_translation_jobs;
  current_hash text;
  target_version integer;
  existing_status text;
begin
  if p_source_hash !~ '^[0-9a-f]{64}$' or jsonb_typeof(p_content) <> 'object'
    or jsonb_typeof(coalesce(p_provider_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'LOCALIZATION_RESULT_INPUT_INVALID' using errcode = '22023';
  end if;
  select * into job from public.localization_translation_jobs where id = p_job_id for update;
  if job.id is null or job.status <> 'running' or job.source_hash <> p_source_hash then
    raise exception 'LOCALIZATION_JOB_STATE_CONFLICT' using errcode = 'PT409';
  end if;
  current_hash := case when job.entity_type = 'product'
    then public.product_localization_source_hash(job.entity_id)
    else public.category_localization_source_hash(job.entity_id) end;
  if current_hash is distinct from p_source_hash then
    update public.localization_translation_jobs set status = 'superseded', completed_at = now(), updated_at = now()
    where id = job.id;
    insert into public.localization_audit_events(entity_type,entity_id,locale,event_type,source_hash,safe_metadata)
    values(job.entity_type,job.entity_id,job.locale,'stale_result_ignored',p_source_hash,
      jsonb_build_object('currentSourceHash',current_hash));
    return jsonb_build_object('applied',false,'stale',true);
  end if;

  if job.entity_type = 'product' then
    select translation_status, translation_version into existing_status, target_version
    from public.product_localizations where product_id = job.entity_id and locale = job.locale for update;
    target_version := greatest(coalesce(target_version,0),coalesce((select max(revision.translation_version)
      from public.localization_revisions revision where revision.entity_type='product'
        and revision.entity_id=job.entity_id and revision.locale=job.locale),0));
    if existing_status = 'reviewed' and exists (
      select 1 from public.product_localizations where product_id = job.entity_id and locale = job.locale and source_hash = current_hash
    ) then
      target_version := target_version + 1;
      insert into public.localization_revisions(entity_type,entity_id,locale,source_hash,translation_status,
        translation_version,content,provider_metadata)
      values('product',job.entity_id,job.locale,current_hash,'machine_draft',target_version,p_content,coalesce(p_provider_metadata,'{}'::jsonb));
      insert into public.localization_audit_events(entity_type,entity_id,locale,event_type,source_hash,safe_metadata)
      values('product',job.entity_id,job.locale,'translated',current_hash,
        jsonb_build_object('translationVersion',target_version,'jobId',job.id,'reviewedContentPreserved',true));
      update public.localization_translation_jobs set status='succeeded',completed_at=now(),updated_at=now() where id=job.id;
      return jsonb_build_object('applied',false,'reviewedCurrent',true,'machineDraftAvailable',true);
    end if;
    target_version := coalesce(target_version,0)+1;
    insert into public.product_localizations(product_id,locale,localized_name,short_description,description,seo_title,seo_description,
      translation_status,source_hash,outdated_against_hash,translation_version,provider_metadata,translated_at)
    values(job.entity_id,job.locale,nullif(btrim(p_content->>'localizedName'),''),nullif(btrim(p_content->>'shortDescription'),''),
      nullif(btrim(p_content->>'description'),''),nullif(btrim(p_content->>'seoTitle'),''),nullif(btrim(p_content->>'seoDescription'),''),
      'machine_draft',current_hash,null,target_version,coalesce(p_provider_metadata,'{}'::jsonb),now())
    on conflict(product_id,locale) do update set
      localized_name=excluded.localized_name,short_description=excluded.short_description,description=excluded.description,
      seo_title=excluded.seo_title,seo_description=excluded.seo_description,translation_status='machine_draft',
      source_hash=excluded.source_hash,outdated_against_hash=null,translation_version=excluded.translation_version,
      revision=product_localizations.revision+1,provider_metadata=excluded.provider_metadata,
      translated_at=now(),reviewed_at=null,reviewed_by=null,updated_at=now();
  else
    select translation_status, translation_version into existing_status, target_version
    from public.category_localizations where category_id = job.entity_id and locale = job.locale for update;
    target_version := greatest(coalesce(target_version,0),coalesce((select max(revision.translation_version)
      from public.localization_revisions revision where revision.entity_type='category'
        and revision.entity_id=job.entity_id and revision.locale=job.locale),0));
    if existing_status = 'reviewed' and exists (
      select 1 from public.category_localizations where category_id = job.entity_id and locale = job.locale and source_hash = current_hash
    ) then
      target_version := target_version + 1;
      insert into public.localization_revisions(entity_type,entity_id,locale,source_hash,translation_status,
        translation_version,content,provider_metadata)
      values('category',job.entity_id,job.locale,current_hash,'machine_draft',target_version,p_content,coalesce(p_provider_metadata,'{}'::jsonb));
      insert into public.localization_audit_events(entity_type,entity_id,locale,event_type,source_hash,safe_metadata)
      values('category',job.entity_id,job.locale,'translated',current_hash,
        jsonb_build_object('translationVersion',target_version,'jobId',job.id,'reviewedContentPreserved',true));
      update public.localization_translation_jobs set status='succeeded',completed_at=now(),updated_at=now() where id=job.id;
      return jsonb_build_object('applied',false,'reviewedCurrent',true,'machineDraftAvailable',true);
    end if;
    target_version := coalesce(target_version,0)+1;
    insert into public.category_localizations(category_id,locale,localized_name,intro,seo_title,seo_description,
      translation_status,source_hash,outdated_against_hash,translation_version,provider_metadata,translated_at)
    values(job.entity_id,job.locale,nullif(btrim(p_content->>'localizedName'),''),nullif(btrim(p_content->>'intro'),''),
      nullif(btrim(p_content->>'seoTitle'),''),nullif(btrim(p_content->>'seoDescription'),''),
      'machine_draft',current_hash,null,target_version,coalesce(p_provider_metadata,'{}'::jsonb),now())
    on conflict(category_id,locale) do update set
      localized_name=excluded.localized_name,intro=excluded.intro,seo_title=excluded.seo_title,
      seo_description=excluded.seo_description,translation_status='machine_draft',source_hash=excluded.source_hash,
      outdated_against_hash=null,translation_version=excluded.translation_version,
      revision=category_localizations.revision+1,provider_metadata=excluded.provider_metadata,
      translated_at=now(),reviewed_at=null,reviewed_by=null,updated_at=now();
  end if;

  insert into public.localization_revisions(entity_type,entity_id,locale,source_hash,translation_status,
    translation_version,content,provider_metadata)
  values(job.entity_type,job.entity_id,job.locale,current_hash,'machine_draft',target_version,p_content,coalesce(p_provider_metadata,'{}'::jsonb));
  insert into public.localization_audit_events(entity_type,entity_id,locale,event_type,source_hash,safe_metadata)
  values(job.entity_type,job.entity_id,job.locale,'translated',current_hash,
    jsonb_build_object('translationVersion',target_version,'jobId',job.id));
  update public.localization_translation_jobs set status='succeeded',completed_at=now(),updated_at=now() where id=job.id;
  return jsonb_build_object('applied',true,'stale',false,'translationVersion',target_version);
end;
$$;

create or replace function public.fail_portal_localization_job(p_job_id uuid, p_safe_error_code text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.localization_translation_jobs set
    status = 'failed', last_error_code = left(coalesce(nullif(btrim(p_safe_error_code),''),'TRANSLATION_PROVIDER_FAILED'),120),
    available_at = now() + make_interval(mins => least(attempt_count * 5, 30)), completed_at = now(), updated_at = now()
  where id = p_job_id and status = 'running';
end;
$$;

create or replace function public.complete_portal_localization_run(
  p_run_id uuid, p_completed integer, p_failed integer, p_stale integer, p_applied integer, p_duration_ms integer,
  p_safe_error_code text default null
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if least(p_completed,p_failed,p_stale,p_applied,p_duration_ms) < 0 or p_applied > p_completed then
    raise exception 'LOCALIZATION_RUN_RESULT_INVALID' using errcode = '22023';
  end if;
  update public.localization_translation_runs set
    status = case when p_failed = 0 then 'succeeded' when p_completed + p_stale > 0 then 'partial_success' else 'failed' end,
    completed_count=p_completed,failed_count=p_failed,stale_count=p_stale,duration_ms=p_duration_ms,
    safe_error_code=left(p_safe_error_code,120),completed_at=now(),
    publication_status=case when p_applied > 0 then 'pending' else 'not_required' end,
    publication_available_at=now()
  where id=p_run_id and status='running';
end;
$$;

create or replace function public.request_portal_localization_publication(p_locale text default 'ro')
returns uuid language plpgsql security definer set search_path='' as $$
declare target_run_id uuid;
begin
  if p_locale !~ '^[a-z]{2}(?:-[a-z]{2})?$' then
    raise exception 'LOCALIZATION_PUBLICATION_INPUT_INVALID' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('portal_localization_publication_request:'||p_locale,0));
  select run.id into target_run_id from public.localization_translation_runs run
  where run.locale=p_locale and run.publication_status in ('pending','publishing','failed')
    and run.publication_attempt_count<5 order by run.started_at limit 1;
  if target_run_id is null then
    insert into public.localization_translation_runs(locale,status,completed_at,publication_status)
    values(p_locale,'succeeded',now(),'pending') returning id into target_run_id;
  end if;
  return target_run_id;
end;
$$;

create or replace function public.claim_portal_localization_publication(p_locale text default 'ro')
returns jsonb language plpgsql security definer set search_path='' as $$
declare target_run_id uuid;
begin
  update public.localization_translation_runs set publication_status='failed',publication_started_at=null,
    publication_available_at=now(),publication_error_code='LEASE_EXPIRED'
  where locale=p_locale and publication_status='publishing'
    and publication_started_at < now()-interval '15 minutes' and publication_attempt_count<5;
  with candidate as (
    select run.id from public.localization_translation_runs run
    where run.locale=p_locale and run.publication_status in ('pending','failed')
      and run.publication_attempt_count<5 and run.publication_available_at<=now()
    order by run.publication_available_at,run.started_at,run.id limit 1 for update skip locked
  )
  update public.localization_translation_runs run set publication_status='publishing',
    publication_attempt_count=run.publication_attempt_count+1,publication_started_at=now(),
    publication_completed_at=null,publication_error_code=null
  from candidate where run.id=candidate.id returning run.id into target_run_id;
  return jsonb_build_object('runId',target_run_id);
end;
$$;

create or replace function public.complete_portal_localization_publication(
  p_run_id uuid,p_succeeded boolean,p_safe_error_code text default null
)
returns void language plpgsql security definer set search_path='' as $$
begin
  update public.localization_translation_runs set
    publication_status=case when p_succeeded then 'succeeded' else 'failed' end,
    publication_completed_at=case when p_succeeded then now() else null end,
    publication_available_at=case when p_succeeded then publication_available_at
      else now()+make_interval(mins=>least(publication_attempt_count*5,30)) end,
    publication_error_code=case when p_succeeded then null
      else left(coalesce(nullif(btrim(p_safe_error_code),''),'LOCALIZATION_PUBLICATION_FAILED'),120) end
  where id=p_run_id and publication_status='publishing';
end;
$$;

create or replace function public.get_portal_localization_workbench(
  p_entity_type text default 'category', p_locale text default 'ro', p_status text default null,
  p_search text default null, p_limit integer default 25, p_offset integer default 0
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_entity_type not in ('product','category') or p_locale !~ '^[a-z]{2}(?:-[a-z]{2})?$'
    or (p_status is not null and p_status not in ('missing','machine_draft','reviewed','outdated'))
    or p_limit not between 1 and 50 or p_offset < 0 or p_offset > 10000
    or char_length(coalesce(p_search,'')) > 100 then
    raise exception 'LOCALIZATION_WORKBENCH_INPUT_INVALID' using errcode='22023';
  end if;
  if p_entity_type='category' then
    with source as (
      select category.id, null::text sku, category.name source_name, category.description source_description,
        public.category_localization_source_hash(category.id) current_hash, category.sort_order,
        localization.id localization_id, localization.localized_name, localization.intro localized_description,
        localization.seo_title, localization.seo_description, localization.translation_status,
        localization.source_hash, localization.outdated_against_hash, localization.translation_version,
        localization.revision, localization.translated_at, localization.reviewed_at,
        (select revision.content from public.localization_revisions revision
          where revision.entity_type='category' and revision.entity_id=category.id and revision.locale=p_locale
            and revision.source_hash=public.category_localization_source_hash(category.id)
            and revision.translation_status='machine_draft'
          order by revision.created_at desc,revision.id desc limit 1) machine_draft_content,
        coalesce(localization.translation_status,'missing') effective_status
      from public.catalog_categories category
      left join public.category_localizations localization on localization.category_id=category.id and localization.locale=p_locale
      where category.is_active and (p_search is null or category.name ilike '%'||btrim(p_search)||'%')
    ), filtered as (select * from source where p_status is null or effective_status=p_status),
    page as (select * from filtered order by sort_order,source_name,id limit p_limit offset p_offset)
    select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(page) order by page.sort_order,page.source_name,page.id),'[]'::jsonb),
      'totalCount',(select count(*) from filtered)) into result from page;
  else
    with source as (
      select product.id, product.sku, product.name source_name,
        coalesce(product.full_description,product.description,product.short_description) source_description,
        public.product_localization_source_hash(product.id) current_hash, product.sort_order,
        localization.id localization_id, localization.localized_name,
        coalesce(localization.description,localization.short_description) localized_description,
        localization.seo_title,localization.seo_description,localization.translation_status,
        localization.source_hash,localization.outdated_against_hash,localization.translation_version,
        localization.revision,localization.translated_at,localization.reviewed_at,
        (select revision.content from public.localization_revisions revision
          where revision.entity_type='product' and revision.entity_id=product.id and revision.locale=p_locale
            and revision.source_hash=public.product_localization_source_hash(product.id)
            and revision.translation_status='machine_draft'
          order by revision.created_at desc,revision.id desc limit 1) machine_draft_content,
        coalesce(localization.translation_status,'missing') effective_status
      from public.catalog_products product
      left join public.product_localizations localization on localization.product_id=product.id and localization.locale=p_locale
      where product.is_active and product.is_visible and (p_search is null or product.sku ilike '%'||btrim(p_search)||'%'
        or product.name ilike '%'||btrim(p_search)||'%')
    ), filtered as (select * from source where p_status is null or effective_status=p_status),
    page as (select * from filtered order by sort_order,source_name,id limit p_limit offset p_offset)
    select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(page) order by page.sort_order,page.source_name,page.id),'[]'::jsonb),
      'totalCount',(select count(*) from filtered)) into result from page;
  end if;
  return result || jsonb_build_object('summary',jsonb_build_object(
    'missingProducts',(select count(*) from public.catalog_products product left join public.product_localizations localization
      on localization.product_id=product.id and localization.locale=p_locale where product.is_active and product.is_visible and localization.id is null),
    'machineDraftProducts',(select count(*) from public.product_localizations where locale=p_locale and translation_status='machine_draft'),
    'reviewedProducts',(select count(*) from public.product_localizations where locale=p_locale and translation_status='reviewed'),
    'outdatedProducts',(select count(*) from public.product_localizations where locale=p_locale and translation_status='outdated'),
    'missingCategories',(select count(*) from public.catalog_categories category left join public.category_localizations localization
      on localization.category_id=category.id and localization.locale=p_locale where category.is_active and localization.id is null),
    'machineDraftCategories',(select count(*) from public.category_localizations where locale=p_locale and translation_status='machine_draft'),
    'reviewedCategories',(select count(*) from public.category_localizations where locale=p_locale and translation_status='reviewed'),
    'outdatedCategories',(select count(*) from public.category_localizations where locale=p_locale and translation_status='outdated'),
    'queuedJobs',(select count(*) from public.localization_translation_jobs where locale=p_locale and status in ('queued','running')),
    'failedJobs',(select count(*) from public.localization_translation_jobs where locale=p_locale and status='failed'),
    'lastRun',(select to_jsonb(run) from public.localization_translation_runs run where run.locale=p_locale order by run.started_at desc limit 1)
  ));
end;
$$;

create or replace function public.manage_portal_localization(
  p_entity_type text, p_entity_id uuid, p_locale text, p_action text, p_source_hash text,
  p_expected_revision integer, p_content jsonb, p_actor_user_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_hash text; target_version integer; target_revision integer; target_status text;
  selected_content jsonb := p_content;
begin
  if p_entity_type not in ('product','category') or p_action not in ('save_draft','review','revert_machine_draft')
    or p_locale !~ '^[a-z]{2}(?:-[a-z]{2})?$' or p_source_hash !~ '^[0-9a-f]{64}$'
    or p_expected_revision < 0 or jsonb_typeof(p_content)<>'object'
    or not exists(select 1 from public.user_profiles where id=p_actor_user_id and status='active') then
    raise exception 'LOCALIZATION_MUTATION_INPUT_INVALID' using errcode='22023';
  end if;
  current_hash := case when p_entity_type='product' then public.product_localization_source_hash(p_entity_id)
    else public.category_localization_source_hash(p_entity_id) end;
  if current_hash is null then raise exception 'LOCALIZATION_ENTITY_NOT_FOUND' using errcode='P0002'; end if;
  if current_hash<>p_source_hash then raise exception 'LOCALIZATION_SOURCE_CONFLICT' using errcode='PT409'; end if;

  if p_action='revert_machine_draft' then
    select revision.content into selected_content
    from public.localization_revisions revision
    where revision.entity_type=p_entity_type and revision.entity_id=p_entity_id and revision.locale=p_locale
      and revision.source_hash=current_hash and revision.translation_status='machine_draft'
    order by revision.created_at desc,revision.id desc limit 1;
    if selected_content is null then
      raise exception 'LOCALIZATION_MACHINE_DRAFT_NOT_FOUND' using errcode='P0002';
    end if;
  end if;

  if p_entity_type='product' then
    select revision,translation_version into target_revision,target_version from public.product_localizations
      where product_id=p_entity_id and locale=p_locale for update;
    if coalesce(target_revision,0)<>p_expected_revision then raise exception 'LOCALIZATION_REVISION_CONFLICT' using errcode='PT409'; end if;
    target_version:=greatest(coalesce(target_version,0),coalesce((select max(revision.translation_version)
      from public.localization_revisions revision where revision.entity_type='product'
        and revision.entity_id=p_entity_id and revision.locale=p_locale),0))+1;
    target_status:=case when p_action='review' then 'reviewed' else 'machine_draft' end;
    insert into public.product_localizations(product_id,locale,localized_name,short_description,description,seo_title,seo_description,
      translation_status,source_hash,translation_version,revision,translated_at,reviewed_at,reviewed_by)
    values(p_entity_id,p_locale,nullif(btrim(selected_content->>'localizedName'),''),nullif(btrim(selected_content->>'shortDescription'),''),
      nullif(btrim(selected_content->>'description'),''),nullif(btrim(selected_content->>'seoTitle'),''),nullif(btrim(selected_content->>'seoDescription'),''),
      target_status,current_hash,target_version,1,now(),case when p_action='review' then now() end,
      case when p_action='review' then p_actor_user_id end)
    on conflict(product_id,locale) do update set localized_name=excluded.localized_name,
      short_description=excluded.short_description,description=excluded.description,seo_title=excluded.seo_title,
      seo_description=excluded.seo_description,translation_status=excluded.translation_status,source_hash=current_hash,
      outdated_against_hash=null,translation_version=target_version,revision=product_localizations.revision+1,
      translated_at=coalesce(product_localizations.translated_at,now()),reviewed_at=excluded.reviewed_at,
      reviewed_by=excluded.reviewed_by,updated_at=now() returning revision into target_revision;
  else
    select revision,translation_version into target_revision,target_version from public.category_localizations
      where category_id=p_entity_id and locale=p_locale for update;
    if coalesce(target_revision,0)<>p_expected_revision then raise exception 'LOCALIZATION_REVISION_CONFLICT' using errcode='PT409'; end if;
    target_version:=greatest(coalesce(target_version,0),coalesce((select max(revision.translation_version)
      from public.localization_revisions revision where revision.entity_type='category'
        and revision.entity_id=p_entity_id and revision.locale=p_locale),0))+1;
    target_status:=case when p_action='review' then 'reviewed' else 'machine_draft' end;
    insert into public.category_localizations(category_id,locale,localized_name,intro,seo_title,seo_description,
      translation_status,source_hash,translation_version,revision,translated_at,reviewed_at,reviewed_by)
    values(p_entity_id,p_locale,nullif(btrim(selected_content->>'localizedName'),''),nullif(btrim(selected_content->>'intro'),''),
      nullif(btrim(selected_content->>'seoTitle'),''),nullif(btrim(selected_content->>'seoDescription'),''),target_status,current_hash,
      target_version,1,now(),case when p_action='review' then now() end,case when p_action='review' then p_actor_user_id end)
    on conflict(category_id,locale) do update set localized_name=excluded.localized_name,intro=excluded.intro,
      seo_title=excluded.seo_title,seo_description=excluded.seo_description,translation_status=excluded.translation_status,
      source_hash=current_hash,outdated_against_hash=null,translation_version=target_version,
      revision=category_localizations.revision+1,translated_at=coalesce(category_localizations.translated_at,now()),
      reviewed_at=excluded.reviewed_at,reviewed_by=excluded.reviewed_by,updated_at=now() returning revision into target_revision;
  end if;
  insert into public.localization_revisions(entity_type,entity_id,locale,source_hash,translation_status,
    translation_version,content,actor_user_id) values(p_entity_type,p_entity_id,p_locale,current_hash,target_status,target_version,selected_content,p_actor_user_id);
  insert into public.localization_audit_events(entity_type,entity_id,locale,event_type,source_hash,actor_user_id,safe_metadata)
  values(p_entity_type,p_entity_id,p_locale,case when p_action='review' then 'reviewed'
    when p_action='revert_machine_draft' then 'reverted_to_machine_draft' else 'draft_saved' end,
    current_hash,p_actor_user_id,jsonb_build_object('translationVersion',target_version));
  update public.localization_translation_jobs set status='superseded',completed_at=now(),updated_at=now()
    where entity_type=p_entity_type and entity_id=p_entity_id and locale=p_locale and status in ('queued','running','failed');
  return jsonb_build_object('revision',target_revision,'translationVersion',target_version,'status',target_status);
end;
$$;

create or replace function public.request_portal_localization_retranslation(
  p_entity_type text,p_entity_id uuid,p_locale text,p_actor_user_id uuid
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_hash text; priority_value integer:=100;
begin
  if p_entity_type not in ('product','category') or p_locale !~ '^[a-z]{2}(?:-[a-z]{2})?$'
    or not exists(select 1 from public.user_profiles where id=p_actor_user_id and status='active') then
    raise exception 'LOCALIZATION_RETRANSLATION_INPUT_INVALID' using errcode='22023';
  end if;
  current_hash:=case when p_entity_type='product' then public.product_localization_source_hash(p_entity_id)
    else public.category_localization_source_hash(p_entity_id) end;
  if current_hash is null then raise exception 'LOCALIZATION_ENTITY_NOT_FOUND' using errcode='P0002'; end if;
  priority_value:=case when p_entity_type='category' then 10 else 100 end;
  update public.localization_translation_jobs set status='superseded',completed_at=now(),updated_at=now()
    where entity_type=p_entity_type and entity_id=p_entity_id and locale=p_locale and source_hash<>current_hash
      and status in ('queued','running','failed');
  insert into public.localization_translation_jobs(entity_type,entity_id,locale,source_hash,priority)
  values(p_entity_type,p_entity_id,p_locale,current_hash,priority_value)
  on conflict(entity_type,entity_id,locale,source_hash) do update set status='queued',attempt_count=0,
    last_error_code=null,available_at=now(),started_at=null,completed_at=null,run_id=null,updated_at=now();
  insert into public.localization_audit_events(entity_type,entity_id,locale,event_type,source_hash,actor_user_id)
  values(p_entity_type,p_entity_id,p_locale,'retranslation_requested',current_hash,p_actor_user_id);
  return jsonb_build_object('queued',true,'sourceHash',current_hash);
end;
$$;

alter table public.public_retail_products add column seo_title_ro text null, add column seo_description_ro text null;
alter table public.public_retail_categories add column seo_title_ro text null, add column seo_description_ro text null;
alter table public.public_retail_publications add column localization_merge_duration_ms integer not null default 0
  check (localization_merge_duration_ms >= 0);

create or replace function public.list_public_retail_categories(p_locale text default 'ru')
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', category.public_id, 'parentId', category.parent_public_id,
    'slug', category.slug,
    'name', case when p_locale = 'ro' then coalesce(category.name_ro, category.name_ru) else category.name_ru end,
    'description', case when p_locale = 'ro' then coalesce(category.description_ro, category.description_ru) else category.description_ru end,
    'seoTitle', case when p_locale = 'ro' then category.seo_title_ro else null end,
    'seoDescription', case when p_locale = 'ro' then category.seo_description_ro else null end,
    'productCount', category.product_count
  ) order by category.sort_order, category.name_ru, category.public_id), '[]'::jsonb)
  from public.public_retail_categories category
  join public.public_retail_publications publication on publication.id = category.publication_id
  where publication.status = 'published' and p_locale in ('ru', 'ro');
$$;

create or replace function public.get_public_retail_product(p_slug text, p_locale text default 'ru')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  product public.public_retail_products;
  source_catalog_product_id uuid;
begin
  if p_locale not in ('ru','ro') or p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(p_slug) > 160 then
    raise exception 'Public Retail product input is invalid.' using errcode = '22023';
  end if;
  select snapshot.* into product
  from public.public_retail_products snapshot
  join public.public_retail_publications publication on publication.id = snapshot.publication_id
  where publication.status = 'published' and snapshot.slug = p_slug;
  if product.public_id is null then return null; end if;
  select identity.source_product_id into source_catalog_product_id
  from public.public_retail_product_identities identity where identity.public_id = product.public_id;
  return jsonb_build_object(
    'id', product.public_id, 'slug', product.slug, 'sku', product.sku,
    'name', case when p_locale='ro' then coalesce(product.name_ro,product.name_ru) else product.name_ru end,
    'shortDescription', case when p_locale='ro' then coalesce(product.short_description_ro,product.short_description_ru) else product.short_description_ru end,
    'description', case when p_locale='ro' then coalesce(product.description_ro,product.description_ru) else product.description_ru end,
    'seoTitle', case when p_locale='ro' then product.seo_title_ro else null end,
    'seoDescription', case when p_locale='ro' then product.seo_description_ro else null end,
    'categoryPath', (select coalesce(jsonb_agg(jsonb_build_object(
      'id',value->>'id','slug',value->>'slug',
      'name',case when p_locale='ro' then coalesce(value->>'nameRo',value->>'nameRu') else value->>'nameRu' end
    ) order by ordinal), '[]'::jsonb) from jsonb_array_elements(product.category_path) with ordinality path(value,ordinal)),
    'brand', case when product.brand is null then null else jsonb_build_object(
      'slug',product.brand->>'slug','name',case when p_locale='ro' then coalesce(product.brand->>'nameRo',product.brand->>'nameRu') else product.brand->>'nameRu' end) end,
    'price', jsonb_build_object('amount',product.retail_price_amount,'currency',product.retail_price_currency,'vatPresentation',product.vat_presentation),
    'availability', product.availability,
    'image', case when product.primary_image_url is null then null else jsonb_build_object('url',product.primary_image_url,
      'alt',case when p_locale='ro' then coalesce(product.primary_image_alt_ro,product.primary_image_alt_ru) else product.primary_image_alt_ru end) end,
    'gallery', (select coalesce(jsonb_agg(jsonb_build_object('url',value->>'url',
      'alt',case when p_locale='ro' then coalesce(value->>'altRo',value->>'altRu') else value->>'altRu' end)
      order by ordinal), '[]'::jsonb) from jsonb_array_elements(product.gallery) with ordinality media(value,ordinal)),
    'specifications', (select coalesce(jsonb_agg(jsonb_build_object(
      'key',value->>'key',
      'label',case when p_locale='ro' then coalesce(value->>'labelRo',value->>'labelRu') else value->>'labelRu' end,
      'value',value->>'value',
      'filterable', exists (
        select 1 from public.catalog_product_attributes attribute
        where attribute.product_id = source_catalog_product_id and attribute.attribute_key = value->>'key'
          and attribute.is_filterable and attribute.is_visible
          and attribute.resolution_status in ('not_required', 'resolved')
          and coalesce(attribute.resolved_display_value, attribute.display_value) = value->>'value'
      )
    ) order by ordinal), '[]'::jsonb)
      from jsonb_array_elements(product.specifications) with ordinality specification(value,ordinal)
      where lower(btrim(coalesce(value->>'key',''))) <> 'datasheeturl'
        and lower(btrim(coalesce(value->>'labelRu',''))) <> 'datasheeturl'),
    'datasheet', case when product.datasheet_url is null then null
      else jsonb_build_object('type','datasheet','url',product.datasheet_url) end,
    'calculatorEligible', cardinality(product.calculator_profile_keys)>0
  );
end;
$$;

create or replace function public.merge_product_localization_into_public_snapshot()
returns trigger language plpgsql security definer set search_path='' as $$
declare merge_started_at timestamptz := clock_timestamp();
begin
  update public.public_retail_products snapshot set
    name_ro=coalesce(localization.localized_name,snapshot.name_ro),
    short_description_ro=coalesce(localization.short_description,snapshot.short_description_ro),
    description_ro=coalesce(localization.description,snapshot.description_ro),
    seo_title_ro=coalesce(localization.seo_title,snapshot.seo_title_ro),
    seo_description_ro=coalesce(localization.seo_description,snapshot.seo_description_ro),
    primary_image_alt_ro=coalesce(localization.localized_name,snapshot.primary_image_alt_ro,snapshot.primary_image_alt_ru),
    gallery=(select coalesce(jsonb_agg(media.value || jsonb_build_object('altRo',coalesce(localization.localized_name,media.value->>'altRu')) order by media.ordinal),'[]'::jsonb)
      from jsonb_array_elements(snapshot.gallery) with ordinality media(value,ordinal)),
    category_path=(select coalesce(jsonb_agg(path.value || jsonb_build_object('nameRo',coalesce(category_localization.localized_name,path.value->>'nameRu')) order by path.ordinal),'[]'::jsonb)
      from jsonb_array_elements(snapshot.category_path) with ordinality path(value,ordinal)
      left join public.public_retail_category_identities identity on identity.public_id=(path.value->>'id')::uuid
      left join public.category_localizations category_localization on category_localization.category_id=identity.source_category_id
        and category_localization.locale='ro' and category_localization.translation_status in ('machine_draft','reviewed')
        and category_localization.source_hash=public.category_localization_source_hash(identity.source_category_id)),
    specifications=(select coalesce(jsonb_agg(spec.value || jsonb_build_object('labelRo',coalesce(term.localized_term,spec.value->>'labelRu')) order by spec.ordinal),'[]'::jsonb)
      from jsonb_array_elements(snapshot.specifications) with ordinality spec(value,ordinal)
      left join public.localization_terminology term on term.source_locale='ru' and term.target_locale='ro'
        and term.source_term=spec.value->>'labelRu' and term.context='technical' and term.is_active),
    specification_highlights=(select coalesce(jsonb_agg(spec.value || jsonb_build_object('labelRo',coalesce(term.localized_term,spec.value->>'labelRu')) order by spec.ordinal),'[]'::jsonb)
      from jsonb_array_elements(snapshot.specification_highlights) with ordinality spec(value,ordinal)
      left join public.localization_terminology term on term.source_locale='ru' and term.target_locale='ro'
        and term.source_term=spec.value->>'labelRu' and term.context='technical' and term.is_active),
    search_document=concat_ws(' ',snapshot.search_document,localization.localized_name,localization.short_description,localization.description)
  from new_product_rows inserted
  join public.public_retail_product_identities identity on identity.public_id=inserted.public_id
  left join public.product_localizations localization on localization.product_id=identity.source_product_id and localization.locale='ro'
    and localization.translation_status in ('machine_draft','reviewed')
    and localization.source_hash=public.product_localization_source_hash(identity.source_product_id)
  where snapshot.publication_id=inserted.publication_id and snapshot.public_id=inserted.public_id;
  update public.public_retail_publications publication set
    localization_merge_duration_ms = publication.localization_merge_duration_ms
      + greatest(0, extract(milliseconds from clock_timestamp()-merge_started_at)::integer)
  where publication.id in (select distinct publication_id from new_product_rows);
  return null;
end;
$$;

create or replace function public.merge_category_localization_into_public_snapshot()
returns trigger language plpgsql security definer set search_path='' as $$
declare merge_started_at timestamptz := clock_timestamp();
begin
  update public.public_retail_categories snapshot set
    name_ro=localization.localized_name,description_ro=localization.intro,
    seo_title_ro=localization.seo_title,seo_description_ro=localization.seo_description
  from new_category_rows inserted
  join public.public_retail_category_identities identity on identity.public_id=inserted.public_id
  join public.category_localizations localization on localization.category_id=identity.source_category_id and localization.locale='ro'
    and localization.translation_status in ('machine_draft','reviewed')
    and localization.source_hash=public.category_localization_source_hash(identity.source_category_id)
  where snapshot.publication_id=inserted.publication_id and snapshot.public_id=inserted.public_id;
  update public.public_retail_publications publication set
    localization_merge_duration_ms = publication.localization_merge_duration_ms
      + greatest(0, extract(milliseconds from clock_timestamp()-merge_started_at)::integer)
  where publication.id in (select distinct publication_id from new_category_rows);
  return null;
end;
$$;

create or replace function public.merge_terminology_into_public_facets()
returns trigger language plpgsql security definer set search_path='' as $$
declare merge_started_at timestamptz := clock_timestamp();
begin
  update public.public_retail_facets snapshot set label_ro=term.localized_term
  from new_facet_rows inserted
  join public.localization_terminology term on term.source_locale='ru' and term.target_locale='ro'
    and term.source_term=inserted.label_ru and term.context='technical' and term.is_active
  where snapshot.publication_id=inserted.publication_id and snapshot.category_public_id=inserted.category_public_id
    and snapshot.facet_key=inserted.facet_key;
  update public.public_retail_publications publication set
    localization_merge_duration_ms = publication.localization_merge_duration_ms
      + greatest(0, extract(milliseconds from clock_timestamp()-merge_started_at)::integer)
  where publication.id in (select distinct publication_id from new_facet_rows);
  return null;
end;
$$;

create trigger merge_product_localization_after_snapshot_insert
after insert on public.public_retail_products referencing new table as new_product_rows
for each statement execute function public.merge_product_localization_into_public_snapshot();
create trigger merge_category_localization_after_snapshot_insert
after insert on public.public_retail_categories referencing new table as new_category_rows
for each statement execute function public.merge_category_localization_into_public_snapshot();
create trigger merge_terminology_after_snapshot_insert
after insert on public.public_retail_facets referencing new table as new_facet_rows
for each statement execute function public.merge_terminology_into_public_facets();

create or replace function public.reconcile_localization_before_publication()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform public.reconcile_portal_localization_sources('ro',2000);
  return new;
end;
$$;
create trigger reconcile_localization_on_publication_start
after insert on public.public_retail_publications
for each statement execute function public.reconcile_localization_before_publication();

insert into public.localization_terminology(source_locale,target_locale,source_term,localized_term,context) values
  ('ru','ro','Разрешение-MPx','Rezoluție MPx','technical'),
  ('ru','ro','Форм-фактор','Tip carcasă','technical'),
  ('ru','ro','Дальность-ИК','Distanță IR','technical'),
  ('ru','ro','Аналитика','Analitică video','technical'),
  ('ru','ro','Технология','Tehnologie','technical'),
  ('ru','ro','Тип-объектива','Tip obiectiv','technical'),
  ('ru','ro','Фокусное-расстояние','Distanță focală','technical'),
  ('ru','ro','PoE-Питание','Alimentare PoE','technical'),
  ('ru','ro','Микрофон','Microfon','technical'),
  ('ru','ro','Защищенность','Protecție','technical'),
  ('ru','ro','Скорость','Viteză','technical'),
  ('ru','ro','Материал','Material','technical'),
  ('ru','ro','Порты','Porturi','technical'),
  ('ru','ro','Пропускная-способность','Lățime de bandă','technical'),
  ('ru','ro','AI-Технологии','Tehnologii AI','technical'),
  ('ru','ro','Цифровые-каналы','Canale digitale','technical'),
  ('ru','ro','Гибридные-каналы','Canale hibride','technical')
  ,('ru','ro','MicroSD','MicroSD','technical')
  ,('ru','ro','Класс','Clasă','technical')
  ,('ru','ro','Оптические-порты','Porturi optice','technical')
  ,('ru','ro','Передача-данных','Transmisie de date','technical')
  ,('ru','ro','Передача-питания','Transmitere alimentare','technical')
  ,('ru','ro','Светочувствительность','Sensibilitate la lumină','technical')
  ,('ru','ro','Тип-регистратора','Tip recorder','technical')
  ,('ru','ro','Управляемый','Administrabil','technical')
on conflict(source_locale,target_locale,source_term,context) do update set
  localized_term=excluded.localized_term,is_active=true,updated_at=now();

insert into public.localization_translation_settings(locale,historical_backfill_mode)
values('ro','paused') on conflict(locale) do nothing;

revoke all on function public.prevent_localization_history_mutation(),
  public.normalize_localization_source_text(text), public.localization_category_path_payload(uuid),
  public.product_localization_source_hash(uuid), public.category_localization_source_hash(uuid),
  public.reconcile_portal_localization_sources(text,integer), public.claim_portal_localization_jobs(text,integer),
  public.complete_portal_localization_job(uuid,text,jsonb,jsonb), public.fail_portal_localization_job(uuid,text),
  public.complete_portal_localization_run(uuid,integer,integer,integer,integer,integer,text),
  public.request_portal_localization_publication(text), public.claim_portal_localization_publication(text),
  public.complete_portal_localization_publication(uuid,boolean,text),
  public.get_portal_localization_workbench(text,text,text,text,integer,integer),
  public.manage_portal_localization(text,uuid,text,text,text,integer,jsonb,uuid),
  public.request_portal_localization_retranslation(text,uuid,text,uuid),
  public.merge_product_localization_into_public_snapshot(),
  public.merge_category_localization_into_public_snapshot(), public.merge_terminology_into_public_facets(),
  public.reconcile_localization_before_publication()
from public, anon, authenticated;

grant execute on function public.reconcile_portal_localization_sources(text,integer),
  public.claim_portal_localization_jobs(text,integer), public.complete_portal_localization_job(uuid,text,jsonb,jsonb),
  public.fail_portal_localization_job(uuid,text),
  public.complete_portal_localization_run(uuid,integer,integer,integer,integer,integer,text),
  public.request_portal_localization_publication(text), public.claim_portal_localization_publication(text),
  public.complete_portal_localization_publication(uuid,boolean,text),
  public.get_portal_localization_workbench(text,text,text,text,integer,integer),
  public.manage_portal_localization(text,uuid,text,text,text,integer,jsonb,uuid),
  public.request_portal_localization_retranslation(text,uuid,text,uuid)
to service_role;

comment on table public.product_localizations is 'Portal-owned localized presentation overlay. Product identity and commercial truth remain governed by 1C-backed catalog models.';
comment on table public.category_localizations is 'Portal-owned localized category presentation overlay, merged only into immutable Public Retail publications.';
comment on table public.localization_translation_jobs is 'Bounded source-hash-bound asynchronous translation queue. Stale results cannot overwrite newer source truth.';
comment on table public.localization_revisions is 'Append-only localization content revisions retained for review and audit.';

commit;
