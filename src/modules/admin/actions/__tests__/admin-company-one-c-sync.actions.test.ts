import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  discover: vi.fn(),
  apply: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/src/lib/env", () => ({ getOneCEnv: () => ({}) }));
vi.mock("@/src/modules/integration/providers/one-c/one-c-provider", () => ({
  OneCProvider: class { partners = {}; },
}));
vi.mock("../../repositories", () => ({ SupabaseAdminCompanyRepository: class {} }));
vi.mock("../../services", () => {
  class AdminOneCManualSyncError extends Error {
    constructor(readonly code: string) { super(code); }
  }
  return {
    AdminOneCManualSyncError,
    AdminCompanyOneCManualSyncService: class {
      discover = mocks.discover;
      apply = mocks.apply;
    },
    requireAdminPermission: mocks.requirePermission,
  };
});

import {
  applyAdminCompanyOneCSyncAction,
  discoverAdminCompanyOneCSyncAction,
  type AdminOneCManualSyncActionState,
} from "../admin-company-one-c-sync.actions";

const COMPANY_ID = "00000000-0000-4000-8000-000000000001";
const INITIAL: AdminOneCManualSyncActionState = {
  status: "idle", message: "", correlationId: null, errorCode: null, discovery: null, result: null,
};

describe("admin company manual 1C synchronization actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.requirePermission.mockResolvedValue({ userId: "admin" });
    mocks.discover.mockResolvedValue({ errors: [], candidates: [] });
    mocks.apply.mockResolvedValue({
      status: "success", code: "MANUAL_ONE_C_SYNC_SUCCESS", message: "ok",
      correlationId: "id", readiness: "READY", mainContractRef: "main",
      cashContractRef: "cash", priceTypeRef: "price",
    });
  });

  it("requires both integration and partner-integrity permissions", async () => {
    await discoverAdminCompanyOneCSyncAction(INITIAL, form(false));
    expect(mocks.requirePermission.mock.calls).toEqual([
      ["admin.integrations.manage"],
      ["admin.partner_integrity.manage"],
    ]);
  });

  it("stops an unauthorized direct invocation before live 1C discovery", async () => {
    const permissionError = new Error("permission detail");
    permissionError.name = "PermissionRequiredError";
    mocks.requirePermission.mockRejectedValue(permissionError);
    const result = await discoverAdminCompanyOneCSyncAction(INITIAL, form(false));
    expect(result).toMatchObject({ status: "error", errorCode: "UNAUTHORIZED" });
    expect(mocks.discover).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("permission detail");
  });

  it("requires explicit confirmation before applying any mapping", async () => {
    const result = await applyAdminCompanyOneCSyncAction(INITIAL, form(false));
    expect(result.status).toBe("error");
    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it("revalidates the company only after a confirmed successful apply", async () => {
    const result = await applyAdminCompanyOneCSyncAction(INITIAL, form(true));
    expect(result.status).toBe("success");
    expect(mocks.apply).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/admin/companies/${COMPANY_ID}`);
  });
});

function form(confirmed: boolean): FormData {
  const data = new FormData();
  data.set("companyId", COMPANY_ID);
  data.set("mainContractRef", "00000000-0000-4000-8000-000000000002");
  data.set("cashContractRef", "00000000-0000-4000-8000-000000000003");
  data.set("expectedContractVersion", "1");
  data.set("expectedCashVersion", "0");
  data.set("expectedProfileVersion", "2");
  data.set("reason", "Verified controlled synchronization");
  if (confirmed) data.set("confirmed", "yes");
  return data;
}
