-- Expected business conflicts must not impersonate PostgreSQL serialization failures.
-- Historical migrations remain immutable; this forward migration repairs the active RPCs.
do $migration$
declare
  target record;
  definition text;
  interactive_functions constant text[] := array[
    'add_estimate_external_item', 'add_estimate_external_item_v2', 'add_estimate_external_item_v3',
    'add_estimate_items', 'add_estimate_items_v2', 'add_estimate_section_v2',
    'admin_publish_installation_tariff_set', 'admin_reassign_installation_requirement',
    'admin_save_installation_provider', 'admin_save_installation_tariff_draft',
    'approve_partner_access_request_v3', 'archive_estimate',
    'archive_partner_external_nomenclature', 'archive_partner_final_customer',
    'create_public_retail_order', 'delete_archived_estimate', 'merge_purchasing_list_items',
    'partner_respond_installation_assignment', 'partner_transition_support_ticket',
    'perform_partner_service_action', 'record_partner_momentum_action',
    'reject_onboarding_request', 'remove_estimate_item', 'remove_estimate_items',
    'remove_public_retail_cart_item', 'remove_purchasing_list_items',
    'request_onboarding_clarification', 'save_estimate_commercial_draft_impl',
    'save_estimate_proposal_settings', 'save_onboarding_approval_draft',
    'set_admin_external_nomenclature_cover', 'set_onboarding_approval_draft_step',
    'set_partner_external_nomenclature_cover', 'set_purchasing_list_archived',
    'start_proposal_delivery_send', 'submit_onboarding_partner_revision',
    'transition_external_item_request', 'transition_installation_execution',
    'transition_service_case', 'update_admin_external_nomenclature',
    'update_estimate_draft', 'update_estimate_generator_calculator_profile',
    'update_estimate_generator_service_default_price', 'update_estimate_item',
    'update_partner_external_nomenclature', 'update_partner_final_customer',
    'update_partner_final_customer_v2', 'update_public_retail_cart_quantity',
    'update_purchase_template', 'update_purchasing_list_items',
    'update_purchasing_list_metadata'
  ];
begin
  for target in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname = any(interactive_functions)
      and pg_get_functiondef(p.oid) like '%40001%'
  loop
    definition := pg_get_functiondef(target.oid);
    definition := replace(definition, '''40001''', '''PT409''');
    execute definition;
  end loop;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname = any(interactive_functions)
      and pg_get_functiondef(p.oid) like '%40001%'
  ) then
    raise exception 'Interactive concurrency contract migration is incomplete.';
  end if;
end;
$migration$;

comment on function public.partner_transition_support_ticket(uuid, integer, text) is
  'Partner support transition. Expected stale-version conflicts return PT409 and are never retried.';
comment on function public.perform_partner_service_action(uuid, integer, text, text) is
  'Partner service action. Expected stale-version conflicts return PT409 and are never retried.';
comment on function public.update_purchasing_list_items(uuid, integer, jsonb) is
  'Atomic purchasing-list update. Expected stale revisions return PT409 and are never retried.';
comment on function public.update_partner_external_nomenclature(uuid, uuid, integer, text, text, text, text) is
  'Company-scoped nomenclature update. Expected stale versions return PT409 and are never retried.';
