import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CustomerIdentityRepository } from "../../customer-identity/repository";
import { CustomerIdentityResolutionService } from "../../customer-identity/service";
import type { AgentDomainRepository } from "../repository";
import { AgentDomainService, AgentDomainValidationError, hashReferralToken } from "../service";
import type { AgentDetail, CommercialAgent } from "../types";

const AGENT: CommercialAgent = {
  id: "00000000-0000-4000-8000-000000000001", userId: null, sourceAgent1cId: null,
  agentCode: "MD-P-001", agentType: "INDIVIDUAL", displayName: "Test Agent", legalName: null,
  idnoIdnp: null, phone: null, email: null, locality: null, profession: null, workplace: null,
  status: "APPLIED", complianceStatus: "UNREVIEWED", level: "START", contractReady: false,
  contractConfirmedAt: null, contractConfirmedBy: null,
  createdAt: "2026-09-13T00:00:00Z", updatedAt: "2026-09-13T00:00:00Z",
};

function detail(overrides: Partial<AgentDetail> = {}): AgentDetail {
  return { agent: AGENT, contractConfirmedByName: null, compliance: null, tokens: [], attributions: [], ...overrides };
}

function repository(agentDetail: AgentDetail | null = detail()): AgentDomainRepository {
  return {
    listAgents: vi.fn(async () => [AGENT]), getAgent: vi.fn(async () => agentDetail), findAgentByUser: vi.fn(async () => AGENT),
    createAgent: vi.fn(async () => AGENT), transitionAgent: vi.fn(async () => AGENT), confirmContract: vi.fn(async () => ({ ...AGENT, contractReady: true })), reviewCompliance: vi.fn(async () => undefined),
    createToken: vi.fn(async () => "00000000-0000-4000-8000-000000000002"), revokeToken: vi.fn(async () => undefined),
    findValidToken: vi.fn(async () => ({ agentId: AGENT.id })), createReferral: vi.fn(async () => "00000000-0000-4000-8000-000000000003"),
    listReferrals: vi.fn(async () => []), getReferral: vi.fn(async () => null), transitionReferral: vi.fn(async () => { throw new Error("unused"); }),
    findActiveAttribution: vi.fn(async () => null), createAttribution: vi.fn(async () => { throw new Error("unused"); }),
    detectExistingCustomerRelationship: vi.fn(async () => ({ activeNegotiationCount: 0, retailOrderCount: 0, hasActiveRelationship: false, reasons: [] })),
  };
}

function identityService() {
  const repo: CustomerIdentityRepository = {
    findKeyMatches: vi.fn(async () => []), findExternalRef: vi.fn(async () => null),
    createIdentity: vi.fn(async () => "00000000-0000-4000-8000-000000000009"), recordReconciliation: vi.fn(async () => undefined),
  };
  return new CustomerIdentityResolutionService(repo);
}

describe("AgentDomainService", () => {
  beforeEach(() => vi.stubEnv("CUSTOMER_IDENTITY_HMAC_SECRET", "customer-identity-test-secret-at-least-32-bytes"));

  it("enforces lifecycle order plus compliance and contract prerequisites", async () => {
    const service = new AgentDomainService(repository(), identityService());
    await expect(service.transitionAgent(AGENT.id, "ACTIVE", AGENT.id)).rejects.toBeInstanceOf(AgentDomainValidationError);
    const noCompliance = detail({ agent: { ...AGENT, status: "CONTRACT_PENDING" } });
    await expect(new AgentDomainService(repository(noCompliance), identityService()).transitionAgent(AGENT.id, "APPROVED", AGENT.id)).rejects.toThrow("compliance");
    const noContract = detail({ agent: { ...AGENT, status: "CONTRACT_PENDING", complianceStatus: "APPROVED" } });
    await expect(new AgentDomainService(repository(noContract), identityService()).transitionAgent(AGENT.id, "APPROVED", AGENT.id)).rejects.toThrow("договора");
    const ready = detail({ agent: { ...AGENT, status: "CONTRACT_PENDING", complianceStatus: "APPROVED", contractReady: true } });
    const repo = repository(ready);
    await expect(new AgentDomainService(repo, identityService()).transitionAgent(AGENT.id, "APPROVED", AGENT.id)).resolves.toBe(AGENT);
    expect(repo.transitionAgent).toHaveBeenCalledWith(AGENT.id, "APPROVED", AGENT.id);
  });

  it("requires approved compliance and records contract confirmation through the repository", async () => {
    await expect(new AgentDomainService(repository(), identityService()).confirmCommercialAgentContract(AGENT.id, AGENT.id)).rejects.toThrow("compliance");
    const approved = detail({ agent: { ...AGENT, complianceStatus: "APPROVED" } });
    const repo = repository(approved);
    await new AgentDomainService(repo, identityService()).confirmCommercialAgentContract(AGENT.id, AGENT.id);
    expect(repo.confirmContract).toHaveBeenCalledWith(AGENT.id, AGENT.id);
  });

  it("rejects ACTIVE when either contract or compliance readiness is missing", async () => {
    const missingContract = detail({ agent: { ...AGENT, status: "APPROVED", complianceStatus: "APPROVED", contractReady: false } });
    await expect(new AgentDomainService(repository(missingContract), identityService()).transitionAgent(AGENT.id, "ACTIVE", AGENT.id)).rejects.toThrow("договора");

    const missingCompliance = detail({ agent: { ...AGENT, status: "APPROVED", complianceStatus: "PENDING", contractReady: true } });
    await expect(new AgentDomainService(repository(missingCompliance), identityService()).transitionAgent(AGENT.id, "ACTIVE", AGENT.id)).rejects.toThrow("compliance");
  });

  it("creates an opaque token whose persisted form is only a hash", async () => {
    const repo = repository(detail({ agent: { ...AGENT, status: "ACTIVE", complianceStatus: "APPROVED", contractReady: true } }));
    const result = await new AgentDomainService(repo, identityService()).createReferralToken({ agentId: AGENT.id, actorUserId: AGENT.id });
    expect(result.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashReferralToken(result.rawToken)).toMatch(/^[0-9a-f]{64}$/);
    expect(repo.createToken).toHaveBeenCalledWith(expect.objectContaining({ tokenHash: hashReferralToken(result.rawToken) }));
  });

  it("rejects creation of a referral token before activation", async () => {
    const repo = repository(detail({ agent: { ...AGENT, status: "APPROVED", complianceStatus: "APPROVED", contractReady: true } }));
    await expect(new AgentDomainService(repo, identityService()).createReferralToken({ agentId: AGENT.id, actorUserId: AGENT.id })).rejects.toThrow("активному агенту");
    expect(repo.createToken).not.toHaveBeenCalled();
  });

  it("rejects a tampered link and captures consented minimal referral against shared identity", async () => {
    const repo = repository();
    const service = new AgentDomainService(repo, identityService());
    await expect(service.captureReferral({ rawToken: "tampered", customerKind: "PERSON", name: "Client", phone: "+37369123456", needSummary: "CCTV", consent: true })).rejects.toBeInstanceOf(AgentDomainValidationError);
    const token = "a".repeat(43);
    await expect(service.captureReferral({ rawToken: token, customerKind: "PERSON", name: "Client", phone: "+37369123456", needSummary: "CCTV", consent: true })).resolves.toMatchObject({ resolutionStatus: "NEW" });
    expect(repo.createReferral).toHaveBeenCalledWith(expect.objectContaining({ customerIdentityId: "00000000-0000-4000-8000-000000000009", consentTextVersion: "agent-referral-v1" }));
  });
});
