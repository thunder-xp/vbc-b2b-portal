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
  createdAt: "2026-09-13T00:00:00Z", updatedAt: "2026-09-13T00:00:00Z",
};

function detail(overrides: Partial<AgentDetail> = {}): AgentDetail {
  return { agent: AGENT, compliance: null, tokens: [], attributions: [], ...overrides };
}

function repository(agentDetail: AgentDetail | null = detail()): AgentDomainRepository {
  return {
    listAgents: vi.fn(async () => [AGENT]), getAgent: vi.fn(async () => agentDetail), findAgentByUser: vi.fn(async () => AGENT),
    createAgent: vi.fn(async () => AGENT), transitionAgent: vi.fn(async () => AGENT), reviewCompliance: vi.fn(async () => undefined),
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

  it("enforces lifecycle order and compliance before approval", async () => {
    const service = new AgentDomainService(repository(), identityService());
    await expect(service.transitionAgent(AGENT.id, "ACTIVE", AGENT.id)).rejects.toBeInstanceOf(AgentDomainValidationError);
    const contractPending = detail({ agent: { ...AGENT, status: "CONTRACT_PENDING" } });
    await expect(new AgentDomainService(repository(contractPending), identityService()).transitionAgent(AGENT.id, "APPROVED", AGENT.id)).rejects.toThrow("compliance");
  });

  it("creates an opaque token whose persisted form is only a hash", async () => {
    const repo = repository();
    const result = await new AgentDomainService(repo, identityService()).createReferralToken({ agentId: AGENT.id, actorUserId: AGENT.id });
    expect(result.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashReferralToken(result.rawToken)).toMatch(/^[0-9a-f]{64}$/);
    expect(repo.createToken).toHaveBeenCalledWith(expect.objectContaining({ tokenHash: hashReferralToken(result.rawToken) }));
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
