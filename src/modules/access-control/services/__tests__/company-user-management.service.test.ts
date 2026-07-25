import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { CompanyUserManagementRepository } from "../../repositories";
import type { PermissionService } from "../permission.service";
import type { CompanyInvitationEmailProvider } from "../company-invitation-email.provider";
import { CompanyUserManagementService } from "../company-user-management.service";

const repository = {
  list: vi.fn(),
  listEvents: vi.fn(),
  listAdminCompanies: vi.fn(),
  createInvitation: vi.fn(),
  reissueInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  acceptInvitation: vi.fn(),
  setMembershipState: vi.fn(),
  updateMembershipAccess: vi.fn(),
  appointOwner: vi.fn(),
} satisfies CompanyUserManagementRepository;

const permissions = {
  ensurePermission: vi.fn(),
} as unknown as PermissionService;

const email = {
  send: vi.fn(),
} satisfies CompanyInvitationEmailProvider;

const service = new CompanyUserManagementService(repository, permissions, email);

describe("CompanyUserManagementService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissions.ensurePermission = vi.fn().mockResolvedValue({
      isAllowed: true,
      permissionCode: "company_users.manage",
      context: null,
    });
  });

  it("loads an employee page through one aggregate repository call", async () => {
    repository.list.mockResolvedValue({
      records: [],
      page: 1,
      pageSize: 25,
      totalCount: 0,
      totalPages: 1,
    });
    await service.list("actor", "company");
    expect(repository.list).toHaveBeenCalledOnce();
  });

  it("normalizes email and passes only the token hash to persistence", async () => {
    repository.createInvitation.mockImplementation(async (input) => ({
      invitationId: "invitation",
      email: input.email,
      fullName: input.fullName,
      expiresAt: input.expiresAt,
      tokenVersion: 1,
      repeated: false,
    }));
    const result = await service.createInvitation(invitationInput({
      email: "  EMPLOYEE@Example.COM ",
    }));
    expect(repository.createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "employee@example.com",
        tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
    expect(result.invitationUrl).not.toContain(
      repository.createInvitation.mock.calls[0][0].tokenHash,
    );
  });

  it("stores retail-only intent without applying UI redaction", async () => {
    repository.createInvitation.mockImplementation(async (input) => ({
      invitationId: "invitation",
      email: input.email,
      fullName: input.fullName,
      expiresAt: input.expiresAt,
      tokenVersion: 1,
      repeated: false,
    }));
    await service.createInvitation(invitationInput({ priceAccess: "retail_only" }));
    expect(repository.createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ priceAccess: "retail_only" }),
    );
  });

  it("rejects internal roles before repository access", async () => {
    await expect(service.createInvitation(invitationInput({
      roleCode: "novotech_admin",
    }))).rejects.toThrow("not assignable");
    expect(repository.createInvitation).not.toHaveBeenCalled();
  });

  it("falls back to a one-time copy link when SMTP is unavailable", async () => {
    repository.createInvitation.mockImplementation(async (input) => ({
      invitationId: "invitation",
      email: input.email,
      fullName: input.fullName,
      expiresAt: input.expiresAt,
      tokenVersion: 1,
      repeated: false,
    }));
    email.send.mockRejectedValue(new Error("smtp unavailable"));
    const result = await service.createInvitation(invitationInput());
    expect(result.delivery).toBe("copy_link");
    expect(result.invitationUrl).toContain("/auth/invitations/");
  });

  it("does not generate a second link for an idempotent repeated request", async () => {
    repository.createInvitation.mockResolvedValue({
      invitationId: "invitation",
      email: "employee@example.com",
      fullName: "Employee",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      tokenVersion: 1,
      repeated: true,
    });
    const result = await service.createInvitation(invitationInput());
    expect(result).toMatchObject({
      delivery: "already_created",
      invitationUrl: "",
      repeated: true,
    });
    expect(email.send).not.toHaveBeenCalled();
  });

  it("uses the same membership for suspension and restoration", async () => {
    await service.suspend("actor", "company", "membership");
    await service.restore("actor", "company", "membership");
    expect(repository.setMembershipState).toHaveBeenNthCalledWith(
      1,
      "membership",
      "suspended",
    );
    expect(repository.setMembershipState).toHaveBeenNthCalledWith(
      2,
      "membership",
      "active",
    );
  });
});

function invitationInput(
  overrides: Partial<Parameters<CompanyUserManagementService["createInvitation"]>[0]> = {},
) {
  return {
    actorUserId: "actor",
    companyId: "company",
    companyName: "Company",
    inviterName: "Owner",
    fullName: "Employee",
    email: "employee@example.com",
    roleCode: "partner_viewer",
    priceAccess: "full" as const,
    requestKey: "request",
    applicationUrl: "https://www.nsd.md",
    ...overrides,
  };
}
