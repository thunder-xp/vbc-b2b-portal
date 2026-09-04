import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  getEnv: vi.fn(),
  run: vi.fn(),
  createService: vi.fn(),
}));

vi.mock("@/src/lib/cron-auth", () => ({ authorizeCronRequest: mocks.authorize }));
vi.mock("@/src/lib/env", () => ({ getOneCEnv: mocks.getEnv }));
vi.mock("@/src/modules/integration/services", () => ({
  createPriceCoverageAuditService: mocks.createService,
}));

import { GET } from "../route";

describe("governed price coverage cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({ authorized: true });
    mocks.getEnv.mockReturnValue({ baseUrl: "https://one-c.example", username: "user", password: "secret" });
    mocks.createService.mockReturnValue({ run: mocks.run });
    mocks.run.mockResolvedValue({
      status: "completed",
      priceCoverageReady: false,
      candidateCount: 1,
      autoRepaired: 0,
      irreparableSourceGaps: 1,
      activeCartsBlocked: 1,
      providerRequestCount: 1,
    });
  });

  it("rejects unauthorized calls before loading 1C configuration", async () => {
    mocks.authorize.mockResolvedValue({ authorized: false });

    const response = await GET(new Request("https://www.nsd.md/api/cron/price-coverage"));

    expect(response.status).toBe(401);
    expect(mocks.getEnv).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("runs one bounded off-request audit and never caches the result", async () => {
    const response = await GET(new Request("https://www.nsd.md/api/cron/price-coverage"));

    expect(response.status).toBe(200);
    expect(mocks.run).toHaveBeenCalledWith(100);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      candidateCount: 1,
      irreparableSourceGaps: 1,
      activeCartsBlocked: 1,
    });
  });

  it("returns only a safe error when the source audit fails", async () => {
    mocks.run.mockRejectedValue(new Error("credential detail"));

    const response = await GET(new Request("https://www.nsd.md/api/cron/price-coverage"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      status: "failed",
      safeError: "Governed price coverage audit failed.",
    });
  });
});
