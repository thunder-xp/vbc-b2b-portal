begin;

alter table public.onboarding_application_revisions
  add column if not exists business_activity text null,
  add column if not exists estimated_purchasing_volume text null;

alter table public.access_requests
  add column if not exists clarification_reason_category text null,
  add column if not exists clarification_partner_message text null,
  add column if not exists clarification_fields text[] not null default '{}',
  add column if not exists clarification_response_deadline date null,
  add column if not exists clarification_internal_note text null,
  add column if not exists rejection_reason_category text null,
  add column if not exists rejection_partner_message text null,
  add column if not exists rejection_internal_note text null,
  add column if not exists reopened_count integer not null default 0;

alter table public.access_requests
  drop constraint if exists access_requests_clarification_reason_check;
alter table public.access_requests
  add constraint access_requests_clarification_reason_check check (
    clarification_reason_category is null or clarification_reason_category in (
      'company_data_incomplete', 'fiscal_code_needs_confirmation',
      'contact_details_incomplete', 'business_activity_unclear',
      'existing_company_conflict', '1c_company_not_found',
      'additional_documents_required', 'other'
    )
  );
alter table public.access_requests
  drop constraint if exists access_requests_rejection_reason_check;
alter table public.access_requests
  add constraint access_requests_rejection_reason_check check (
    rejection_reason_category is null or rejection_reason_category in (
      'duplicate_application', 'company_not_verified', 'invalid_information',
      'unsupported_business_type', 'existing_membership',
      'company_access_conflict', 'not_eligible', 'cancelled_by_applicant', 'other'
    )
  );
alter table public.access_requests
  drop constraint if exists access_requests_clarification_fields_check;
alter table public.access_requests
  add constraint access_requests_clarification_fields_check check (
    clarification_fields <@ array[
      'company_name', 'fiscal_code', 'contact_name', 'phone', 'email',
      'locality', 'business_type', 'business_activity',
      'estimated_purchasing_volume', 'comment'
    ]::text[]
  );

alter table public.onboarding_events
  drop constraint if exists onboarding_events_event_type_check;
alter table public.onboarding_events
  add constraint onboarding_events_event_type_check check (event_type in (
    'application_migrated', 'revision_created', 'assigned', 'reassigned', 'unassigned',
    'review_started', 'match_suggested', 'match_confirmed',
    'awaiting_1c_company', 'ready_for_approval', 'status_changed',
    'approval_failed', 'approval_draft_updated', 'onboarding_approved',
    'capability_granted', 'capability_revoked', 'clarification_requested',
    'partner_revision_submitted', 'rejected', 'cancelled', 'reopened',
    'sla_paused', 'sla_resumed'
  ));

create table if not exists public.onboarding_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  access_request_id uuid not null references public.access_requests(id) on delete restrict,
  recipient_user_id uuid not null references public.user_profiles(id) on delete restrict,
  audience text not null check (audience in ('partner', 'manager')),
  event_code text not null check (event_code in (
    'onboarding_application_received', 'onboarding_clarification_requested',
    'onboarding_application_updated', 'onboarding_ready_for_approval',
    'onboarding_approved', 'onboarding_rejected', 'onboarding_cancelled',
    'onboarding_reopened', 'onboarding_application_assigned',
    'onboarding_partner_updated', 'onboarding_sla_overdue',
    'onboarding_match_available', 'onboarding_approval_failed'
  )),
  title text not null check (char_length(title) between 1 and 180 and title !~ '[<>]'),
  message text not null check (char_length(message) between 1 and 600 and message !~ '[<>]'),
  action_url text not null check (action_url in ('/onboarding/waiting', '/admin/onboarding')),
  safe_payload jsonb not null default '{}'::jsonb check (
    jsonb_typeof(safe_payload) = 'object' and pg_column_size(safe_payload) <= 2048
  ),
  deduplication_key text not null unique,
  delivery_status text not null default 'pending' check (
    delivery_status in ('pending', 'delivered', 'failed', 'suppressed')
  ),
  created_at timestamptz not null default now(),
  delivered_at timestamptz null
);
create index if not exists onboarding_notification_outbox_recipient_idx
  on public.onboarding_notification_outbox(recipient_user_id, created_at desc);
alter table public.onboarding_notification_outbox enable row level security;
revoke all on table public.onboarding_notification_outbox from anon, authenticated;

create or replace function public.prevent_onboarding_notification_outbox_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.delivery_status = 'pending'
    and new.delivery_status in ('delivered', 'failed', 'suppressed')
    and new.id = old.id
    and new.access_request_id = old.access_request_id
    and new.recipient_user_id = old.recipient_user_id
    and new.event_code = old.event_code
    and new.audience = old.audience
    and new.title = old.title
    and new.message = old.message
    and new.action_url = old.action_url
    and new.safe_payload = old.safe_payload
    and new.created_at = old.created_at
    and new.deduplication_key = old.deduplication_key then
    return new;
  end if;
  raise exception 'Onboarding notification content is append-only.' using errcode = '42501';
end;
$$;
drop trigger if exists protect_onboarding_notification_outbox
  on public.onboarding_notification_outbox;
create trigger protect_onboarding_notification_outbox
before update or delete on public.onboarding_notification_outbox
for each row execute function public.prevent_onboarding_notification_outbox_mutation();

create or replace function public.onboarding_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    values
      ('received', 'under_review'),
      ('received', 'clarification_requested'),
      ('under_review', 'clarification_requested'),
      ('clarification_requested', 'under_review'),
      ('under_review', 'awaiting_1c_company'),
      ('under_review', 'link_confirmation_required'),
      ('under_review', 'ready_for_approval'),
      ('awaiting_1c_company', 'link_confirmation_required'),
      ('awaiting_1c_company', 'under_review'),
      ('link_confirmation_required', 'under_review'),
      ('link_confirmation_required', 'ready_for_approval'),
      ('ready_for_approval', 'under_review'),
      ('ready_for_approval', 'approved'),
      ('received', 'rejected'),
      ('under_review', 'rejected'),
      ('clarification_requested', 'rejected'),
      ('awaiting_1c_company', 'rejected'),
      ('link_confirmation_required', 'rejected'),
      ('ready_for_approval', 'rejected'),
      ('received', 'cancelled'),
      ('under_review', 'cancelled'),
      ('clarification_requested', 'cancelled'),
      ('awaiting_1c_company', 'cancelled'),
      ('link_confirmation_required', 'cancelled'),
      ('ready_for_approval', 'cancelled')
  );
$$;

create or replace function public.request_onboarding_clarification(
  p_request_id uuid,
  p_expected_revision integer,
  p_reason_category text,
  p_partner_message text,
  p_fields text[],
  p_response_deadline date default null,
  p_internal_note text default null,
  p_correlation_id uuid default gen_random_uuid()
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  request public.access_requests%rowtype;
  revision_number integer;
begin
  if not public.has_internal_permission('onboarding.requests.review') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_reason_category not in (
    'company_data_incomplete', 'fiscal_code_needs_confirmation',
    'contact_details_incomplete', 'business_activity_unclear',
    'existing_company_conflict', '1c_company_not_found',
    'additional_documents_required', 'other'
  ) then raise exception 'invalid_clarification_reason' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_partner_message, ''))) not between 10 and 1200 then
    raise exception 'partner_message_required' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_fields), 0) = 0 or not p_fields <@ array[
    'company_name', 'fiscal_code', 'contact_name', 'phone', 'email',
    'locality', 'business_type', 'business_activity',
    'estimated_purchasing_volume', 'comment'
  ]::text[] then raise exception 'invalid_clarification_fields' using errcode = '22023'; end if;
  if p_response_deadline is not null
    and p_response_deadline < (now() at time zone 'Europe/Chisinau')::date then
    raise exception 'invalid_response_deadline' using errcode = '22023';
  end if;
  if char_length(coalesce(p_internal_note, '')) > 2000 then
    raise exception 'internal_note_too_long' using errcode = '22023';
  end if;

  select * into request from public.access_requests where id = p_request_id for update;
  if request.id is null then raise exception 'request_not_found' using errcode = 'P0002'; end if;
  select revision_number into revision_number
  from public.onboarding_application_revisions where id = request.current_revision_id;
  if revision_number is distinct from p_expected_revision then
    raise exception 'stale_request_revision' using errcode = '40001';
  end if;
  if not public.onboarding_transition_allowed(request.onboarding_status, 'clarification_requested') then
    raise exception 'invalid_status_transition' using errcode = '22023';
  end if;
  if request.assigned_manager_user_id is distinct from actor_id
    and not public.has_internal_permission('onboarding.requests.assign') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  update public.access_requests set
    onboarding_status = 'clarification_requested',
    review_started_at = coalesce(review_started_at, now()),
    clarification_paused_at = now(),
    clarification_reason_category = p_reason_category,
    clarification_partner_message = btrim(p_partner_message),
    clarification_fields = array(select distinct value from unnest(p_fields) value order by value),
    clarification_response_deadline = p_response_deadline,
    clarification_internal_note = nullif(btrim(coalesce(p_internal_note, '')), ''),
    last_activity_at = now()
  where id = request.id;

  insert into public.onboarding_events(
    access_request_id, actor_user_id, event_type, previous_status, next_status,
    safe_metadata, correlation_id
  ) values (
    request.id, actor_id, 'clarification_requested', request.onboarding_status,
    'clarification_requested',
    jsonb_build_object(
      'reason', p_reason_category,
      'requested_fields', array(select distinct value from unnest(p_fields) value order by value),
      'partner_message_fingerprint', encode(digest(btrim(p_partner_message), 'sha256'), 'hex'),
      'revision_number', revision_number
    ), p_correlation_id
  );
  insert into public.onboarding_events(
    access_request_id, actor_user_id, event_type, previous_status, next_status,
    safe_metadata, correlation_id
  ) values (
    request.id, actor_id, 'sla_paused', request.onboarding_status,
    'clarification_requested', '{}'::jsonb, p_correlation_id
  );
  insert into public.onboarding_notification_outbox(
    access_request_id, recipient_user_id, audience, event_code, title, message,
    action_url, deduplication_key
  ) values (
    request.id, request.user_profile_id, 'partner',
    'onboarding_clarification_requested', 'Требуется уточнить заявку',
    'Novotech запросил уточнение данных партнёрской заявки.',
    '/onboarding/waiting',
    concat('onboarding:clarification:', request.id, ':', revision_number)
  ) on conflict (deduplication_key) do nothing;
end;
$$;

create or replace function public.submit_onboarding_partner_revision(
  p_expected_revision integer,
  p_company_name text,
  p_fiscal_code text,
  p_contact_name text,
  p_phone text,
  p_email text,
  p_locality text,
  p_business_type text,
  p_business_activity text,
  p_estimated_purchasing_volume text,
  p_comment text,
  p_correlation_id uuid default gen_random_uuid()
)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  request public.access_requests%rowtype;
  current_revision public.onboarding_application_revisions%rowtype;
  new_revision_id uuid;
  new_revision_number integer;
  fingerprint_value text;
begin
  if actor_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  select * into request
  from public.access_requests
  where user_profile_id = actor_id and onboarding_status = 'clarification_requested'
  order by created_at desc limit 1 for update;
  if request.id is null then raise exception 'clarification_request_not_found' using errcode = 'P0002'; end if;
  select * into current_revision
  from public.onboarding_application_revisions where id = request.current_revision_id;
  if current_revision.revision_number is distinct from p_expected_revision then
    raise exception 'stale_request_revision' using errcode = '40001';
  end if;
  if char_length(btrim(coalesce(p_company_name, ''))) not between 2 and 200
    or char_length(btrim(coalesce(p_contact_name, ''))) not between 2 and 160
    or char_length(btrim(coalesce(p_phone, ''))) not between 5 and 50
    or char_length(btrim(coalesce(p_email, ''))) not between 5 and 254 then
    raise exception 'invalid_partner_revision' using errcode = '22023';
  end if;
  if btrim(p_email) !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid_partner_email' using errcode = '22023';
  end if;
  if char_length(coalesce(p_fiscal_code, '')) > 64
    or char_length(coalesce(p_locality, '')) > 160
    or char_length(coalesce(p_business_type, '')) > 160
    or char_length(coalesce(p_business_activity, '')) > 1000
    or char_length(coalesce(p_estimated_purchasing_volume, '')) > 160
    or char_length(coalesce(p_comment, '')) > 2000 then
    raise exception 'invalid_partner_revision' using errcode = '22023';
  end if;

  new_revision_number := current_revision.revision_number + 1;
  fingerprint_value := encode(digest(concat_ws(chr(31),
    btrim(p_company_name), btrim(coalesce(p_fiscal_code, '')),
    btrim(p_contact_name), btrim(p_phone), lower(btrim(p_email)),
    btrim(coalesce(p_locality, '')), btrim(coalesce(p_business_type, '')),
    btrim(coalesce(p_business_activity, '')),
    btrim(coalesce(p_estimated_purchasing_volume, '')),
    btrim(coalesce(p_comment, ''))
  ), 'sha256'), 'hex');

  insert into public.onboarding_application_revisions(
    access_request_id, revision_number, requested_company_name,
    requested_fiscal_code, contact_name, contact_phone, contact_email,
    locality, business_type, business_activity, estimated_purchasing_volume,
    message, submitted_by, submitted_at, source, fingerprint
  ) values (
    request.id, new_revision_number, btrim(p_company_name),
    nullif(btrim(coalesce(p_fiscal_code, '')), ''), btrim(p_contact_name),
    btrim(p_phone), lower(btrim(p_email)), nullif(btrim(coalesce(p_locality, '')), ''),
    nullif(btrim(coalesce(p_business_type, '')), ''),
    nullif(btrim(coalesce(p_business_activity, '')), ''),
    nullif(btrim(coalesce(p_estimated_purchasing_volume, '')), ''),
    nullif(btrim(coalesce(p_comment, '')), ''), actor_id, now(),
    'partner_clarification', fingerprint_value
  ) returning id into new_revision_id;

  update public.access_requests set
    current_revision_id = new_revision_id,
    onboarding_status = 'under_review',
    status = 'pending_review',
    requested_company_name = btrim(p_company_name),
    requested_fiscal_code = nullif(btrim(coalesce(p_fiscal_code, '')), ''),
    contact_phone = btrim(p_phone),
    message = nullif(btrim(coalesce(p_comment, '')), ''),
    review_started_at = coalesce(review_started_at, now()),
    clarification_paused_seconds = clarification_paused_seconds + case
      when clarification_paused_at is not null
      then greatest(0, extract(epoch from (now() - clarification_paused_at))::integer)
      else 0 end,
    clarification_paused_at = null,
    last_activity_at = now()
  where id = request.id;

  update public.onboarding_approval_drafts set
    request_revision_number = new_revision_number,
    confirmed_counterparty_id = null,
    selected_price_profile_id = null,
    current_step = 1,
    version = version + 1,
    updated_by = actor_id,
    updated_at = now()
  where access_request_id = request.id;

  insert into public.onboarding_events(
    access_request_id, actor_user_id, event_type, previous_status, next_status,
    safe_metadata, correlation_id
  ) values (
    request.id, actor_id, 'partner_revision_submitted',
    'clarification_requested', 'under_review',
    jsonb_build_object('revision_number', new_revision_number, 'fingerprint', fingerprint_value),
    p_correlation_id
  );
  insert into public.onboarding_events(
    access_request_id, actor_user_id, event_type, previous_status, next_status,
    safe_metadata, correlation_id
  ) values (
    request.id, actor_id, 'sla_resumed', 'clarification_requested',
    'under_review', '{}'::jsonb, p_correlation_id
  );
  if request.assigned_manager_user_id is not null then
    insert into public.onboarding_notification_outbox(
      access_request_id, recipient_user_id, audience, event_code, title, message,
      action_url, deduplication_key
    ) values (
      request.id, request.assigned_manager_user_id, 'manager',
      'onboarding_partner_updated', 'Партнёр обновил заявку',
      'Партнёр отправил новую редакцию заявки для проверки.',
      '/admin/onboarding', concat('onboarding:partner-updated:', request.id, ':', new_revision_number)
    ) on conflict (deduplication_key) do nothing;
  end if;
  return new_revision_number;
end;
$$;

create or replace function public.reject_onboarding_request(
  p_request_id uuid,
  p_expected_revision integer,
  p_reason_category text,
  p_partner_message text,
  p_internal_note text default null,
  p_correlation_id uuid default gen_random_uuid()
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  request public.access_requests%rowtype;
  revision_number integer;
begin
  if not public.has_internal_permission('onboarding.requests.reject') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_reason_category not in (
    'duplicate_application', 'company_not_verified', 'invalid_information',
    'unsupported_business_type', 'existing_membership',
    'company_access_conflict', 'not_eligible', 'cancelled_by_applicant', 'other'
  ) then raise exception 'invalid_rejection_reason' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_partner_message, ''))) not between 10 and 1200
    or char_length(coalesce(p_internal_note, '')) > 2000 then
    raise exception 'invalid_rejection_message' using errcode = '22023';
  end if;
  select * into request from public.access_requests where id = p_request_id for update;
  if request.id is null then raise exception 'request_not_found' using errcode = 'P0002'; end if;
  select revision_number into revision_number
  from public.onboarding_application_revisions where id = request.current_revision_id;
  if revision_number is distinct from p_expected_revision then
    raise exception 'stale_request_revision' using errcode = '40001';
  end if;
  if not public.onboarding_transition_allowed(request.onboarding_status, 'rejected') then
    raise exception 'invalid_status_transition' using errcode = '22023';
  end if;
  if request.assigned_manager_user_id is distinct from actor_id
    and not public.has_internal_permission('onboarding.requests.assign') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  update public.access_requests set
    onboarding_status = 'rejected', status = 'rejected', reviewed_by = actor_id,
    reviewed_at = now(), decision_reason = btrim(p_partner_message),
    rejection_reason_category = p_reason_category,
    rejection_partner_message = btrim(p_partner_message),
    rejection_internal_note = nullif(btrim(coalesce(p_internal_note, '')), ''),
    clarification_paused_seconds = clarification_paused_seconds + case
      when onboarding_status = 'clarification_requested' and clarification_paused_at is not null
      then greatest(0, extract(epoch from (now() - clarification_paused_at))::integer)
      else 0 end,
    clarification_paused_at = null, last_activity_at = now()
  where id = request.id;
  insert into public.onboarding_events(
    access_request_id, actor_user_id, event_type, previous_status, next_status,
    safe_metadata, correlation_id
  ) values (
    request.id, actor_id, 'rejected', request.onboarding_status, 'rejected',
    jsonb_build_object(
      'reason', p_reason_category,
      'partner_message_fingerprint', encode(digest(btrim(p_partner_message), 'sha256'), 'hex'),
      'revision_number', revision_number
    ), p_correlation_id
  );
  insert into public.onboarding_notification_outbox(
    access_request_id, recipient_user_id, audience, event_code, title, message,
    action_url, deduplication_key
  ) values (
    request.id, request.user_profile_id, 'partner', 'onboarding_rejected',
    'Заявка рассмотрена', 'Заявка на партнёрский доступ отклонена.',
    '/onboarding/waiting', concat('onboarding:rejected:', request.id, ':', revision_number)
  ) on conflict (deduplication_key) do nothing;
end;
$$;

create or replace function public.cancel_own_onboarding_request(
  p_reason_category text default 'cancelled_by_applicant',
  p_correlation_id uuid default gen_random_uuid()
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  request public.access_requests%rowtype;
begin
  select * into request from public.access_requests
  where user_profile_id = actor_id
    and onboarding_status not in ('approved', 'rejected', 'cancelled')
  order by created_at desc limit 1 for update;
  if request.id is null then raise exception 'cancellable_request_not_found' using errcode = 'P0002'; end if;
  if not public.onboarding_transition_allowed(request.onboarding_status, 'cancelled') then
    raise exception 'invalid_status_transition' using errcode = '22023';
  end if;
  update public.access_requests set
    onboarding_status = 'cancelled', status = 'cancelled',
    clarification_paused_at = null, last_activity_at = now()
  where id = request.id;
  insert into public.onboarding_events(
    access_request_id, actor_user_id, event_type, previous_status, next_status,
    safe_metadata, correlation_id
  ) values (
    request.id, actor_id, 'cancelled', request.onboarding_status, 'cancelled',
    jsonb_build_object('reason', p_reason_category), p_correlation_id
  );
  if request.assigned_manager_user_id is not null then
    insert into public.onboarding_notification_outbox(
      access_request_id, recipient_user_id, audience, event_code, title, message,
      action_url, deduplication_key
    ) values (
      request.id, request.assigned_manager_user_id, 'manager',
      'onboarding_cancelled', 'Партнёр отменил заявку',
      'Партнёр отменил заявку на доступ.', '/admin/onboarding',
      concat('onboarding:cancelled:', request.id)
    ) on conflict (deduplication_key) do nothing;
  end if;
end;
$$;

create or replace function public.cancel_onboarding_request_internal(
  p_request_id uuid,
  p_reason_category text,
  p_internal_note text,
  p_correlation_id uuid default gen_random_uuid()
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  request public.access_requests%rowtype;
begin
  if not public.has_internal_permission('onboarding.requests.reject') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_reason_category not in ('cancelled_by_applicant', 'duplicate_application', 'other')
    or char_length(btrim(coalesce(p_internal_note, ''))) not between 3 and 2000 then
    raise exception 'invalid_cancellation_reason' using errcode = '22023';
  end if;
  select * into request from public.access_requests where id = p_request_id for update;
  if request.id is null or not public.onboarding_transition_allowed(request.onboarding_status, 'cancelled') then
    raise exception 'invalid_status_transition' using errcode = '22023';
  end if;
  update public.access_requests set
    onboarding_status = 'cancelled', status = 'cancelled',
    clarification_paused_at = null, last_activity_at = now()
  where id = request.id;
  insert into public.onboarding_events(
    access_request_id, actor_user_id, event_type, previous_status, next_status,
    safe_metadata, correlation_id
  ) values (
    request.id, actor_id, 'cancelled', request.onboarding_status, 'cancelled',
    jsonb_build_object('reason', p_reason_category), p_correlation_id
  );
  insert into public.onboarding_notification_outbox(
    access_request_id, recipient_user_id, audience, event_code, title, message,
    action_url, deduplication_key
  ) values (
    request.id, request.user_profile_id, 'partner', 'onboarding_cancelled',
    'Заявка отменена', 'Novotech прекратил обработку партнёрской заявки.',
    '/onboarding/waiting', concat('onboarding:internal-cancelled:', request.id)
  ) on conflict (deduplication_key) do nothing;
end;
$$;

create or replace function public.reopen_onboarding_request(
  p_request_id uuid,
  p_assignee_user_id uuid,
  p_reason text,
  p_correlation_id uuid default gen_random_uuid()
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  request public.access_requests%rowtype;
begin
  if not exists (
    select 1 from public.get_effective_internal_permissions() context
    where context.is_platform_admin
  ) then raise exception 'permission_denied' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'reopen_reason_required' using errcode = '22023';
  end if;
  if not public.is_onboarding_manager_eligible(p_assignee_user_id) then
    raise exception 'invalid_assignee' using errcode = '22023';
  end if;
  select * into request from public.access_requests where id = p_request_id for update;
  if request.id is null or request.onboarding_status not in ('rejected', 'cancelled') then
    raise exception 'invalid_status_transition' using errcode = '22023';
  end if;
  update public.access_requests set
    onboarding_status = 'under_review', status = 'pending_review',
    assigned_manager_user_id = p_assignee_user_id, assigned_at = now(),
    assigned_by = actor_id, review_started_at = now(),
    clarification_paused_at = null, clarification_paused_seconds = 0,
    reviewed_by = null, reviewed_at = null, decision_reason = null,
    reopened_count = reopened_count + 1, last_activity_at = now()
  where id = request.id;
  update public.onboarding_approval_drafts set
    current_step = 1, version = version + 1, updated_by = actor_id, updated_at = now()
  where access_request_id = request.id;
  insert into public.onboarding_events(
    access_request_id, actor_user_id, event_type, previous_status, next_status,
    safe_metadata, correlation_id
  ) values (
    request.id, actor_id, 'reopened', request.onboarding_status, 'under_review',
    jsonb_build_object('reason', btrim(p_reason), 'sla_cycle', request.reopened_count + 1),
    p_correlation_id
  );
  insert into public.onboarding_notification_outbox(
    access_request_id, recipient_user_id, audience, event_code, title, message,
    action_url, deduplication_key
  ) values (
    request.id, request.user_profile_id, 'partner', 'onboarding_reopened',
    'Заявка возвращена на проверку', 'Novotech возобновил рассмотрение партнёрской заявки.',
    '/onboarding/waiting', concat('onboarding:reopened:', request.id, ':', request.reopened_count + 1)
  ) on conflict (deduplication_key) do nothing;
end;
$$;

create or replace function public.assign_onboarding_request(
  p_request_id uuid,
  p_assignee_user_id uuid,
  p_correlation_id uuid default gen_random_uuid()
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  request public.access_requests%rowtype;
  event_name text;
begin
  if not public.has_internal_permission('onboarding.requests.assign') then
    raise exception 'Onboarding assignment is not allowed.' using errcode = '42501';
  end if;
  if not public.is_onboarding_manager_eligible(p_assignee_user_id) then
    raise exception 'Assignee is not an active onboarding manager.' using errcode = '22023';
  end if;
  select * into request from public.access_requests where id = p_request_id for update;
  if request.id is null then raise exception 'Onboarding request was not found.' using errcode = 'P0002'; end if;
  if request.onboarding_status in ('approved', 'rejected', 'cancelled') then
    raise exception 'Completed onboarding request cannot be assigned.' using errcode = '22023';
  end if;
  if request.assigned_manager_user_id = p_assignee_user_id then return; end if;
  event_name := case when request.assigned_manager_user_id is null then 'assigned' else 'reassigned' end;
  update public.access_requests set
    assigned_manager_user_id = p_assignee_user_id, assigned_at = now(),
    assigned_by = actor_id, last_activity_at = now()
  where id = request.id;
  insert into public.onboarding_events(
    access_request_id, actor_user_id, event_type, previous_status, next_status,
    safe_metadata, correlation_id
  ) values (
    request.id, actor_id, event_name, request.onboarding_status, request.onboarding_status,
    jsonb_build_object('assignment', event_name), p_correlation_id
  );
  insert into public.onboarding_notification_outbox(
    access_request_id, recipient_user_id, audience, event_code, title, message,
    action_url, deduplication_key
  ) values (
    request.id, p_assignee_user_id, 'manager', 'onboarding_application_assigned',
    'Назначена заявка партнёра', 'Вам назначена заявка партнёра для проверки.',
    '/admin/onboarding', concat('onboarding:assigned:', request.id, ':', p_assignee_user_id, ':', extract(epoch from now())::bigint)
  );
end;
$$;

create or replace function public.get_onboarding_request_detail_v3(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  base jsonb;
  workflow jsonb;
  revision_extra jsonb;
begin
  base := public.get_onboarding_request_detail_v2(p_request_id);
  if base is null then return null; end if;
  select jsonb_build_object(
    'clarification', case when request.clarification_reason_category is null then null else jsonb_build_object(
      'reasonCategory', request.clarification_reason_category,
      'partnerMessage', request.clarification_partner_message,
      'fields', request.clarification_fields,
      'responseDeadline', request.clarification_response_deadline,
      'internalNote', request.clarification_internal_note,
      'requestedAt', request.clarification_paused_at,
      'responseOverdue', request.onboarding_status = 'clarification_requested'
        and request.clarification_response_deadline is not null
        and request.clarification_response_deadline < (now() at time zone 'Europe/Chisinau')::date
    ) end,
    'rejection', case when request.rejection_reason_category is null then null else jsonb_build_object(
      'reasonCategory', request.rejection_reason_category,
      'partnerMessage', request.rejection_partner_message,
      'internalNote', request.rejection_internal_note
    ) end,
    'assignedManagerId', request.assigned_manager_user_id,
    'assignmentAgeSeconds', case when request.assigned_at is null then null
      else greatest(0, extract(epoch from now() - request.assigned_at)::integer) end,
    'revisionCount', (select count(*) from public.onboarding_application_revisions revision where revision.access_request_id = request.id),
    'reopenedCount', request.reopened_count,
    'managerWorkload', case when request.assigned_manager_user_id is null then 0 else (
      select count(*) from public.access_requests workload
      where workload.assigned_manager_user_id = request.assigned_manager_user_id
        and workload.onboarding_status not in ('approved', 'rejected', 'cancelled')
    ) end,
    'isPlatformAdmin', exists (
      select 1 from public.get_effective_internal_permissions() context where context.is_platform_admin
    )
  ), jsonb_build_object(
    'locality', revision.locality,
    'businessType', revision.business_type,
    'businessActivity', revision.business_activity,
    'estimatedPurchasingVolume', revision.estimated_purchasing_volume
  ) into workflow, revision_extra
  from public.access_requests request
  join public.onboarding_application_revisions revision on revision.id = request.current_revision_id
  where request.id = p_request_id;
  return jsonb_set(base, '{revision}', (base->'revision') || revision_extra)
    || jsonb_build_object('workflow', workflow);
end;
$$;

create or replace function public.get_onboarding_queue_v2(
  p_page integer default 1,
  p_page_size integer default 25,
  p_status text default null,
  p_assigned_manager uuid default null,
  p_unassigned boolean default false,
  p_sla text default null,
  p_match_state text default null,
  p_search text default null,
  p_locality text default null,
  p_business_type text default null,
  p_submitted_from date default null,
  p_submitted_to date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  base jsonb;
  enriched_rows jsonb;
  enriched_managers jsonb;
begin
  base := public.get_onboarding_queue(
    p_page, p_page_size, p_status, p_assigned_manager, p_unassigned,
    p_sla, p_match_state, p_search, p_locality, p_business_type,
    p_submitted_from, p_submitted_to
  );
  select coalesce(jsonb_agg(row.value || jsonb_build_object(
    'revision_count', (select count(*) from public.onboarding_application_revisions revision where revision.access_request_id = request.id),
    'assignment_age_seconds', case when request.assigned_at is null then null else greatest(0, extract(epoch from now() - request.assigned_at)::integer) end,
    'clarification_age_seconds', case when request.clarification_paused_at is null then null else greatest(0, extract(epoch from now() - request.clarification_paused_at)::integer) end,
    'partner_response_overdue', request.onboarding_status = 'clarification_requested'
      and request.clarification_response_deadline is not null
      and request.clarification_response_deadline < (now() at time zone 'Europe/Chisinau')::date,
    'sla_paused', request.onboarding_status = 'clarification_requested'
  ) order by row.ordinality), '[]'::jsonb) into enriched_rows
  from jsonb_array_elements(base->'rows') with ordinality row(value, ordinality)
  join public.access_requests request on request.id = (row.value->>'id')::uuid;
  select coalesce(jsonb_agg(manager.value || jsonb_build_object(
    'workloadCount', (select count(*) from public.access_requests request
      where request.assigned_manager_user_id = (manager.value->>'id')::uuid
        and request.onboarding_status not in ('approved', 'rejected', 'cancelled'))
  ) order by manager.ordinality), '[]'::jsonb) into enriched_managers
  from jsonb_array_elements(base->'managers') with ordinality manager(value, ordinality);
  return jsonb_set(jsonb_set(base, '{rows}', enriched_rows), '{managers}', enriched_managers);
end;
$$;

create or replace function public.get_own_onboarding_status_center()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  result jsonb;
begin
  if actor_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  select jsonb_build_object(
    'status', request.onboarding_status,
    'companyName', revision.requested_company_name,
    'revisionNumber', revision.revision_number,
    'revisionSubmittedAt', revision.submitted_at,
    'currentValues', jsonb_build_object(
      'companyName', revision.requested_company_name,
      'fiscalCode', revision.requested_fiscal_code,
      'contactName', revision.contact_name,
      'phone', revision.contact_phone,
      'email', revision.contact_email,
      'locality', revision.locality,
      'businessType', revision.business_type,
      'businessActivity', revision.business_activity,
      'estimatedPurchasingVolume', revision.estimated_purchasing_volume,
      'comment', revision.message
    ),
    'partnerMessage', case
      when request.onboarding_status = 'clarification_requested' then request.clarification_partner_message
      when request.onboarding_status = 'rejected' then request.rejection_partner_message
      else null end,
    'requestedFields', case when request.onboarding_status = 'clarification_requested'
      then request.clarification_fields else '{}'::text[] end,
    'responseDeadline', case when request.onboarding_status = 'clarification_requested'
      then request.clarification_response_deadline else null end,
    'canUpdate', request.onboarding_status = 'clarification_requested',
    'canCancel', request.onboarding_status not in ('approved', 'rejected', 'cancelled'),
    'hasActiveMembership', exists (
      select 1 from public.company_memberships membership
      where membership.user_id = actor_id and membership.status = 'active'
    ),
    'timeline', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event', event.event_type,
        'status', event.next_status,
        'occurredAt', event.occurred_at
      ) order by event.occurred_at desc)
      from public.onboarding_events event
      where event.access_request_id = request.id
        and event.event_type in (
          'revision_created', 'review_started', 'clarification_requested',
          'partner_revision_submitted', 'ready_for_approval',
          'onboarding_approved', 'rejected', 'cancelled', 'reopened'
        )
    ), '[]'::jsonb)
  ) into result
  from public.access_requests request
  join public.onboarding_application_revisions revision on revision.id = request.current_revision_id
  where request.user_profile_id = actor_id
  order by request.created_at desc limit 1;
  return result;
end;
$$;

create or replace function public.get_internal_onboarding_capability_states(p_user_ids uuid[])
returns table(user_id uuid, enabled boolean)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.has_internal_permission('admin.users.view') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  return query
  select requested_id,
    exists (
      select 1
      from public.permissions permission
      where permission.code like 'onboarding.%'
        and not exists (
          select 1 from public.internal_user_capability_assignments assignment
          where assignment.user_id = requested_id
            and assignment.permission_id = permission.id
            and assignment.revoked_at is null
        )
    ) = false
  from unnest(coalesce(p_user_ids, '{}'::uuid[])) requested_id;
end;
$$;

revoke all on function public.request_onboarding_clarification(uuid, integer, text, text, text[], date, text, uuid) from public, anon;
revoke all on function public.submit_onboarding_partner_revision(integer, text, text, text, text, text, text, text, text, text, text, uuid) from public, anon;
revoke all on function public.reject_onboarding_request(uuid, integer, text, text, text, uuid) from public, anon;
revoke all on function public.cancel_own_onboarding_request(text, uuid) from public, anon;
revoke all on function public.cancel_onboarding_request_internal(uuid, text, text, uuid) from public, anon;
revoke all on function public.reopen_onboarding_request(uuid, uuid, text, uuid) from public, anon;
revoke all on function public.get_onboarding_request_detail_v3(uuid) from public, anon;
revoke all on function public.get_onboarding_queue_v2(integer, integer, text, uuid, boolean, text, text, text, text, text, date, date) from public, anon;
revoke all on function public.get_own_onboarding_status_center() from public, anon;
revoke all on function public.get_internal_onboarding_capability_states(uuid[]) from public, anon;

grant execute on function public.request_onboarding_clarification(uuid, integer, text, text, text[], date, text, uuid) to authenticated;
grant execute on function public.submit_onboarding_partner_revision(integer, text, text, text, text, text, text, text, text, text, text, uuid) to authenticated;
grant execute on function public.reject_onboarding_request(uuid, integer, text, text, text, uuid) to authenticated;
grant execute on function public.cancel_own_onboarding_request(text, uuid) to authenticated;
grant execute on function public.cancel_onboarding_request_internal(uuid, text, text, uuid) to authenticated;
grant execute on function public.reopen_onboarding_request(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.get_onboarding_request_detail_v3(uuid) to authenticated;
grant execute on function public.get_onboarding_queue_v2(integer, integer, text, uuid, boolean, text, text, text, text, text, date, date) to authenticated;
grant execute on function public.get_own_onboarding_status_center() to authenticated;
grant execute on function public.get_internal_onboarding_capability_states(uuid[]) to authenticated;

comment on function public.get_own_onboarding_status_center() is
  'One-query, ownership-scoped onboarding status projection. Internal notes and technical identifiers are excluded.';
comment on function public.submit_onboarding_partner_revision(integer, text, text, text, text, text, text, text, text, text, text, uuid) is
  'Creates an immutable partner clarification revision and resumes review without allowing technical-field mutation.';

commit;
