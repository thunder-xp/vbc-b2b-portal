import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";
import type { AgentContractCandidate, AgentOperationsDetail, AgentOperationsListItem, AgentProjectCandidate, CounterpartyCandidate } from "./types";

export class AgentOperationsRepository {
  async list(): Promise<AgentOperationsListItem[]> {
    const client = createAdminClient();
    const [agents, bindings, contracts, projects, sales, rewards, users] = await Promise.all([
      client.from("commercial_agents").select("id,user_id,agent_code,display_name,email,phone,status,compliance_status,contract_ready").order("created_at", { ascending: false }).limit(100),
      client.from("agent_1c_bindings").select("agent_id,agent_code_state,verified_at"),
      client.from("agent_1c_contract_bindings").select("agent_id,agent_code_state,verified_at").eq("is_current", true),
      client.from("agent_1c_project_bindings").select("agent_id,agent_code_state,verified_at").eq("is_current", true),
      client.from("agent_sale_links").select("agent_id"),
      client.from("agent_reward_projections").select("state,agent_sale_links!inner(agent_id)"),
      client.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    for (const result of [agents, bindings, contracts, projects, sales, rewards]) if (result.error) throw new Error(`AGENT_OPERATIONS_READ_${result.error.code}`);
    if (users.error) throw new Error("AGENT_AUTH_DIRECTORY_READ_FAILED");
    const bindingByAgent = byAgent(bindings.data ?? []);
    const contractByAgent = byAgent(contracts.data ?? []);
    const projectByAgent = byAgent(projects.data ?? []);
    const saleAgents = new Set((sales.data ?? []).map((row) => String(row.agent_id)));
    const rewardByAgent = new Map<string, string[]>();
    for (const row of rewards.data ?? []) {
      const link = relation(row.agent_sale_links); const agentId = link?.agent_id ? String(link.agent_id) : null;
      if (agentId) rewardByAgent.set(agentId, [...(rewardByAgent.get(agentId) ?? []), String(row.state)]);
    }
    const authById = new Map(users.data.users.map((user) => [user.id, user]));
    return (agents.data ?? []).map((row) => {
      const user = row.user_id ? authById.get(String(row.user_id)) : null;
      const auth = authState(user ?? null, String(row.phone ?? ""), String(row.status));
      const binding = bindingByAgent.get(String(row.id));
      const contract = contractByAgent.get(String(row.id));
      const project = projectByAgent.get(String(row.id));
      const rewardStates = rewardByAgent.get(String(row.id)) ?? [];
      const economicState = rewardStates.includes("PAID") ? "PAID" : rewardStates.some((state) => ["APPROVED", "READY_FOR_PAYOUT"].includes(state)) ? "APPROVED" : saleAgents.has(String(row.id)) ? "PROJECTION" : "NONE";
      const verified = [binding?.verified_at, contract?.verified_at, project?.verified_at].filter(Boolean).map(String).sort().at(-1) ?? null;
      return {
        id: String(row.id), agentCode: String(row.agent_code), displayName: String(row.display_name), email: row.email ? String(row.email) : null,
        status: String(row.status), complianceStatus: String(row.compliance_status), auth,
        counterpartyLinked: Boolean(binding), counterpartyCodeState: state(binding?.agent_code_state),
        contractState: contract ? state(contract.agent_code_state) === "MATCH" ? "VERIFIED" : "MISMATCH" : row.contract_ready ? "LEGACY" : "MISSING",
        projectState: project ? state(project.agent_code_state) === "MATCH" ? "VERIFIED" : "MISMATCH" : "MISSING",
        economicState, lastVerifiedAt: verified,
      } as AgentOperationsListItem;
    });
  }

  async detail(agentId: string, counterpartySearch = ""): Promise<AgentOperationsDetail> {
    const client = createAdminClient();
    const [agent, binding, contracts, projects, events, authUser, counterparties] = await Promise.all([
      client.from("commercial_agents").select("user_id,phone,status").eq("id", agentId).single(),
      client.from("agent_1c_bindings").select("*").eq("agent_id", agentId).maybeSingle(),
      client.from("agent_1c_contract_bindings").select("*").eq("agent_id", agentId).order("linked_at", { ascending: false }).limit(20),
      client.from("agent_1c_project_bindings").select("*").eq("agent_id", agentId).order("linked_at", { ascending: false }).limit(20),
      client.from("agent_domain_events").select("id,event_type,created_at,safe_metadata").eq("agent_id", agentId).order("created_at", { ascending: false }).limit(100),
      this.authUserForAgent(agentId),
      this.searchCounterparties(counterpartySearch),
    ]);
    for (const result of [agent, binding, contracts, projects, events]) if (result.error) throw new Error(`AGENT_OPERATIONS_DETAIL_${result.error.code}`);
    if (!agent.data) throw new Error("AGENT_OPERATIONS_DETAIL_NOT_FOUND");
    return {
      auth: authState(authUser, String(agent.data.phone ?? ""), String(agent.data.status)),
      counterparty: binding.data ? {
        reference: String(binding.data.source_agent_1c_id), externalCode: String(binding.data.source_external_code),
        fiscalCode: binding.data.source_fiscal_code ? String(binding.data.source_fiscal_code) : null,
        name: String(binding.data.source_name_snapshot), sourceAgentCode: binding.data.source_agent_code_snapshot ? String(binding.data.source_agent_code_snapshot) : null,
        codeState: state(binding.data.agent_code_state), linkedAt: String(binding.data.linked_at),
        verifiedAt: binding.data.verified_at ? String(binding.data.verified_at) : null,
        observedAt: binding.data.source_observed_at ? String(binding.data.source_observed_at) : null,
        lastError: binding.data.last_verification_error ? String(binding.data.last_verification_error) : null,
      } : null,
      contracts: (contracts.data ?? []).map((row) => ({
        id: String(row.id), reference: String(row.source_contract_1c_ref), counterpartyRef: String(row.source_counterparty_1c_ref),
        number: row.source_contract_number_snapshot ? String(row.source_contract_number_snapshot) : null,
        name: String(row.source_contract_name_snapshot), contractType: String(row.source_contract_type_snapshot),
        signed: typeof row.source_contract_signed_snapshot === "boolean" ? row.source_contract_signed_snapshot : null,
        sourceAgentCode: row.source_agent_code_snapshot ? String(row.source_agent_code_snapshot) : null,
        codeState: state(row.agent_code_state), isCurrent: Boolean(row.is_current), linkedAt: String(row.linked_at),
        verifiedAt: row.verified_at ? String(row.verified_at) : null,
      })),
      projects: (projects.data ?? []).map((row) => ({
        id: String(row.id), reference: String(row.source_project_1c_ref), code: row.source_project_code_snapshot ? String(row.source_project_code_snapshot) : null,
        name: String(row.source_project_name_snapshot), counterpartyRef: String(row.source_counterparty_1c_ref), contractRef: String(row.source_contract_1c_ref),
        sourceAgentCode: row.source_agent_code_snapshot ? String(row.source_agent_code_snapshot) : null,
        codeState: state(row.agent_code_state), codeEvidence: row.agent_code_evidence as "CUSTOM_PROPERTY" | "STRUCTURED_NAME" | "NONE",
        isCurrent: Boolean(row.is_current), linkedAt: String(row.linked_at), verifiedAt: row.verified_at ? String(row.verified_at) : null,
      })),
      events: (events.data ?? []).map((row) => ({ id: String(row.id), type: String(row.event_type), createdAt: String(row.created_at), metadata: isRecord(row.safe_metadata) ? row.safe_metadata : {} })),
      counterparties,
    };
  }

  async bindContract(agentId: string, candidate: AgentContractCandidate, actorUserId: string, reason: string | null) {
    return this.rpc("bind_agent_1c_contract_record", {
      p_agent_id: agentId, p_source_contract_1c_ref: candidate.reference, p_source_counterparty_1c_ref: candidate.counterpartyRef,
      p_source_contract_number: candidate.number, p_source_contract_name: candidate.name, p_source_contract_type: candidate.contractType,
      p_source_contract_date: candidate.contractDate, p_source_contract_valid_until: candidate.validUntil,
      p_source_contract_signed: candidate.signed, p_source_agent_code: candidate.sourceAgentCode,
      p_source_observed_at: candidate.observedAt, p_actor_user_id: actorUserId, p_supersession_reason: reason,
    });
  }

  async linkCounterparty(agentId: string, candidate: Awaited<ReturnType<import("./one-c-agent-operations.provider").OneCAgentOperationsProvider["verifyCounterparty"]>>, actorUserId: string) {
    return this.rpc("link_commercial_agent_1c_record", {
      p_agent_id: agentId, p_source_agent_1c_id: candidate.reference,
      p_source_external_code: candidate.externalCode, p_source_fiscal_code: candidate.fiscalCode,
      p_source_name_snapshot: candidate.name, p_actor_user_id: actorUserId,
    });
  }

  async bindProject(agentId: string, candidate: AgentProjectCandidate, actorUserId: string, reason: string | null) {
    return this.rpc("bind_agent_1c_project_record", {
      p_agent_id: agentId, p_source_project_1c_ref: candidate.reference, p_source_project_name: candidate.name,
      p_source_project_code: candidate.code, p_source_counterparty_1c_ref: candidate.counterpartyRef,
      p_source_contract_1c_ref: candidate.contractRef, p_source_start_date: candidate.startDate, p_source_end_date: candidate.endDate,
      p_source_agent_code: candidate.sourceAgentCode, p_agent_code_evidence: candidate.codeEvidence,
      p_source_observed_at: candidate.observedAt, p_actor_user_id: actorUserId, p_supersession_reason: reason,
    });
  }

  async verifyCounterparty(agentId: string, candidate: Awaited<ReturnType<import("./one-c-agent-operations.provider").OneCAgentOperationsProvider["verifyCounterparty"]>>, actorUserId: string) {
    return this.rpc("verify_agent_1c_binding_record", {
      p_agent_id: agentId, p_source_agent_1c_id: candidate.reference, p_source_external_code: candidate.externalCode,
      p_source_fiscal_code: candidate.fiscalCode, p_source_name_snapshot: candidate.name, p_source_agent_code: candidate.sourceAgentCode,
      p_agent_code_state: candidate.codeState, p_source_observed_at: candidate.observedAt, p_actor_user_id: actorUserId, p_safe_error: null,
    });
  }

  async recordPasswordReset(agentId: string, actorUserId: string) { return this.rpc("record_agent_auth_password_reset_requested", { p_agent_id: agentId, p_actor_user_id: actorUserId }); }

  async agentIdentity(agentId: string) {
    const { data, error } = await createAdminClient().from("commercial_agents").select("id,user_id,agent_code,email,status,source_agent_1c_id").eq("id", agentId).single();
    if (error) throw new Error(`AGENT_IDENTITY_${error.code}`); return data;
  }

  private async authUserForAgent(agentId: string) {
    const { data: agent, error } = await createAdminClient().from("commercial_agents").select("user_id").eq("id", agentId).single();
    if (error || !agent.user_id) return null;
    const result = await createAdminClient().auth.admin.getUserById(String(agent.user_id));
    if (result.error) throw new Error("AGENT_AUTH_READ_FAILED"); return result.data.user;
  }

  private async searchCounterparties(search: string): Promise<CounterpartyCandidate[]> {
    const term = search.trim().slice(0, 100); if (!term) return [];
    const escaped = term.replaceAll("%", "\\%").replaceAll("_", "\\_").replaceAll(",", "");
    const { data, error } = await createAdminClient().from("one_c_counterparties")
      .select("external_1c_id,external_code,name,fiscal_code,is_active,is_deleted")
      .eq("is_published", true).or(`external_1c_id.eq.${term},external_code.ilike.%${escaped}%,name.ilike.%${escaped}%,fiscal_code.ilike.%${escaped}%`)
      .order("name").limit(20);
    if (error) throw new Error(`COUNTERPARTY_SEARCH_${error.code}`);
    return (data ?? []).map((row) => ({ reference: String(row.external_1c_id).toLowerCase(), externalCode: row.external_code ? String(row.external_code) : null, name: String(row.name), fiscalCode: row.fiscal_code ? String(row.fiscal_code) : null, active: Boolean(row.is_active), deleted: Boolean(row.is_deleted) }));
  }

  private async rpc(operation: string, input: Record<string, unknown>) { const { data, error } = await createAdminClient().rpc(operation, input); if (error) throw new Error(`${operation}:${error.code}`); return data; }
}

function byAgent(rows: Array<Record<string, unknown>>) { return new Map(rows.map((row) => [String(row.agent_id), row])); }
function relation(value: unknown): Record<string, unknown> | null { if (Array.isArray(value)) return relation(value[0]); return isRecord(value) ? value : null; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function state(value: unknown): "MATCH" | "MISSING" | "MISMATCH" | "NOT_VERIFIED" { return ["MATCH", "MISSING", "MISMATCH", "NOT_VERIFIED"].includes(String(value)) ? String(value) as "MATCH" | "MISSING" | "MISMATCH" | "NOT_VERIFIED" : "NOT_VERIFIED"; }
function normalizedPhone(value: string | null | undefined) { return value?.replace(/\D/g, "") || null; }
function authState(user: { email?: string; email_confirmed_at?: string; phone?: string; phone_confirmed_at?: string; last_sign_in_at?: string } | null, profilePhone: string, status: string) {
  const phoneConfirmed = Boolean(user?.phone && user.phone_confirmed_at);
  return { linked: Boolean(user), email: user?.email ?? null, emailConfirmed: Boolean(user?.email_confirmed_at), phoneConfirmed, quickAuthReady: status === "ACTIVE" && phoneConfirmed && normalizedPhone(user?.phone) === normalizedPhone(profilePhone), lastSignInAt: user?.last_sign_in_at ?? null };
}
