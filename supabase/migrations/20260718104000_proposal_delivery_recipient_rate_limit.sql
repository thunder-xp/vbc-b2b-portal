-- Bound repeated delivery attempts for the same version and recipient.

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
  if (select count(*) from public.estimate_proposal_deliveries d
      where d.company_id = version.company_id and d.version_id = version.id
        and d.created_by = auth.uid() and d.recipient_email = lower(btrim(target_recipient_email))
        and d.created_at > now() - interval '10 minutes') >= 3 then
    raise exception 'Recipient delivery rate limit exceeded.' using errcode = 'P0001';
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

revoke all on function public.claim_proposal_delivery(uuid, uuid, text, text, text, text, text, text, timestamptz, uuid) from public, anon;
grant execute on function public.claim_proposal_delivery(uuid, uuid, text, text, text, text, text, text, timestamptz, uuid) to authenticated;
