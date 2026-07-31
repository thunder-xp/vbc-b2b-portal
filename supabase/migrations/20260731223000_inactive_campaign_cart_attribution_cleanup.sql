create or replace function public.clear_inactive_campaign_cart_attribution()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status in ('paused','completed','archived') and old.status is distinct from new.status then
    update public.cart_items
    set campaign_id=null,campaign_item_id=null,campaign_attribution_fingerprint=null,updated_at=now()
    where campaign_id=new.id;
  end if;
  return new;
end; $$;

create trigger clear_inactive_campaign_cart_attribution
after update of status on public.commercial_campaigns
for each row execute function public.clear_inactive_campaign_cart_attribution();

update public.cart_items item
set campaign_id=null,campaign_item_id=null,campaign_attribution_fingerprint=null,updated_at=now()
from public.commercial_campaigns campaign
where item.campaign_id=campaign.id and campaign.status in ('paused','completed','archived');

revoke all on function public.clear_inactive_campaign_cart_attribution() from public,anon,authenticated;
