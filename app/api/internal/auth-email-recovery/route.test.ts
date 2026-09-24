import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  diagnose: vi.fn(),
  execute: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/src/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock("@/src/modules/admin/services", () => ({
  AuthEmailRecoveryError: class AuthEmailRecoveryError extends Error {},
  createAuthEmailRecoveryService: () => ({ diagnose: mocks.diagnose, execute: mocks.execute }),
}));

import { POST } from "./route";

const SERVICE_KEY = "test-service-role-key";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const CORRELATION_ID = "44444444-4444-4444-8444-444444444444";

describe("internal auth email recovery route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
    mocks.diagnose.mockResolvedValue({ identityState: "UNCONFIRMED", authUserId: USER_ID, eligible: true });
    mocks.execute.mockResolvedValue({ deliveryResult: "ACCEPTED", idempotent: false, correlationId: CORRELATION_ID });
    mocks.from.mockImplementation((table: string) => chainFor(table));
  });

  it("rejects anonymous requests before any diagnostic or provider operation", async () => {
    const response = await POST(request(null));
    expect(response.status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("requires one active admin.security.manage actor before one governed send", async () => {
    const response = await POST(request(SERVICE_KEY));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ accepted: true, idempotent: false, correlationId: CORRELATION_ID });
    expect(mocks.diagnose).toHaveBeenCalledWith("admin@psg.md");
    expect(mocks.execute).toHaveBeenCalledWith({
      actorUserId: USER_ID,
      authUserId: USER_ID,
      correlationId: CORRELATION_ID,
      originalErrorConfirmed: true,
      mailboxValidityConfirmed: true,
      explicitlyAuthorized: true,
    });
  });

  it("does not execute for an ineligible identity", async () => {
    mocks.diagnose.mockResolvedValue({ identityState: "CONFIRMED", authUserId: USER_ID, eligible: false });
    const response = await POST(request(SERVICE_KEY));
    expect(response.status).toBe(409);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});

function request(key: string | null): Request {
  return new Request("https://www.nsd.md/api/internal/auth-email-recovery", {
    method: "POST",
    headers: key ? { authorization: `Bearer ${key}`, "content-type": "application/json" } : { "content-type": "application/json" },
    body: JSON.stringify({
      email: "admin@psg.md",
      correlationId: CORRELATION_ID,
      originalErrorConfirmed: true,
      mailboxValidityConfirmed: true,
      explicitlyAuthorized: true,
    }),
  });
}

function chainFor(table: string) {
  if (table === "permissions") {
    return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: "permission-id" }, error: null }) }) }) };
  }
  if (table === "role_permissions") {
    return { select: () => ({ eq: async () => ({ data: [{ role_id: "role-id" }], error: null }) }) };
  }
  if (table === "internal_user_role_assignments") {
    return { select: () => ({ in: () => ({ is: async () => ({ data: [{ user_id: USER_ID }], error: null }) }) }) };
  }
  return { select: () => ({ in: () => ({ eq: async () => ({ data: [{ id: USER_ID }], error: null }) }) }) };
}
