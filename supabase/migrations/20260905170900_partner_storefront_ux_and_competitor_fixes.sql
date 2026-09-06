-- Return the bounded showcase rows and the exact matching count in the same
-- request. The count is presentation metadata; pricing and catalog truth stay
-- in their existing projections.
create or replace function public.get_published_product_merchandising_v2(
  p_company_id uuid,
  p_label_code text default null,
  p_limit_per_label integer default 5
)
returns table(
  product_id uuid,
  label_code text,
  priority integer,
  starts_at timestamptz,
  ends_at timestamptz,
  source text,
  matching_product_count integer
)
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.uid() is null
    or not public.has_active_company_membership(p_company_id)
    or not public.has_permission(p_company_id, 'catalog.view') then
    raise exception 'Catalog merchandising access denied.' using errcode = '42501';
  end if;
  if (p_label_code is not null and p_label_code not in ('NEW', 'TOP', 'HOT'))
    or p_limit_per_label not between 1 and 5 then
    raise exception 'Invalid merchandising projection input.' using errcode = '22023';
  end if;

  return query
  with eligible as (
    select assignment.product_id,
      assignment.label_code,
      assignment.priority,
      assignment.starts_at,
      assignment.ends_at,
      assignment.source,
      row_number() over (
        partition by assignment.label_code
        order by assignment.priority desc, assignment.updated_at desc,
          product.sort_order, lower(product.name), product.id
      ) as label_rank,
      count(*) over (partition by assignment.label_code)::integer as total_count
    from public.product_merchandising_assignments assignment
    join public.catalog_products product
      on product.id = assignment.product_id
     and product.is_active
     and product.is_visible
    where assignment.label_code in ('NEW', 'TOP', 'HOT')
      and assignment.is_active
      and assignment.is_curated_visible
      and assignment.revoked_at is null
      and assignment.source in ('manual', 'one_c')
      and assignment.starts_at <= now()
      and (assignment.ends_at is null or assignment.ends_at > now())
      and (p_label_code is null or assignment.label_code = p_label_code)
  )
  select eligible.product_id,
    eligible.label_code,
    eligible.priority,
    eligible.starts_at,
    eligible.ends_at,
    eligible.source,
    eligible.total_count
  from eligible
  where eligible.label_rank <= p_limit_per_label
  order by case eligible.label_code when 'TOP' then 1 when 'NEW' then 2 else 3 end,
    eligible.label_rank;
end;
$$;

revoke all on function public.get_published_product_merchandising_v2(uuid,text,integer)
  from public, anon;
grant execute on function public.get_published_product_merchandising_v2(uuid,text,integer)
  to authenticated;

-- Victiana was incorrectly registered as an alias of Exterior. Preserve the
-- submitted observation name and repair only the governed identity mapping.
insert into public.competitive_intelligence_competitors(
  canonical_name,
  display_name,
  normalized_name
)
values
  ('Victiana', 'Victiana', public.normalize_competitive_intelligence_name('Victiana')),
  ('Mellitax', 'Mellitax', public.normalize_competitive_intelligence_name('Mellitax'))
on conflict (normalized_name) do update
set canonical_name = excluded.canonical_name,
  display_name = excluded.display_name,
  status = 'active',
  merged_into_id = null,
  updated_at = now();

delete from public.competitive_intelligence_competitor_aliases alias
using public.competitive_intelligence_competitors competitor
where alias.competitor_id = competitor.id
  and competitor.normalized_name = public.normalize_competitive_intelligence_name('Exterior')
  and alias.normalized_alias = public.normalize_competitive_intelligence_name('VICTIANA');

insert into public.competitive_intelligence_competitor_aliases(
  competitor_id,
  alias,
  normalized_alias
)
select competitor.id, candidate.alias, public.normalize_competitive_intelligence_name(candidate.alias)
from public.competitive_intelligence_competitors competitor
cross join (values ('VICTIANA')) candidate(alias)
where competitor.normalized_name = public.normalize_competitive_intelligence_name('Victiana')
on conflict (normalized_alias) do update
set competitor_id = excluded.competitor_id,
  alias = excluded.alias;

insert into public.competitive_intelligence_competitor_aliases(
  competitor_id,
  alias,
  normalized_alias
)
select competitor.id, candidate.alias, public.normalize_competitive_intelligence_name(candidate.alias)
from public.competitive_intelligence_competitors competitor
cross join (values ('MELLITAX')) candidate(alias)
where competitor.normalized_name = public.normalize_competitive_intelligence_name('Mellitax')
on conflict (normalized_alias) do update
set competitor_id = excluded.competitor_id,
  alias = excluded.alias;

update public.competitive_intelligence_reconciliation_queue queue
set resolved_competitor_id = competitor.id,
  status = 'resolved',
  resolved_at = now()
from public.competitive_intelligence_competitors competitor
where queue.normalized_name = public.normalize_competitive_intelligence_name('VICTIANA')
  and competitor.normalized_name = public.normalize_competitive_intelligence_name('Victiana');

-- The database and client both use UTF-8. Two stored projector definitions had
-- already-mojibaked Cyrillic literals, so corruption happened before insert.
-- U& literals make this repair independent of the migration transport encoding.
do $$
declare
  warehouse_title text := U&'\041D\043E\0432\043E\0435 \043F\043E\043F\043E\043B\043D\0435\043D\0438\0435 \0441\043A\043B\0430\0434\0430';
  warehouse_message text := U&'\0412 \0432\0438\0442\0440\0438\043D\0443 \0434\043E\0431\0430\0432\043B\0435\043D\044B \0442\043E\0432\0430\0440\044B \0438\0437 \043F\043E\0441\043B\0435\0434\043D\0435\0433\043E \043F\043E\0441\0442\0443\043F\043B\0435\043D\0438\044F.';
  warehouse_action text := U&'\041F\043E\0441\043C\043E\0442\0440\0435\0442\044C \043F\043E\043F\043E\043B\043D\0435\043D\0438\0435';
  installation_title text := U&'\041D\043E\0432\044B\0439 \0437\0430\043A\0430\0437 \043D\0430 \043C\043E\043D\0442\0430\0436';
  installation_message_prefix text := U&'\0414\043E\0441\0442\0443\043F\043D\043E \043D\043E\0432\043E\0435 \043F\0440\0435\0434\043B\043E\0436\0435\043D\0438\0435 \043F\043E \043C\043E\043D\0442\0430\0436\0443 CCTV \0432 \0440\0435\0433\0438\043E\043D\0435 ';
  installation_action text := U&'\041E\0442\043A\0440\044B\0442\044C \043F\0440\0435\0434\043B\043E\0436\0435\043D\0438\044F';
  bad_warehouse_title text;
  bad_warehouse_message text;
  bad_warehouse_action text;
  bad_installation_title text;
  bad_installation_message_prefix text;
  bad_installation_action text;
  definition text;
begin
  bad_warehouse_title := convert_from(convert_to(warehouse_title, 'UTF8'), 'WIN1251');
  bad_warehouse_message := convert_from(convert_to(warehouse_message, 'UTF8'), 'WIN1251');
  bad_warehouse_action := convert_from(convert_to(warehouse_action, 'UTF8'), 'WIN1251');
  bad_installation_title := convert_from(convert_to(installation_title, 'UTF8'), 'WIN1251');
  bad_installation_message_prefix := convert_from(convert_to(installation_message_prefix, 'UTF8'), 'WIN1251');
  bad_installation_action := convert_from(convert_to(installation_action, 'UTF8'), 'WIN1251');

  select pg_get_functiondef('public.reconcile_current_warehouse_replenishment_day(boolean)'::regprocedure)
  into definition;
  definition := replace(definition, bad_warehouse_title, warehouse_title);
  definition := replace(definition, bad_warehouse_message, warehouse_message);
  definition := replace(definition, bad_warehouse_action, warehouse_action);
  execute definition;

  select pg_get_functiondef('public.project_installation_offer_notification(uuid)'::regprocedure)
  into definition;
  definition := replace(definition, bad_installation_title, installation_title);
  definition := replace(definition, bad_installation_message_prefix, installation_message_prefix);
  definition := replace(definition, bad_installation_action, installation_action);
  execute definition;

  update public.partner_notifications notification
  set title = warehouse_title,
    message = warehouse_message,
    action_label = warehouse_action
  where notification.event_code = 'warehouse_arrival_completed'
    and notification.title = bad_warehouse_title
    and notification.message = bad_warehouse_message;

  update public.partner_notifications notification
  set title = installation_title,
    message = replace(notification.message, bad_installation_message_prefix, installation_message_prefix),
    action_label = installation_action
  where notification.event_code = 'installation_offer'
    and notification.title = bad_installation_title
    and notification.message like bad_installation_message_prefix || '%';

  if exists (
    select 1 from public.partner_notifications notification
    where notification.title in (bad_warehouse_title, bad_installation_title)
  ) then
    raise exception 'Targeted notification Unicode repair was incomplete.';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from public.competitive_intelligence_competitors competitor
    where competitor.normalized_name = public.normalize_competitive_intelligence_name('Victiana')
      and competitor.display_name = 'Victiana'
      and competitor.status = 'active'
  ) or not exists (
    select 1
    from public.competitive_intelligence_competitors competitor
    where competitor.normalized_name = public.normalize_competitive_intelligence_name('Mellitax')
      and competitor.display_name = 'Mellitax'
      and competitor.status = 'active'
  ) then
    raise exception 'Governed competitor registration was incomplete.';
  end if;

  if exists (
    select 1
    from public.competitive_intelligence_competitor_aliases alias
    join public.competitive_intelligence_competitors competitor
      on competitor.id = alias.competitor_id
    where alias.normalized_alias = public.normalize_competitive_intelligence_name('VICTIANA')
      and competitor.normalized_name <> public.normalize_competitive_intelligence_name('Victiana')
  ) then
    raise exception 'Victiana remains mapped to an incorrect competitor.';
  end if;

  if position(convert_from(convert_to(
      U&'\041D\043E\0432\043E\0435 \043F\043E\043F\043E\043B\043D\0435\043D\0438\0435 \0441\043A\043B\0430\0434\0430',
      'UTF8'), 'WIN1251') in pg_get_functiondef(
        'public.reconcile_current_warehouse_replenishment_day(boolean)'::regprocedure
      )) > 0
    or position(convert_from(convert_to(
      U&'\041D\043E\0432\044B\0439 \0437\0430\043A\0430\0437 \043D\0430 \043C\043E\043D\0442\0430\0436',
      'UTF8'), 'WIN1251') in pg_get_functiondef(
        'public.project_installation_offer_notification(uuid)'::regprocedure
      )) > 0 then
    raise exception 'Notification projector Unicode repair was incomplete.';
  end if;
end;
$$;
