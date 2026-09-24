import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";
import type { AgentCommercialAdminDetail, AgentCommissionClassification, AgentRewardState, OneCCommercialOrderCandidate } from "./types";

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
