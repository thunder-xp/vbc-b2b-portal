alter type public.notification_channel add value if not exists 'in_app';
alter type public.notification_delivery_status add value if not exists 'projected';
alter type public.notification_delivery_status add value if not exists 'suppressed';
