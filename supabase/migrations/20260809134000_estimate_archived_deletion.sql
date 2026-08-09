-- Governed tombstone deletion for archived estimates. Immutable proposal and lifecycle history is retained.

alter table public.estimates
  add column if not exists deleted_at timestamptz null,
  add column if not exists deleted_by uuid null references public.user_profiles(id) on delete restrict,
  add column if not exists deletion_reason text null;

alter table public.estimates drop constraint if exists estimates_deletion_state_check;
alter table public.estimates add constraint estimates_deletion_state_check check (
  (deleted_at is null and deleted_by is null and deletion_reason is null)
  or (deleted_at is not null and deleted_by is not null and char_length(deletion_reason) between 10 and 500)
);

create index if not exists estimates_company_status_updated_not_deleted_idx
  on public.estimates(company_id, status, updated_at desc)
  where deleted_at is null;

create table public.estimate_deletion_events (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete restrict,
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  actor_user_id uuid not null references public.user_profiles(id) on delete restrict,
  request_key uuid not null,
  estimate_revision integer not null,
  reason text not null,
  occurred_at timestamptz not null default now(),
  constraint estimate_deletion_events_revision_check check (estimate_revision > 0),
  constraint estimate_deletion_events_reason_check check (char_length(reason) between 10 and 500),
  constraint estimate_deletion_events_request_unique unique(company_id, request_key),
  constraint estimate_deletion_events_estimate_unique unique(estimate_id)
);

create index estimate_deletion_events_company_occurred_idx
  on public.estimate_deletion_events(company_id, occurred_at desc);

alter table public.estimate_deletion_events enable row level security;
revoke all on table public.estimate_deletion_events from public, anon, authenticated;

create or replace function public.prevent_estimate_deletion_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Estimate deletion events are immutable.' using errcode = '42501';
end;
$$;

revoke all on function public.prevent_estimate_deletion_event_mutation() from public, anon, authenticated;

create trigger prevent_estimate_deletion_event_mutation
before update or delete on public.estimate_deletion_events
for each row execute function public.prevent_estimate_deletion_event_mutation();

create or replace function public.delete_archived_estimate(
  target_estimate_id uuid,
  expected_revision integer,
  target_request_key uuid,
  target_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.estimates;
  existing_event public.estimate_deletion_events;
  created_event public.estimate_deletion_events;
  normalized_reason text := nullif(btrim(target_reason), '');
begin
  select * into existing_event
  from public.estimate_deletion_events
  where request_key = target_request_key and actor_user_id = auth.uid();
  if existing_event.id is not null then
    if existing_event.estimate_id <> target_estimate_id then
      raise exception 'Estimate deletion request was already used.' using errcode = '23505';
    end if;
    return jsonb_build_object('estimateId', existing_event.estimate_id, 'eventId', existing_event.id, 'deletedAt', existing_event.occurred_at);
  end if;

  if target_request_key is null or normalized_reason is null or char_length(normalized_reason) not between 10 and 500 then
    raise exception 'Estimate deletion request is invalid.' using errcode = '22023';
  end if;

  select * into target from public.estimates where id = target_estimate_id for update;
  if target.id is null or target.deleted_at is not null
     or not public.can_access_estimates(target.company_id, 'estimates.manage') then
    raise exception 'Archived estimate is not available.' using errcode = 'P0002';
  end if;
  if target.status <> 'archived' or target.archived_at is null then
    raise exception 'Only archived estimates can be deleted.' using errcode = '22023';
  end if;
  if target.revision <> expected_revision then
    raise exception 'Estimate changed before deletion.' using errcode = '40001';
  end if;
  if target.lifecycle_status <> 'draft' or target.lifecycle_order_id is not null or target.accepted_version_id is not null then
    raise exception 'Estimate has protected commercial or order history.' using errcode = '23514';
  end if;
  if exists (select 1 from public.estimate_cart_conversions conversion where conversion.estimate_id = target.id)
     or exists (select 1 from public.estimate_proposal_deliveries delivery where delivery.estimate_id = target.id)
     or exists (select 1 from public.estimate_versions version where version.estimate_id = target.id and version.status <> 'prepared')
     or exists (select 1 from public.estimate_lifecycle_events event where event.estimate_id = target.id and event.to_status <> 'draft') then
    raise exception 'Estimate has protected commercial or order history.' using errcode = '23514';
  end if;

  update public.estimates set
    deleted_at = statement_timestamp(),
    deleted_by = auth.uid(),
    deletion_reason = normalized_reason
  where id = target.id;

  insert into public.estimate_deletion_events(
    estimate_id, company_id, actor_user_id, request_key, estimate_revision, reason
  ) values (
    target.id, target.company_id, auth.uid(), target_request_key, target.revision, normalized_reason
  ) returning * into created_event;

  return jsonb_build_object('estimateId', target.id, 'eventId', created_event.id, 'deletedAt', created_event.occurred_at);
end;
$$;

revoke all on function public.delete_archived_estimate(uuid, integer, uuid, text) from public, anon;
grant execute on function public.delete_archived_estimate(uuid, integer, uuid, text) to authenticated;

drop policy if exists "Company members can view estimates" on public.estimates;
create policy "Company members can view estimates" on public.estimates for select to authenticated
using (deleted_at is null and public.can_access_estimates(company_id, 'estimates.view'));

drop policy if exists "Company members can view estimate sections" on public.estimate_sections;
create policy "Company members can view estimate sections" on public.estimate_sections for select to authenticated
using (exists (select 1 from public.estimates estimate where estimate.id = estimate_sections.estimate_id and estimate.deleted_at is null and public.can_access_estimates(estimate.company_id, 'estimates.view')));

drop policy if exists "Company members can view estimate items" on public.estimate_items;
create policy "Company members can view estimate items" on public.estimate_items for select to authenticated
using (exists (select 1 from public.estimates estimate where estimate.id = estimate_items.estimate_id and estimate.deleted_at is null and public.can_access_estimates(estimate.company_id, 'estimates.view')));

drop policy if exists "Company members can view estimate charges" on public.estimate_charges;
create policy "Company members can view estimate charges" on public.estimate_charges for select to authenticated
using (exists (select 1 from public.estimates estimate where estimate.id = estimate_charges.estimate_id and estimate.deleted_at is null and public.can_access_estimates(estimate.company_id, 'estimates.view')));

drop policy if exists "Company members can view estimate events" on public.estimate_events;
create policy "Company members can view estimate events" on public.estimate_events for select to authenticated
using (exists (select 1 from public.estimates estimate where estimate.id = estimate_events.estimate_id and estimate.deleted_at is null and public.can_access_estimates(estimate.company_id, 'estimates.view')));

drop policy if exists "Company members view estimate versions" on public.estimate_versions;
create policy "Company members view estimate versions" on public.estimate_versions for select to authenticated
using (exists (select 1 from public.estimates estimate where estimate.id = estimate_versions.estimate_id and estimate.deleted_at is null and public.can_access_estimates(estimate.company_id, 'estimates.view')));

drop policy if exists "Company members view estimate conversions" on public.estimate_cart_conversions;
create policy "Company members view estimate conversions" on public.estimate_cart_conversions for select to authenticated
using (exists (select 1 from public.estimates estimate where estimate.id = estimate_cart_conversions.estimate_id and estimate.deleted_at is null and public.can_access_estimates(estimate.company_id, 'estimates.view')));

drop policy if exists "Company members view generated estimate documents" on public.generated_estimate_documents;
create policy "Company members view generated estimate documents" on public.generated_estimate_documents for select to authenticated
using (exists (select 1 from public.estimates estimate where estimate.id = generated_estimate_documents.estimate_id and estimate.deleted_at is null and public.can_access_estimates(estimate.company_id, 'estimates.view')));

drop policy if exists "Company members view proposal deliveries" on public.estimate_proposal_deliveries;
create policy "Company members view proposal deliveries" on public.estimate_proposal_deliveries for select to authenticated
using (exists (select 1 from public.estimates estimate where estimate.id = estimate_proposal_deliveries.estimate_id and estimate.deleted_at is null and public.can_access_estimates(estimate.company_id, 'estimates.view')));

drop policy if exists "Company members view estimate lifecycle events" on public.estimate_lifecycle_events;
create policy "Company members view estimate lifecycle events" on public.estimate_lifecycle_events for select to authenticated
using (exists (select 1 from public.estimates estimate where estimate.id = estimate_lifecycle_events.estimate_id and estimate.deleted_at is null and public.can_access_estimates(estimate.company_id, 'estimates.view')));

comment on column public.estimates.deleted_at is 'Governed partner-facing tombstone. Immutable proposal, lifecycle, and audit records remain retained.';
comment on table public.estimate_deletion_events is 'Append-only audit of governed archived-estimate tombstones.';
