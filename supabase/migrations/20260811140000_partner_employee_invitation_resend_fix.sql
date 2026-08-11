create or replace function public.reissue_company_invitation(
  p_invitation_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
)
returns table (
  invitation_id uuid,
  normalized_email text,
  full_name text,
  expires_at timestamptz,
  token_version integer
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  target public.invitations%rowtype;
begin
  select * into target
  from public.invitations
  where id = p_invitation_id
  for update;

  if not found or not public.can_manage_company_users(target.company_id) then
    raise exception 'Invitation is unavailable.' using errcode = '42501';
  end if;
  if target.status <> 'pending' or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_expires_at <= now() or p_expires_at > now() + interval '30 days' then
    raise exception 'Invitation cannot be reissued.' using errcode = '55000';
  end if;

  update public.invitations as invitation
  set token_hash = p_token_hash,
      token_version = invitation.token_version + 1,
      expires_at = p_expires_at,
      last_sent_at = now(),
      send_count = invitation.send_count + 1,
      updated_at = now()
  where invitation.id = target.id
  returning invitation.* into target;

  insert into public.company_user_events (
    company_id, target_invitation_id, actor_user_id, event_type, safe_payload
  ) values (
    target.company_id, target.id, actor_id, 'invitation_resent',
    jsonb_build_object('tokenVersion', target.token_version)
  );
  perform public.record_company_admin_intervention(
    target.company_id, null, target.id, 'invitation_resent'
  );

  return query select target.id, lower(target.email), target.full_name,
    target.expires_at,
    target.token_version;
end;
$$;

revoke all on function public.reissue_company_invitation(uuid, text, timestamptz) from public;
grant execute on function public.reissue_company_invitation(uuid, text, timestamptz) to authenticated;
