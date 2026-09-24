alter table public.agent_sale_projections
  add column realization_evidence jsonb not null default '[]'::jsonb,
  add column payment_evidence jsonb not null default '[]'::jsonb;

alter table public.agent_sale_projections
  add constraint agent_sale_projections_realization_evidence_array_check
    check (jsonb_typeof(realization_evidence) = 'array'),
  add constraint agent_sale_projections_payment_evidence_array_check
    check (jsonb_typeof(payment_evidence) = 'array');
create or replace function public.upsert_agent_sale_projection_record(
  p_sale_link_id uuid,
  p_source jsonb,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link public.agent_sale_links;
  policy public.agent_commission_policies;
  previous_reward public.agent_reward_projections;
  line jsonb;
  realization_refs text[] := array[]::text[];
  source_state text;
  payment_state text;
  projection_state text;
  complete boolean;
  equipment_net numeric(16,2);
  installation_net numeric(16,2);
  excluded_net numeric(16,2);
  equipment_rate numeric(7,4);
  installation_rate numeric(7,4);
  reward_amount numeric(16,2);
  reward_state text;
begin
  select * into link from public.agent_sale_links where id = p_sale_link_id and link_status = 'ACTIVE' for update;
  if link.id is null then raise exception 'Active Agent sale link not found.' using errcode = 'P0002'; end if;
  if lower(p_source #>> '{order,ref}') <> link.source_order_1c_ref
    or lower(p_source #>> '{order,customerRef}') <> link.source_customer_1c_ref then
    raise exception '1C projection identity mismatch.' using errcode = '23514';
  end if;
  if jsonb_typeof(p_source #> '{realization,evidence}') <> 'array'
    or jsonb_typeof(p_source #> '{payment,evidence}') <> 'array' then
    raise exception '1C evidence arrays are required.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_source -> 'lines') <> 'array' or jsonb_array_length(p_source -> 'lines') = 0 then
    raise exception '1C projection lines are required.' using errcode = '22023';
  end if;

  select * into policy from public.agent_commission_policies
  where status = 'ACTIVE' and effective_from <= link.source_order_date_snapshot
    and (effective_until is null or effective_until >= link.source_order_date_snapshot)
  order by effective_from desc limit 1;
  if policy.id is null then raise exception 'No active Agent commission policy.' using errcode = 'P0002'; end if;
  select rate_percent into equipment_rate from public.agent_commission_policy_rates
    where policy_id = policy.id and classification = 'EQUIPMENT';
  select rate_percent into installation_rate from public.agent_commission_policy_rates
    where policy_id = policy.id and classification = 'NOVOTECH_INSTALLATION';

  delete from public.agent_sale_projection_lines where sale_link_id = link.id;
  for line in select value from jsonb_array_elements(p_source -> 'lines') loop
    if (line ->> 'gross')::numeric <> (line ->> 'net')::numeric + (line ->> 'vat')::numeric then
      raise exception '1C line amount equation failed.' using errcode = '23514';
    end if;
    insert into public.agent_sale_projection_lines (
      sale_link_id, source_line_ref, source_realization_1c_ref,
      source_nomenclature_1c_ref, source_name_snapshot,
      gross_amount, vat_amount, net_amount, classification, classification_status
    )
    select link.id, btrim(line ->> 'lineRef'), lower(line ->> 'realizationRef'),
      lower(line ->> 'nomenclatureRef'), btrim(line ->> 'name'),
      (line ->> 'gross')::numeric, (line ->> 'vat')::numeric, (line ->> 'net')::numeric,
      classification.classification,
      case when classification.classification is null then 'BLOCKED_FROM_CALCULATION' else 'CLASSIFIED' end
    from (select 1) seed
    left join public.agent_nomenclature_commission_classifications classification
      on classification.source_nomenclature_1c_ref = lower(line ->> 'nomenclatureRef');
  end loop;

  select coalesce(array_agg(distinct value), '{}') into realization_refs
  from jsonb_array_elements_text(coalesce(p_source #> '{realization,refs}', '[]'::jsonb));
  source_state := nullif(btrim(p_source #>> '{order,state}'), '');
  payment_state := case
    when (p_source #>> '{payment,reconciliationRequired}')::boolean then 'RECONCILIATION_REQUIRED'
    when nullif(p_source #>> '{payment,fullyPaidAt}', '') is not null then 'FULLY_PAID'
    when (p_source #>> '{payment,paidGross}')::numeric > 0 then 'PARTIALLY_PAID'
    else 'UNPAID'
  end;
  projection_state := case
    when (p_source #>> '{order,deletionMarked}')::boolean then 'CANCELLED'
    when payment_state = 'RECONCILIATION_REQUIRED' then 'RECONCILIATION_REQUIRED'
    when payment_state = 'FULLY_PAID' then 'FULLY_PAID'
    when payment_state = 'PARTIALLY_PAID' then 'PARTIALLY_PAID'
    when jsonb_array_length(coalesce(p_source #> '{realization,refs}', '[]'::jsonb)) > 0 then 'REALIZED'
    else 'LINKED'
  end;

  insert into public.agent_sale_projections (
    sale_link_id, state, source_order_state, source_order_posted, source_order_deletion_marked,
    source_realization_refs, realization_evidence, payment_evidence, realized_at, gross_realized_amount, vat_amount, net_realized_amount,
    paid_gross_amount, remaining_gross_amount, payment_state, fully_paid_at,
    source_version, source_observed_at, refreshed_at
  ) values (
    link.id, projection_state, source_state, (p_source #>> '{order,posted}')::boolean,
    (p_source #>> '{order,deletionMarked}')::boolean, realization_refs,
    p_source #> '{realization,evidence}', p_source #> '{payment,evidence}',
    nullif(p_source #>> '{realization,realizedAt}', '')::timestamptz,
    (p_source #>> '{realization,gross}')::numeric, (p_source #>> '{realization,vat}')::numeric,
    (p_source #>> '{realization,net}')::numeric, (p_source #>> '{payment,paidGross}')::numeric,
    nullif(p_source #>> '{payment,remainingGross}', '')::numeric, payment_state,
    nullif(p_source #>> '{payment,fullyPaidAt}', '')::timestamptz,
    btrim(p_source ->> 'sourceVersion'), (p_source ->> 'observedAt')::timestamptz, now()
  ) on conflict (sale_link_id) do update set
    state = excluded.state, source_order_state = excluded.source_order_state,
    source_order_posted = excluded.source_order_posted,
    source_order_deletion_marked = excluded.source_order_deletion_marked,
    source_realization_refs = excluded.source_realization_refs,
    realization_evidence = excluded.realization_evidence, payment_evidence = excluded.payment_evidence,
    realized_at = excluded.realized_at,
    gross_realized_amount = excluded.gross_realized_amount, vat_amount = excluded.vat_amount,
    net_realized_amount = excluded.net_realized_amount, paid_gross_amount = excluded.paid_gross_amount,
    remaining_gross_amount = excluded.remaining_gross_amount, payment_state = excluded.payment_state,
    fully_paid_at = excluded.fully_paid_at, source_version = excluded.source_version,
    source_observed_at = excluded.source_observed_at, refreshed_at = now();

  select bool_and(classification_status = 'CLASSIFIED'),
    coalesce(sum(net_amount) filter (where classification = 'EQUIPMENT'), 0),
    coalesce(sum(net_amount) filter (where classification = 'NOVOTECH_INSTALLATION'), 0),
    coalesce(sum(net_amount) filter (where classification = 'EXCLUDED'), 0)
  into complete, equipment_net, installation_net, excluded_net
  from public.agent_sale_projection_lines where sale_link_id = link.id;
  reward_amount := round(equipment_net * equipment_rate / 100 + installation_net * installation_rate / 100, 2);
  select * into previous_reward from public.agent_reward_projections where sale_link_id = link.id;
  reward_state := case
    when projection_state in ('CANCELLED', 'RECONCILIATION_REQUIRED') or (payment_state = 'FULLY_PAID' and not complete) then 'BLOCKED'
    when previous_reward.state in ('FINANCE_REVIEW', 'APPROVED', 'READY_FOR_PAYOUT', 'PAID', 'ADJUSTED')
      and payment_state = 'FULLY_PAID' and complete
      and (p_source #>> '{realization,gross}')::numeric = link.source_order_gross_snapshot then previous_reward.state
    when payment_state = 'FULLY_PAID' and complete
      and (p_source #>> '{realization,gross}')::numeric = link.source_order_gross_snapshot then 'ELIGIBLE'
    else 'FORECAST'
  end;

  insert into public.agent_reward_projections (
    sale_link_id, policy_id, state, classification_complete,
    equipment_net_amount, installation_net_amount, excluded_net_amount,
    equipment_rate_percent, installation_rate_percent, forecast_reward_amount, currency
  ) values (
    link.id, coalesce(previous_reward.policy_id, policy.id), reward_state, complete,
    equipment_net, installation_net, excluded_net, equipment_rate, installation_rate,
    reward_amount, link.source_currency_snapshot
  ) on conflict (sale_link_id) do update set
    state = excluded.state, classification_complete = excluded.classification_complete,
    equipment_net_amount = excluded.equipment_net_amount,
    installation_net_amount = excluded.installation_net_amount,
    excluded_net_amount = excluded.excluded_net_amount,
    forecast_reward_amount = excluded.forecast_reward_amount, updated_at = now();

  insert into public.agent_domain_events (agent_id, referral_id, attribution_id, actor_user_id, event_type, safe_metadata)
  values (link.agent_id, link.referral_id, link.attribution_id, p_actor_user_id, 'AGENT_SALE_REFRESHED',
    jsonb_build_object('saleLinkId', link.id, 'projectionState', projection_state, 'rewardState', reward_state));
  return jsonb_build_object('saleLinkId', link.id, 'saleState', projection_state,
    'rewardState', reward_state, 'rewardAmount', reward_amount, 'classificationComplete', complete);
end;
$$;
