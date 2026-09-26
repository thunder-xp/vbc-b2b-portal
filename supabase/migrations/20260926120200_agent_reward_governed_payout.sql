-- Complete the existing Agent reward workflow with explicit, auditable payout
-- evidence. 1C remains authoritative for the customer sale and payment; this
-- migration records only the separate Portal-controlled Agent payout action.

alter table public.agent_reward_projections
  add column paid_by uuid null references public.user_profiles(id) on delete restrict,
  add column payout_reference text null,
  add column payout_note text null,
  add column payout_idempotency_key uuid null;

alter table public.agent_reward_projections
  add constraint agent_reward_projections_payout_reference_check check (
    payout_reference is null or char_length(btrim(payout_reference)) between 1 and 160
  ),
  add constraint agent_reward_projections_payout_note_check check (
    payout_note is null or char_length(btrim(payout_note)) <= 1000
  ),
  add constraint agent_reward_projections_payout_evidence_consistency_check check (
    payout_idempotency_key is null or (
      state = 'PAID' and paid_at is not null and paid_by is not null and payout_reference is not null
    )
  );

create unique index agent_reward_projections_payout_idempotency_idx
  on public.agent_reward_projections (payout_idempotency_key)
  where payout_idempotency_key is not null;

create index agent_reward_projections_finance_queue_idx
  on public.agent_reward_projections (updated_at, sale_link_id)
  where state in ('ELIGIBLE', 'FINANCE_REVIEW', 'APPROVED', 'READY_FOR_PAYOUT');

alter table public.agent_reward_events
  add column reward_amount numeric(16,2) null,
  add column currency text null,
  add column payout_reference text null;

alter table public.agent_reward_events
  add constraint agent_reward_events_amount_check check (reward_amount is null or reward_amount >= 0),
  add constraint agent_reward_events_currency_check check (currency is null or currency ~ '^[A-Z]{3}$'),
  add constraint agent_reward_events_payout_reference_check check (
    payout_reference is null or char_length(btrim(payout_reference)) between 1 and 160
  );

-- Preserve the established review lifecycle while making PAID reachable only
-- through confirm_agent_reward_payout_record, which requires payout evidence.
create or replace function public.transition_agent_reward_record(
  p_sale_link_id uuid,
  p_target_state text,
  p_actor_user_id uuid,
  p_reason text default null
)
returns public.agent_reward_projections
language plpgsql
security definer
set search_path = ''
as $$
declare
  current public.agent_reward_projections;
  changed public.agent_reward_projections;
  link public.agent_sale_links;
begin
  select * into current
  from public.agent_reward_projections
  where sale_link_id = p_sale_link_id
  for update;

  select * into link from public.agent_sale_links where id = p_sale_link_id;
  if current.sale_link_id is null then
    raise exception 'Agent reward projection not found.' using errcode = 'P0002';
  end if;

  if not (
    (current.state = 'ELIGIBLE' and p_target_state = 'FINANCE_REVIEW') or
    (current.state = 'FINANCE_REVIEW' and p_target_state in ('APPROVED', 'BLOCKED')) or
    (current.state = 'APPROVED' and p_target_state in ('READY_FOR_PAYOUT', 'ADJUSTED')) or
    (current.state = 'READY_FOR_PAYOUT' and p_target_state = 'ADJUSTED') or
    (current.state = 'PAID' and p_target_state = 'ADJUSTED')
  ) then
    raise exception 'Invalid Agent reward transition.' using errcode = '23514';
  end if;

  update public.agent_reward_projections
  set state = p_target_state,
      reviewed_by = case when p_target_state = 'FINANCE_REVIEW' then p_actor_user_id else reviewed_by end,
      reviewed_at = case when p_target_state = 'FINANCE_REVIEW' then now() else reviewed_at end,
      approved_by = case when p_target_state = 'APPROVED' then p_actor_user_id else approved_by end,
      approved_at = case when p_target_state = 'APPROVED' then now() else approved_at end,
      updated_at = now()
  where sale_link_id = p_sale_link_id
  returning * into changed;

  insert into public.agent_reward_events (
    sale_link_id, from_state, to_state, actor_user_id, reason, reward_amount, currency
  ) values (
    p_sale_link_id, current.state, p_target_state, p_actor_user_id,
    nullif(btrim(p_reason), ''), current.forecast_reward_amount, current.currency
  );

  insert into public.agent_domain_events (
    agent_id, referral_id, attribution_id, actor_user_id, event_type, safe_metadata
  ) values (
    link.agent_id, link.referral_id, link.attribution_id, p_actor_user_id,
    'AGENT_REWARD_STATUS_CHANGED',
    jsonb_build_object(
      'saleLinkId', p_sale_link_id,
      'from', current.state,
      'to', p_target_state,
      'amount', current.forecast_reward_amount,
      'currency', current.currency
    )
  );
  return changed;
end;
$$;

create or replace function public.confirm_agent_reward_payout_record(
  p_sale_link_id uuid,
  p_actor_user_id uuid,
  p_expected_updated_at timestamptz,
  p_idempotency_key uuid,
  p_payout_reference text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current public.agent_reward_projections;
  projection public.agent_sale_projections;
  link public.agent_sale_links;
  normalized_reference text := nullif(btrim(p_payout_reference), '');
  normalized_note text := nullif(btrim(p_note), '');
  paid_timestamp timestamptz;
begin
  if p_idempotency_key is null then
    raise exception 'Payout idempotency key is required.' using errcode = '22023';
  end if;
  if normalized_reference is null or char_length(normalized_reference) > 160 then
    raise exception 'A valid payout reference is required.' using errcode = '22023';
  end if;
  if normalized_note is not null and char_length(normalized_note) > 1000 then
    raise exception 'Payout note is too long.' using errcode = '22023';
  end if;

  select * into current
  from public.agent_reward_projections
  where sale_link_id = p_sale_link_id
  for update;

  if current.sale_link_id is null then
    raise exception 'Agent reward projection not found.' using errcode = 'P0002';
  end if;

  if current.state = 'PAID' and current.payout_idempotency_key = p_idempotency_key then
    return jsonb_build_object(
      'outcome', 'ALREADY_APPLIED',
      'saleLinkId', current.sale_link_id,
      'state', current.state,
      'amount', current.forecast_reward_amount,
      'currency', current.currency,
      'paidAt', current.paid_at
    );
  end if;

  if current.state = 'PAID' then
    raise exception 'Reward payout was already resolved by another Finance action.' using errcode = '40001';
  end if;
  if current.updated_at is distinct from p_expected_updated_at then
    raise exception 'Reward changed after this page was opened. Reload before continuing.' using errcode = '40001';
  end if;
  if current.state <> 'READY_FOR_PAYOUT' then
    raise exception 'Reward is not ready for payout.' using errcode = '23514';
  end if;

  select * into link
  from public.agent_sale_links
  where id = p_sale_link_id;
  select * into projection
  from public.agent_sale_projections
  where sale_link_id = p_sale_link_id;

  if link.id is null or link.link_status <> 'ACTIVE'
    or projection.sale_link_id is null
    or projection.state <> 'FULLY_PAID'
    or projection.payment_state <> 'FULLY_PAID'
    or not current.classification_complete then
    raise exception 'Reward eligibility evidence is no longer valid.' using errcode = '23514';
  end if;

  paid_timestamp := now();
  update public.agent_reward_projections
  set state = 'PAID',
      paid_at = paid_timestamp,
      paid_by = p_actor_user_id,
      payout_reference = normalized_reference,
      payout_note = normalized_note,
      payout_idempotency_key = p_idempotency_key,
      updated_at = paid_timestamp
  where sale_link_id = p_sale_link_id
  returning * into current;

  insert into public.agent_reward_events (
    sale_link_id, from_state, to_state, actor_user_id, reason,
    reward_amount, currency, payout_reference
  ) values (
    p_sale_link_id, 'READY_FOR_PAYOUT', 'PAID', p_actor_user_id,
    normalized_note, current.forecast_reward_amount, current.currency, normalized_reference
  );

  insert into public.agent_domain_events (
    agent_id, referral_id, attribution_id, actor_user_id, event_type, safe_metadata
  ) values (
    link.agent_id, link.referral_id, link.attribution_id, p_actor_user_id,
    'AGENT_REWARD_STATUS_CHANGED',
    jsonb_build_object(
      'saleLinkId', p_sale_link_id,
      'from', 'READY_FOR_PAYOUT',
      'to', 'PAID',
      'amount', current.forecast_reward_amount,
      'currency', current.currency
    )
  );

  return jsonb_build_object(
    'outcome', 'APPLIED',
    'saleLinkId', current.sale_link_id,
    'state', current.state,
    'amount', current.forecast_reward_amount,
    'currency', current.currency,
    'paidAt', current.paid_at
  );
end;
$$;

create or replace function public.get_agent_cabinet_deal(p_sale_link_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(row) from (
    select link.id, referral.name_snapshot as client, link.source_order_number_snapshot as "orderNumber",
      link.source_order_date_snapshot as "orderDate", link.source_currency_snapshot as currency,
      projection.state, projection.source_order_state as "orderState",
      projection.gross_realized_amount as "realizedAmount", projection.vat_amount as "vatAmount",
      projection.net_realized_amount as "netRealizedAmount", projection.payment_state as "paymentState",
      projection.fully_paid_at as "fullyPaidAt", reward.state as "rewardState",
      reward.equipment_net_amount as "equipmentNetAmount",
      reward.installation_net_amount as "installationNetAmount",
      reward.excluded_net_amount as "excludedNetAmount",
      reward.equipment_rate_percent as "equipmentRatePercent",
      reward.installation_rate_percent as "installationRatePercent",
      reward.forecast_reward_amount as "rewardAmount", reward.classification_complete as "classificationComplete",
      reward.paid_at as "paidAt",
      case
        when reward.state <> 'BLOCKED' then null
        when not reward.classification_complete then 'CLASSIFICATION_PENDING'
        when projection.payment_state = 'RECONCILIATION_REQUIRED' then 'PAYMENT_RECONCILIATION'
        else 'REVIEW_REQUIRED'
      end as "safeBlockedReason"
    from public.agent_sale_links link
    join public.commercial_agents agent on agent.id = link.agent_id and agent.user_id = auth.uid() and agent.status = 'ACTIVE'
    join public.agent_referrals referral on referral.id = link.referral_id
    left join public.agent_sale_projections projection on projection.sale_link_id = link.id
    left join public.agent_reward_projections reward on reward.sale_link_id = link.id
    where link.id = p_sale_link_id and link.link_status = 'ACTIVE'
  ) row;
$$;

create or replace function public.get_agent_cabinet_rewards()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with agent as (select (private.current_commercial_agent()).*), own as (
    select reward.*, link.source_order_number_snapshot, link.source_order_date_snapshot,
      projection.payment_state
    from public.agent_reward_projections reward
    join public.agent_sale_links link on link.id = reward.sale_link_id
    join agent on agent.id = link.agent_id and agent.status = 'ACTIVE'
    left join public.agent_sale_projections projection on projection.sale_link_id = link.id
    where link.link_status = 'ACTIVE'
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'expected', coalesce(sum(forecast_reward_amount) filter (where state = 'FORECAST'), 0),
      'review', coalesce(sum(forecast_reward_amount) filter (where state in ('ELIGIBLE', 'FINANCE_REVIEW')), 0),
      'available', coalesce(sum(forecast_reward_amount) filter (where state in ('APPROVED', 'READY_FOR_PAYOUT')), 0),
      'paid', coalesce(sum(forecast_reward_amount) filter (where state = 'PAID'), 0)
    ),
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'saleLinkId', sale_link_id, 'orderNumber', source_order_number_snapshot,
      'orderDate', source_order_date_snapshot, 'state', state,
      'amount', forecast_reward_amount, 'currency', currency, 'paidAt', paid_at,
      'safeBlockedReason', case
        when state <> 'BLOCKED' then null
        when not classification_complete then 'CLASSIFICATION_PENDING'
        when payment_state = 'RECONCILIATION_REQUIRED' then 'PAYMENT_RECONCILIATION'
        else 'REVIEW_REQUIRED'
      end
    ) order by source_order_date_snapshot desc), '[]'::jsonb)
  ) from own;
$$;

revoke all on function public.confirm_agent_reward_payout_record(uuid, uuid, timestamptz, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.confirm_agent_reward_payout_record(uuid, uuid, timestamptz, uuid, text, text)
  to service_role;

-- Reassert the existing grants after replacing these functions.
revoke all on function public.transition_agent_reward_record(uuid, text, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.transition_agent_reward_record(uuid, text, uuid, text)
  to service_role;
revoke all on function public.get_agent_cabinet_deal(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_agent_cabinet_deal(uuid) to authenticated;
revoke all on function public.get_agent_cabinet_rewards()
  from public, anon, authenticated, service_role;
grant execute on function public.get_agent_cabinet_rewards() to authenticated;

comment on function public.confirm_agent_reward_payout_record(uuid, uuid, timestamptz, uuid, text, text) is
  'Atomically records an Agent payout from authoritative READY_FOR_PAYOUT state. It does not execute or replace 1C customer payment accounting.';
