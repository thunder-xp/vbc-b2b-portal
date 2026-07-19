import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  explain: vi.fn(),
  getAuthenticatedUserId: vi.fn(),
  getCurrentProfile: vi.fn(),
  canApprovePartnerRequests: vi.fn(),
}));

vi.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
}));
vi.mock("@/src/modules/access-control/actions/service-factory", () => ({
  getAuthenticatedUserId: mocks.getAuthenticatedUserId,
  createUserProfileService: () => ({ getCurrentProfile: mocks.getCurrentProfile }),
}));
vi.mock("@/src/modules/access-control/services/internal-authorization", () => ({
  canApprovePartnerRequests: mocks.canApprovePartnerRequests,
}));
vi.mock("@/src/modules/catalog/diagnostics", () => ({
  CATALOG_PLAN_OPERATIONS: [
    "catalog_page",
    "catalog_facets",
    "exact_sku",
    "attribute_filter",
    "stock_sort",
  ],
  CatalogQueryPlanService: class {
    explain = mocks.explain;
  },
  SupabaseCatalogQueryPlanRepository: class {},
}));

import { POST } from "../../../../../app/api/internal/catalog-query-plan/route";

const companyId = "11111111-1111-4111-8111-111111111111";

describe("catalog query plan route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CATALOG_PLAN_DIAGNOSTICS_ENABLED", "true");
    vi.stubEnv("CATALOG_PLAN_DIAGNOSTIC_SECRET", "diagnostic-secret");
    mocks.getAuthenticatedUserId.mockRejectedValue(new Error("Unauthenticated"));
  });

  it("is disabled by default", async () => {
    vi.stubEnv("CATALOG_PLAN_DIAGNOSTICS_ENABLED", "false");
    const response = await POST(request({ operation: "catalog_page", companyId }, true));
    expect(response.status).toBe(404);
    expect(mocks.explain).not.toHaveBeenCalled();
  });

  it("requires internal authorization or the diagnostic secret", async () => {
    const response = await POST(request({ operation: "catalog_page", companyId }));
    expect(response.status).toBe(401);
    expect(mocks.explain).not.toHaveBeenCalled();
  });

  it("rejects arbitrary SQL and unsupported operation names", async () => {
    const response = await POST(request({
      operation: "select * from product_prices",
      companyId,
      sql: "select current_user",
    }, true));
    expect(response.status).toBe(400);
    expect(mocks.explain).not.toHaveBeenCalled();
  });

  it("runs only an allowlisted operation with the dedicated secret", async () => {
    mocks.explain.mockResolvedValue({ operation: "catalog_facets", executionTimeMs: 25 });
    const response = await POST(request({ operation: "catalog_facets", companyId }, true));
    expect(response.status).toBe(200);
    expect(mocks.explain).toHaveBeenCalledWith("catalog_facets", companyId);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

function request(body: Record<string, unknown>, authorized = false) {
  return new Request("https://portal.example/api/internal/catalog-query-plan", {
    method: "POST",
    headers: authorized ? { authorization: "Bearer diagnostic-secret" } : undefined,
    body: JSON.stringify(body),
  });
}
