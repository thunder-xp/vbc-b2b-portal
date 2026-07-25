import { beforeEach, describe, expect, it, vi } from "vitest";

import { createClient } from "@/src/lib/supabase/server";

import { RepositoryUnexpectedError } from "../../index";
import { SupabaseEffectivePermissionRepository } from "../effective-permission.supabase-repository";

vi.mock("@/src/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

describe("SupabaseEffectivePermissionRepository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads and maps one tenant-bound permission projection", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        user_id: "user-1",
        company_id: "company-1",
        profile_status: "active",
        company_status: "active",
        membership_id: "membership-1",
        membership_status: "active",
        role_id: "role-1",
        role_code: "partner_owner",
        role_name: "Partner Owner",
        is_internal_override: false,
        role_permission_codes: ["pricing.partner_price.view", "pricing.retail_price.view"],
        allowed_override_codes: [],
        denied_override_codes: ["pricing.partner_price.view"],
        effective_permission_codes: ["pricing.retail_price.view"],
      }],
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue({ rpc } as never);

    const result = await new SupabaseEffectivePermissionRepository()
      .findForCurrentUser("user-1", "company-1");

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("get_effective_company_permissions", {
      p_company_id: "company-1",
    });
    expect(result).toMatchObject({
      userId: "user-1",
      companyId: "company-1",
      deniedOverrideCodes: ["pricing.partner_price.view"],
      effectivePermissionCodes: ["pricing.retail_price.view"],
    });
  });

  it("rejects a projection for another user or company", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        user_id: "other-user",
        company_id: "company-1",
      }],
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue({ rpc } as never);

    await expect(
      new SupabaseEffectivePermissionRepository()
        .findForCurrentUser("user-1", "company-1"),
    ).resolves.toBeNull();
  });

  it("does not expose raw database errors", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42501", message: "permission denied" },
    });
    vi.mocked(createClient).mockResolvedValue({ rpc } as never);

    await expect(
      new SupabaseEffectivePermissionRepository()
        .findForCurrentUser("user-1", "company-1"),
    ).rejects.toBeInstanceOf(RepositoryUnexpectedError);
  });
});
