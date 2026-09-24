import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class AuthEmailRecoveryError extends Error {
    constructor(readonly code: string) {
      super(code);
      this.name = "AuthEmailRecoveryError";
    }
  }
  return {
    AuthEmailRecoveryError,
    diagnose: vi.fn(),
    execute: vi.fn(),
    requireAdminPermission: vi.fn(),
  };
});

vi.mock("../../services", () => ({
  AuthEmailRecoveryError: mocks.AuthEmailRecoveryError,
  createAuthEmailRecoveryService: () => ({ diagnose: mocks.diagnose, execute: mocks.execute }),
  requireAdminPermission: mocks.requireAdminPermission,
}));

import {
  diagnoseAuthEmailRecoveryAction,
  executeAuthEmailRecoveryAction,
} from "../auth-email-recovery.actions";

const ACTOR_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const CORRELATION_ID = "44444444-4444-4444-8444-444444444444";
const diagnosticInitial = { status: "idle", message: "", diagnosis: null, correlationId: null } as const;
const executionInitial = { status: "idle", message: "", correlationId: null } as const;

describe("auth email recovery actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminPermission.mockResolvedValue({ userId: ACTOR_ID });
    mocks.diagnose.mockResolvedValue({
      identityState: "UNCONFIRMED",
      authUserId: USER_ID,
      maskedEmail: "ad•••@psg.md",
      emailDomain: "psg.md",
      originalErrorCode: "email_address_invalid",
      profileState: "NOT_STARTED",
      profileStatus: null,
      latestAttemptStatus: null,
      deliveryResult: null,
      verificationResult: null,
      eligible: true,
    });
    mocks.execute.mockResolvedValue({
      authUserId: USER_ID,
      correlationId: CORRELATION_ID,
      deliveryResult: "ACCEPTED",
      idempotent: false,
    });
  });

  it("requires the security-management permission for diagnostics", async () => {
    const form = new FormData();
    form.set("email", "admin@psg.md");
    const result = await diagnoseAuthEmailRecoveryAction(diagnosticInitial, form);
    expect(mocks.requireAdminPermission).toHaveBeenCalledWith("admin.security.manage");
    expect(result.status).toBe("ready");
    expect(result.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(result)).not.toMatch(/action_link|token_hash|service_role/i);
  });

  it("rejects anonymous or unauthorized direct execution before recovery", async () => {
    const permissionError = new Error("private permission detail");
    permissionError.name = "PermissionRequiredError";
    mocks.requireAdminPermission.mockRejectedValue(permissionError);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await executeAuthEmailRecoveryAction(executionInitial, executionForm());
    expect(result.status).toBe("error");
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("private permission detail");
  });

  it("passes the server-derived actor and explicit evidence to the service", async () => {
    const result = await executeAuthEmailRecoveryAction(executionInitial, executionForm());
    expect(mocks.requireAdminPermission).toHaveBeenCalledWith("admin.security.manage");
    expect(mocks.execute).toHaveBeenCalledWith({
      actorUserId: ACTOR_ID,
      authUserId: USER_ID,
      correlationId: CORRELATION_ID,
      originalErrorConfirmed: true,
      mailboxValidityConfirmed: true,
      explicitlyAuthorized: true,
    });
    expect(result).toMatchObject({ status: "accepted", correlationId: CORRELATION_ID });
  });

  it("returns a non-retryable partial outcome after accepted delivery with audit failure", async () => {
    mocks.execute.mockRejectedValue(new mocks.AuthEmailRecoveryError("AUDIT_FAILED_AFTER_DELIVERY"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await executeAuthEmailRecoveryAction(executionInitial, executionForm());
    expect(result.status).toBe("partial");
    expect(result.message).toContain("Повторять отправку нельзя");
  });
});

function executionForm(): FormData {
  const form = new FormData();
  form.set("authUserId", USER_ID);
  form.set("correlationId", CORRELATION_ID);
  form.set("originalErrorConfirmed", "on");
  form.set("mailboxValidityConfirmed", "on");
  form.set("explicitlyAuthorized", "on");
  return form;
}
