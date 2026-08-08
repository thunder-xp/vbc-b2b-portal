-- Canonical estimate business lifecycle. Estimate edit/archive governance remains separate.

alter table public.estimates
  add column if not exists lifecycle_status text not null default 'draft',
  add column if not exists lifecycle_sent_at timestamptz null,
  add column if not exists lifecycle_expires_at timestamptz null,
  add column if not exists lifecycle_accepted_at timestamptz null,
  add column if not exists lifecycle_rejected_at timestamptz null,
  add column if not exists lifecycle_rejection_reason text null,
  add column if not exists lifecycle_converted_at timestamptz null,
  add column if not exists lifecycle_order_id uuid null references public.partner_orders(id) on delete restrict;

alter table public.estimates drop constraint if exists estimates_lifecycle_status_check;
alter table public.estimates add constraint estimates_lifecycle_status_check check (
  lifecycle_status in ('draft', 'sent', 'accepted', 'rejected', 'expired', 'converted_to_order')
);
alter table public.estimates drop constraint if exists estimates_lifecycle_rejection_reason_check;
alter table public.estimates add constraint estimates_lifecycle_rejection_reason_check check (
  lifecycle_rejection_reason is null or lifecycle_rejection_reason in (
    'price', 'no_budget', 'other_supplier', 'project_changed', 'postponed', 'other'
  )
);
alter table public.estimates drop constraint if exists estimates_lifecycle_order_check;
alter table public.estimates add constraint estimates_lifecycle_order_check check (
  (lifecycle_status = 'converted_to_order') = (lifecycle_order_id is not null)
);

alter table public.estimate_versions
  add column if not exists rejection_reason_code text null;
alter table public.estimate_versions drop constraint if exists estimate_versions_rejection_reason_code_check;
alter table public.estimate_versions add constraint estimate_versions_rejection_reason_code_check check (
  rejection_reason_code is null or rejection_reason_code in (
    'price', 'no_budget', 'other_supplier', 'project_changed', 'postponed', 'other'
  )
);

create table if not exists public.estimate_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete restrict,
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  actor_user_id uuid null references public.user_profiles(id) on delete restrict,
  from_status text null,
  to_status text not null,
  rejection_reason text null,
  source_version_id uuid null references public.estimate_versions(id) on delete restrict,
  order_id uuid null references public.partner_orders(id) on delete restrict,
  event_source text not null,
  occurred_at timestamptz not null default now(),
  safe_metadata jsonb not null default '{}'::jsonb,
  constraint estimate_lifecycle_events_from_check check (
    from_status is null or from_status in ('draft', 'sent', 'accepted', 'rejected', 'expired', 'converted_to_order')
  ),
  constraint estimate_lifecycle_events_to_check check (
    to_status in ('draft', 'sent', 'accepted', 'rejected', 'expired', 'converted_to_order')
  ),
  constraint estimate_lifecycle_events_reason_check check (
    rejection_reason is null or rejection_reason in ('price', 'no_budget', 'other_supplier', 'project_changed', 'postponed', 'other')
  ),
  constraint estimate_lifecycle_events_source_check check (
    event_source in ('estimate_creation', 'partner_action', 'email_delivery', 'customer_response', 'expiration_worker', 'order_confirmation', 'version_restore', 'migration_backfill')
  ),
  constraint estimate_lifecycle_events_metadata_check check (jsonb_typeof(safe_metadata) = 'object')
);

create index if not exists estimates_company_lifecycle_updated_idx
  on public.estimates(company_id, lifecycle_status, updated_at desc);
create index if not exists estimates_lifecycle_expiry_idx
  on public.estimates(lifecycle_expires_at, id)
  where lifecycle_status = 'sent';
create index if not exists estimate_lifecycle_events_estimate_occurred_idx
  on public.estimate_lifecycle_events(estimate_id, occurred_at, id);
create index if not exists estimate_lifecycle_events_company_status_idx
  on public.estimate_lifecycle_events(company_id, to_status, occurred_at desc);
create unique index if not exists estimate_lifecycle_events_version_status_unique
  on public.estimate_lifecycle_events(source_version_id, to_status)
  where source_version_id is not null and event_source <> 'migration_backfill';
create unique index if not exists estimate_lifecycle_events_order_estimate_unique
  on public.estimate_lifecycle_events(order_id, estimate_id)
  where order_id is not null;

alter table public.estimate_lifecycle_events enable row level security;
revoke all on table public.estimate_lifecycle_events from public, anon, authenticated;
grant select on table public.estimate_lifecycle_events to authenticated;

drop policy if exists "Company members view estimate lifecycle events" on public.estimate_lifecycle_events;
create policy "Company members view estimate lifecycle events"
on public.estimate_lifecycle_events for select to authenticated
using (public.can_access_estimates(company_id, 'estimates.view'));

create or replace function public.prevent_estimate_lifecycle_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Estimate lifecycle events are immutable.' using errcode = '42501';
end;
$$;

drop trigger if exists prevent_estimate_lifecycle_event_mutation on public.estimate_lifecycle_events;
create trigger prevent_estimate_lifecycle_event_mutation
before update or delete on public.estimate_lifecycle_events
for each row execute function public.prevent_estimate_lifecycle_event_mutation();

create or replace function public.record_estimate_lifecycle_creation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.estimate_lifecycle_events(
    estimate_id, company_id, actor_user_id, from_status, to_status, event_source, occurred_at
  ) values (new.id, new.company_id, auth.uid(), null, 'draft', 'estimate_creation', new.created_at);
  return null;
end;
$$;

drop trigger if exists record_estimate_lifecycle_creation on public.estimates;
create trigger record_estimate_lifecycle_creation
after insert on public.estimates
for each row execute function public.record_estimate_lifecycle_creation();

create or replace function public.apply_estimate_lifecycle_transition(
  target_estimate_id uuid,
  target_status text,
  target_actor uuid,
  target_event_source text,
  target_version_id uuid default null,
  target_order_id uuid default null,
  target_rejection_reason text default null,
  target_occurred_at timestamptz default now()
)
returns public.estimates
language plpgsql
security definer
set search_path = public
as $$
declare target public.estimates; previous_status text; normalized_reason text := nullif(btrim(target_rejection_reason), '');
begin
  select * into target from public.estimates where id = target_estimate_id for update;
  if target.id is null then raise exception 'Estimate is not available.' using errcode = 'P0002'; end if;
  previous_status := target.lifecycle_status;
  if target_status not in ('draft', 'sent', 'accepted', 'rejected', 'expired', 'converted_to_order')
     or target_event_source not in ('partner_action', 'email_delivery', 'customer_response', 'expiration_worker', 'order_confirmation', 'version_restore', 'migration_backfill')
     or (normalized_reason is not null and normalized_reason not in ('price', 'no_budget', 'other_supplier', 'project_changed', 'postponed', 'other')) then
    raise exception 'Estimate lifecycle transition is invalid.' using errcode = '22023';
  end if;
  if previous_status = target_status then return target; end if;
  if not (
    (previous_status = 'draft' and target_status = 'sent')
    or (previous_status = 'sent' and target_status in ('accepted', 'rejected', 'expired'))
    or (previous_status = 'accepted' and target_status = 'converted_to_order')
    or (previous_status in ('accepted', 'rejected', 'expired') and target_status = 'draft' and target_event_source = 'version_restore')
  ) then raise exception 'Estimate lifecycle transition is not allowed.' using errcode = '23514'; end if;
  if target_version_id is not null and not exists (
    select 1 from public.estimate_versions version where version.id = target_version_id
      and version.estimate_id = target.id and version.company_id = target.company_id
  ) then raise exception 'Estimate version is not available.' using errcode = '23514'; end if;
  if target_status = 'rejected' and normalized_reason is null then normalized_reason := 'other'; end if;
  if target_status = 'converted_to_order' and (
    target_order_id is null or not exists (
      select 1 from public.partner_orders partner_order where partner_order.id = target_order_id
        and partner_order.company_id = target.company_id and partner_order.status = 'submitted'
        and partner_order.integration_status = 'confirmed'
    )
  ) then raise exception 'Confirmed order is required.' using errcode = '23514'; end if;

  update public.estimates set
    lifecycle_status = target_status,
    lifecycle_sent_at = case when target_status = 'sent' then target_occurred_at when target_status = 'draft' then null else lifecycle_sent_at end,
    lifecycle_expires_at = case when target_status = 'sent' then target_occurred_at + make_interval(days => validity_days) when target_status = 'draft' then null else lifecycle_expires_at end,
    lifecycle_accepted_at = case when target_status = 'accepted' then target_occurred_at when target_status = 'draft' then null else lifecycle_accepted_at end,
    lifecycle_rejected_at = case when target_status = 'rejected' then target_occurred_at when target_status = 'draft' then null else lifecycle_rejected_at end,
    lifecycle_rejection_reason = case when target_status = 'rejected' then normalized_reason when target_status = 'draft' then null else lifecycle_rejection_reason end,
    lifecycle_converted_at = case when target_status = 'converted_to_order' then target_occurred_at when target_status = 'draft' then null else lifecycle_converted_at end,
    lifecycle_order_id = case when target_status = 'converted_to_order' then target_order_id when target_status = 'draft' then null else lifecycle_order_id end
  where id = target.id returning * into target;
  insert into public.estimate_lifecycle_events(
    estimate_id, company_id, actor_user_id, from_status, to_status, rejection_reason,
    source_version_id, order_id, event_source, occurred_at
  ) values (
    target.id, target.company_id, target_actor, previous_status, target_status, normalized_reason,
    target_version_id, target_order_id, target_event_source, target_occurred_at
  );
  return target;
end;
$$;

create or replace function public.transition_estimate_version_v2(
  target_version_id uuid,
  target_status text,
  target_channel text default null,
  target_note text default null,
  target_rejection_reason text default null
)
returns public.estimate_versions
language plpgsql
security definer
set search_path = public
as $$
declare current_version public.estimate_versions; source_name text;
begin
  select * into current_version from public.estimate_versions where id = target_version_id for update;
  if current_version.id is null or not public.can_access_estimates(current_version.company_id, 'estimates.manage') then
    raise exception 'Estimate version is not available.' using errcode = '42501';
  end if;
  if current_version.status = target_status then return current_version; end if;
  if not ((current_version.status = 'prepared' and target_status = 'sent')
      or (current_version.status = 'sent' and target_status in ('accepted', 'rejected'))) then
    raise exception 'Estimate version transition is not allowed.' using errcode = '23514';
  end if;
  if target_status = 'sent' and target_channel is not null and target_channel not in ('email', 'messenger', 'printed', 'other') then
    raise exception 'Delivery channel is invalid.' using errcode = '23514';
  end if;
  if target_status = 'sent' and not exists (
    select 1 from public.generated_estimate_documents document
    where document.version_id = current_version.id and document.status = 'ready'
  ) then raise exception 'Generate the version PDF before marking it sent.' using errcode = '23514'; end if;
  if target_status = 'rejected' and target_rejection_reason is not null
     and target_rejection_reason not in ('price', 'no_budget', 'other_supplier', 'project_changed', 'postponed', 'other') then
    raise exception 'Rejection reason is invalid.' using errcode = '22023';
  end if;

  update public.estimate_versions set
    status = target_status,
    sent_at = case when target_status = 'sent' then now() else sent_at end,
    sent_by = case when target_status = 'sent' then auth.uid() else sent_by end,
    sent_channel = case when target_status = 'sent' then target_channel else sent_channel end,
    recipient_note = case when target_status = 'sent' then nullif(btrim(target_note), '') else recipient_note end,
    accepted_at = case when target_status = 'accepted' then now() else accepted_at end,
    accepted_by = case when target_status = 'accepted' then auth.uid() else accepted_by end,
    acceptance_note = case when target_status = 'accepted' then nullif(btrim(target_note), '') else acceptance_note end,
    rejected_at = case when target_status = 'rejected' then now() else rejected_at end,
    rejected_by = case when target_status = 'rejected' then auth.uid() else rejected_by end,
    rejection_reason = case when target_status = 'rejected' then nullif(btrim(target_note), '') else rejection_reason end,
    rejection_reason_code = case when target_status = 'rejected' then coalesce(target_rejection_reason, 'other') else rejection_reason_code end
  where id = current_version.id returning * into current_version;

  if target_status = 'accepted' then
    update public.estimates set accepted_version_id = current_version.id, status = 'ready' where id = current_version.estimate_id;
  end if;
  source_name := case when target_status = 'sent' and target_channel = 'email' then 'email_delivery' else 'partner_action' end;
  perform public.apply_estimate_lifecycle_transition(
    current_version.estimate_id, target_status, auth.uid(), source_name,
    current_version.id, null, target_rejection_reason, now()
  );
  insert into public.estimate_events(estimate_id, actor_user_id, event_type)
  values (current_version.estimate_id, auth.uid(), case target_status when 'sent' then 'version_sent' when 'accepted' then 'version_accepted' else 'version_rejected' end);
  return current_version;
end;
$$;

-- Preserve the production RPC signature for existing deployments and email delivery.
create or replace function public.transition_estimate_version(
  target_version_id uuid,
  target_status text,
  target_channel text default null,
  target_note text default null
)
returns public.estimate_versions
language sql
security definer
set search_path = public
as $$
  select * from public.transition_estimate_version_v2(
    target_version_id, target_status, target_channel, target_note,
    case when target_status = 'rejected' then 'other' else null end
  );
$$;

create or replace function public.apply_estimate_version_final_response(
  target_version_id uuid,
  target_status text,
  target_note text,
  target_actor uuid
)
returns public.estimate_versions
language plpgsql
security definer
set search_path = public
as $$
declare current_version public.estimate_versions;
begin
  if target_status not in ('accepted', 'rejected') then raise exception 'Proposal response is invalid.' using errcode = '23514'; end if;
  select * into current_version from public.estimate_versions where id = target_version_id for update;
  if current_version.id is null then raise exception 'Proposal version is unavailable.' using errcode = 'P0002'; end if;
  if current_version.status = target_status then return current_version; end if;
  if current_version.status <> 'sent' then raise exception 'Proposal response conflicts with current state.' using errcode = '23514'; end if;
  update public.estimate_versions set
    status = target_status,
    accepted_at = case when target_status = 'accepted' then now() else accepted_at end,
    accepted_by = case when target_status = 'accepted' then target_actor else accepted_by end,
    acceptance_note = case when target_status = 'accepted' then nullif(btrim(target_note), '') else acceptance_note end,
    rejected_at = case when target_status = 'rejected' then now() else rejected_at end,
    rejected_by = case when target_status = 'rejected' then target_actor else rejected_by end,
    rejection_reason = case when target_status = 'rejected' then nullif(btrim(target_note), '') else rejection_reason end,
    rejection_reason_code = case when target_status = 'rejected' then 'other' else rejection_reason_code end
  where id = current_version.id returning * into current_version;
  if target_status = 'accepted' then
    update public.estimates set accepted_version_id = current_version.id, status = 'ready' where id = current_version.estimate_id;
  end if;
  perform public.apply_estimate_lifecycle_transition(
    current_version.estimate_id, target_status, target_actor, 'customer_response', current_version.id,
    null, case when target_status = 'rejected' then 'other' else null end, now()
  );
  insert into public.estimate_events(estimate_id, actor_user_id, event_type)
  values(current_version.estimate_id, target_actor, case target_status when 'accepted' then 'version_accepted' else 'version_rejected' end);
  return current_version;
end;
$$;

create or replace function public.sync_estimate_lifecycle_draft_restore()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'draft' and old.status is distinct from 'draft'
     and old.lifecycle_status in ('accepted', 'rejected', 'expired') then
    insert into public.estimate_lifecycle_events(
      estimate_id, company_id, actor_user_id, from_status, to_status, source_version_id, event_source, occurred_at
    ) values (old.id, old.company_id, auth.uid(), old.lifecycle_status, 'draft', new.source_version_id, 'version_restore', now());
    new.lifecycle_status := 'draft';
    new.lifecycle_sent_at := null; new.lifecycle_expires_at := null; new.lifecycle_accepted_at := null;
    new.lifecycle_rejected_at := null; new.lifecycle_rejection_reason := null;
    new.lifecycle_converted_at := null; new.lifecycle_order_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_estimate_lifecycle_draft_restore on public.estimates;
create trigger sync_estimate_lifecycle_draft_restore
before update of status on public.estimates
for each row execute function public.sync_estimate_lifecycle_draft_restore();

create or replace function public.sync_confirmed_order_estimate_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare linked record;
begin
  if new.status = 'submitted' and new.integration_status = 'confirmed'
     and (old.status is distinct from new.status or old.integration_status is distinct from new.integration_status) then
    for linked in
      select distinct estimate.id estimate_id, conversion.version_id
      from public.estimate_cart_conversions conversion
      join public.estimates estimate on estimate.id = conversion.estimate_id and estimate.company_id = new.company_id
      join public.estimate_versions version on version.id = conversion.version_id
        and version.estimate_id = estimate.id and version.status = 'accepted'
      where conversion.cart_id = new.cart_id and conversion.direction = 'estimate_to_cart'
        and estimate.lifecycle_status = 'accepted' and estimate.accepted_version_id = version.id
        and exists (
          select 1 from jsonb_array_elements(version.snapshot -> 'items') item
          where item ->> 'line_type' = 'product' and nullif(item ->> 'product_id', '') is not null
        )
        and not exists (
          select 1
          from (
            select (item ->> 'product_id')::uuid product_id, sum((item ->> 'quantity')::numeric) quantity
            from jsonb_array_elements(version.snapshot -> 'items') item
            where item ->> 'line_type' = 'product' and nullif(item ->> 'product_id', '') is not null
            group by (item ->> 'product_id')::uuid
          ) expected
          where not exists (
            select 1 from public.partner_order_items order_item
            where order_item.order_id = new.id and order_item.product_id = expected.product_id
              and order_item.quantity >= expected.quantity
          )
        )
    loop
      perform public.apply_estimate_lifecycle_transition(
        linked.estimate_id, 'converted_to_order', new.submitted_by, 'order_confirmation',
        linked.version_id, new.id, null, coalesce(new.confirmed_at, now())
      );
    end loop;
  end if;
  return null;
end;
$$;

drop trigger if exists sync_confirmed_order_estimate_lifecycle on public.partner_orders;
create trigger sync_confirmed_order_estimate_lifecycle
after update of status, integration_status on public.partner_orders
for each row execute function public.sync_confirmed_order_estimate_lifecycle();

create or replace function public.expire_estimate_lifecycles(target_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare candidate record; processed integer := 0;
begin
  if auth.role() <> 'service_role' then raise exception 'Lifecycle reconciliation is not available.' using errcode = '42501'; end if;
  if target_limit not between 1 and 500 then raise exception 'Lifecycle batch is invalid.' using errcode = '22023'; end if;
  for candidate in
    select id from public.estimates
    where lifecycle_status = 'sent' and lifecycle_expires_at <= now()
    order by lifecycle_expires_at, id
    limit target_limit for update skip locked
  loop
    perform public.apply_estimate_lifecycle_transition(candidate.id, 'expired', null, 'expiration_worker', null, null, null, now());
    processed := processed + 1;
  end loop;
  return jsonb_build_object('processed', processed, 'remaining', (
    select count(*) from public.estimates where lifecycle_status = 'sent' and lifecycle_expires_at <= now()
  ));
end;
$$;

-- Backfill only from authoritative immutable version/order evidence.
with latest_version as (
  select distinct on (version.estimate_id)
    version.estimate_id, version.id version_id, version.status, version.sent_at,
    version.accepted_at, version.rejected_at, version.rejection_reason_code
  from public.estimate_versions version
  order by version.estimate_id, version.version_number desc
), confirmed_conversion as (
  select distinct on (conversion.estimate_id)
    conversion.estimate_id, partner_order.id order_id, partner_order.confirmed_at
  from public.estimate_cart_conversions conversion
  join public.partner_orders partner_order on partner_order.cart_id = conversion.cart_id
    and partner_order.status = 'submitted' and partner_order.integration_status = 'confirmed'
  join public.estimate_versions version on version.id = conversion.version_id and version.status = 'accepted'
  join public.estimates estimate on estimate.id = conversion.estimate_id and estimate.accepted_version_id = version.id
  where conversion.direction = 'estimate_to_cart'
    and exists (
      select 1 from jsonb_array_elements(version.snapshot -> 'items') item
      where item ->> 'line_type' = 'product' and nullif(item ->> 'product_id', '') is not null
    )
    and not exists (
      select 1
      from (
        select (item ->> 'product_id')::uuid product_id, sum((item ->> 'quantity')::numeric) quantity
        from jsonb_array_elements(version.snapshot -> 'items') item
        where item ->> 'line_type' = 'product' and nullif(item ->> 'product_id', '') is not null
        group by (item ->> 'product_id')::uuid
      ) expected
      where not exists (
        select 1 from public.partner_order_items order_item
        where order_item.order_id = partner_order.id and order_item.product_id = expected.product_id
          and order_item.quantity >= expected.quantity
      )
    )
  order by conversion.estimate_id, partner_order.confirmed_at desc nulls last
)
update public.estimates estimate set
  lifecycle_status = case
    when conversion.order_id is not null then 'converted_to_order'
    when estimate.accepted_version_id is not null then 'accepted'
    when version.status = 'rejected' then 'rejected'
    when version.status = 'sent' and version.sent_at + make_interval(days => estimate.validity_days) <= now() then 'expired'
    when version.status = 'sent' then 'sent'
    else 'draft'
  end,
  lifecycle_sent_at = version.sent_at,
  lifecycle_expires_at = case when version.sent_at is not null then version.sent_at + make_interval(days => estimate.validity_days) end,
  lifecycle_accepted_at = version.accepted_at,
  lifecycle_rejected_at = version.rejected_at,
  lifecycle_rejection_reason = case when version.status = 'rejected' then coalesce(version.rejection_reason_code, 'other') end,
  lifecycle_converted_at = conversion.confirmed_at,
  lifecycle_order_id = conversion.order_id
from latest_version version
left join confirmed_conversion conversion on conversion.estimate_id = version.estimate_id
where version.estimate_id = estimate.id;

insert into public.estimate_lifecycle_events(
  estimate_id, company_id, actor_user_id, from_status, to_status, source_version_id, event_source, occurred_at
)
select estimate.id, estimate.company_id, estimate.created_by, null, 'draft', null, 'migration_backfill', estimate.created_at
from public.estimates estimate
where not exists (select 1 from public.estimate_lifecycle_events event where event.estimate_id = estimate.id and event.to_status = 'draft');

insert into public.estimate_lifecycle_events(
  estimate_id, company_id, actor_user_id, from_status, to_status, rejection_reason, source_version_id, event_source, occurred_at
)
select version.estimate_id, version.company_id, version.sent_by, null, 'sent', null, version.id, 'migration_backfill', version.sent_at
from public.estimate_versions version where version.sent_at is not null
union all
select version.estimate_id, version.company_id, version.accepted_by, null, 'accepted', null, version.id, 'migration_backfill', version.accepted_at
from public.estimate_versions version where version.accepted_at is not null
union all
select version.estimate_id, version.company_id, version.rejected_by, null, 'rejected', coalesce(version.rejection_reason_code, 'other'), version.id, 'migration_backfill', version.rejected_at
from public.estimate_versions version where version.rejected_at is not null;

create or replace function public.get_partner_final_customer_detail(
  target_company_id uuid,
  target_customer_id uuid,
  estimate_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare customer public.partner_final_customers; related_estimates jsonb; last_activity timestamptz;
begin
  if not public.can_access_estimates(target_company_id, 'estimates.view') then raise exception 'Final customer is not available.' using errcode = '42501'; end if;
  select * into customer from public.partner_final_customers where id = target_customer_id and company_id = target_company_id and archived_at is null;
  if customer.id is null then return null; end if;
  select coalesce(jsonb_agg(to_jsonb(estimate_row) order by estimate_row.updated_at desc), '[]'::jsonb), max(estimate_row.updated_at)
  into related_estimates, last_activity
  from (
    select estimate.id, estimate.estimate_number, estimate.name, estimate.project_name,
      estimate.lifecycle_status status, estimate.updated_at
    from public.estimates estimate
    where estimate.final_customer_id = customer.id and estimate.archived_at is null
    order by estimate.updated_at desc, estimate.id
    limit least(greatest(coalesce(estimate_limit, 50), 1), 100)
  ) estimate_row;
  return jsonb_build_object('customer', to_jsonb(customer), 'estimates', related_estimates, 'last_activity_at', last_activity);
end;
$$;

revoke all on function public.prevent_estimate_lifecycle_event_mutation() from public, anon, authenticated;
revoke all on function public.record_estimate_lifecycle_creation() from public, anon, authenticated;
revoke all on function public.apply_estimate_lifecycle_transition(uuid, text, uuid, text, uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.sync_estimate_lifecycle_draft_restore() from public, anon, authenticated;
revoke all on function public.sync_confirmed_order_estimate_lifecycle() from public, anon, authenticated;
revoke all on function public.expire_estimate_lifecycles(integer) from public, anon, authenticated;
revoke all on function public.transition_estimate_version_v2(uuid, text, text, text, text) from public, anon;
grant execute on function public.transition_estimate_version_v2(uuid, text, text, text, text) to authenticated;
grant execute on function public.expire_estimate_lifecycles(integer) to service_role;
