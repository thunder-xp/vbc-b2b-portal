-- Proposal Generator MVP: bounded telemetry and atomic hand-off to the canonical Estimate aggregate.

create table public.estimate_generator_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  actor_user_id uuid not null references public.user_profiles(id) on delete restrict,
  request_key uuid not null,
  request_fingerprint text not null,
  status text not null default 'completed',
  requirement_count integer not null default 0,
  resolved_catalog_count integer not null default 0,
  own_nomenclature_count integer not null default 0,
  shared_nomenclature_count integer not null default 0,
  unresolved_count integer not null default 0,
  generation_duration_ms integer not null default 0,
  estimate_id uuid null references public.estimates(id) on delete restrict,
  created_at timestamptz not null default now(),
  estimate_created_at timestamptz null,
  constraint estimate_generator_session_status_check check (status in ('completed', 'failed', 'estimate_created')),
  constraint estimate_generator_session_fingerprint_check check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint estimate_generator_session_counts_check check (
    requirement_count between 0 and 30 and resolved_catalog_count >= 0 and own_nomenclature_count >= 0
    and shared_nomenclature_count >= 0 and unresolved_count >= 0 and generation_duration_ms between 0 and 120000
  ),
  unique (actor_user_id, request_key)
);

create index estimate_generator_sessions_admin_idx
  on public.estimate_generator_sessions(created_at desc, id);
create index estimate_generator_sessions_company_idx
  on public.estimate_generator_sessions(company_id, created_at desc, id);

create table public.estimate_generator_feedback (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.estimate_generator_sessions(id) on delete restrict,
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  actor_user_id uuid not null references public.user_profiles(id) on delete restrict,
  answer text not null,
  comment text null,
  created_at timestamptz not null default now(),
  constraint estimate_generator_feedback_answer_check check (answer in ('yes', 'partial', 'no')),
  constraint estimate_generator_feedback_comment_check check (comment is null or char_length(comment) <= 500)
);

alter table public.estimate_generator_sessions enable row level security;
alter table public.estimate_generator_feedback enable row level security;
revoke all on table public.estimate_generator_sessions, public.estimate_generator_feedback from public, anon, authenticated;

alter table public.estimate_events drop constraint if exists estimate_events_type_check;
alter table public.estimate_events add constraint estimate_events_type_check check (event_type in (
  'created', 'saved', 'line_added', 'line_updated', 'line_removed', 'archived',
  'commercial_updated', 'currency_changed', 'section_created', 'section_reordered',
  'line_moved', 'discount_changed', 'charge_added', 'totals_recalculated',
  'ready', 'version_created', 'version_sent', 'version_accepted', 'version_rejected',
  'draft_restored', 'duplicated', 'template_created', 'created_from_cart', 'added_to_cart',
  'generator_created'
));

create or replace function public.prevent_estimate_generator_feedback_mutation()
returns trigger language plpgsql set search_path = public as $$
begin raise exception 'Generator feedback is immutable.' using errcode = '42501'; end;
$$;
create trigger prevent_estimate_generator_feedback_mutation
before update or delete on public.estimate_generator_feedback
for each row execute function public.prevent_estimate_generator_feedback_mutation();
revoke all on function public.prevent_estimate_generator_feedback_mutation() from public, anon, authenticated;

create or replace function public.record_estimate_generator_session(
  target_company_id uuid, target_request_key uuid, target_request_fingerprint text,
  target_requirement_count integer, target_duration_ms integer, target_failed boolean default false
) returns uuid language plpgsql security definer set search_path = public as $$
declare prior public.estimate_generator_sessions; created_id uuid;
begin
  if auth.uid() is null or not public.can_access_estimates(target_company_id, 'estimates.manage') then
    raise exception 'Proposal generator is not available.' using errcode = '42501';
  end if;
  if target_request_key is null or target_request_fingerprint !~ '^[0-9a-f]{64}$'
    or target_requirement_count not between 0 and 30 or target_duration_ms not between 0 and 120000 then
    raise exception 'Generator request is invalid.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || target_request_key::text, 0));
  select * into prior from public.estimate_generator_sessions where actor_user_id = auth.uid() and request_key = target_request_key;
  if prior.id is not null then
    if prior.company_id <> target_company_id or prior.request_fingerprint <> target_request_fingerprint then
      raise exception 'Generator request key was reused with different data.' using errcode = '22023';
    end if;
    return prior.id;
  end if;
  insert into public.estimate_generator_sessions(company_id, actor_user_id, request_key, request_fingerprint, status, requirement_count, generation_duration_ms)
  values(target_company_id, auth.uid(), target_request_key, target_request_fingerprint,
    case when target_failed then 'failed' else 'completed' end, target_requirement_count, target_duration_ms)
  returning id into created_id;
  return created_id;
end;
$$;

create or replace function public.resolve_generator_external_nomenclature(
  target_company_id uuid, target_ids uuid[]
) returns table(id uuid, item_type text, manufacturer text, model text, name text, category text, unit text, specification text)
language sql security definer set search_path = public stable as $$
  select item.id, item.item_type, item.manufacturer, item.model, item.name, item.category, item.unit, item.specification
  from public.external_nomenclature_items item
  where item.id = any(coalesce(target_ids, array[]::uuid[])) and item.is_active
    and item.canonical_item_id is null and item.curation_status in ('active', 'review_required')
    and public.can_access_estimates(target_company_id, 'estimates.manage')
    and (
      item.curation_status = 'active'
      or exists (select 1 from public.partner_external_nomenclature_library library
        where library.company_id = target_company_id and library.external_nomenclature_id = item.id and library.status = 'active')
    );
$$;

create or replace function public.create_estimate_from_generator(
  target_company_id uuid, target_session_id uuid, target_final_customer_id uuid,
  estimate_name text, target_project_name text, target_currency_code text,
  target_validity_days integer, target_request_key uuid, target_request_fingerprint text,
  generated_lines jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare session_row public.estimate_generator_sessions; created public.estimates; line jsonb; section_id uuid; external_item public.external_nomenclature_items; inserted_count integer := 0;
begin
  if auth.uid() is null or not public.can_access_estimates(target_company_id, 'estimates.manage')
    or not public.can_access_estimates(target_company_id, 'estimates.pricing.manage') then
    raise exception 'Proposal generator is not available.' using errcode = '42501';
  end if;
  if jsonb_typeof(generated_lines) <> 'array' or jsonb_array_length(generated_lines) < 1 or jsonb_array_length(generated_lines) > 30 then
    raise exception 'Generated estimate lines are invalid.' using errcode = '22023';
  end if;
  select * into session_row from public.estimate_generator_sessions where id = target_session_id for update;
  if session_row.id is null or session_row.company_id <> target_company_id or session_row.actor_user_id <> auth.uid()
    or session_row.request_fingerprint <> target_request_fingerprint then
    raise exception 'Generator session is not available.' using errcode = '42501';
  end if;
  if session_row.estimate_id is not null then return session_row.estimate_id; end if;

  select * into created from public.create_estimate_v3(target_company_id, estimate_name, target_final_customer_id, '', target_project_name,
    target_currency_code, target_validity_days, target_request_key);

  for line in select value from jsonb_array_elements(generated_lines) loop
    select id into section_id from public.estimate_sections
      where estimate_id = created.id and system_key = line->>'section_key';
    if section_id is null or (line->>'line_type') not in ('product', 'external', 'custom')
      or coalesce((line->>'quantity')::numeric, 0) <= 0 then
      raise exception 'Generated estimate line is invalid.' using errcode = '22023';
    end if;

    if line->>'line_type' = 'external' then
      select * into external_item from public.external_nomenclature_items where id = (line->>'external_nomenclature_id')::uuid
        and is_active and canonical_item_id is null and curation_status in ('active', 'review_required')
        and (curation_status = 'active' or exists (select 1 from public.partner_external_nomenclature_library library
          where library.company_id = target_company_id and library.external_nomenclature_id = external_nomenclature_items.id and library.status = 'active'));
      if external_item.id is null then raise exception 'External nomenclature is not available.' using errcode = '42501'; end if;
      insert into public.estimate_items(estimate_id, section_id, line_type, external_nomenclature_id, position, description, quantity, unit, selling_unit_price)
      values(created.id, section_id, 'external', external_item.id, inserted_count + 1, external_item.name,
        (line->>'quantity')::numeric, external_item.unit, null);
      insert into public.partner_external_nomenclature_library(company_id, external_nomenclature_id, status, created_by, last_used_at)
      values(target_company_id, external_item.id, 'active', auth.uid(), now())
      on conflict(company_id, external_nomenclature_id) do update set status='active', archived_at=null, archived_by=null, last_used_at=now();
    elsif line->>'line_type' = 'product' then
      if not exists(select 1 from public.catalog_products product where product.id=(line->>'product_id')::uuid and product.is_active and product.is_visible) then
        raise exception 'Catalog product is not available.' using errcode = '42501';
      end if;
      insert into public.estimate_items(estimate_id, section_id, line_type, product_id, position, sku_snapshot, product_name_snapshot,
        source_unit_price, source_currency_code, source_snapshot_at, internal_cost_unit_price, converted_cost_unit_price,
        exchange_rate, exchange_rate_effective_date, description, quantity, unit, selling_unit_price)
      values(created.id, section_id, 'product', (line->>'product_id')::uuid, inserted_count + 1, line->>'sku_snapshot', line->>'product_name_snapshot',
        nullif(line->>'source_unit_price','')::numeric, nullif(line->>'source_currency_code',''), nullif(line->>'source_snapshot_at','')::timestamptz,
        nullif(line->>'internal_cost_unit_price','')::numeric, nullif(line->>'converted_cost_unit_price','')::numeric,
        nullif(line->>'exchange_rate','')::numeric, nullif(line->>'exchange_rate_effective_date','')::date,
        left(line->>'description', 2000), (line->>'quantity')::numeric, 'pcs', nullif(line->>'selling_unit_price','')::numeric);
    else
      insert into public.estimate_items(estimate_id, section_id, line_type, position, description, quantity, unit, selling_unit_price)
      values(created.id, section_id, 'custom', inserted_count + 1, left(line->>'description', 2000),
        (line->>'quantity')::numeric, line->>'unit', null);
    end if;
    inserted_count := inserted_count + 1;
  end loop;

  update public.estimate_generator_sessions set status='estimate_created', estimate_id=created.id, estimate_created_at=now(),
    resolved_catalog_count=(select count(*) from jsonb_array_elements(generated_lines) value where value->>'resolution'='catalog'),
    own_nomenclature_count=(select count(*) from jsonb_array_elements(generated_lines) value where value->>'resolution'='own_nomenclature'),
    shared_nomenclature_count=(select count(*) from jsonb_array_elements(generated_lines) value where value->>'resolution'='shared_nomenclature'),
    unresolved_count=(select count(*) from jsonb_array_elements(generated_lines) value where value->>'resolution'='unresolved')
  where id=session_row.id;
  insert into public.estimate_events(estimate_id, actor_user_id, event_type)
  values(created.id, auth.uid(), 'generator_created');
  return created.id;
end;
$$;

create or replace function public.submit_estimate_generator_feedback(target_session_id uuid, target_answer text, target_comment text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare session_row public.estimate_generator_sessions; feedback_id uuid;
begin
  select * into session_row from public.estimate_generator_sessions where id=target_session_id;
  if session_row.id is null or session_row.actor_user_id<>auth.uid() or session_row.estimate_id is null
    or not public.can_access_estimates(session_row.company_id, 'estimates.view') then
    raise exception 'Generator feedback is not available.' using errcode='42501';
  end if;
  if target_answer not in ('yes','partial','no') or char_length(coalesce(target_comment,''))>500 then
    raise exception 'Generator feedback is invalid.' using errcode='22023';
  end if;
  insert into public.estimate_generator_feedback(session_id,company_id,actor_user_id,answer,comment)
  values(session_row.id,session_row.company_id,auth.uid(),target_answer,nullif(btrim(target_comment),''))
  on conflict(session_id) do nothing returning id into feedback_id;
  if feedback_id is null then select id into feedback_id from public.estimate_generator_feedback where session_id=session_row.id; end if;
  return feedback_id;
end;
$$;

create or replace function public.can_prompt_estimate_generator_feedback(target_session_id uuid, target_estimate_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists(select 1 from public.estimate_generator_sessions session
    where session.id=target_session_id and session.estimate_id=target_estimate_id and session.actor_user_id=auth.uid()
      and public.can_access_estimates(session.company_id,'estimates.view')
      and not exists(select 1 from public.estimate_generator_feedback feedback where feedback.session_id=session.id));
$$;

create or replace function public.get_estimate_generator_admin_report(result_limit integer default 20)
returns jsonb language sql security definer set search_path = public stable as $$
  select case when not public.has_internal_permission('admin.estimates.view') then null else jsonb_build_object(
    'summary', jsonb_build_object(
      'usageCount', count(*), 'companiesCount', count(distinct company_id),
      'estimatesCreated', count(*) filter(where status='estimate_created'),
      'completionRate', coalesce(round(100.0*count(*) filter(where status='estimate_created')/nullif(count(*),0),1),0),
      'averageGeneratedLines', coalesce(round(avg(requirement_count),1),0), 'unresolvedCount', coalesce(sum(unresolved_count),0),
      'feedbackYes', (select count(*) from public.estimate_generator_feedback where answer='yes'),
      'feedbackPartial', (select count(*) from public.estimate_generator_feedback where answer='partial'),
      'feedbackNo', (select count(*) from public.estimate_generator_feedback where answer='no')
    ),
    'comments', coalesce((select jsonb_agg(row_data order by created_at desc) from (
      select feedback.answer, feedback.comment, feedback.created_at from public.estimate_generator_feedback feedback
      where feedback.comment is not null order by feedback.created_at desc limit greatest(1,least(result_limit,50))
    ) row_data),'[]'::jsonb)
  ) end from public.estimate_generator_sessions;
$$;

revoke all on function public.record_estimate_generator_session(uuid,uuid,text,integer,integer,boolean),
  public.resolve_generator_external_nomenclature(uuid,uuid[]),
  public.create_estimate_from_generator(uuid,uuid,uuid,text,text,text,integer,uuid,text,jsonb),
  public.submit_estimate_generator_feedback(uuid,text,text), public.can_prompt_estimate_generator_feedback(uuid,uuid), public.get_estimate_generator_admin_report(integer)
from public, anon;
grant execute on function public.record_estimate_generator_session(uuid,uuid,text,integer,integer,boolean),
  public.resolve_generator_external_nomenclature(uuid,uuid[]),
  public.create_estimate_from_generator(uuid,uuid,uuid,text,text,text,integer,uuid,text,jsonb),
  public.submit_estimate_generator_feedback(uuid,text,text), public.can_prompt_estimate_generator_feedback(uuid,uuid), public.get_estimate_generator_admin_report(integer)
to authenticated;
