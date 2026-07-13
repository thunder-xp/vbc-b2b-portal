-- Portal-owned reservation request workflow derived from approved specification snapshots.
-- Current stock and supplier arrivals remain 1C-owned read models and are not persisted here.

insert into public.permissions (code, description)
values
  ('reservations.manage', 'Create and submit company reservation requests.'),
  ('reservations.review', 'Review submitted partner reservation requests.')
on conflict (code) do update set description = excluded.description;

with permission_seed(role_code, permission_code) as (
  values
    ('partner_owner', 'reservations.manage'),
    ('partner_manager', 'reservations.manage'),
    ('partner_buyer', 'reservations.manage'),
    ('novotech_admin', 'reservations.review'),
    ('novotech_sales', 'reservations.review')
)
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from permission_seed seed
join public.roles role on role.code = seed.role_code
join public.permissions permission on permission.code = seed.permission_code
on conflict (role_id, permission_id) do nothing;

create table public.reservation_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  specification_id uuid not null references public.project_specifications(id) on delete restrict,
  specification_revision_id uuid not null references public.project_specifications(id) on delete restrict,
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'under_review', 'approved', 'partially_approved', 'rejected', 'cancelled')),
  requested_delivery_date date null,
  partner_comment text null check (partner_comment is null or char_length(partner_comment) <= 2000),
  manager_comment text null check (manager_comment is null or char_length(manager_comment) <= 2000),
  submitted_at timestamptz null,
  reviewed_at timestamptz null,
  reviewed_by uuid null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservation_requests_submission_check check (
    (status = 'draft' and submitted_at is null)
    or (status <> 'draft' and submitted_at is not null)
  ),
  constraint reservation_requests_review_check check (
    (status in ('draft', 'submitted', 'under_review') and reviewed_at is null and reviewed_by is null)
    or status in ('approved', 'partially_approved', 'rejected', 'cancelled')
  )
);

create table public.reservation_request_items (
  id uuid primary key default gen_random_uuid(),
  reservation_request_id uuid not null references public.reservation_requests(id) on delete cascade,
  product_id uuid not null references public.catalog_products(id) on delete restrict,
  product_name_snapshot text not null,
  sku_snapshot text not null,
  slug_snapshot text not null,
  specification_quantity integer not null check (specification_quantity > 0),
  requested_quantity integer not null check (requested_quantity > 0 and requested_quantity <= specification_quantity),
  approved_quantity integer null check (approved_quantity is null or (approved_quantity >= 0 and approved_quantity <= requested_quantity)),
  partner_unit_price_amount numeric null check (partner_unit_price_amount is null or partner_unit_price_amount >= 0),
  partner_currency_code text null,
  retail_unit_price_amount numeric null check (retail_unit_price_amount is null or retail_unit_price_amount >= 0),
  retail_currency_code text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reservation_request_id, product_id)
);

create unique index reservation_requests_active_revision_idx
  on public.reservation_requests(specification_revision_id)
  where status not in ('rejected', 'cancelled');
create index reservation_requests_company_idx on public.reservation_requests(company_id, created_at desc);
create index reservation_requests_review_queue_idx on public.reservation_requests(status, submitted_at desc);
create index reservation_request_items_request_idx on public.reservation_request_items(reservation_request_id);

create trigger set_reservation_requests_updated_at
before update on public.reservation_requests
for each row execute function public.set_updated_at();
create trigger set_reservation_request_items_updated_at
before update on public.reservation_request_items
for each row execute function public.set_updated_at();

comment on table public.reservation_requests is
  'Portal workflow requests. A row is not a confirmed 1C reservation.';
comment on table public.reservation_request_items is
  'Immutable product/price request snapshots. Current stock and arrivals are resolved live.';

alter table public.reservation_requests enable row level security;
alter table public.reservation_request_items enable row level security;
revoke all on table public.reservation_requests from anon, authenticated;
revoke all on table public.reservation_request_items from anon, authenticated;
grant select on table public.reservation_requests to authenticated;
grant select on table public.reservation_request_items to authenticated;
grant update (requested_delivery_date, partner_comment) on table public.reservation_requests to authenticated;
grant update (requested_quantity) on table public.reservation_request_items to authenticated;

create or replace function public.can_manage_reservation_company(target_company_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles profile
    join public.company_memberships membership on membership.user_id = profile.id
    join public.partner_companies company on company.id = membership.company_id
    join public.roles role on role.id = membership.role_id
    join public.role_permissions role_permission on role_permission.role_id = role.id
    join public.permissions permission on permission.id = role_permission.permission_id
    where profile.id = auth.uid()
      and profile.status = 'active'
      and membership.company_id = target_company_id
      and membership.status = 'active'
      and company.status = 'active'
      and permission.code = 'reservations.manage'
  );
$$;

create or replace function public.can_review_reservation_requests()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles profile
    where profile.id = auth.uid()
      and profile.status = 'active'
      and profile.user_type in ('internal', 'admin')
  ) and exists (
    select 1
    from public.roles role
    join public.role_permissions role_permission on role_permission.role_id = role.id
    join public.permissions permission on permission.id = role_permission.permission_id
    where role.code in ('novotech_admin', 'novotech_sales')
      and permission.code = 'reservations.review'
  );
$$;

revoke all on function public.can_manage_reservation_company(uuid) from public;
revoke all on function public.can_review_reservation_requests() from public;
grant execute on function public.can_manage_reservation_company(uuid) to authenticated;
grant execute on function public.can_review_reservation_requests() to authenticated;

create policy "Partners select own reservation requests"
on public.reservation_requests for select to authenticated
using (public.can_manage_reservation_company(company_id));
create policy "Partners update own draft reservation requests"
on public.reservation_requests for update to authenticated
using (status = 'draft' and public.can_manage_reservation_company(company_id))
with check (status = 'draft' and public.can_manage_reservation_company(company_id));
create policy "Partners select own reservation items"
on public.reservation_request_items for select to authenticated
using (exists (
  select 1 from public.reservation_requests request
  where request.id = reservation_request_id
    and public.can_manage_reservation_company(request.company_id)
));
create policy "Partners update own draft reservation items"
on public.reservation_request_items for update to authenticated
using (exists (
  select 1 from public.reservation_requests request
  where request.id = reservation_request_id and request.status = 'draft'
    and public.can_manage_reservation_company(request.company_id)
))
with check (exists (
  select 1 from public.reservation_requests request
  where request.id = reservation_request_id and request.status = 'draft'
    and public.can_manage_reservation_company(request.company_id)
));
create policy "Internal sales select reservation requests"
on public.reservation_requests for select to authenticated
using (status <> 'draft' and public.can_review_reservation_requests());
create policy "Internal sales select reservation items"
on public.reservation_request_items for select to authenticated
using (public.can_review_reservation_requests() and exists (
  select 1 from public.reservation_requests request
  where request.id = reservation_request_id and request.status <> 'draft'
));

create or replace function public.create_reservation_request_from_specification(
  target_specification_id uuid,
  target_delivery_date date,
  target_partner_comment text default null
)
returns public.reservation_requests
language plpgsql security definer set search_path = public
as $$
declare
  specification public.project_specifications;
  request public.reservation_requests;
  root_id uuid;
  normalized_comment text := nullif(btrim(target_partner_comment), '');
begin
  select * into specification from public.project_specifications
  where id = target_specification_id for update;
  if not found then raise exception 'Approved specification was not found.' using errcode = 'P0002'; end if;
  if specification.status <> 'approved' then raise exception 'Only approved specifications can create reservation requests.' using errcode = '22023'; end if;
  if target_delivery_date is null then raise exception 'Preferred delivery date is required.' using errcode = '22023'; end if;
  if normalized_comment is not null and char_length(normalized_comment) > 2000 then raise exception 'Partner comment is too long.' using errcode = '22023'; end if;
  if not public.can_manage_reservation_company(specification.company_id) then raise exception 'Reservation request is not allowed.' using errcode = '42501'; end if;
  if exists (select 1 from public.reservation_requests existing where existing.specification_revision_id = specification.id and existing.status not in ('rejected', 'cancelled')) then
    raise exception 'An active reservation request already exists.' using errcode = '23505';
  end if;
  if not exists (select 1 from public.project_specification_items item where item.specification_id = specification.id) then
    raise exception 'Approved specification has no items.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.project_specification_items item
    where item.specification_id = specification.id
      and (item.product_name_snapshot is null or item.sku_snapshot is null or item.slug_snapshot is null or item.snapshot_at is null)
  ) then raise exception 'Approved specification snapshot is incomplete.' using errcode = '22023'; end if;

  root_id := coalesce(specification.parent_specification_id, specification.id);
  insert into public.reservation_requests (
    company_id, specification_id, specification_revision_id, created_by,
    requested_delivery_date, partner_comment
  )
  values (
    specification.company_id, root_id, specification.id, auth.uid(),
    target_delivery_date, normalized_comment
  ) returning * into request;

  insert into public.reservation_request_items (
    reservation_request_id, product_id, product_name_snapshot, sku_snapshot, slug_snapshot,
    specification_quantity, requested_quantity, partner_unit_price_amount, partner_currency_code,
    retail_unit_price_amount, retail_currency_code
  )
  select request.id, item.product_id, item.product_name_snapshot, item.sku_snapshot, item.slug_snapshot,
    item.quantity, item.quantity, item.partner_unit_price_amount, item.partner_currency_code,
    item.retail_unit_price_amount, item.retail_currency_code
  from public.project_specification_items item where item.specification_id = specification.id;
  return request;
end;
$$;

create or replace function public.submit_reservation_request(target_request_id uuid)
returns public.reservation_requests
language plpgsql security definer set search_path = public
as $$
declare target public.reservation_requests;
begin
  select * into target from public.reservation_requests where id = target_request_id for update;
  if not found then raise exception 'Reservation request was not found.' using errcode = 'P0002'; end if;
  if not public.can_manage_reservation_company(target.company_id) then raise exception 'Reservation request is not allowed.' using errcode = '42501'; end if;
  if target.status <> 'draft' then raise exception 'Only draft reservation requests can be submitted.' using errcode = '22023'; end if;
  if target.requested_delivery_date is null then raise exception 'Preferred delivery date is required.' using errcode = '22023'; end if;
  if not exists (select 1 from public.reservation_request_items item where item.reservation_request_id = target.id) then raise exception 'Reservation request has no items.' using errcode = '22023'; end if;
  update public.reservation_requests set status = 'submitted', submitted_at = now()
  where id = target.id returning * into target;
  return target;
end;
$$;

create or replace function public.start_reservation_request_review(target_request_id uuid)
returns public.reservation_requests
language plpgsql security definer set search_path = public
as $$
declare target public.reservation_requests;
begin
  if not public.can_review_reservation_requests() then raise exception 'Reservation review is not allowed.' using errcode = '42501'; end if;
  select * into target from public.reservation_requests where id = target_request_id for update;
  if not found then raise exception 'Reservation request was not found.' using errcode = 'P0002'; end if;
  if target.status <> 'submitted' then raise exception 'Only submitted requests can enter review.' using errcode = '22023'; end if;
  update public.reservation_requests set status = 'under_review'
  where id = target.id returning * into target;
  return target;
end;
$$;

create or replace function public.decide_reservation_request(
  target_request_id uuid,
  target_status text,
  approved_quantities jsonb,
  response_comment text default null
)
returns public.reservation_requests
language plpgsql security definer set search_path = public
as $$
declare
  target public.reservation_requests;
  normalized_comment text := nullif(btrim(response_comment), '');
  item_count integer;
  decision_count integer;
  decision_input_count integer;
  reduced_count integer;
  positive_count integer;
begin
  if not public.can_review_reservation_requests() then raise exception 'Reservation review is not allowed.' using errcode = '42501'; end if;
  if target_status not in ('approved', 'partially_approved', 'rejected') then raise exception 'Reservation decision is invalid.' using errcode = '22023'; end if;
  if target_status = 'rejected' and normalized_comment is null then raise exception 'Rejection requires a comment.' using errcode = '22023'; end if;
  select * into target from public.reservation_requests where id = target_request_id for update;
  if not found then raise exception 'Reservation request was not found.' using errcode = 'P0002'; end if;
  if target.status <> 'under_review' then raise exception 'Only requests under review can be decided.' using errcode = '22023'; end if;
  select count(*) into item_count from public.reservation_request_items where reservation_request_id = target.id;

  if target_status = 'rejected' then
    update public.reservation_request_items set approved_quantity = 0 where reservation_request_id = target.id;
  else
    with decision as (
      select (entry->>'itemId')::uuid item_id, (entry->>'approvedQuantity')::integer approved_quantity
      from jsonb_array_elements(coalesce(approved_quantities, '[]'::jsonb)) entry
    )
    select count(distinct decision.item_id), count(*) filter (where decision.approved_quantity < item.requested_quantity), count(*) filter (where decision.approved_quantity > 0)
    into decision_count, reduced_count, positive_count
    from decision
    join public.reservation_request_items item on item.id = decision.item_id and item.reservation_request_id = target.id
    where decision.approved_quantity between 0 and item.requested_quantity;

    decision_input_count := jsonb_array_length(coalesce(approved_quantities, '[]'::jsonb));
    if decision_count <> item_count or decision_input_count <> item_count then raise exception 'Every request item requires one valid approved quantity.' using errcode = '22023'; end if;
    if target_status = 'approved' and reduced_count <> 0 then raise exception 'Full approval requires all requested quantities.' using errcode = '22023'; end if;
    if target_status = 'partially_approved' and (reduced_count = 0 or positive_count = 0) then raise exception 'Partial approval requires reduced positive fulfillment.' using errcode = '22023'; end if;

    with decision as (
      select (entry->>'itemId')::uuid item_id, (entry->>'approvedQuantity')::integer approved_quantity
      from jsonb_array_elements(approved_quantities) entry
    )
    update public.reservation_request_items item set approved_quantity = decision.approved_quantity
    from decision where item.id = decision.item_id and item.reservation_request_id = target.id;
  end if;

  update public.reservation_requests
  set status = target_status, manager_comment = normalized_comment, reviewed_by = auth.uid(), reviewed_at = now()
  where id = target.id returning * into target;
  return target;
end;
$$;

revoke all on function public.create_reservation_request_from_specification(uuid, date, text) from public;
revoke all on function public.submit_reservation_request(uuid) from public;
revoke all on function public.start_reservation_request_review(uuid) from public;
revoke all on function public.decide_reservation_request(uuid, text, jsonb, text) from public;
grant execute on function public.create_reservation_request_from_specification(uuid, date, text) to authenticated;
grant execute on function public.submit_reservation_request(uuid) to authenticated;
grant execute on function public.start_reservation_request_review(uuid) to authenticated;
grant execute on function public.decide_reservation_request(uuid, text, jsonb, text) to authenticated;
