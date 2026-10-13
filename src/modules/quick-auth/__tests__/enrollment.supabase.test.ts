import { beforeEach, describe, expect, it, vi } from "vitest";

import { SupabaseBusinessPhoneEnrollmentRepository, SupabaseBusinessProfilePhoneStateRepository } from "../enrollment.supabase";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/src/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/src/lib/supabase/server", () => ({ createClient: vi.fn() }));
beforeEach(() => mocks.rpc.mockReset());

describe("Shared enrollment RPC boundary", () => {
  it("uses one governed source resolver and the versioned operational conflict guard", async () => {
    const repository = new SupabaseBusinessProfilePhoneStateRepository();
    mocks.rpc.mockResolvedValueOnce({ data: { source: "COMMERCIAL_AGENT", phoneE164: "+37369256733" }, error: null });
    expect(await repository.resolvePhone("server-authenticated-user")).toEqual({ source: "COMMERCIAL_AGENT", phoneE164: "+37369256733" });
    expect(mocks.rpc).toHaveBeenCalledWith("resolve_business_profile_phone_v1", { p_auth_user_id: "server-authenticated-user" });
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(await repository.hasOperationalConflict("server-authenticated-user", "+37369256733")).toBe(false);
    expect(mocks.rpc).toHaveBeenLastCalledWith("has_business_profile_phone_operational_conflict_v3", { p_auth_user_id: "server-authenticated-user", p_phone_e164: "+37369256733" });
  });

  it("uses source-gated preparation, reservation and verified-projection completion", async () => {
    const repository = new SupabaseBusinessPhoneEnrollmentRepository();
    const input = { authUserId: "server-authenticated-user", phoneE164: "+37369256733", phoneKeyHash: "a".repeat(64), challengeId: "11111111-1111-4111-8111-111111111111" };
    mocks.rpc.mockResolvedValueOnce({ data: { result: "READY", challengeId: input.challengeId, expiresAt: "2026-10-13T12:00:00Z", isPhoneChange: false }, error: null });
    await repository.prepare(input);
    expect(mocks.rpc.mock.calls[0][0]).toBe("prepare_business_phone_enrollment_v3");
    mocks.rpc.mockResolvedValueOnce({ data: { allowed: true, retryAfterSeconds: 0 }, error: null });
    await repository.reserveSend(input);
    expect(mocks.rpc.mock.calls[1][0]).toBe("reserve_business_phone_enrollment_send_v4");
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
    expect(await repository.complete(input)).toBe(true);
    expect(mocks.rpc.mock.calls[2][0]).toBe("complete_business_phone_enrollment_v3");
  });

  it("fails closed when conflict lookup is unavailable", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "UNAVAILABLE" } });
    await expect(new SupabaseBusinessProfilePhoneStateRepository().hasOperationalConflict("server-user", "+37369256733")).rejects.toThrow("conflict lookup failed");
  });
});
