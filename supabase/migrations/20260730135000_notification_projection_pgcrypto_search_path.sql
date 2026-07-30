begin;

alter function public.create_partner_notification_event(
  uuid,
  text,
  text,
  uuid,
  text,
  uuid,
  text,
  timestamptz,
  jsonb
)
set search_path = public, extensions;

commit;
