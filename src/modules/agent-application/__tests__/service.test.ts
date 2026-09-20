import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentDomainService } from "@/src/modules/agent-domain/service";

import type { CommercialAgentApplicationRepository } from "../repository";
import { CommercialAgentApplicationService, CommercialAgentApplicationValidationError } from "../service";
import type { CommercialAgentApplication } from "../types";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "22222222-2222-4222-8222-222222222222";
const APPLICATION_ID = "33333333-3333-4333-8333-333333333333";

describe("CommercialAgentApplicationService", () => {
  let repository: CommercialAgentApplicationRepository;
  let agentService: Pick<AgentDomainService, "getAgentWorkspace">;
  let service: CommercialAgentApplicationService;

  beforeEach(() => {
    repository = {
      findByApplicant: vi.fn(),
      ensureDraft: vi.fn().mockResolvedValue(application()),
      submit: vi.fn().mockResolvedValue(application({ status: "SUBMITTED" })),
      withdraw: vi.fn().mockResolvedValue(application({ status: "WITHDRAWN" })),
      listForAdmin: vi.fn().mockResolvedValue([]),
      getForAdmin: vi.fn().mockResolvedValue(application()),
      review: vi.fn().mockResolvedValue(application({ status: "APPROVED", provisionedAgentId: "44444444-4444-4444-8444-444444444444" })),
    };
    agentService = { getAgentWorkspace: vi.fn().mockResolvedValue(null) };
    service = new CommercialAgentApplicationService(repository, agentService as AgentDomainService);
  });

  it("creates or reuses one draft for an authenticated applicant", async () => {
    await expect(service.getOrCreateApplicantWorkspace(USER_ID, "agent@example.com"))
      .resolves.toEqual({ application: application(), existingAgent: null });
    expect(repository.ensureDraft).toHaveBeenCalledWith(USER_ID, "agent@example.com");
  });

  it("does not create an application when an operational Agent already exists", async () => {
    vi.mocked(agentService.getAgentWorkspace).mockResolvedValue({ id: "agent-1" } as never);
    const result = await service.getOrCreateApplicantWorkspace(USER_ID, "agent@example.com");
    expect(result.existingAgent).toEqual({ id: "agent-1" });
    expect(repository.ensureDraft).not.toHaveBeenCalled();
  });

  it("submits normalized applicant data without operational or compliance fields", async () => {
    await service.submit(USER_ID, "identity@example.com", {
      displayName: "  Agent Name  ", agentType: "INDIVIDUAL", phone: " +37360000000 ",
      email: "", locality: " Chișinău ", profession: " Consultant ", workplace: " Office ",
    });
    expect(repository.submit).toHaveBeenCalledWith(USER_ID, {
      displayName: "Agent Name", agentType: "INDIVIDUAL", legalName: null,
      phone: "+37360000000", email: "identity@example.com", locality: "Chișinău",
      profession: "Consultant", workplace: "Office",
    });
  });

  it("requires the existing domain legal name for a legal entity", async () => {
    await expect(service.submit(USER_ID, "agent@example.com", {
      displayName: "Agent Company", agentType: "LEGAL_ENTITY",
    })).rejects.toBeInstanceOf(CommercialAgentApplicationValidationError);
    expect(repository.submit).not.toHaveBeenCalled();
  });

  it("requires an applicant-facing note for clarification and rejection", async () => {
    await expect(service.review({ applicationId: APPLICATION_ID, actorUserId: ADMIN_ID, action: "REQUEST_CLARIFICATION" }))
      .rejects.toBeInstanceOf(CommercialAgentApplicationValidationError);
    await expect(service.review({ applicationId: APPLICATION_ID, actorUserId: ADMIN_ID, action: "REJECT" }))
      .rejects.toBeInstanceOf(CommercialAgentApplicationValidationError);
    expect(repository.review).not.toHaveBeenCalled();
  });

  it("delegates approval to the atomic repository contract", async () => {
    await service.review({ applicationId: APPLICATION_ID, actorUserId: ADMIN_ID, action: "APPROVE" });
    expect(repository.review).toHaveBeenCalledWith({
      applicationId: APPLICATION_ID, actorUserId: ADMIN_ID, action: "APPROVE", safeNote: null,
    });
  });
});

function application(overrides: Partial<CommercialAgentApplication> = {}): CommercialAgentApplication {
  return {
    id: APPLICATION_ID,
    applicantUserId: USER_ID,
    status: "DRAFT",
    displayName: null,
    phone: null,
    email: "agent@example.com",
    locality: null,
    profession: null,
    workplace: null,
    agentType: "INDIVIDUAL",
    legalName: null,
    applicantVisibleNote: null,
    submittedAt: null,
    reviewedAt: null,
    reviewedBy: null,
    provisionedAgentId: null,
    revision: 1,
    createdAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
    ...overrides,
  };
}
