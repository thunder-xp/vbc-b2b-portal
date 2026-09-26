import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), reconcile: vi.fn() }));

vi.mock("@/src/lib/cron-auth", () => ({ authorizeCronRequest: mocks.authorize }));
vi.mock("@/src/modules/payments/server", () => ({ reconcileDueMaibPayments: mocks.reconcile }));

import { GET } from "../route";

describe("retail payment reconciliation cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({ authorized: true });
    mocks.reconcile.mockResolvedValue({ claimed: 1, paid: 0, pending: 0, terminal: 1, retried: 0 });
  });

  it("requires cron authorization and runs one bounded batch", async () => {
    const response = await GET(new Request("https://www.nsd.md/api/cron/retail-payment-reconciliation"));
    expect(response.status).toBe(200);
    expect(mocks.reconcile).toHaveBeenCalledWith(3);
    await expect(response.json()).resolves.toMatchObject({ status: "succeeded", claimed: 1, terminal: 1 });
  });

  it("does not reconcile an unauthorized request", async () => {
    mocks.authorize.mockResolvedValue({ authorized: false });
    expect((await GET(new Request("https://www.nsd.md/api/cron/retail-payment-reconciliation"))).status).toBe(401);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
});
