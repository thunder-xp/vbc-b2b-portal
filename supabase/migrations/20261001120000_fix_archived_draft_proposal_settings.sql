create or replace function public.save_estimate_proposal_settings(
  target_estimate_id uuid,
  expected_revision integer,
  target_template_id uuid,
  settings_payload jsonb
)
returns public.estimates
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.estimates;
begin
  select *
  into target
  from public.estimates
  where id = target_estimate_id
  for update;

  if target.id is null
     or not (
       target.status in ('draft', 'ready')
       or (target.status = 'archived' and target.lifecycle_status = 'draft')
     )
     or not public.can_access_estimates(target.company_id, 'estimates.manage') then
    raise exception 'Estimate proposal is not available.' using errcode = '42501';
  end if;

  if target.revision <> expected_revision then
    raise exception 'Estimate proposal settings changed before save.' using errcode = 'PT409';
  end if;

  if settings_payload is null
     or jsonb_typeof(settings_payload) <> 'object'
     or octet_length(settings_payload::text) > 20000 then
    raise exception 'Proposal settings are invalid.' using errcode = '22023';
  end if;

  if target_template_id is not null and not exists (
    select 1
    from public.proposal_templates template
    where template.id = target_template_id
      and template.is_active
      and (template.is_system or template.company_id = target.company_id)
  ) then
    raise exception 'Proposal template is unavailable.' using errcode = '22023';
  end if;

  update public.estimates
  set proposal_template_id = target_template_id,
      proposal_settings = settings_payload,
      revision = revision + 1
  where id = target.id
  returning * into target;

  return target;
end;
$$;

comment on function public.save_estimate_proposal_settings(uuid, integer, uuid, jsonb) is
  'Persists presentation-only proposal settings for mutable drafts, ready estimates, and archived unsent drafts. Commercial estimate content and immutable version snapshots are not changed.';

revoke all on function public.save_estimate_proposal_settings(uuid, integer, uuid, jsonb)
from public, anon;
grant execute on function public.save_estimate_proposal_settings(uuid, integer, uuid, jsonb)
to authenticated, service_role;
