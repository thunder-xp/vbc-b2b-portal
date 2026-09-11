import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class AdminPartnerPasswordChangeError extends Error {
    constructor(readonly code: string) {
      super(code);
      this.name = "AdminPartnerPasswordChangeError";
    }
  }
  return {
    AdminPartnerPasswordChangeError,
    changePassword: vi.fn(),
    getPartnerLocale: vi.fn().mockResolvedValue("ru"),
    requireAdminPermission: vi.fn(),
  };
});

vi.mock("@/src/modules/partner-locale/server", () => ({ getPartnerLocale: mocks.getPartnerLocale }));
vi.mock("../../services", () => ({
  AdminPartnerPasswordChangeError: mocks.AdminPartnerPasswordChangeError,
  createAdminPartnerPasswordService: () => ({ changePassword: mocks.changePassword }),
  requireAdminPermission: mocks.requireAdminPermission,
}));

import { changeAdminPartnerPasswordAction } from "../admin-partner-password.actions";

const ACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TARGET_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SECRET = "Acceptance-only-2026";
const INITIAL_STATE = { status: "idle", message: "", correlationId: null } as const;

function formData() {
  const form = new FormData();
  form.set("targetProfileId", TARGET_ID);
  form.set("newPassword", SECRET);
  form.set("confirmPassword", SECRET);
  return form;
}

describe("changeAdminPartnerPasswordAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPartnerLocale.mockResolvedValue("ru");
    mocks.requireAdminPermission.mockResolvedValue({ userId: ACTOR_ID });
    mocks.changePassword.mockResolvedValue({});
  });

  it("requires the strongest existing partner-integrity permission and passes the server-derived actor", async () => {
    const result = await changeAdminPartnerPasswordAction(INITIAL_STATE, formData());
    expect(mocks.requireAdminPermission).toHaveBeenCalledWith("admin.partner_integrity.manage");
    expect(mocks.changePassword).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: ACTOR_ID,
      targetProfileId: TARGET_ID,
      password: SECRET,
      confirmation: SECRET,
    }));
    expect(result.status).toBe("success");
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it("rejects unauthorized direct invocation before calling the credential service", async () => {
    const permissionError = new Error("private permission detail");
    permissionError.name = "PermissionRequiredError";
    mocks.requireAdminPermission.mockRejectedValue(permissionError);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await changeAdminPartnerPasswordAction(INITIAL_STATE, formData());

    expect(result).toMatchObject({ status: "error" });
    expect(mocks.changePassword).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("private permission detail");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(SECRET);
  });

  it("returns an explicit partial outcome when audit fails after the provider change", async () => {
    mocks.changePassword.mockRejectedValue(new mocks.AdminPartnerPasswordChangeError("AUDIT_FAILED_AFTER_CHANGE"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await changeAdminPartnerPasswordAction(INITIAL_STATE, formData());

    expect(result.status).toBe("partial");
    expect(result.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.message).not.toContain(SECRET);
  });

  it("returns Romanian safe copy without exposing provider details", async () => {
    mocks.getPartnerLocale.mockResolvedValue("ro");
    mocks.changePassword.mockRejectedValue(new mocks.AdminPartnerPasswordChangeError("AUTH_PROVIDER_REJECTED"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await changeAdminPartnerPasswordAction(INITIAL_STATE, formData());
    expect(result.message).toContain("Serviciul de autentificare");
    expect(result.message).not.toContain(SECRET);
  });
});
