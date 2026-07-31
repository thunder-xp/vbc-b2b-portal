begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if to_regprocedure('extensions.digest(text,text)') is null then
    raise exception 'pgcrypto digest(text,text) is unavailable in extensions.';
  end if;

  perform extensions.digest(
    'partner-order-pgcrypto-runtime-smoke'::text,
    'sha256'::text
  );
end;
$$;

create or replace function public.record_partner_order_notification_transition()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare event_name text;
begin
  if tg_op = 'INSERT' then
    event_name := 'order_submitted';
  elsif old.integration_status is distinct from new.integration_status then
    event_name := case new.integration_status
      when 'confirmed' then 'order_confirmed'
      when 'reconciliation_required' then 'order_reconciliation_required'
      when 'manual_review_required' then 'order_requires_attention'
      when 'confirmed_not_created' then 'order_requires_attention'
      when 'failed' then 'order_requires_attention'
      else null
    end;
  elsif old.status is distinct from new.status and new.status = 'unknown' then
    event_name := 'order_readback_failed';
  end if;

  if event_name is not null then
    insert into public.partner_order_notification_events(
      company_id, partner_order_id, event_type, occurred_at, fingerprint
    ) values (
      new.company_id, new.id, event_name, now(),
      encode(extensions.digest(
        new.id::text || '|' || event_name || '|'
          || coalesce(new.integration_status, new.status),
        'sha256'::text
      ), 'hex')
    ) on conflict (fingerprint) do nothing;
  end if;
  return new;
end;
$$;

comment on function public.record_partner_order_notification_transition() is
  'Projects portal order lifecycle transitions using explicitly resolved pgcrypto hashing.';

commit;
