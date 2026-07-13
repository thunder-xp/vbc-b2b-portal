-- Internal review and immutable commercial snapshots for project specifications.
-- The snapshot records what the partner submitted; live commercial truth remains in 1C read models.

insert into public.permissions (code, description)
values ('specifications.review', 'Review submitted partner project specifications.')
on conflict (code) do update set description = excluded.description;

with review_roles(role_code) as (
  values ('novotech_admin'), ('novotech_sales')
)
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from review_roles seed
join public.roles role on role.code = seed.role_code
join public.permissions permission on permission.code = 'specifications.review'
on conflict (role_id, permission_id) do nothing;

alter table public.project_specifications
  add column if not exists parent_specification_id uuid null references public.project_specifications(id) on delete restrict,
  add column if not exists revision_number integer not null default 1,
  add column if not exists review_comment text null,
  add column if not exists reviewed_by uuid null references public.user_profiles(id) on delete restrict,
  add column if not exists reviewed_at timestamptz null,
  add column if not exists partner_purchase_total_amount numeric null,
  add column if not exists partner_currency_code_snapshot text null,
  add column if not exists retail_total_amount numeric null,
  add column if not exists retail_currency_code_snapshot text null,
  add column if not exists gross_profit_usd_snapshot numeric null,
  add column if not exists markup_percentage_snapshot numeric null,
  add column if not exists commercial_snapshot_at timestamptz null;

alter table public.project_specifications
  drop constraint if exists project_specifications_status_check,
  drop constraint if exists project_specifications_submission_time_check,
  drop constraint if exists project_specifications_revision_number_check,
  drop constraint if exists project_specifications_review_comment_check,
  add constraint project_specifications_status_check
    check (status in ('draft', 'submitted', 'under_review', 'approved', 'changes_requested', 'rejected')),
  add constraint project_specifications_submission_time_check
    check (
      (status = 'draft' and submitted_at is null)
      or (status <> 'draft' and submitted_at is not null)
    ),
  add constraint project_specifications_revision_number_check check (revision_number > 0),
  add constraint project_specifications_review_comment_check
    check (review_comment is null or char_length(review_comment) <= 2000);

create index if not exists project_specifications_review_queue_idx
  on public.project_specifications(status, submitted_at desc)
  where status <> 'draft';
create index if not exists project_specifications_parent_idx
  on public.project_specifications(parent_specification_id);

alter table public.project_specification_items
  add column if not exists product_name_snapshot text null,
  add column if not exists sku_snapshot text null,
  add column if not exists slug_snapshot text null,
  add column if not exists partner_unit_price_amount numeric null,
  add column if not exists partner_currency_code text null,
  add column if not exists retail_unit_price_amount numeric null,
  add column if not exists retail_currency_code text null,
  add column if not exists available_stock numeric null,
  add column if not exists nearest_arrival_date date null,
  add column if not exists nearest_arrival_quantity numeric null,
  add column if not exists gross_profit_usd numeric null,
  add column if not exists markup_percentage numeric null,
  add column if not exists partner_line_total_amount numeric null,
  add column if not exists retail_line_total_amount numeric null,
  add column if not exists snapshot_at timestamptz null;

comment on column public.project_specification_items.partner_unit_price_amount is
  'Immutable submitted-value snapshot; 1C remains the current price source of truth.';
comment on column public.project_specification_items.available_stock is
  'Immutable submitted-value snapshot; 1C remains the current stock source of truth.';

-- Existing submitted rows predate commercial snapshots. Preserve their product
-- identity without inventing historical prices or availability.
update public.project_specification_items item
set
  product_name_snapshot = product.name,
  sku_snapshot = product.sku,
  slug_snapshot = product.slug,
  snapshot_at = specification.submitted_at
from public.project_specifications specification,
     public.catalog_products product
where specification.id = item.specification_id
  and product.id = item.product_id
  and specification.status = 'submitted'
  and item.snapshot_at is null;

create or replace function public.can_review_project_specifications()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles profile
    where profile.id = auth.uid()
      and profile.status = 'active'
      and profile.user_type in ('internal', 'admin')
  )
  and exists (
    select 1
    from public.roles role
    join public.role_permissions role_permission on role_permission.role_id = role.id
    join public.permissions permission on permission.id = role_permission.permission_id
    where role.code in ('novotech_admin', 'novotech_sales')
      and permission.code = 'specifications.review'
  );
$$;

revoke all on function public.can_review_project_specifications() from public;
grant execute on function public.can_review_project_specifications() to authenticated;

drop policy if exists "Internal sales can select project specifications"
on public.project_specifications;
create policy "Internal sales can select project specifications"
on public.project_specifications
for select
to authenticated
using (public.can_review_project_specifications());

drop policy if exists "Internal sales can select project specification items"
on public.project_specification_items;
create policy "Internal sales can select project specification items"
on public.project_specification_items
for select
to authenticated
using (public.can_review_project_specifications());

-- Preserve the deployed one-argument RPC exactly. The guarded block repairs
-- environments where the earlier draft migration accidentally removed it.
do $restore_legacy_rpc$
begin
  if to_regprocedure('public.submit_project_specification(uuid)') is null then
    execute $function$
      create function public.submit_project_specification(target_specification_id uuid)
      returns public.project_specifications
      language plpgsql
      security definer
      set search_path = public
      as $body$
      declare
        target public.project_specifications;
      begin
        select * into target
        from public.project_specifications
        where id = target_specification_id
        for update;

        if target.id is null
          or not public.can_manage_project_specifications(target.company_id) then
          raise exception 'Project specification is not available.' using errcode = 'P0002';
        end if;

        if target.status <> 'draft' then
          raise exception 'Project specification is not a draft.' using errcode = 'P0001';
        end if;

        if not exists (
          select 1 from public.project_specification_items item
          where item.specification_id = target.id
        ) then
          raise exception 'Project specification cannot be submitted without items.' using errcode = '23514';
        end if;

        update public.project_specifications
        set status = 'submitted', submitted_at = now()
        where id = target.id
        returning * into target;

        return target;
      end;
      $body$
    $function$;
  end if;
end;
$restore_legacy_rpc$;

revoke all on function public.submit_project_specification(uuid) from public;
grant execute on function public.submit_project_specification(uuid) to authenticated;

-- Remove only the accidental unversioned overload from the pre-release draft.
drop function if exists public.submit_project_specification(uuid, jsonb);

create or replace function public.submit_project_specification_v2(
  target_specification_id uuid,
  item_snapshots jsonb
)
returns public.project_specifications
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.project_specifications;
  item_count integer;
  snapshot_count integer;
begin
  select * into target
  from public.project_specifications
  where id = target_specification_id
  for update;

  if target.id is null
    or not public.can_manage_project_specifications(target.company_id) then
    raise exception 'Project specification is not available.' using errcode = 'P0002';
  end if;

  if target.status <> 'draft' then
    raise exception 'Project specification is not a draft.' using errcode = 'P0001';
  end if;

  select count(*) into item_count
  from public.project_specification_items item
  where item.specification_id = target.id;

  if item_count = 0 then
    raise exception 'Project specification cannot be submitted without items.' using errcode = '23514';
  end if;

  select count(*) into snapshot_count
  from jsonb_to_recordset(item_snapshots) as snapshot(item_id uuid);

  if snapshot_count <> item_count
    or snapshot_count <> (
      select count(distinct snapshot.item_id)
      from jsonb_to_recordset(item_snapshots) as snapshot(item_id uuid)
    ) then
    raise exception 'A complete unique snapshot is required.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(item_snapshots) as snapshot(item_id uuid)
    left join public.project_specification_items item
      on item.id = snapshot.item_id and item.specification_id = target.id
    where item.id is null
  ) then
    raise exception 'Snapshot contains an invalid item.' using errcode = '23514';
  end if;

  update public.project_specification_items item
  set
    product_name_snapshot = snapshot.product_name,
    sku_snapshot = snapshot.sku,
    slug_snapshot = snapshot.slug,
    partner_unit_price_amount = snapshot.partner_unit_price_amount,
    partner_currency_code = snapshot.partner_currency_code,
    retail_unit_price_amount = snapshot.retail_unit_price_amount,
    retail_currency_code = snapshot.retail_currency_code,
    available_stock = snapshot.available_stock,
    nearest_arrival_date = snapshot.nearest_arrival_date,
    nearest_arrival_quantity = snapshot.nearest_arrival_quantity,
    gross_profit_usd = snapshot.gross_profit_usd,
    markup_percentage = snapshot.markup_percentage,
    partner_line_total_amount = case
      when snapshot.partner_unit_price_amount is null then null
      else snapshot.partner_unit_price_amount * item.quantity
    end,
    retail_line_total_amount = case
      when snapshot.retail_unit_price_amount is null then null
      else snapshot.retail_unit_price_amount * item.quantity
    end,
    snapshot_at = now()
  from jsonb_to_recordset(item_snapshots) as snapshot(
    item_id uuid,
    product_name text,
    sku text,
    slug text,
    partner_unit_price_amount numeric,
    partner_currency_code text,
    retail_unit_price_amount numeric,
    retail_currency_code text,
    available_stock numeric,
    nearest_arrival_date date,
    nearest_arrival_quantity numeric,
    gross_profit_usd numeric,
    markup_percentage numeric
  )
  where item.id = snapshot.item_id
    and item.specification_id = target.id
    and nullif(btrim(snapshot.product_name), '') is not null
    and nullif(btrim(snapshot.sku), '') is not null
    and nullif(btrim(snapshot.slug), '') is not null;

  if exists (
    select 1 from public.project_specification_items item
    where item.specification_id = target.id and item.snapshot_at is null
  ) then
    raise exception 'A valid snapshot is required for every item.' using errcode = '23514';
  end if;

  update public.project_specifications specification
  set
    partner_purchase_total_amount = totals.partner_purchase_total_amount,
    partner_currency_code_snapshot = totals.partner_currency_code,
    retail_total_amount = totals.retail_total_amount,
    retail_currency_code_snapshot = totals.retail_currency_code,
    gross_profit_usd_snapshot = totals.gross_profit_usd,
    markup_percentage_snapshot = case
      when totals.gross_profit_usd is not null
        and totals.partner_purchase_total_amount > 0
        and totals.partner_currency_code = 'USD'
      then (totals.gross_profit_usd / totals.partner_purchase_total_amount) * 100
      else null
    end,
    commercial_snapshot_at = now(),
    status = 'submitted',
    submitted_at = now()
  from (
    select
      case when count(*) = count(item.partner_line_total_amount)
        and count(distinct item.partner_currency_code) = 1
        then sum(item.partner_line_total_amount) else null end as partner_purchase_total_amount,
      case when count(*) = count(item.partner_line_total_amount)
        and count(distinct item.partner_currency_code) = 1
        then min(item.partner_currency_code) else null end as partner_currency_code,
      case when count(*) = count(item.retail_line_total_amount)
        and count(distinct item.retail_currency_code) = 1
        then sum(item.retail_line_total_amount) else null end as retail_total_amount,
      case when count(*) = count(item.retail_line_total_amount)
        and count(distinct item.retail_currency_code) = 1
        then min(item.retail_currency_code) else null end as retail_currency_code,
      case when count(*) = count(item.gross_profit_usd)
        then sum(item.gross_profit_usd * item.quantity) else null end as gross_profit_usd
    from public.project_specification_items item
    where item.specification_id = target.id
  ) totals
  where specification.id = target.id
  returning * into target;

  return target;
end;
$$;

revoke all on function public.submit_project_specification_v2(uuid, jsonb) from public;
grant execute on function public.submit_project_specification_v2(uuid, jsonb) to authenticated;

create or replace function public.review_project_specification(
  target_specification_id uuid,
  target_status text,
  response_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.project_specifications;
  normalized_comment text := nullif(btrim(response_comment), '');
  revision_id uuid;
begin
  if not public.can_review_project_specifications() then
    raise exception 'Specification review is not allowed.' using errcode = '42501';
  end if;

  select * into target
  from public.project_specifications
  where id = target_specification_id
  for update;

  if target.id is null then
    raise exception 'Project specification was not found.' using errcode = 'P0002';
  end if;

  if target_status = 'under_review' then
    if target.status <> 'submitted' then
      raise exception 'Only submitted specifications can enter review.' using errcode = 'P0001';
    end if;
  elsif target_status in ('approved', 'changes_requested', 'rejected') then
    if target.status <> 'under_review' then
      raise exception 'Only specifications under review can receive a decision.' using errcode = 'P0001';
    end if;
    if normalized_comment is null then
      raise exception 'A response comment is required.' using errcode = '23514';
    end if;
  else
    raise exception 'Unsupported review status.' using errcode = '23514';
  end if;

  update public.project_specifications
  set
    status = target_status,
    review_comment = case when target_status = 'under_review' then review_comment else normalized_comment end,
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = target.id;

  if target_status = 'changes_requested' then
    insert into public.project_specifications (
      company_id, created_by, project_name, customer_site_name, description,
      status, parent_specification_id, revision_number
    ) values (
      target.company_id, target.created_by, target.project_name, target.customer_site_name,
      target.description, 'draft', target.id, target.revision_number + 1
    ) returning id into revision_id;

    insert into public.project_specification_items (specification_id, product_id, quantity)
    select revision_id, item.product_id, item.quantity
    from public.project_specification_items item
    where item.specification_id = target.id;
  end if;

  return jsonb_build_object(
    'specification_id', target.id,
    'status', target_status,
    'revision_id', revision_id
  );
end;
$$;

revoke all on function public.review_project_specification(uuid, text, text) from public;
grant execute on function public.review_project_specification(uuid, text, text) to authenticated;
