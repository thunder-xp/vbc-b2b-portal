import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  parse: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock("@/src/modules/payments/providers/maib/maib-callback-auth", () => ({ authenticateMaibCallback: mocks.authenticate }));
vi.mock("@/src/modules/payments/providers/maib/maib-callback", () => ({ parseMaibCallback: mocks.parse }));
vi.mock("@/src/modules/payments/server", () => ({
  createRetailPaymentService: () => ({ confirmMaibCallback: mocks.confirm }),
  createMaibReviewPaymentService: () => ({ confirmMaibCallback: mocks.confirm }),
  maibReviewProviderEnvironment: () => ({ MAIB_SIGNATURE_KEY: "review-signature-key" }),
}));

import { POST } from "../route";

const evidence = {
  checkoutId: "11111111-1111-4111-8111-111111111111", paymentId: "22222222-2222-4222-8222-222222222222",
  orderReference: "33333333-3333-4333-8333-333333333333", checkoutAmount: "10.00", checkoutCurrency: "MDL",
  paymentAmount: "10.00", paymentCurrency: "MDL", paymentStatus: "Executed", providerEventAt: "2026-09-16T12:00:00Z", rrn: null,
};

describe("MAIB callback route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockReturnValue({ valid: true, timestampMs: Date.now() });
    mocks.parse.mockReturnValue(evidence);
    mocks.confirm.mockResolvedValue({ outcome: "PAID" });
  });

  it.each(["PAID", "DUPLICATE", "NON_PAID"])("acknowledges %s with an empty HTTP 200", async (outcome) => {
    mocks.confirm.mockResolvedValue({ outcome });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  it("returns retryable non-200 while verified payment awaits local activation", async () => {
    mocks.confirm.mockResolvedValue({ outcome: "PAID_PENDING_ACTIVATION" });
    expect((await POST(request())).status).toBe(503);
  });

  it("rejects stale or invalid authentication before parsing JSON", async () => {
    mocks.authenticate.mockReturnValue({ valid: false, reason: "STALE_TIMESTAMP" });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("continues processing an in-flight callback while public initiation is disabled", async () => {
    vi.stubEnv("RETAIL_CHECKOUT_ENABLED", "false");
    expect((await POST(request())).status).toBe(200);
    expect(mocks.confirm).toHaveBeenCalledWith(evidence, "public");
  });
});

function request() {
  return new Request("https://www.nsd.md/api/payments/maib/callback", {
    method: "POST", body: JSON.stringify(evidence),
    headers: { "content-type": "application/json", "x-signature": "sha256=test", "x-signature-timestamp": String(Date.now()) },
  });
}
