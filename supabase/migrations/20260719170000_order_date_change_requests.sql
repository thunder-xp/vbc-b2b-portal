begin;

insert into public.permissions(code, description)
values ('order_date_changes.review', 'Review partner customer-order shipment date-change requests.')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from public.roles role cross join public.permissions permission
where role.code in ('novotech_admin', 'novotech_sales') and permission.code = 'order_date_changes.review'
on conflict do nothing;

alter table public.partner_order_history
  drop constraint if exists partner_order_history_id_company_unique;
alter table public.partner_order_history
  add constraint partner_order_history_id_company_unique unique(id, company_id);

create table if not exists public.partner_order_date_change_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete cascade,
  order_history_id uuid not null,
  requested_by uuid not null references public.user_profiles(id),
  current_date_snapshot date not null,
  requested_date date not null,
  comment text null,
  status text not null default 'pending',
  reviewed_by uuid null references public.user_profiles(id),
  reviewed_at timestamptz null,
  review_comment text null,
  synchronized_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_order_date_change_order_company_fk foreign key(order_history_id, company_id)
    references public.partner_order_history(id, company_id) on delete cascade,
  constraint partner_order_date_change_dates_check check (requested_date <> current_date_snapshot),
  constraint partner_order_date_change_comment_check check (comment is null or char_length(comment) <= 1000),
  constraint partner_order_date_change_review_comment_check check (review_comment is null or char_length(review_comment) <= 1000),
  constraint partner_order_date_change_status_check check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  constraint partner_order_date_change_review_check check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status = 'cancelled' and reviewed_by is null and reviewed_at is null)
    or (status in ('approved', 'rejected') and reviewed_by is not null and reviewed_at is not null)
  )
);

create unique index if not exists partner_order_date_change_pending_idx
  on public.partner_order_date_change_requests(order_history_id) where status = 'pending';
create index if not exists partner_order_date_change_company_status_idx
  on public.partner_order_date_change_requests(company_id, status, created_at desc);
create index if not exists partner_order_date_change_order_idx
  on public.partner_order_date_change_requests(order_history_id, created_at desc);
create index if not exists partner_order_history_planned_shipments_idx
  on public.partner_order_history(company_id, one_c_delivery_date, id)
  where partner_visible and not one_c_deletion_mark and one_c_delivery_date is not null;

drop trigger if exists set_partner_order_date_change_requests_updated_at on public.partner_order_date_change_requests;
create trigger set_partner_order_date_change_requests_updated_at before update on public.partner_order_date_change_requests
for each row execute function public.set_updated_at();

create or replace function public.can_review_order_date_changes()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_profiles profile
    where profile.id = auth.uid() and profile.status = 'active' and profile.user_type in ('internal', 'admin')
  ) and exists (
    select 1 from public.roles role
    join public.role_permissions role_permission on role_permission.role_id = role.id
    join public.permissions permission on permission.id = role_permission.permission_id
    where role.code in ('novotech_admin', 'novotech_sales') and permission.code = 'order_date_changes.review'
  );
$$;

alter table public.partner_order_date_change_requests enable row level security;
revoke all on table public.partner_order_date_change_requests from anon, authenticated;
grant select on table public.partner_order_date_change_requests to authenticated;

drop policy if exists "Partners select company date change requests" on public.partner_order_date_change_requests;
create policy "Partners select company date change requests" on public.partner_order_date_change_requests for select to authenticated
using (public.has_permission(company_id, 'orders.view') or public.can_review_order_date_changes());

create or replace function public.create_partner_order_date_change_request(
  target_order_history_id uuid,
  target_requested_date date,
  target_comment text default null
)
returns public.partner_order_date_change_requests
language plpgsql security definer set search_path = public as $$
declare target_order public.partner_order_history; created public.partner_order_date_change_requests; normalized_comment text;
begin
  select * into target_order from public.partner_order_history where id = target_order_history_id for share;
  if not found or not target_order.partner_visible or target_order.one_c_deletion_mark or target_order.one_c_state_code = 'completed' or target_order.one_c_delivery_date is null then
    raise exception 'Order is not eligible for a date change.' using errcode = 'P0002';
  end if;
  if not public.has_permission(target_order.company_id, 'orders.manage') then raise exception 'Date change is not allowed.' using errcode = '42501'; end if;
  if target_requested_date <= current_date or target_requested_date = target_order.one_c_delivery_date then raise exception 'Requested date is invalid.' using errcode = '22023'; end if;
  normalized_comment := nullif(btrim(target_comment), '');
  if normalized_comment is not null and char_length(normalized_comment) > 1000 then raise exception 'Comment is too long.' using errcode = '22023'; end if;
  insert into public.partner_order_date_change_requests(company_id, order_history_id, requested_by, current_date_snapshot, requested_date, comment)
  values(target_order.company_id, target_order.id, auth.uid(), target_order.one_c_delivery_date, target_requested_date, normalized_comment)
  returning * into created;
  return created;
end;
$$;

create or replace function public.cancel_partner_order_date_change_request(target_request_id uuid)
returns public.partner_order_date_change_requests
language plpgsql security definer set search_path = public as $$
declare target public.partner_order_date_change_requests;
begin
  select * into target from public.partner_order_date_change_requests where id = target_request_id for update;
  if not found then raise exception 'Request was not found.' using errcode = 'P0002'; end if;
  if target.requested_by <> auth.uid() or target.status <> 'pending' or not public.has_permission(target.company_id, 'orders.manage') then raise exception 'Request cannot be cancelled.' using errcode = '42501'; end if;
  update public.partner_order_date_change_requests set status = 'cancelled' where id = target.id returning * into target;
  return target;
end;
$$;

revoke all on function public.create_partner_order_date_change_request(uuid, date, text) from public;
revoke all on function public.cancel_partner_order_date_change_request(uuid) from public;
grant execute on function public.create_partner_order_date_change_request(uuid, date, text) to authenticated;
grant execute on function public.cancel_partner_order_date_change_request(uuid) to authenticated;

comment on table public.partner_order_date_change_requests is 'Portal workflow requests only. Document_ЗаказПокупателя.ДатаОтгрузки in 1C remains authoritative.';
commit;
