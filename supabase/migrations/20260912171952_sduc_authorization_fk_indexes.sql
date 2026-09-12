begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create index sduc_system_policy_updated_by_idx
  on private.sduc_system_policy (updated_by)
  where updated_by is not null;

create index sduc_price_authorizations_product_idx
  on private.sduc_price_authorizations (product_id, company_id, id);

create index sduc_price_authorizations_policy_idx
  on private.sduc_price_authorizations (mechanism_policy_id, id);

create index sduc_price_authorizations_order_idx
  on private.sduc_price_authorizations (consumed_order_id, id)
  where consumed_order_id is not null;

create index sduc_authorization_events_order_idx
  on private.sduc_authorization_events (order_id, id)
  where order_id is not null;

commit;
