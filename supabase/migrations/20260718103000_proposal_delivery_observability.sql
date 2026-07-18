-- Add server-side observability identifiers to service-role-only proposal RPC responses.

create or replace function public.get_public_proposal_delivery(target_token_hash text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'deliveryId', delivery.id,
    'companyId', delivery.company_id,
    'estimateId', delivery.estimate_id,
    'versionId', delivery.version_id,
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
    return jsonb_build_object('deliveryId', delivery.id, 'companyId', delivery.company_id, 'estimateId', delivery.estimate_id,
      'versionId', delivery.version_id, 'response', delivery.response, 'respondedAt', delivery.responded_at);
  end if;
  select * into version
  from public.apply_estimate_version_final_response(delivery.version_id, target_response, target_response_note, null);
  update public.estimate_proposal_deliveries set status = 'responded', responded_at = now(), response = target_response,
    response_name = nullif(btrim(left(target_response_name, 160)), ''),
    response_note = nullif(btrim(left(target_response_note, 2000)), '')
  where id = delivery.id returning * into delivery;
  return jsonb_build_object('deliveryId', delivery.id, 'companyId', delivery.company_id, 'estimateId', delivery.estimate_id,
    'versionId', delivery.version_id, 'response', delivery.response, 'respondedAt', delivery.responded_at, 'versionStatus', version.status);
end;
$$;

revoke all on function public.get_public_proposal_delivery(text) from public, anon, authenticated;
revoke all on function public.submit_public_proposal_response(text, text, text, text) from public, anon, authenticated;
grant execute on function public.get_public_proposal_delivery(text) to service_role;
grant execute on function public.submit_public_proposal_response(text, text, text, text) to service_role;
