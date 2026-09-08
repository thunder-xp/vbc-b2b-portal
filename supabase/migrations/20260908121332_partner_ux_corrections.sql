begin;

-- Restore the cumulative, governed Partner Cabinet route allowlist. The payment
-- obligation migration narrowed this helper and made older legitimate rows fail
-- their unchanged CHECK constraint during mark-as-read updates.
create or replace function public.is_allowed_partner_notification_url(value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select value = '/cabinet'
    or value = '/cabinet/installation-orders'
    or value ~ '^/cabinet/orders/[0-9a-f-]{36}(\?tab=date-change)?$'
    or value ~ '^/cabinet/service/[0-9a-f-]{36}$'
    or value ~ '^/cabinet/service/history/[0-9a-f-]{36}$'
    or value ~ '^/cabinet/support/[0-9a-f-]{36}$'
    or value = '/cabinet/reservation-requests'
    or value = '/cabinet/company/users'
    or value ~ '^/cabinet/catalog/[a-z0-9-]+$'
    or value = '/cabinet/cart'
    or value = '/cabinet/offers'
    or value ~ '^/cabinet/offers/[0-9a-f-]{36}$'
    or value = '/cabinet/documents'
    or value ~ '^/cabinet/documents/[0-9a-f-]{36}$'
    or value ~ '^/cabinet/arrivals/[0-9a-f-]{36}$'
    or value = '/cabinet/campaigns'
    or value = '/cabinet/service'
    or value = '/cabinet/support'
    or value = '/cabinet/finance';
$$;

do $$
begin
  if exists (
    select 1
    from public.partner_notifications notification
    where notification.action_url is not null
      and not public.is_allowed_partner_notification_url(notification.action_url)
  ) then
    raise exception 'Existing partner notification action URL is outside the governed route allowlist.'
      using errcode = '23514';
  end if;
end;
$$;

commit;
