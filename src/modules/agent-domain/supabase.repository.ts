import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";

import type { AgentDomainRepository } from "./repository";
import type {
  AgentAttribution,
  AgentCompliance,
  AgentDetail,
  AgentReferral,
  AgentReferralToken,
  CommercialAgent,
  ExistingCustomerEvidence,
} from "./types";

export class SupabaseAgentDomainRepository implements AgentDomainRepository {
  async listAgents() {
    const { data, error } = await createAdminClient()
      .from("commercial_agents")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw repositoryError("list agents", error.code);
    return (data ?? []).map(mapAgent);
  }

  async getAgent(agentId: string): Promise<AgentDetail | null> {
    const admin = createAdminClient();
    const [agentResult, complianceResult, tokensResult, attributionResult] = await Promise.all([
      admin.from("commercial_agents").select("*").eq("id", agentId).maybeSingle(),
      admin.from("agent_compliance").select("*").eq("agent_id", agentId).maybeSingle(),
      admin.from("agent_referral_tokens").select("id,agent_id,token_type,status,campaign_ref,created_at,expires_at,revoked_at").eq("agent_id", agentId).order("created_at", { ascending: false }),
      admin.from("agent_attributions").select("*").eq("agent_id", agentId).order("valid_from", { ascending: false }).limit(100),
    ]);
    for (const result of [agentResult, complianceResult, tokensResult, attributionResult]) {
      if (result.error) throw repositoryError("get agent", result.error.code);
    }
    if (!agentResult.data) return null;
    const confirmedBy = nullableText(agentResult.data.contract_confirmed_by);
    let contractConfirmedByName: string | null = null;
    if (confirmedBy) {
      const { data: profile, error: profileError } = await admin
        .from("user_profiles")
        .select("full_name,email")
        .eq("id", confirmedBy)
        .maybeSingle();
      if (profileError) throw repositoryError("get contract confirmer", profileError.code);
      contractConfirmedByName = profile?.full_name || profile?.email || null;
    }
    return {
      agent: mapAgent(agentResult.data),
      contractConfirmedByName,
      compliance: complianceResult.data ? mapCompliance(complianceResult.data) : null,
      tokens: (tokensResult.data ?? []).map(mapToken),
      attributions: (attributionResult.data ?? []).map(mapAttribution),
    };
  }

  async findAgentByUser(userId: string) {
    const { data, error } = await createAdminClient()
      .from("commercial_agents")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw repositoryError("find agent user", error.code);
    return data ? mapAgent(data) : null;
  }

  async createAgent(input: Parameters<AgentDomainRepository["createAgent"]>[0]) {
    const { data, error } = await createAdminClient().rpc("create_commercial_agent_record", {
      p_actor_user_id: input.actorUserId,
      p_user_id: input.userId ?? null,
      p_agent_type: input.agentType,
      p_display_name: input.displayName,
      p_legal_name: input.legalName ?? null,
      p_idno_idnp: input.idnoIdnp ?? null,
      p_phone: input.phone ?? null,
      p_email: input.email ?? null,
      p_locality: input.locality ?? null,
      p_profession: input.profession ?? null,
      p_workplace: input.workplace ?? null,
    });
    if (error || !data) throw repositoryError("create agent", error?.code);
    return mapAgent(data);
  }

  async transitionAgent(agentId: string, targetStatus: Parameters<AgentDomainRepository["transitionAgent"]>[1], actorUserId: string) {
    const { data, error } = await createAdminClient().rpc("transition_commercial_agent_record", {
      p_agent_id: agentId,
      p_target_status: targetStatus,
      p_actor_user_id: actorUserId,
    });
    if (error || !data) throw repositoryError("transition agent", error?.code);
    return mapAgent(data);
  }

  async confirmContract(agentId: string, actorUserId: string) {
    const { data, error } = await createAdminClient().rpc("confirm_commercial_agent_contract", {
      p_agent_id: agentId,
      p_actor_user_id: actorUserId,
    });
    if (error || !data) throw repositoryError("confirm agent contract", error?.code);
    return mapAgent(data);
  }

  async reviewCompliance(input: Parameters<AgentDomainRepository["reviewCompliance"]>[0]) {
    const { error } = await createAdminClient().rpc("review_commercial_agent_compliance", {
      p_agent_id: input.agentId,
      p_actor_user_id: input.actorUserId,
      p_public_sector_flag: input.publicSectorFlag,
      p_external_paid_activity_status: input.externalPaidActivityStatus,
      p_procurement_participation_flag: input.procurementParticipationFlag,
      p_conflict_of_interest_status: input.conflictOfInterestStatus,
      p_review_status: input.reviewStatus,
      p_safe_review_note: input.safeReviewNote ?? null,
    });
    if (error) throw repositoryError("review agent compliance", error.code);
  }

  async createToken(input: Parameters<AgentDomainRepository["createToken"]>[0]) {
    const { data, error } = await createAdminClient().rpc("create_agent_referral_token_record", {
      p_agent_id: input.agentId,
      p_token_hash: input.tokenHash,
      p_token_type: input.tokenType,
      p_campaign_ref: input.campaignRef ?? null,
      p_expires_at: input.expiresAt ?? null,
      p_actor_user_id: input.actorUserId,
    });
    if (error || typeof data !== "string") throw repositoryError("create referral token", error?.code);
    return data;
  }

  async revokeToken(tokenId: string, actorUserId: string) {
    const { error } = await createAdminClient().rpc("revoke_agent_referral_token_record", {
      p_token_id: tokenId,
      p_actor_user_id: actorUserId,
    });
    if (error) throw repositoryError("revoke referral token", error.code);
  }

  async findValidToken(tokenHash: string) {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("agent_referral_tokens")
      .select("agent_id,expires_at")
      .eq("token_hash", tokenHash)
      .eq("status", "ACTIVE")
      .is("revoked_at", null)
      .maybeSingle();
    if (error) throw repositoryError("resolve referral token", error.code);
    if (!data || (data.expires_at && Date.parse(data.expires_at) <= Date.now())) return null;
    const { data: agent, error: agentError } = await admin
      .from("commercial_agents")
      .select("id")
      .eq("id", data.agent_id)
      .eq("status", "ACTIVE")
      .maybeSingle();
    if (agentError) throw repositoryError("resolve referral agent", agentError.code);
    return agent ? { agentId: agent.id } : null;
  }

  async createReferral(input: Parameters<AgentDomainRepository["createReferral"]>[0]) {
    const { data, error } = await createAdminClient().rpc("create_agent_referral_record", {
      p_token_hash: input.tokenHash,
      p_customer_identity_id: input.customerIdentityId,
      p_customer_kind: input.customerKind,
      p_name: input.name,
      p_phone: input.phone,
      p_email: input.email,
      p_locality: input.locality,
      p_object_type: input.objectType,
      p_need_summary: input.needSummary,
      p_short_description: input.shortDescription,
      p_project_timing: input.projectTiming,
      p_resolution_status: input.resolutionStatus,
      p_resolution_reason: input.resolutionReason,
      p_consent_text_version: input.consentTextVersion,
      p_consent_given_at: input.consentGivenAt,
    });
    if (error || typeof data !== "string") throw repositoryError("create referral", error?.code);
    return data;
  }

  async listReferrals() {
    const { data, error } = await createAdminClient()
      .from("agent_referrals")
      .select("*,commercial_agents(agent_code,display_name)")
      .order("submitted_at", { ascending: false })
      .limit(200);
    if (error) throw repositoryError("list referrals", error.code);
    return (data ?? []).map(mapReferral);
  }

  async getReferral(referralId: string) {
    const { data, error } = await createAdminClient()
      .from("agent_referrals")
      .select("*,commercial_agents(agent_code,display_name)")
      .eq("id", referralId)
      .maybeSingle();
    if (error) throw repositoryError("get referral", error.code);
    return data ? mapReferral(data) : null;
  }

  async transitionReferral(input: Parameters<AgentDomainRepository["transitionReferral"]>[0]) {
    const { data, error } = await createAdminClient().rpc("transition_agent_referral_record", {
      p_referral_id: input.referralId,
      p_target_status: input.targetStatus,
      p_actor_user_id: input.actorUserId,
      p_customer_identity_id: input.customerIdentityId ?? null,
      p_duplicate_reason: input.duplicateReason ?? null,
      p_existing_customer_reason: input.existingCustomerReason ?? null,
    });
    if (error || !data) throw repositoryError("transition referral", error?.code);
    return mapReferral(data);
  }

  async findActiveAttribution(customerIdentityId: string) {
    const { data, error } = await createAdminClient()
      .from("agent_attributions")
      .select("*")
      .eq("customer_identity_id", customerIdentityId)
      .eq("status", "ACTIVE")
      .is("ended_at", null)
      .maybeSingle();
    if (error) throw repositoryError("find active attribution", error.code);
    return data ? mapAttribution(data) : null;
  }

  async createAttribution(referralId: string, actorUserId: string) {
    const { data, error } = await createAdminClient().rpc("create_agent_attribution_record", {
      p_referral_id: referralId,
      p_actor_user_id: actorUserId,
    });
    if (error || !data) throw repositoryError("create attribution", error?.code);
    return mapAttribution(data);
  }

  async detectExistingCustomerRelationship(customerIdentityId: string): Promise<ExistingCustomerEvidence> {
    const admin = createAdminClient();
    const [partnerResult, retailResult] = await Promise.all([
      admin.from("partner_final_customers").select("id").eq("customer_identity_id", customerIdentityId),
      admin.from("retail_customers").select("id").eq("customer_identity_id", customerIdentityId),
    ]);
    if (partnerResult.error || retailResult.error) {
      throw repositoryError("resolve customer contexts", partnerResult.error?.code ?? retailResult.error?.code);
    }
    const partnerIds = (partnerResult.data ?? []).map((row) => row.id);
    const retailIds = (retailResult.data ?? []).map((row) => row.id);
    const [estimateResult, orderResult] = await Promise.all([
      partnerIds.length
        ? admin.from("estimates").select("id", { count: "exact", head: true }).in("final_customer_id", partnerIds).in("lifecycle_status", ["sent", "accepted"])
        : Promise.resolve({ count: 0, error: null }),
      retailIds.length
        ? admin.from("retail_orders").select("id", { count: "exact", head: true }).in("customer_id", retailIds)
        : Promise.resolve({ count: 0, error: null }),
    ]);
    if (estimateResult.error || orderResult.error) {
      throw repositoryError("resolve customer relationship", estimateResult.error?.code ?? orderResult.error?.code);
    }
    const activeNegotiationCount = estimateResult.count ?? 0;
    const retailOrderCount = orderResult.count ?? 0;
    const reasons: ExistingCustomerEvidence["reasons"] = [
      ...(activeNegotiationCount > 0 ? ["ACTIVE_NEGOTIATION" as const] : []),
      ...(retailOrderCount > 0 ? ["RETAIL_ORDER" as const] : []),
    ];
    return {
      activeNegotiationCount,
      retailOrderCount,
      hasActiveRelationship: reasons.length > 0,
      reasons,
    };
  }
}

type DatabaseRow = Record<string, unknown>;

function mapAgent(row: DatabaseRow): CommercialAgent {
  return {
    id: text(row.id),
    userId: nullableText(row.user_id),
    sourceAgent1cId: nullableText(row.source_agent_1c_id),
    agentCode: text(row.agent_code),
    agentType: row.agent_type as CommercialAgent["agentType"],
    displayName: text(row.display_name),
    legalName: nullableText(row.legal_name),
    idnoIdnp: nullableText(row.idno_idnp),
    phone: nullableText(row.phone),
    email: nullableText(row.email),
    locality: nullableText(row.locality),
    profession: nullableText(row.profession),
    workplace: nullableText(row.workplace),
    status: row.status as CommercialAgent["status"],
    complianceStatus: row.compliance_status as CommercialAgent["complianceStatus"],
    level: row.level as CommercialAgent["level"],
    contractReady: Boolean(row.contract_ready),
    contractConfirmedAt: nullableText(row.contract_confirmed_at),
    contractConfirmedBy: nullableText(row.contract_confirmed_by),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

function mapCompliance(row: DatabaseRow): AgentCompliance {
  return {
    agentId: text(row.agent_id),
    publicSectorFlag: nullableBoolean(row.public_sector_flag),
    externalPaidActivityStatus: row.external_paid_activity_status as AgentCompliance["externalPaidActivityStatus"],
    procurementParticipationFlag: nullableBoolean(row.procurement_participation_flag),
    conflictOfInterestStatus: row.conflict_of_interest_status as AgentCompliance["conflictOfInterestStatus"],
    complianceReviewStatus: row.compliance_review_status as AgentCompliance["complianceReviewStatus"],
    reviewedBy: nullableText(row.reviewed_by),
    reviewedAt: nullableText(row.reviewed_at),
    safeReviewNote: nullableText(row.safe_review_note),
  };
}

function mapToken(row: DatabaseRow): AgentReferralToken {
  return {
    id: text(row.id),
    agentId: text(row.agent_id),
    tokenType: row.token_type as AgentReferralToken["tokenType"],
    status: row.status as AgentReferralToken["status"],
    campaignRef: nullableText(row.campaign_ref),
    createdAt: text(row.created_at),
    expiresAt: nullableText(row.expires_at),
    revokedAt: nullableText(row.revoked_at),
  };
}

function mapReferral(row: DatabaseRow): AgentReferral {
  const rawAgent = Array.isArray(row.commercial_agents) ? row.commercial_agents[0] : row.commercial_agents;
  const agent = rawAgent && typeof rawAgent === "object" ? rawAgent as DatabaseRow : null;
  return {
    id: text(row.id),
    agentId: text(row.agent_id),
    agentCode: agent ? text(agent.agent_code) : undefined,
    agentDisplayName: agent ? text(agent.display_name) : undefined,
    customerIdentityId: nullableText(row.customer_identity_id),
    submittedAt: text(row.submitted_at),
    customerKind: row.customer_kind as AgentReferral["customerKind"],
    name: text(row.name_snapshot),
    phone: nullableText(row.phone_snapshot),
    email: nullableText(row.email_snapshot),
    locality: nullableText(row.locality),
    objectType: nullableText(row.object_type),
    needSummary: text(row.need_summary),
    shortDescription: nullableText(row.short_description),
    projectTiming: nullableText(row.project_timing),
    status: row.status as AgentReferral["status"],
    identityResolutionStatus: row.identity_resolution_status as AgentReferral["identityResolutionStatus"],
    identityResolutionReason: text(row.identity_resolution_reason),
    duplicateReason: nullableText(row.duplicate_reason),
    existingCustomerReason: nullableText(row.existing_customer_reason),
    reviewedAt: nullableText(row.reviewed_at),
  };
}

function mapAttribution(row: DatabaseRow): AgentAttribution {
  return {
    id: text(row.id),
    customerIdentityId: text(row.customer_identity_id),
    agentId: text(row.agent_id),
    referralId: text(row.referral_id),
    validFrom: text(row.valid_from),
    validUntil: nullableText(row.valid_until),
    status: row.status as AgentAttribution["status"],
    protectionUntil: text(row.protection_until),
    extendedUntil: nullableText(row.extended_until),
    supersedesAttributionId: nullableText(row.supersedes_attribution_id),
  };
}

function text(value: unknown): string {
  return String(value ?? "");
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function nullableBoolean(value: unknown): boolean | null {
  return value === null || value === undefined ? null : Boolean(value);
}

function repositoryError(operation: string, code?: string) {
  return new Error(`Agent repository ${operation} failed: ${code ?? "UNKNOWN"}`);
}
