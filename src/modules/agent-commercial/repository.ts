import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";
import type {
  AgentCommercialAdminDetail,
  AgentCommissionClassification,
  AgentRewardFinanceDetail,
  AgentRewardFinanceQueueItem,
  AgentRewardPayoutResult,
  AgentRewardState,
  OneCCommercialOrderCandidate,
} from "./types";

export class AgentCommercialRepository {
  async adminDetail(agentId: string): Promise<AgentCommercialAdminDetail> {
    const client = createAdminClient();
    const [bindingResult, attributionResult, salesResult] = await Promise.all([
      client.from("agent_1c_bindings").select("source_agent_1c_id,source_external_code,source_fiscal_code,source_name_snapshot,linked_at").eq("agent_id", agentId).maybeSingle(),
      client.from("agent_attributions").select("id,referral_id,customer_identity_id,status,agent_referrals!inner(name_snapshot,referral_code)").eq("agent_id", agentId).order("valid_from", { ascending: false }),
      client.from("agent_sale_links").select("id,source_order_1c_ref,source_order_number_snapshot,source_order_date_snapshot,source_customer_name_snapshot,source_currency_snapshot,agent_sale_projections(state,payment_state,source_realization_refs,realization_evidence,payment_evidence,gross_realized_amount,vat_amount,net_realized_amount,paid_gross_amount,fully_paid_at,source_observed_at),agent_reward_projections(state,forecast_reward_amount,classification_complete),agent_sale_projection_lines(source_line_ref,source_nomenclature_1c_ref,source_name_snapshot,net_amount,classification,classification_status)").eq("agent_id", agentId).order("source_order_date_snapshot", { ascending: false }),
    ]);
    for (const result of [bindingResult, attributionResult, salesResult]) if (result.error) throw new Error(`Agent commercial read failed: ${result.error.code}`);
    const binding = bindingResult.data as Record<string, unknown> | null;
    return {
      binding: binding ? {
        sourceAgent1cId: String(binding.source_agent_1c_id),
        sourceExternalCode: String(binding.source_external_code),
        sourceFiscalCode: binding.source_fiscal_code ? String(binding.source_fiscal_code) : null,
        sourceNameSnapshot: String(binding.source_name_snapshot),
        linkedAt: String(binding.linked_at),
      } : null,
      attributions: (attributionResult.data ?? []).map((row) => {
        const referral = relation(row.agent_referrals);
        return { id: row.id, referralId: row.referral_id, customerIdentityId: row.customer_identity_id, customerName: String(referral?.name_snapshot ?? "—"), referralCode: String(referral?.referral_code ?? "—"), status: row.status };
      }),
      sales: (salesResult.data ?? []).map((row) => {
        const projection = relation(row.agent_sale_projections);
        const reward = relation(row.agent_reward_projections);
        return {
          id: row.id,
          orderRef: row.source_order_1c_ref,
          orderNumber: row.source_order_number_snapshot,
          orderDate: row.source_order_date_snapshot,
          customerName: row.source_customer_name_snapshot,
          saleState: projection?.state ?? null,
          paymentState: projection?.payment_state ?? null,
          rewardState: reward?.state ?? null,
          rewardAmount: numberOrNull(reward?.forecast_reward_amount),
          currency: row.source_currency_snapshot,
          classificationComplete: typeof reward?.classification_complete === "boolean" ? reward.classification_complete : null,
          realizationRefs: Array.isArray(projection?.source_realization_refs) ? projection.source_realization_refs.map(String) : [],
          realizationEvidence: realizationEvidence(projection?.realization_evidence),
          paymentEvidence: paymentEvidence(projection?.payment_evidence),
          realizedGrossAmount: Number(projection?.gross_realized_amount ?? 0),
          vatAmount: Number(projection?.vat_amount ?? 0),
          netRealizedAmount: Number(projection?.net_realized_amount ?? 0),
          paidGrossAmount: Number(projection?.paid_gross_amount ?? 0),
          fullyPaidAt: projection?.fully_paid_at ? String(projection.fully_paid_at) : null,
          sourceObservedAt: projection?.source_observed_at ? String(projection.source_observed_at) : null,
          lines: (Array.isArray(row.agent_sale_projection_lines) ? row.agent_sale_projection_lines : []).map((line) => ({
            lineRef: String(line.source_line_ref), nomenclatureRef: String(line.source_nomenclature_1c_ref),
            name: String(line.source_name_snapshot), netAmount: Number(line.net_amount),
            classification: (line.classification ?? null) as AgentCommissionClassification | null,
            classificationStatus: line.classification_status as "CLASSIFIED" | "BLOCKED_FROM_CALCULATION",
          })),
        } as AgentCommercialAdminDetail["sales"][number];
      }),
    };
  }

  async linkAgent(input: { agentId: string; candidate: { reference: string; code: string; fiscalCode: string | null; name: string }; actorUserId: string }) {
    return this.rpc("link_commercial_agent_1c_record", {
      p_agent_id: input.agentId, p_source_agent_1c_id: input.candidate.reference,
      p_source_external_code: input.candidate.code, p_source_fiscal_code: input.candidate.fiscalCode,
      p_source_name_snapshot: input.candidate.name, p_actor_user_id: input.actorUserId,
    });
  }

  async createSaleLink(input: { agentId: string; referralId: string; attributionId: string; order: OneCCommercialOrderCandidate; actorUserId: string }): Promise<{ id: string }> {
    return this.rpc("create_agent_sale_link_record", {
      p_agent_id: input.agentId, p_referral_id: input.referralId, p_attribution_id: input.attributionId,
      p_source_order_1c_ref: input.order.reference, p_source_order_number: input.order.number,
      p_source_order_date: input.order.date.slice(0, 10), p_source_customer_1c_ref: input.order.customerRef,
      p_source_customer_name: input.order.customerName, p_source_order_gross: input.order.grossAmount,
      p_source_currency: input.order.currency, p_actor_user_id: input.actorUserId,
    });
  }

  async importOrderReferral(input: { agentId: string; order: OneCCommercialOrderCandidate; actorUserId: string }): Promise<{ referralId: string; referralCode: string; attributionId: string; customerIdentityId: string; created: boolean }> {
    return this.rpc("import_agent_order_referral_record", {
      p_agent_id: input.agentId, p_source_order_1c_ref: input.order.reference,
      p_source_order_number: input.order.number, p_source_customer_1c_ref: input.order.customerRef,
      p_source_customer_name: input.order.customerName, p_customer_kind: input.order.customerKind,
      p_actor_user_id: input.actorUserId,
    });
  }

  async upsertProjection(saleLinkId: string, source: Record<string, unknown>, actorUserId: string) {
    return this.rpc("upsert_agent_sale_projection_record", { p_sale_link_id: saleLinkId, p_source: source, p_actor_user_id: actorUserId });
  }

  async classify(input: { reference: string; name: string; classification: AgentCommissionClassification; actorUserId: string }) {
    return this.rpc("classify_agent_nomenclature_record", {
      p_source_nomenclature_1c_ref: input.reference, p_source_name_snapshot: input.name,
      p_classification: input.classification, p_actor_user_id: input.actorUserId,
    });
  }

  async transitionReward(input: { saleLinkId: string; targetState: AgentRewardState; actorUserId: string; reason: string | null }) {
    return this.rpc("transition_agent_reward_record", {
      p_sale_link_id: input.saleLinkId, p_target_state: input.targetState,
      p_actor_user_id: input.actorUserId, p_reason: input.reason,
    });
  }

  async financeQueue(limit = 50): Promise<AgentRewardFinanceQueueItem[]> {
    const { data, error } = await createAdminClient()
      .from("agent_reward_projections")
      .select("sale_link_id,state,forecast_reward_amount,currency,updated_at,agent_sale_links!inner(agent_id,source_order_number_snapshot,source_order_date_snapshot,source_customer_name_snapshot,commercial_agents!inner(agent_code,display_name))")
      .in("state", ["ELIGIBLE", "FINANCE_REVIEW", "APPROVED", "READY_FOR_PAYOUT"])
      .order("updated_at", { ascending: true })
      .limit(Math.min(Math.max(limit, 1), 50));
    if (error) throw new Error(`Agent reward queue read failed: ${error.code}`);
    return (data ?? []).flatMap((row) => {
      const link = relation(row.agent_sale_links);
      const agent = relation(link?.commercial_agents);
      if (!link || !agent) return [];
      return [{
        saleLinkId: String(row.sale_link_id),
        agentId: String(link.agent_id),
        agentName: String(agent.display_name),
        agentCode: String(agent.agent_code),
        customerName: String(link.source_customer_name_snapshot),
        orderNumber: String(link.source_order_number_snapshot),
        orderDate: String(link.source_order_date_snapshot),
        state: row.state as AgentRewardState,
        amount: Number(row.forecast_reward_amount),
        currency: String(row.currency),
        updatedAt: String(row.updated_at),
      }];
    });
  }

  async financeReward(saleLinkId: string): Promise<AgentRewardFinanceDetail | null> {
    const { data, error } = await createAdminClient()
      .from("agent_reward_projections")
      .select("sale_link_id,state,classification_complete,equipment_net_amount,installation_net_amount,excluded_net_amount,equipment_rate_percent,installation_rate_percent,forecast_reward_amount,currency,updated_at,paid_at,paid_by,payout_reference,payout_note,agent_sale_links!inner(agent_id,source_order_number_snapshot,source_order_date_snapshot,source_customer_name_snapshot,commercial_agents!inner(agent_code,display_name),agent_sale_projections(state,payment_state,gross_realized_amount,paid_gross_amount,fully_paid_at,realization_evidence,payment_evidence),agent_reward_events(id,from_state,to_state,actor_user_id,reason,reward_amount,currency,payout_reference,created_at))")
      .eq("sale_link_id", saleLinkId)
      .order("created_at", { ascending: false, referencedTable: "agent_sale_links.agent_reward_events" })
      .limit(20, { referencedTable: "agent_sale_links.agent_reward_events" })
      .maybeSingle();
    if (error) throw new Error(`Agent reward detail read failed: ${error.code}`);
    if (!data) return null;
    const link = relation(data.agent_sale_links);
    const agent = relation(link?.commercial_agents);
    const projection = relation(link?.agent_sale_projections);
    if (!link || !agent || !projection) return null;
    const events = Array.isArray(link.agent_reward_events) ? link.agent_reward_events : [];
    return {
      saleLinkId: String(data.sale_link_id), agentId: String(link.agent_id),
      agentName: String(agent.display_name), agentCode: String(agent.agent_code),
      customerName: String(link.source_customer_name_snapshot),
      orderNumber: String(link.source_order_number_snapshot), orderDate: String(link.source_order_date_snapshot),
      state: data.state as AgentRewardState, amount: Number(data.forecast_reward_amount),
      currency: String(data.currency), updatedAt: String(data.updated_at),
      classificationComplete: Boolean(data.classification_complete),
      equipmentNetAmount: Number(data.equipment_net_amount), installationNetAmount: Number(data.installation_net_amount),
      excludedNetAmount: Number(data.excluded_net_amount), equipmentRatePercent: Number(data.equipment_rate_percent),
      installationRatePercent: Number(data.installation_rate_percent),
      saleState: projection.state as AgentRewardFinanceDetail["saleState"], paymentState: String(projection.payment_state),
      realizedGrossAmount: Number(projection.gross_realized_amount), paidGrossAmount: Number(projection.paid_gross_amount),
      fullyPaidAt: projection.fully_paid_at ? String(projection.fully_paid_at) : null,
      realizationEvidence: realizationEvidence(projection.realization_evidence),
      paymentEvidence: paymentEvidence(projection.payment_evidence),
      paidAt: data.paid_at ? String(data.paid_at) : null,
      paidBy: data.paid_by ? String(data.paid_by) : null,
      payoutReference: data.payout_reference ? String(data.payout_reference) : null,
      payoutNote: data.payout_note ? String(data.payout_note) : null,
      events: events.map((event) => ({
        id: String(event.id), fromState: event.from_state ? String(event.from_state) : null,
        toState: String(event.to_state), actorUserId: event.actor_user_id ? String(event.actor_user_id) : null,
        reason: event.reason ? String(event.reason) : null,
        amount: numberOrNull(event.reward_amount), currency: event.currency ? String(event.currency) : null,
        payoutReference: event.payout_reference ? String(event.payout_reference) : null,
        createdAt: String(event.created_at),
      })).sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)).slice(0, 20),
    };
  }

  async confirmPayout(input: {
    saleLinkId: string;
    actorUserId: string;
    expectedUpdatedAt: string;
    idempotencyKey: string;
    payoutReference: string;
    note: string | null;
  }): Promise<AgentRewardPayoutResult> {
    const { data, error } = await createAdminClient().rpc("confirm_agent_reward_payout_record", {
      p_sale_link_id: input.saleLinkId, p_actor_user_id: input.actorUserId,
      p_expected_updated_at: input.expectedUpdatedAt, p_idempotency_key: input.idempotencyKey,
      p_payout_reference: input.payoutReference, p_note: input.note,
    });
    if (error) {
      if (error.code === "40001") throw new Error("REWARD_PAYOUT_CONFLICT");
      if (error.code === "23514") throw new Error("REWARD_NOT_READY_FOR_PAYOUT");
      throw new Error(`Agent reward payout failed: ${error.code}`);
    }
    return data as AgentRewardPayoutResult;
  }

  private async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await createAdminClient().rpc(name, args);
    if (error) throw new Error(`Agent commercial ${name} failed: ${error.code}`);
    return data as T;
  }
}

function relation(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return value[0] && typeof value[0] === "object" ? value[0] as Record<string, unknown> : null;
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}
function numberOrNull(value: unknown): number | null { const parsed = Number(value); return value !== null && Number.isFinite(parsed) ? parsed : null; }
function realizationEvidence(value: unknown): AgentCommercialAdminDetail["sales"][number]["realizationEvidence"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const amount = Number(row.amount);
    if ((row.type !== "DELIVERY" && row.type !== "WORK_ACT") || !Number.isFinite(amount)) return [];
    return [{ type: row.type, ref: String(row.ref ?? ""), number: String(row.number ?? ""), date: String(row.date ?? ""), amount }];
  });
}
function paymentEvidence(value: unknown): AgentCommercialAdminDetail["sales"][number]["paymentEvidence"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const allocatedAmount = Number(row.allocatedAmount);
    if ((row.type !== "BANK" && row.type !== "CASH") || !Number.isFinite(allocatedAmount)) return [];
    return [{ type: row.type, ref: String(row.ref ?? ""), number: String(row.number ?? ""), date: String(row.date ?? ""), allocatedAmount }];
  });
}
