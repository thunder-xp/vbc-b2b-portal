import { describe, expect, it, vi } from "vitest";

import type { AdminPartnerIntegrityRepository, AdminPartnerPasswordRepository } from "../../repositories";
import type { AdminPartnerUserIntegrity } from "../../types";
import {
  AdminPartnerPasswordChangeError,
  AdminPartnerPasswordService,
} from "../admin-partner-password.service";

const ACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TARGET_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const COMPANY_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CORRELATION_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function detail(overrides: Partial<AdminPartnerUserIntegrity["identity"]> = {}): AdminPartnerUserIntegrity {
  return {
    identity: {
      id: TARGET_ID,
      email: "controlled.partner@example.test",
      fullName: "Controlled Partner",
      status: "active",
      userType: "partner",
      ...overrides,
    },
    memberships: [{
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      companyId: COMPANY_ID,
      companyName: "Acceptance Company",
      companyStatus: "active",
      roleCode: "partner_owner",
      status: "active",
      version: 1,
      createdAt: "2026-09-11T00:00:00.000Z",
      approvedAt: null,
      endedAt: null,
      isDefault: true,
      historyReason: null,
      relatedAuditEvent: null,
    }],
    requests: [],
    audit: [],
  };
}

function dependencies(value: AdminPartnerUserIntegrity | null = detail()) {
  const targetReader = {
    getUser: vi.fn().mockResolvedValue(value),
  } as unknown as Pick<AdminPartnerIntegrityRepository, "getUser">;
  const passwordRepository: AdminPartnerPasswordRepository = {
    getAuthIdentity: vi.fn().mockResolvedValue({
      id: TARGET_ID,
      email: "controlled.partner@example.test",
      hasEmailIdentity: true,
      isAnonymous: false,
    }),
    changePasswordAndRevokeTargetSessions: vi.fn().mockResolvedValue(undefined),
    recordPasswordChangeAudit: vi.fn().mockResolvedValue("ffffffff-ffff-4fff-8fff-ffffffffffff"),
  };
  return { passwordRepository, service: new AdminPartnerPasswordService(targetReader, passwordRepository), targetReader };
}

function input(password = "Safe-pass-2026") {
  return {
    actorUserId: ACTOR_ID,
    targetProfileId: TARGET_ID,
    password,
    confirmation: password,
    correlationId: CORRELATION_ID,
  };
}

describe("AdminPartnerPasswordService", () => {
  it("uses the canonical profile/Auth UUID, revokes target sessions through the password operation, and writes safe audit metadata", async () => {
    const { passwordRepository, service } = dependencies();

    const result = await service.changePassword(input());

    expect(passwordRepository.getAuthIdentity).toHaveBeenCalledWith(TARGET_ID);
    expect(passwordRepository.changePasswordAndRevokeTargetSessions).toHaveBeenCalledWith(TARGET_ID, "Safe-pass-2026");
    expect(passwordRepository.recordPasswordChangeAudit).toHaveBeenCalledWith({
      actorUserId: ACTOR_ID,
      targetUserId: TARGET_ID,
      targetCompanyId: COMPANY_ID,
      correlationId: CORRELATION_ID,
    });
    expect(JSON.stringify(vi.mocked(passwordRepository.recordPasswordChangeAudit).mock.calls)).not.toContain("Safe-pass-2026");
    expect(result.auditEventId).toBe("ffffffff-ffff-4fff-8fff-ffffffffffff");
  });

  it.each([
    ["PASSWORD_REQUIRED", ""],
    ["PASSWORD_POLICY", "short"],
  ] as const)("rejects %s before reading or mutating the target", async (code, password) => {
    const { passwordRepository, service, targetReader } = dependencies();
    await expect(service.changePassword(input(password))).rejects.toMatchObject({ code });
    expect(targetReader.getUser).not.toHaveBeenCalled();
    expect(passwordRepository.changePasswordAndRevokeTargetSessions).not.toHaveBeenCalled();
  });

  it("rejects a mismatched confirmation at the server boundary", async () => {
    const { passwordRepository, service } = dependencies();
    await expect(service.changePassword({ ...input(), confirmation: "Different-2026" }))
      .rejects.toMatchObject({ code: "PASSWORD_MISMATCH" });
    expect(passwordRepository.changePasswordAndRevokeTargetSessions).not.toHaveBeenCalled();
  });

  it.each([
    ["internal", "active"],
    ["system", "active"],
    ["partner", "suspended"],
  ])("rejects unsupported %s/%s profiles", async (userType, status) => {
    const { passwordRepository, service } = dependencies(detail({ userType, status }));
    await expect(service.changePassword(input())).rejects.toMatchObject({ code: "TARGET_NOT_SUPPORTED" });
    expect(passwordRepository.changePasswordAndRevokeTargetSessions).not.toHaveBeenCalled();
  });

  it("fails closed when the canonical Auth mapping is missing", async () => {
    const { passwordRepository, service } = dependencies();
    vi.mocked(passwordRepository.getAuthIdentity).mockResolvedValue(null);
    await expect(service.changePassword(input())).rejects.toMatchObject({ code: "AUTH_MAPPING_MISSING" });
    expect(passwordRepository.changePasswordAndRevokeTargetSessions).not.toHaveBeenCalled();
  });

  it("fails closed for an anonymous Auth identity", async () => {
    const { passwordRepository, service } = dependencies();
    vi.mocked(passwordRepository.getAuthIdentity).mockResolvedValue({ id: TARGET_ID, email: null, hasEmailIdentity: false, isAnonymous: true });
    await expect(service.changePassword(input())).rejects.toMatchObject({ code: "TARGET_NOT_SUPPORTED" });
    expect(passwordRepository.changePasswordAndRevokeTargetSessions).not.toHaveBeenCalled();
  });

  it("does not silently add a password to an unsupported non-email identity", async () => {
    const { passwordRepository, service } = dependencies();
    vi.mocked(passwordRepository.getAuthIdentity).mockResolvedValue({
      id: TARGET_ID,
      email: "partner@example.test",
      hasEmailIdentity: false,
      isAnonymous: false,
    });
    await expect(service.changePassword(input())).rejects.toMatchObject({ code: "TARGET_NOT_SUPPORTED" });
    expect(passwordRepository.changePasswordAndRevokeTargetSessions).not.toHaveBeenCalled();
  });

  it("requires one governed active company context", async () => {
    const ambiguous = detail();
    ambiguous.memberships.push({ ...ambiguous.memberships[0]!, id: "11111111-1111-4111-8111-111111111111", companyId: "22222222-2222-4222-8222-222222222222", isDefault: false });
    ambiguous.memberships[0]!.isDefault = false;
    const { passwordRepository, service } = dependencies(ambiguous);
    await expect(service.changePassword(input())).rejects.toMatchObject({ code: "TARGET_COMPANY_AMBIGUOUS" });
    expect(passwordRepository.changePasswordAndRevokeTargetSessions).not.toHaveBeenCalled();
  });

  it("reports a partial security outcome if audit persistence fails after provider success", async () => {
    const { passwordRepository, service } = dependencies();
    vi.mocked(passwordRepository.recordPasswordChangeAudit).mockRejectedValue(new Error("audit unavailable"));
    await expect(service.changePassword(input())).rejects.toMatchObject({ code: "AUDIT_FAILED_AFTER_CHANGE" });
    expect(passwordRepository.changePasswordAndRevokeTargetSessions).toHaveBeenCalledOnce();
  });

  it("offers the control only for an active partner with an unambiguous active company", () => {
    const { service } = dependencies();
    expect(service.canOfferPasswordChange(detail())).toBe(true);
    expect(service.canOfferPasswordChange(detail({ userType: "admin" }))).toBe(false);
    expect(service.canOfferPasswordChange(detail({ status: "revoked" }))).toBe(false);
  });

  it("uses typed safe errors without retaining credential material", () => {
    const error = new AdminPartnerPasswordChangeError("PASSWORD_POLICY");
    expect(error.message).toBe("PASSWORD_POLICY");
    expect(JSON.stringify(error)).not.toContain("password-value");
  });
});
