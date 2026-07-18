-- Token-scoped proposal delivery and customer response foundation.
-- Raw tokens, editable estimates, internal commercial data, and provider credentials never enter these tables.

insert into public.permissions(code, description)
values ('proposal.send', 'Send immutable proposal versions to customers.')
on conflict (code) do update set description = excluded.description;

with seed(role_code) as (
  values ('partner_owner'), ('partner_manager'), ('partner_buyer'), ('novotech_admin'), ('novotech_sales')
)
insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from seed
join public.roles role on role.code = seed.role_code
join public.permissions permission on permission.code = 'proposal.send'
on conflict (role_id, permission_id) do nothing;

create table if not exists public.estimate_proposal_deliveries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  estimate_id uuid not null references public.estimates(id) on delete restrict,
  version_id uuid not null references public.estimate_versions(id) on delete restrict,
  generated_document_id uuid not null references public.generated_estimate_documents(id) on delete restrict,
  recipient_email text not null,
  recipient_name text null,
  email_subject text not null,
  message_body text null,
  locale text not null default 'ru',
  delivery_channel text not null default 'email',
  status text not null default 'queued',
  idempotency_key uuid not null,
  token_hash text not null,
  token_expires_at timestamptz not null,
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  sent_at timestamptz null,
  failed_at timestamptz null,
  safe_error text null,
  provider_message_id text null,
  revoked_at timestamptz null,
  revoked_by uuid null references public.user_profiles(id) on delete restrict,
  first_opened_at timestamptz null,
  last_opened_at timestamptz null,
  open_count integer not null default 0,
  responded_at timestamptz null,
  response text null,
  response_name text null,
  response_note text null,
  constraint estimate_proposal_deliveries_status_check check (status in ('queued', 'sending', 'sent', 'delivered', 'failed', 'revoked', 'responded')),
  constraint estimate_proposal_deliveries_channel_check check (delivery_channel = 'email'),
  constraint estimate_proposal_deliveries_locale_check check (locale in ('ru', 'ro')),
  constraint estimate_proposal_deliveries_email_check check (recipient_email = lower(recipient_email) and char_length(recipient_email) between 3 and 254 and recipient_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  constraint estimate_proposal_deliveries_name_check check (recipient_name is null or char_length(recipient_name) <= 160),
  constraint estimate_proposal_deliveries_subject_check check (char_length(email_subject) between 1 and 200 and email_subject !~ E'[\r\n]'),
  constraint estimate_proposal_deliveries_body_check check (message_body is null or char_length(message_body) <= 4000),
  constraint estimate_proposal_deliveries_token_check check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint estimate_proposal_deliveries_expiration_check check (token_expires_at > created_at),
  constraint estimate_proposal_deliveries_open_count_check check (open_count between 0 and 1000),
  constraint estimate_proposal_deliveries_response_check check (response is null or response in ('accepted', 'rejected')),
  constraint estimate_proposal_deliveries_response_name_check check (response_name is null or char_length(response_name) <= 160),
  constraint estimate_proposal_deliveries_response_note_check check (response_note is null or char_length(response_note) <= 2000),
  constraint estimate_proposal_deliveries_safe_error_check check (safe_error is null or char_length(safe_error) <= 500),
  constraint estimate_proposal_deliveries_token_unique unique(token_hash),
  constraint estimate_proposal_deliveries_idempotency_unique unique(company_id, idempotency_key)
);

create table if not exists public.estimate_proposal_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.estimate_proposal_deliveries(id) on delete restrict,
  attempt_number integer not null,
  status text not null default 'sending',
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  provider_result_category text null,
  safe_error text null,
  constraint estimate_proposal_delivery_attempts_number_check check (attempt_number > 0),
  constraint estimate_proposal_delivery_attempts_status_check check (status in ('sending', 'sent', 'failed')),
  constraint estimate_proposal_delivery_attempts_category_check check (provider_result_category is null or char_length(provider_result_category) <= 100),
  constraint estimate_proposal_delivery_attempts_error_check check (safe_error is null or char_length(safe_error) <= 500),
  constraint estimate_proposal_delivery_attempts_unique unique(delivery_id, attempt_number)
);

create index if not exists estimate_proposal_deliveries_version_created_idx
  on public.estimate_proposal_deliveries(version_id, created_at desc);
create index if not exists estimate_proposal_deliveries_company_status_idx
  on public.estimate_proposal_deliveries(company_id, status, created_at desc);
create index if not exists estimate_proposal_deliveries_expiration_idx
  on public.estimate_proposal_deliveries(token_expires_at) where revoked_at is null and responded_at is null;
create index if not exists estimate_proposal_delivery_attempts_delivery_idx
  on public.estimate_proposal_delivery_attempts(delivery_id, attempt_number desc);

alter table public.estimate_proposal_deliveries enable row level security;
alter table public.estimate_proposal_delivery_attempts enable row level security;
revoke all on table public.estimate_proposal_deliveries, public.estimate_proposal_delivery_attempts from public, anon, authenticated;
grant select on table public.estimate_proposal_deliveries to authenticated;

create policy "Company members view proposal deliveries"
on public.estimate_proposal_deliveries for select to authenticated
using (public.can_access_estimates(company_id, 'estimates.view'));

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
declare current_version public.estimate_versions; event_name text;
begin
  if target_status not in ('accepted', 'rejected') then
    raise exception 'Proposal response is invalid.' using errcode = '23514';
  end if;
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
    rejection_reason = case when target_status = 'rejected' then nullif(btrim(target_note), '') else rejection_reason end
  where id = current_version.id returning * into current_version;
  if target_status = 'accepted' then
    update public.estimates set accepted_version_id = current_version.id, status = 'ready'
    where id = current_version.estimate_id;
  end if;
  event_name := case target_status when 'accepted' then 'version_accepted' else 'version_rejected' end;
  insert into public.estimate_events(estimate_id, actor_user_id, event_type)
  values(current_version.estimate_id, target_actor, event_name);
  return current_version;
end;
$$;

revoke all on function public.apply_estimate_version_final_response(uuid, text, text, uuid) from public, anon, authenticated;

create or replace function public.transition_estimate_version(
  target_version_id uuid,
  target_status text,
  target_channel text default null,
  target_note text default null
)
returns public.estimate_versions
language plpgsql
security definer
set search_path = public
as $$
declare current_version public.estimate_versions;
begin
  select * into current_version from public.estimate_versions where id = target_version_id for update;
  if current_version.id is null or not public.can_access_estimates(current_version.company_id, 'estimates.manage') then
    raise exception 'Estimate version is not available.' using errcode = '42501';
  end if;
  if target_status in ('accepted', 'rejected') then
    return public.apply_estimate_version_final_response(target_version_id, target_status, target_note, auth.uid());
  end if;
  if current_version.status = target_status then return current_version; end if;
  if current_version.status <> 'prepared' or target_status <> 'sent' then
    raise exception 'Estimate version transition is not allowed.' using errcode = '23514';
  end if;
  if target_channel is not null and target_channel not in ('email', 'messenger', 'printed', 'other') then
    raise exception 'Delivery channel is invalid.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.generated_estimate_documents d where d.version_id = current_version.id and d.status = 'ready') then
    raise exception 'Generate the version PDF before marking it sent.' using errcode = '23514';
  end if;
  update public.estimate_versions set status = 'sent', sent_at = now(), sent_by = auth.uid(),
    sent_channel = target_channel, recipient_note = nullif(btrim(target_note), '')
  where id = current_version.id returning * into current_version;
  insert into public.estimate_events(estimate_id, actor_user_id, event_type)
  values(current_version.estimate_id, auth.uid(), 'version_sent');
  return current_version;
end;
$$;

create or replace function public.claim_proposal_delivery(
  target_version_id uuid,
  target_document_id uuid,
  target_recipient_email text,
  target_recipient_name text,
  target_subject text,
  target_message text,
  target_locale text,
  target_token_hash text,
  target_expires_at timestamptz,
  target_idempotency_key uuid
)
returns public.estimate_proposal_deliveries
language plpgsql
security definer
set search_path = public
as $$
declare version public.estimate_versions; existing public.estimate_proposal_deliveries; created public.estimate_proposal_deliveries;
begin
  select * into version from public.estimate_versions where id = target_version_id for update;
  if version.id is null or version.status not in ('prepared', 'sent')
     or not public.can_access_estimates(version.company_id, 'proposal.send') then
    raise exception 'Proposal version cannot be delivered.' using errcode = '42501';
  end if;
  select * into existing from public.estimate_proposal_deliveries
  where company_id = version.company_id and idempotency_key = target_idempotency_key;
  if existing.id is not null then
    if existing.created_by <> auth.uid() or existing.version_id <> version.id then
      raise exception 'Delivery key is already used.' using errcode = '23505';
    end if;
    return existing;
  end if;
  if not exists (
    select 1 from public.generated_estimate_documents document
    where document.id = target_document_id and document.version_id = version.id and document.company_id = version.company_id and document.status = 'ready'
  ) then raise exception 'A ready version PDF is required.' using errcode = '23514'; end if;
  if target_expires_at <= now() + interval '1 hour' or target_expires_at > now() + interval '30 days' then
    raise exception 'Delivery expiration is invalid.' using errcode = '23514';
  end if;
  if (select count(*) from public.estimate_proposal_deliveries d where d.company_id = version.company_id and d.created_by = auth.uid() and d.created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'Delivery rate limit exceeded.' using errcode = 'P0001';
  end if;
  insert into public.estimate_proposal_deliveries(
    company_id, estimate_id, version_id, generated_document_id, recipient_email, recipient_name,
    email_subject, message_body, locale, idempotency_key, token_hash, token_expires_at, created_by
  ) values (
    version.company_id, version.estimate_id, version.id, target_document_id, lower(btrim(target_recipient_email)),
    nullif(btrim(target_recipient_name), ''), btrim(target_subject), nullif(btrim(target_message), ''), target_locale,
    target_idempotency_key, target_token_hash, target_expires_at, auth.uid()
  ) returning * into created;
  return created;
end;
$$;

create or replace function public.start_proposal_delivery_send(target_delivery_id uuid)
returns public.estimate_proposal_deliveries
language plpgsql security definer set search_path = public
as $$
declare delivery public.estimate_proposal_deliveries; next_attempt integer;
begin
  select * into delivery from public.estimate_proposal_deliveries where id = target_delivery_id for update;
  if delivery.id is null or delivery.created_by <> auth.uid()
     or not public.can_access_estimates(delivery.company_id, 'proposal.send') then
    raise exception 'Delivery is unavailable.' using errcode = '42501';
  end if;
  if delivery.status in ('sending', 'sent', 'delivered', 'responded') then return delivery; end if;
  if delivery.status not in ('queued', 'failed') then raise exception 'Delivery is already being processed.' using errcode = '40001'; end if;
  if (select count(*) from public.estimate_proposal_delivery_attempts a where a.delivery_id = delivery.id and a.started_at > now() - interval '1 hour') >= 3 then
    raise exception 'Delivery retry rate limit exceeded.' using errcode = 'P0001';
  end if;
  select coalesce(max(attempt_number), 0) + 1 into next_attempt from public.estimate_proposal_delivery_attempts where delivery_id = delivery.id;
  insert into public.estimate_proposal_delivery_attempts(delivery_id, attempt_number) values(delivery.id, next_attempt);
  update public.estimate_proposal_deliveries set status = 'sending', failed_at = null where id = delivery.id returning * into delivery;
  return delivery;
end;
$$;

create or replace function public.complete_proposal_delivery_send(target_delivery_id uuid, target_provider_message_id text)
returns public.estimate_proposal_deliveries
language plpgsql security definer set search_path = public
as $$
declare delivery public.estimate_proposal_deliveries;
begin
  select * into delivery from public.estimate_proposal_deliveries where id = target_delivery_id for update;
  if delivery.id is null or delivery.created_by <> auth.uid()
     or not public.can_access_estimates(delivery.company_id, 'proposal.send') then
    raise exception 'Delivery is unavailable.' using errcode = '42501';
  end if;
  if delivery.status in ('sent', 'delivered', 'responded') then return delivery; end if;
  if delivery.status <> 'sending' then raise exception 'Delivery is not being sent.' using errcode = '23514'; end if;
  perform public.transition_estimate_version(delivery.version_id, 'sent', 'email', null);
  update public.estimate_proposal_delivery_attempts set status = 'sent', completed_at = now(), provider_result_category = 'accepted'
  where delivery_id = delivery.id and status = 'sending';
  update public.estimate_proposal_deliveries set status = 'sent', sent_at = now(), safe_error = null,
    provider_message_id = nullif(left(target_provider_message_id, 300), '')
  where id = delivery.id returning * into delivery;
  return delivery;
end;
$$;

create or replace function public.fail_proposal_delivery_send(target_delivery_id uuid, target_safe_error text, target_category text)
returns public.estimate_proposal_deliveries
language plpgsql security definer set search_path = public
as $$
declare delivery public.estimate_proposal_deliveries;
begin
  select * into delivery from public.estimate_proposal_deliveries where id = target_delivery_id for update;
  if delivery.id is null or delivery.created_by <> auth.uid()
     or not public.can_access_estimates(delivery.company_id, 'proposal.send') then
    raise exception 'Delivery is unavailable.' using errcode = '42501';
  end if;
  if delivery.status <> 'sending' then return delivery; end if;
  update public.estimate_proposal_delivery_attempts set status = 'failed', completed_at = now(),
    provider_result_category = left(target_category, 100), safe_error = left(target_safe_error, 500)
  where delivery_id = delivery.id and status = 'sending';
  update public.estimate_proposal_deliveries set status = 'failed', failed_at = now(), safe_error = left(target_safe_error, 500)
  where id = delivery.id returning * into delivery;
  return delivery;
end;
$$;

create or replace function public.revoke_proposal_delivery(target_delivery_id uuid)
returns public.estimate_proposal_deliveries
language plpgsql security definer set search_path = public
as $$
declare delivery public.estimate_proposal_deliveries;
begin
  select * into delivery from public.estimate_proposal_deliveries where id = target_delivery_id for update;
  if delivery.id is null or not public.can_access_estimates(delivery.company_id, 'proposal.send') then
    raise exception 'Delivery is unavailable.' using errcode = '42501';
  end if;
  if delivery.responded_at is not null then raise exception 'Responded delivery cannot be revoked.' using errcode = '23514'; end if;
  if delivery.revoked_at is null then
    update public.estimate_proposal_deliveries set status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
    where id = delivery.id returning * into delivery;
  end if;
  return delivery;
end;
$$;

create or replace function public.get_public_proposal_delivery(target_token_hash text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'deliveryId', delivery.id,
    'status', delivery.status,
    'locale', delivery.locale,
    'expiresAt', delivery.token_expires_at,
    'firstOpenedAt', delivery.first_opened_at,
    'respondedAt', delivery.responded_at,
    'response', delivery.response,
    'proposal', version.customer_proposal_snapshot,
    'documentId', document.id,
    'documentStatus', document.status,
    'documentSize', document.file_size_bytes
  )
  from public.estimate_proposal_deliveries delivery
  join public.estimate_versions version on version.id = delivery.version_id and version.company_id = delivery.company_id
  join public.generated_estimate_documents document on document.id = delivery.generated_document_id and document.version_id = version.id
  where delivery.token_hash = target_token_hash
    and delivery.revoked_at is null
    and delivery.token_expires_at > now()
    and delivery.status in ('sent', 'delivered', 'responded');
$$;

create or replace function public.track_public_proposal_open(target_token_hash text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.estimate_proposal_deliveries set
    first_opened_at = coalesce(first_opened_at, now()),
    last_opened_at = now(),
    open_count = least(1000, open_count + 1)
  where token_hash = target_token_hash and revoked_at is null and token_expires_at > now()
    and status in ('sent', 'delivered', 'responded')
    and (last_opened_at is null or last_opened_at < now() - interval '5 minutes');
end;
$$;

create or replace function public.submit_public_proposal_response(
  target_token_hash text,
  target_response text,
  target_response_name text,
  target_response_note text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare delivery public.estimate_proposal_deliveries; version public.estimate_versions;
begin
  select * into delivery from public.estimate_proposal_deliveries
  where token_hash = target_token_hash for update;
  if delivery.id is null or delivery.revoked_at is not null or delivery.token_expires_at <= now()
     or delivery.status not in ('sent', 'delivered', 'responded') then
    raise exception 'Proposal is unavailable.' using errcode = 'P0002';
  end if;
  if target_response not in ('accepted', 'rejected') then raise exception 'Response is invalid.' using errcode = '23514'; end if;
  if delivery.response is not null then
    if delivery.response <> target_response then raise exception 'Proposal already has a different response.' using errcode = '23514'; end if;
    return jsonb_build_object('deliveryId', delivery.id, 'response', delivery.response, 'respondedAt', delivery.responded_at);
  end if;
  select * into version
  from public.apply_estimate_version_final_response(delivery.version_id, target_response, target_response_note, null);
  update public.estimate_proposal_deliveries set status = 'responded', responded_at = now(), response = target_response,
    response_name = nullif(btrim(left(target_response_name, 160)), ''),
    response_note = nullif(btrim(left(target_response_note, 2000)), '')
  where id = delivery.id returning * into delivery;
  return jsonb_build_object('deliveryId', delivery.id, 'response', delivery.response, 'respondedAt', delivery.responded_at, 'versionStatus', version.status);
end;
$$;

revoke all on function public.claim_proposal_delivery(uuid, uuid, text, text, text, text, text, text, timestamptz, uuid) from public, anon;
revoke all on function public.start_proposal_delivery_send(uuid) from public, anon;
revoke all on function public.complete_proposal_delivery_send(uuid, text) from public, anon;
revoke all on function public.fail_proposal_delivery_send(uuid, text, text) from public, anon;
revoke all on function public.revoke_proposal_delivery(uuid) from public, anon;
revoke all on function public.get_public_proposal_delivery(text) from public, anon, authenticated;
revoke all on function public.track_public_proposal_open(text) from public, anon, authenticated;
revoke all on function public.submit_public_proposal_response(text, text, text, text) from public, anon, authenticated;

grant execute on function public.claim_proposal_delivery(uuid, uuid, text, text, text, text, text, text, timestamptz, uuid) to authenticated;
grant execute on function public.start_proposal_delivery_send(uuid) to authenticated;
grant execute on function public.complete_proposal_delivery_send(uuid, text) to authenticated;
grant execute on function public.fail_proposal_delivery_send(uuid, text, text) to authenticated;
grant execute on function public.revoke_proposal_delivery(uuid) to authenticated;
grant execute on function public.get_public_proposal_delivery(text) to service_role;
grant execute on function public.track_public_proposal_open(text) to service_role;
grant execute on function public.submit_public_proposal_response(text, text, text, text) to service_role;

comment on table public.estimate_proposal_deliveries is 'Operational delivery state for one immutable proposal version. Raw secure tokens are never stored.';
comment on function public.get_public_proposal_delivery(text) is 'Service-role-only token-hash lookup returning an allowlisted immutable customer proposal.';
