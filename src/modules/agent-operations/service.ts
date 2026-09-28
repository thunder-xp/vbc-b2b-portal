import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { OneCAgentOperationsProvider } from "./one-c-agent-operations.provider";
import { AgentOperationsRepository } from "./repository";
import type { OperationsFilters } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class AgentOperationsService {
  constructor(
    private readonly repository = new AgentOperationsRepository(),
    private readonly oneC = new OneCAgentOperationsProvider(),
  ) {}

  async list(filters: OperationsFilters = {}) {
    const search = filters.search?.trim().toLocaleLowerCase("ru") ?? "";
    return (await this.repository.list()).filter((item) =>
      (!search || [item.agentCode, item.displayName, item.email ?? ""].some((value) => value.toLocaleLowerCase("ru").includes(search)))
      && (!filters.status || item.status === filters.status)
      && (!filters.compliance || item.complianceStatus === filters.compliance)
      && (!filters.auth || (filters.auth === "READY" ? item.auth.quickAuthReady : filters.auth === "LINKED" ? item.auth.linked : !item.auth.linked))
      && (!filters.oneC || (filters.oneC === "LINKED" ? item.counterpartyLinked : !item.counterpartyLinked))
      && (!filters.contract || item.contractState === filters.contract)
      && (!filters.project || item.projectState === filters.project)
    );
  }

  detail(agentId: string, counterpartySearch = "") { requireUuid(agentId); return this.repository.detail(agentId, counterpartySearch); }

  async bindCounterparty(agentId: string, reference: string, actorUserId: string) {
    const agent = await this.identity(agentId);
    if (agent.source_agent_1c_id) throw new Error("COUNTERPARTY_ALREADY_BOUND");
    const candidate = await this.oneC.verifyCounterparty(reference, String(agent.agent_code));
    requireHealthyCandidate(candidate);
    const result = await this.repository.linkCounterparty(agentId, candidate, actorUserId);
    await this.repository.verifyCounterparty(agentId, candidate, actorUserId);
    return result;
  }

  async verifyCounterparty(agentId: string, actorUserId: string) {
    const agent = await this.identity(agentId);
    if (!agent.source_agent_1c_id) throw new Error("COUNTERPARTY_NOT_BOUND");
    const candidate = await this.oneC.verifyCounterparty(String(agent.source_agent_1c_id), String(agent.agent_code));
    await this.repository.verifyCounterparty(agentId, candidate, actorUserId);
    return candidate;
  }

  async contractCandidates(agentId: string) {
    const agent = await this.identity(agentId);
    if (!agent.source_agent_1c_id) throw new Error("COUNTERPARTY_NOT_BOUND");
    return this.oneC.listContracts(String(agent.source_agent_1c_id), String(agent.agent_code));
  }

  async bindContract(agentId: string, reference: string, actorUserId: string, reason: string | null) {
    const agent = await this.identity(agentId);
    if (!agent.source_agent_1c_id) throw new Error("COUNTERPARTY_NOT_BOUND");
    const candidate = await this.oneC.verifyContract(reference, String(agent.source_agent_1c_id), String(agent.agent_code));
    requireHealthyCandidate(candidate);
    if (!candidate.contractType) throw new Error("CONTRACT_TYPE_NOT_PROVEN");
    return this.repository.bindContract(agentId, candidate, actorUserId, normalizedReason(reason));
  }

  async projectCandidates(agentId: string) {
    const identity = await this.identity(agentId);
    const detail = await this.repository.detail(agentId);
    const contract = detail.contracts.find((item) => item.isCurrent && item.codeState === "MATCH");
    if (!identity.source_agent_1c_id || !contract) throw new Error("VERIFIED_CONTRACT_REQUIRED");
    return this.oneC.listProjects(String(identity.source_agent_1c_id), contract.reference, String(identity.agent_code));
  }

  async bindProject(agentId: string, reference: string, actorUserId: string, reason: string | null) {
    const identity = await this.identity(agentId);
    const detail = await this.repository.detail(agentId);
    const contract = detail.contracts.find((item) => item.isCurrent && item.codeState === "MATCH");
    if (!identity.source_agent_1c_id || !contract) throw new Error("VERIFIED_CONTRACT_REQUIRED");
    const candidate = await this.oneC.verifyProject(reference, String(identity.source_agent_1c_id), contract.reference, String(identity.agent_code));
    requireHealthyCandidate(candidate);
    if (candidate.codeEvidence === "NONE") throw new Error("PROJECT_AGENT_CODE_NOT_PROVEN");
    return this.repository.bindProject(agentId, candidate, actorUserId, normalizedReason(reason));
  }

  async requestPasswordReset(agentId: string, actorUserId: string) {
    const agent = await this.identity(agentId);
    if (!agent.user_id) throw new Error("AGENT_AUTH_NOT_LINKED");
    const userResult = await createAdminClient().auth.admin.getUserById(String(agent.user_id));
    const user = userResult.data.user;
    if (userResult.error || !user?.email || !user.email_confirmed_at) throw new Error("AGENT_AUTH_EMAIL_NOT_READY");
    const { error } = await createAdminClient().auth.resetPasswordForEmail(user.email, { redirectTo: passwordRecoveryRedirectUrl() });
    if (error) throw new Error("PASSWORD_RECOVERY_SEND_FAILED");
    await this.repository.recordPasswordReset(agentId, actorUserId);
  }

  private async identity(agentId: string) { requireUuid(agentId); return this.repository.agentIdentity(agentId); }
}

function requireHealthyCandidate(candidate: { active: boolean; deleted: boolean; codeState: string }) {
  if (!candidate.active || candidate.deleted) throw new Error("ONEC_ENTITY_INACTIVE");
  if (candidate.codeState === "MISSING") throw new Error("MISSING_AGENT_CODE");
  if (candidate.codeState !== "MATCH") throw new Error("AGENT_CODE_MISMATCH");
}
function requireUuid(value: string) { if (!UUID.test(value)) throw new Error("INVALID_AGENT_ID"); }
function normalizedReason(reason: string | null) { const value = reason?.trim() || null; if (value && (value.length < 3 || value.length > 1000)) throw new Error("INVALID_SUPERSESSION_REASON"); return value; }
function passwordRecoveryRedirectUrl() { const configured = process.env.PUBLIC_APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://www.nsd.md"; const origin = new URL(/^https?:\/\//i.test(configured) ? configured : `https://${configured}`); if (process.env.NODE_ENV === "production" && origin.protocol !== "https:") throw new Error("INVALID_RECOVERY_ORIGIN"); return new URL("/auth/password-recovery/confirm", origin).toString(); }
