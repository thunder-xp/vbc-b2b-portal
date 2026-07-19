begin;

revoke all on function public.can_review_order_date_changes() from public, anon;
grant execute on function public.can_review_order_date_changes() to authenticated;

alter table public.partner_order_history_events
  drop constraint if exists partner_order_history_events_type_check;
alter table public.partner_order_history_events
  add constraint partner_order_history_events_type_check check (event_type in (
    'imported', 'received_by_one_c', 'posted', 'became_unposted', 'state_changed',
    'delivery_date_changed', 'marked_for_deletion', 'sync_restored',
    'date_change_requested', 'date_change_approved', 'date_change_rejected',
    'date_change_cancelled', 'date_change_reflected'
  ));

create or replace function public.record_order_date_change_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare event_name text; event_time timestamptz; event_value text;
begin
  if tg_op = 'INSERT' then
    event_name := 'date_change_requested'; event_time := new.created_at; event_value := new.requested_date::text;
  elsif old.status is distinct from new.status then
    event_name := case new.status when 'approved' then 'date_change_approved' when 'rejected' then 'date_change_rejected' when 'cancelled' then 'date_change_cancelled' else null end;
    event_time := coalesce(new.reviewed_at, new.updated_at); event_value := new.requested_date::text;
  elsif old.synchronized_at is null and new.synchronized_at is not null then
    event_name := 'date_change_reflected'; event_time := new.synchronized_at; event_value := new.requested_date::text;
  end if;
  if event_name is not null then
    insert into public.partner_order_history_events(order_history_id, event_type, occurred_at, previous_value, current_value, fingerprint)
    values(new.order_history_id, event_name, event_time, new.current_date_snapshot::text, event_value, md5(new.id::text || ':' || event_name))
    on conflict (fingerprint) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists record_order_date_change_event on public.partner_order_date_change_requests;
create trigger record_order_date_change_event after insert or update of status, synchronized_at
on public.partner_order_date_change_requests for each row execute function public.record_order_date_change_event();

insert into public.partner_order_history_events(order_history_id, event_type, occurred_at, previous_value, current_value, fingerprint)
select request.order_history_id, 'date_change_requested', request.created_at, request.current_date_snapshot::text,
  request.requested_date::text, md5(request.id::text || ':date_change_requested')
from public.partner_order_date_change_requests request
on conflict (fingerprint) do nothing;

create or replace function public.review_partner_order_date_change_request(
  target_request_id uuid,
  target_decision text,
  target_comment text default null
)
returns public.partner_order_date_change_requests
language plpgsql security definer set search_path = public as $$
declare target public.partner_order_date_change_requests; normalized_comment text;
begin
  if not public.can_review_order_date_changes() then raise exception 'Review is not allowed.' using errcode = '42501'; end if;
  if target_decision not in ('approved', 'rejected') then raise exception 'Decision is invalid.' using errcode = '22023'; end if;
  normalized_comment := nullif(btrim(target_comment), '');
  if normalized_comment is not null and char_length(normalized_comment) > 1000 then raise exception 'Comment is too long.' using errcode = '22023'; end if;
  select * into target from public.partner_order_date_change_requests where id = target_request_id for update;
  if not found then raise exception 'Request was not found.' using errcode = 'P0002'; end if;
  if target.status <> 'pending' then raise exception 'Request is no longer pending.' using errcode = '22023'; end if;
  update public.partner_order_date_change_requests request set
    status = target_decision,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_comment = normalized_comment,
    synchronized_at = case when target_decision = 'approved' and exists (
      select 1 from public.partner_order_history history
      where history.id = request.order_history_id and history.one_c_delivery_date = request.requested_date
    ) then now() else null end
  where request.id = target.id returning * into target;
  return target;
end;
$$;

create or replace function public.reconcile_order_date_change_from_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.one_c_delivery_date is distinct from new.one_c_delivery_date and new.one_c_delivery_date is not null then
    update public.partner_order_date_change_requests
    set synchronized_at = now()
    where order_history_id = new.id and status = 'approved' and synchronized_at is null
      and requested_date = new.one_c_delivery_date;
  end if;
  return new;
end;
$$;

drop trigger if exists reconcile_order_date_change_from_history on public.partner_order_history;
create trigger reconcile_order_date_change_from_history after update of one_c_delivery_date
on public.partner_order_history for each row execute function public.reconcile_order_date_change_from_history();

revoke all on function public.review_partner_order_date_change_request(uuid, text, text) from public;
grant execute on function public.review_partner_order_date_change_request(uuid, text, text) to authenticated;

comment on function public.reconcile_order_date_change_from_history() is
  'Marks an approved portal request reflected only after the authoritative 1C delivery date reaches the read model.';

commit;
