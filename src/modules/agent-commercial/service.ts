import "server-only";

import { AgentCommercialRepository } from "./repository";
import { OneCAgentCommercialProvider } from "./one-c-provider";
import type { AgentCommissionClassification, AgentRewardState } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ONEC_GUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export class AgentCommercialService {
  constructor(
    private readonly repository = new AgentCommercialRepository(),
    private readonly oneC = new OneCAgentCommercialProvider(),
  ) {}

  detail(agentId: string) { requireUuid(agentId); return this.repository.adminDetail(agentId); }
  resolveAgent(sourceReference: string) { requireOneCGuid(sourceReference); return this.oneC.resolveAgent(sourceReference); }
  searchOrders(number: string) { return this.oneC.searchOrders(number); }

  async bindAgent(agentId: string, sourceReference: string, actorUserId: string) {
    requireUuid(agentId); requireUuid(actorUserId); requireOneCGuid(sourceReference);
    const candidate = await this.oneC.resolveAgent(sourceReference);
    return this.repository.linkAgent({ agentId, candidate, actorUserId });
  }

  async linkSale(input: { agentId: string; attributionId: string; orderReference: string; actorUserId: string }) {
    requireUuid(input.agentId); requireUuid(input.attributionId); requireUuid(input.actorUserId); requireOneCGuid(input.orderReference);
    const client = (await import("@/src/lib/supabase/admin")).createAdminClient();
    const { data: attribution, error } = await client.from("agent_attributions").select("referral_id,agent_id").eq("id", input.attributionId).single();
    if (error || !attribution || attribution.agent_id !== input.agentId) throw new Error("INVALID_AGENT_ATTRIBUTION");
    const order = await this.oneC.getOrder(input.orderReference);
    const link = await this.repository.createSaleLink({ ...input, referralId: attribution.referral_id, order });
    await this.refreshSale(link.id, input.actorUserId);
    return link;
  }

  async importAndLinkSale(input: { agentId: string; orderReference: string; actorUserId: string }) {
    requireUuid(input.agentId); requireUuid(input.actorUserId); requireOneCGuid(input.orderReference);
    const order = await this.oneC.getOrder(input.orderReference);
    const referral = await this.repository.importOrderReferral({ agentId: input.agentId, order, actorUserId: input.actorUserId });
    const link = await this.repository.createSaleLink({ agentId: input.agentId, referralId: referral.referralId, attributionId: referral.attributionId, order, actorUserId: input.actorUserId });
    await this.refreshSale(link.id, input.actorUserId);
    return { ...referral, saleLinkId: link.id };
  }

  async refreshSale(saleLinkId: string, actorUserId: string) {
    requireUuid(saleLinkId); requireUuid(actorUserId);
    const detail = await this.findSale(saleLinkId);
    const source = await this.oneC.projectionSource(detail.orderRef);
    return this.repository.upsertProjection(saleLinkId, source, actorUserId);
  }

  classify(input: { reference: string; name: string; classification: AgentCommissionClassification; actorUserId: string }) {
    requireOneCGuid(input.reference); requireUuid(input.actorUserId);
    if (!(["EQUIPMENT", "NOVOTECH_INSTALLATION", "EXCLUDED"] as const).includes(input.classification)) throw new Error("INVALID_CLASSIFICATION");
    if (!input.name.trim() || input.name.trim().length > 300) throw new Error("INVALID_NOMENCLATURE_NAME");
    return this.repository.classify({ ...input, name: input.name.trim() });
  }

  transitionReward(input: { saleLinkId: string; targetState: AgentRewardState; actorUserId: string; reason: string | null }) {
    requireUuid(input.saleLinkId); requireUuid(input.actorUserId);
    if (input.targetState === "PAID") throw new Error("PAYOUT_EVIDENCE_REQUIRED");
    return this.repository.transitionReward({ ...input, reason: input.reason?.trim().slice(0, 1000) || null });
  }

  financeQueue(limit = 50) { return this.repository.financeQueue(limit); }

  financeReward(saleLinkId: string) {
    requireUuid(saleLinkId);
    return this.repository.financeReward(saleLinkId);
  }

  confirmPayout(input: {
    saleLinkId: string;
    actorUserId: string;
    expectedUpdatedAt: string;
    idempotencyKey: string;
    payoutReference: string;
    note: string | null;
  }) {
    requireUuid(input.saleLinkId); requireUuid(input.actorUserId); requireUuid(input.idempotencyKey);
    if (!Number.isFinite(Date.parse(input.expectedUpdatedAt))) throw new Error("INVALID_EXPECTED_REWARD_VERSION");
    const payoutReference = input.payoutReference.trim();
    if (!payoutReference || payoutReference.length > 160) throw new Error("INVALID_PAYOUT_REFERENCE");
    const note = input.note?.trim().slice(0, 1000) || null;
    return this.repository.confirmPayout({ ...input, payoutReference, note });
  }

  private async findSale(saleLinkId: string) {
    const client = (await import("@/src/lib/supabase/admin")).createAdminClient();
    const { data, error } = await client.from("agent_sale_links").select("source_order_1c_ref").eq("id", saleLinkId).single();
    if (error || !data) throw new Error(`Agent sale link read failed: ${error?.code ?? "NOT_FOUND"}`);
    return { orderRef: data.source_order_1c_ref as string };
  }
}

function requireUuid(value: string) { if (!UUID.test(value)) throw new Error("INVALID_UUID"); }
function requireOneCGuid(value: string) { if (!ONEC_GUID.test(value)) throw new Error("INVALID_ONEC_GUID"); }
export function createAgentCommercialService() { return new AgentCommercialService(); }
