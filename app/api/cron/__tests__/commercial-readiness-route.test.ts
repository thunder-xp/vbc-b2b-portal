import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  run: vi.fn(),
}));

vi.mock("@/src/lib/cron-auth", () => ({ authorizeCronRequest: mocks.authorize }));
vi.mock("@/src/modules/onboarding/services/commercial-readiness-audit.service", () => ({
  CommercialReadinessAuditService: class {
    run = mocks.run;
  },
}));

import { GET } from "../commercial-readiness/route";

describe("commercial readiness cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({ authorized: true });
    mocks.run.mockResolvedValue({
      status: "completed",
      selectedCount: 1,
      updatedCount: 1,
      ready: 36,
      irreparable: 2,
    });
  });

  it("rejects an unauthorized request before running the worker", async () => {
    mocks.authorize.mockResolvedValue({ authorized: false });

    const response = await GET(new Request("https://www.nsd.md/api/cron/commercial-readiness"));

    expect(response.status).toBe(401);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("runs one bounded off-request audit", async () => {
    const response = await GET(new Request("https://www.nsd.md/api/cron/commercial-readiness"));

    expect(response.status).toBe(200);
    expect(mocks.run).toHaveBeenCalledWith(100);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ ready: 36, irreparable: 2 });
  });
});
