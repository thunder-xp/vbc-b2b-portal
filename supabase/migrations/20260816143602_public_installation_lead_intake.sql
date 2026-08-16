create table public.public_installation_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  locale text not null check (locale in ('ru', 'ro')),
  customer_name text not null check (customer_name = btrim(customer_name) and char_length(customer_name) between 2 and 120),
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  locality text not null check (locality = btrim(locality) and char_length(locality) between 2 and 120),
  object_type text not null check (object_type in ('apartment', 'house', 'office', 'retail', 'warehouse', 'production', 'other')),
  system_type text not null check (system_type in ('cctv', 'access_control', 'alarm', 'intercom', 'network', 'other')),
  comment text null check (comment is null or comment = btrim(comment) and char_length(comment) between 1 and 1000),
  source_path text not null check (
    source_path = btrim(source_path)
    and char_length(source_path) between 1 and 300
    and (
      source_path in ('/', '/installation', '/calculator/cctv/result')
      or source_path ~ '^/products/[a-z0-9]+(-[a-z0-9]+)*$'
    )
  ),
  status text not null default 'new' check (status in ('new', 'in_progress', 'contacted', 'closed')),
  consent boolean not null check (consent),
  submission_key uuid not null unique,
  requester_fingerprint text not null check (requester_fingerprint ~ '^[0-9a-f]{64}$'),
  duplicate_fingerprint text not null check (duplicate_fingerprint ~ '^[0-9a-f]{64}$')
);

comment on table public.public_installation_leads is
  'Governed public installation enquiries. This is a lightweight intake queue, not CRM and not a 1C document.';

create index public_installation_leads_queue_idx
  on public.public_installation_leads(created_at desc, id desc);
create index public_installation_leads_requester_window_idx
  on public.public_installation_leads(requester_fingerprint, created_at desc);
create index public_installation_leads_duplicate_window_idx
  on public.public_installation_leads(duplicate_fingerprint, created_at desc);

alter table public.public_installation_leads enable row level security;
revoke all on table public.public_installation_leads from public, anon, authenticated;
grant select, insert on table public.public_installation_leads to service_role;

create or replace function public.create_public_installation_lead(
  p_locale text,
  p_customer_name text,
  p_phone_e164 text,
  p_locality text,
  p_object_type text,
  p_system_type text,
  p_comment text,
  p_source_path text,
  p_consent boolean,
  p_submission_key uuid,
  p_requester_fingerprint text,
  p_duplicate_fingerprint text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing public.public_installation_leads;
  created public.public_installation_leads;
begin
  if p_locale not in ('ru', 'ro')
    or btrim(coalesce(p_customer_name, '')) = ''
    or char_length(btrim(p_customer_name)) not between 2 and 120
    or p_phone_e164 !~ '^\+[1-9][0-9]{7,14}$'
    or char_length(btrim(coalesce(p_locality, ''))) not between 2 and 120
    or p_object_type not in ('apartment', 'house', 'office', 'retail', 'warehouse', 'production', 'other')
    or p_system_type not in ('cctv', 'access_control', 'alarm', 'intercom', 'network', 'other')
    or p_comment is not null and char_length(btrim(p_comment)) not between 1 and 1000
    or char_length(btrim(coalesce(p_source_path, ''))) not between 1 and 300
    or not (
      btrim(p_source_path) in ('/', '/installation', '/calculator/cctv/result')
      or btrim(p_source_path) ~ '^/products/[a-z0-9]+(-[a-z0-9]+)*$'
    )
    or p_consent is not true
    or p_submission_key is null
    or p_requester_fingerprint !~ '^[0-9a-f]{64}$'
    or p_duplicate_fingerprint !~ '^[0-9a-f]{64}$'
  then
    raise exception 'Invalid installation lead input.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_requester_fingerprint, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_duplicate_fingerprint, 1));
  perform pg_advisory_xact_lock(hashtextextended(p_submission_key::text, 2));

  select lead.* into existing
  from public.public_installation_leads lead
  where lead.submission_key = p_submission_key;
  if found then
    if existing.locale = p_locale
      and existing.customer_name = btrim(p_customer_name)
      and existing.phone_e164 = p_phone_e164
      and existing.locality = btrim(p_locality)
      and existing.object_type = p_object_type
      and existing.system_type = p_system_type
      and coalesce(existing.comment, '') = btrim(coalesce(p_comment, ''))
      and existing.source_path = btrim(p_source_path)
      and existing.consent = p_consent
    then
      return jsonb_build_object('status', 'accepted', 'leadId', existing.id, 'repeated', true);
    end if;
    return jsonb_build_object('status', 'conflict', 'leadId', existing.id, 'repeated', true);
  end if;

  select lead.* into existing
  from public.public_installation_leads lead
  where lead.duplicate_fingerprint = p_duplicate_fingerprint
    and lead.created_at >= now() - interval '15 minutes'
  order by lead.created_at desc
  limit 1;
  if found then
    return jsonb_build_object('status', 'accepted', 'leadId', existing.id, 'repeated', true);
  end if;

  if (select count(*) from public.public_installation_leads lead
      where lead.requester_fingerprint = p_requester_fingerprint
        and lead.created_at >= now() - interval '15 minutes') >= 3 then
    return jsonb_build_object('status', 'rate_limited', 'leadId', null, 'repeated', false);
  end if;

  insert into public.public_installation_leads(
    locale, customer_name, phone_e164, locality, object_type, system_type,
    comment, source_path, consent, submission_key, requester_fingerprint, duplicate_fingerprint
  ) values (
    p_locale, btrim(p_customer_name), p_phone_e164, btrim(p_locality), p_object_type, p_system_type,
    nullif(btrim(coalesce(p_comment, '')), ''), btrim(p_source_path), true, p_submission_key,
    p_requester_fingerprint, p_duplicate_fingerprint
  ) returning * into created;

  return jsonb_build_object('status', 'accepted', 'leadId', created.id, 'repeated', false);
end;
$$;

create or replace function public.admin_list_public_installation_leads(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_internal_permission('admin.retail_marketplace.view') then
    raise exception 'Forbidden.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', lead.id,
      'createdAt', lead.created_at,
      'locale', lead.locale,
      'customerName', lead.customer_name,
      'phone', lead.phone_e164,
      'locality', lead.locality,
      'objectType', lead.object_type,
      'systemType', lead.system_type,
      'comment', lead.comment,
      'sourcePath', lead.source_path,
      'status', lead.status
    ) order by lead.created_at desc, lead.id desc)
    from (
      select * from public.public_installation_leads
      order by created_at desc, id desc
      limit least(greatest(coalesce(p_limit, 50), 1), 100)
    ) lead
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.create_public_installation_lead(text, text, text, text, text, text, text, text, boolean, uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_public_installation_lead(text, text, text, text, text, text, text, text, boolean, uuid, text, text) to service_role;
revoke all on function public.admin_list_public_installation_leads(integer) from public, anon;
grant execute on function public.admin_list_public_installation_leads(integer) to authenticated;

comment on function public.create_public_installation_lead(text, text, text, text, text, text, text, text, boolean, uuid, text, text) is
  'Server-only public installation intake with bounded rate limiting and replay-safe duplicate handling.';
