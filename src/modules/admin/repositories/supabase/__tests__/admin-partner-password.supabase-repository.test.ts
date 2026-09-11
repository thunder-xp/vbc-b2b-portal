import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const auditSingle = vi.fn();
  const auditSelect = vi.fn(() => ({ single: auditSingle }));
  const auditInsert = vi.fn(() => ({ select: auditSelect }));
  return {
    auditInsert,
    auditSelect,
    auditSingle,
    from: vi.fn(() => ({ insert: auditInsert })),
    getUserById: vi.fn(),
    updateUserById: vi.fn(),
  };
});

vi.mock("@/src/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: { admin: { getUserById: mocks.getUserById, updateUserById: mocks.updateUserById } },
    from: mocks.from,
  }),
}));

import { AdminPartnerPasswordProviderFailure } from "../../admin-partner-password.repository";
import { SupabaseAdminPartnerPasswordRepository } from "../admin-partner-password.supabase-repository";

const TARGET_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COMPANY_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CORRELATION_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SECRET = "Provider-only-2026";

describe("SupabaseAdminPartnerPasswordRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserById.mockResolvedValue({
      data: { user: { id: TARGET_ID, email: "partner@example.test", is_anonymous: false, app_metadata: { provider: "email", providers: ["email"] }, identities: [{ provider: "email" }] } },
      error: null,
    });
    mocks.updateUserById.mockResolvedValue({ data: { user: { id: TARGET_ID } }, error: null });
    mocks.auditSingle.mockResolvedValue({ data: { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" }, error: null });
  });

  it("resolves the canonical Auth identity by UUID", async () => {
    const repository = new SupabaseAdminPartnerPasswordRepository();
    await expect(repository.getAuthIdentity(TARGET_ID)).resolves.toEqual({
      id: TARGET_ID,
      email: "partner@example.test",
      hasEmailIdentity: true,
      isAnonymous: false,
    });
    expect(mocks.getUserById).toHaveBeenCalledWith(TARGET_ID);
  });

  it("uses the server-only Admin Auth update for the exact target UUID", async () => {
    const repository = new SupabaseAdminPartnerPasswordRepository();
    await repository.changePasswordAndRevokeTargetSessions(TARGET_ID, SECRET);
    expect(mocks.updateUserById).toHaveBeenCalledWith(TARGET_ID, { password: SECRET });
  });

  it("writes the governed audit event with safe metadata and no credential", async () => {
    const repository = new SupabaseAdminPartnerPasswordRepository();
    await expect(repository.recordPasswordChangeAudit({
      actorUserId: ACTOR_ID,
      targetUserId: TARGET_ID,
      targetCompanyId: COMPANY_ID,
      correlationId: CORRELATION_ID,
    })).resolves.toBe("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");

    expect(mocks.from).toHaveBeenCalledWith("company_user_events");
    expect(mocks.auditInsert).toHaveBeenCalledWith({
      actor_user_id: ACTOR_ID,
      company_id: COMPANY_ID,
      event_type: "admin_intervention",
      safe_payload: {
        correlationId: CORRELATION_ID,
        operation: "PARTNER_PASSWORD_CHANGED_BY_ADMIN",
        securityOutcome: "password_changed_existing_access_revoked",
      },
      target_user_id: TARGET_ID,
    });
    expect(JSON.stringify(mocks.auditInsert.mock.calls)).not.toContain(SECRET);
  });

  it("maps provider failures to credential-free repository errors", async () => {
    mocks.updateUserById.mockResolvedValue({ data: { user: null }, error: { status: 500, message: SECRET } });
    const repository = new SupabaseAdminPartnerPasswordRepository();
    await expect(repository.changePasswordAndRevokeTargetSessions(TARGET_ID, SECRET))
      .rejects.toEqual(new AdminPartnerPasswordProviderFailure("AUTH_UPDATE_FAILED"));
  });
});
