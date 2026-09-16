begin;

create index installation_marketplace_pilot_config_created_by_idx
  on public.installation_marketplace_pilot_configurations(created_by);

create index installation_marketplace_pilot_config_updated_by_idx
  on public.installation_marketplace_pilot_configurations(updated_by);

create index installation_marketplace_invitations_created_by_idx
  on public.installation_marketplace_invitations(created_by);

create index installation_marketplace_invitations_updated_by_idx
  on public.installation_marketplace_invitations(updated_by);

create index installation_marketplace_supply_events_actor_idx
  on public.installation_marketplace_supply_events(actor_user_id)
  where actor_user_id is not null;

commit;
