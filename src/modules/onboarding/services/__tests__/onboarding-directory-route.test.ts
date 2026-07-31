import { beforeEach, describe, expect, it, vi } from "vitest";

const synchronize = vi.fn();

vi.mock("@/src/modules/onboarding/services", () => ({
  CounterpartyDirectorySyncService: class {
    synchronize = synchronize;
  },
  OneCCounterpartyDirectorySource: class {},
}));
vi.mock("@/src/lib/env", () => ({ getOneCEnv: () => ({}) }));

describe("onboarding directory cron", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "cron-secret");
  });

  it("rejects requests without the cron secret", async () => {
    const { GET } = await import("@/app/api/cron/onboarding-directory/route");
    const response = await GET(new Request("https://www.nsd.md/api/cron/onboarding-directory"));
    expect(response.status).toBe(401);
    expect(synchronize).not.toHaveBeenCalled();
  });

  it("returns safe publication counts for an authorized run", async () => {
    synchronize.mockResolvedValue({
      syncId: "11111111-1111-4111-8111-111111111111",
      startedAt: "2026-07-31T10:00:00.000Z",
      finishedAt: "2026-07-31T10:00:10.000Z",
      durationMs: 10_000,
      sourceCounterparties: 100,
      stagedCounterparties: 99,
      published: 99,
    });
    const { GET } = await import("@/app/api/cron/onboarding-directory/route");
    const response = await GET(new Request(
      "https://www.nsd.md/api/cron/onboarding-directory",
      { headers: { Authorization: "Bearer cron-secret" } },
    ));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "succeeded",
      published: 99,
    });
  });

  it("does not expose provider errors", async () => {
    synchronize.mockRejectedValue(new Error("private provider response"));
    const { GET } = await import("@/app/api/cron/onboarding-directory/route");
    const response = await GET(new Request(
      "https://www.nsd.md/api/cron/onboarding-directory",
      { headers: { Authorization: "Bearer cron-secret" } },
    ));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private provider response");
  });
});
