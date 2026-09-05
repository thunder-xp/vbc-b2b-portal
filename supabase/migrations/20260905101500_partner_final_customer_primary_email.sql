alter table public.partner_final_customers
  add column if not exists primary_email text null;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'partner_final_customers_primary_email_check'
      and conrelid = 'public.partner_final_customers'::regclass
  ) then
    alter table public.partner_final_customers
      add constraint partner_final_customers_primary_email_check check (
        primary_email is null
        or (
          char_length(primary_email) <= 254
          and primary_email = lower(btrim(primary_email))
          and primary_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        )
      );
  end if;
end;
$$;

create or replace function public.update_estimate_final_customer_email(
  target_estimate_id uuid,
  target_customer_id uuid,
  expected_revision integer,
  target_primary_email text
)
returns public.partner_final_customers
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_estimate public.estimates;
  target_customer public.partner_final_customers;
  normalized_email text := lower(btrim(coalesce(target_primary_email, '')));
begin
  select * into target_estimate
  from public.estimates
  where id = target_estimate_id and deleted_at is null and archived_at is null;

  if target_estimate.id is null
     or target_estimate.final_customer_id <> target_customer_id
     or not public.can_access_estimates(target_estimate.company_id, 'estimates.manage') then
    raise exception 'Estimate customer is not available.' using errcode = '42501';
  end if;

  select * into target_customer
  from public.partner_final_customers
  where id = target_customer_id
  for update;

  if target_customer.id is null
     or target_customer.company_id <> target_estimate.company_id
     or target_customer.archived_at is not null then
    raise exception 'Estimate customer is not available.' using errcode = '42501';
  end if;
  if target_customer.revision <> expected_revision then
    raise exception 'Final customer changed in another session.' using errcode = '40001';
  end if;
  if char_length(normalized_email) = 0
     or char_length(normalized_email) > 254
     or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Final customer email is invalid.' using errcode = '22023';
  end if;

  update public.partner_final_customers
  set primary_email = normalized_email, updated_by = (select auth.uid())
  where id = target_customer.id
  returning * into target_customer;

  insert into public.partner_final_customer_events (
    customer_id, company_id, actor_user_id, event_type, metadata
  ) values (
    target_customer.id,
    target_customer.company_id,
    (select auth.uid()),
    'updated',
    jsonb_build_object('changedFields', jsonb_build_array('primaryEmail'), 'source', 'estimate_delivery')
  );

  return target_customer;
end;
$$;

revoke all on function public.update_estimate_final_customer_email(uuid, uuid, integer, text) from public, anon;
grant execute on function public.update_estimate_final_customer_email(uuid, uuid, integer, text) to authenticated;

comment on column public.partner_final_customers.primary_email is
  'Governed primary email for proposal delivery. Company-scoped Final Customer data, not CRM.';
comment on function public.update_estimate_final_customer_email(uuid, uuid, integer, text) is
  'Updates only the governed email for the Final Customer already attached to an authorized Estimate.';

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
set search_path = ''
as $$
declare
  version public.estimate_versions;
  existing public.estimate_proposal_deliveries;
  created public.estimate_proposal_deliveries;
begin
  select * into version from public.estimate_versions where id = target_version_id for update;
  if version.id is null
     or version.status not in ('prepared', 'sent')
     or not public.can_access_estimates(version.company_id, 'proposal.send')
     or not exists (
       select 1
       from public.estimates estimate
       where estimate.id = version.estimate_id
         and estimate.company_id = version.company_id
         and estimate.revision = version.estimate_revision
         and estimate.deleted_at is null
         and estimate.archived_at is null
     ) then
    raise exception 'Proposal version cannot be delivered.' using errcode = '42501';
  end if;

  select * into existing from public.estimate_proposal_deliveries
  where company_id = version.company_id and idempotency_key = target_idempotency_key;
  if existing.id is not null then
    if existing.created_by <> (select auth.uid()) or existing.version_id <> version.id then
      raise exception 'Delivery key is already used.' using errcode = '23505';
    end if;
    if existing.status <> 'failed' then
      return existing;
    end if;
  end if;

  if not exists (
    select 1 from public.generated_estimate_documents document
    where document.id = target_document_id
      and document.version_id = version.id
      and document.company_id = version.company_id
      and document.status = 'ready'
  ) then
    raise exception 'A ready version PDF is required.' using errcode = '23514';
  end if;
  if target_expires_at <= now() + interval '1 hour' or target_expires_at > now() + interval '30 days' then
    raise exception 'Delivery expiration is invalid.' using errcode = '23514';
  end if;
  if existing.id is not null then
    update public.estimate_proposal_deliveries
    set token_hash = target_token_hash,
        token_expires_at = target_expires_at,
        generated_document_id = target_document_id,
        status = 'queued'
    where id = existing.id
    returning * into existing;
    return existing;
  end if;
  if (
    select count(*) from public.estimate_proposal_deliveries delivery
    where delivery.company_id = version.company_id
      and delivery.created_by = (select auth.uid())
      and delivery.created_at > now() - interval '10 minutes'
  ) >= 10 then
    raise exception 'Delivery rate limit exceeded.' using errcode = 'P0001';
  end if;
  if (
    select count(*) from public.estimate_proposal_deliveries delivery
    where delivery.company_id = version.company_id
      and delivery.version_id = version.id
      and delivery.created_by = (select auth.uid())
      and delivery.recipient_email = lower(btrim(target_recipient_email))
      and delivery.created_at > now() - interval '10 minutes'
  ) >= 3 then
    raise exception 'Recipient delivery rate limit exceeded.' using errcode = 'P0001';
  end if;

  insert into public.estimate_proposal_deliveries(
    company_id, estimate_id, version_id, generated_document_id, recipient_email, recipient_name,
    email_subject, message_body, locale, idempotency_key, token_hash, token_expires_at, created_by
  ) values (
    version.company_id, version.estimate_id, version.id, target_document_id, lower(btrim(target_recipient_email)),
    nullif(btrim(target_recipient_name), ''), btrim(target_subject), nullif(btrim(target_message), ''), target_locale,
    target_idempotency_key, target_token_hash, target_expires_at, (select auth.uid())
  ) returning * into created;
  return created;
end;
$$;

revoke all on function public.claim_proposal_delivery(uuid, uuid, text, text, text, text, text, text, timestamptz, uuid) from public, anon;
grant execute on function public.claim_proposal_delivery(uuid, uuid, text, text, text, text, text, text, timestamptz, uuid) to authenticated;
