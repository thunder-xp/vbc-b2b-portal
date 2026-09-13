import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTokenHash: vi.fn(),
  getSummary: vi.fn(),
}));

vi.mock("@/src/modules/public-retail/retail-cart-cookie", () => ({
  getRetailCartTokenHash: mocks.getTokenHash,
}));
vi.mock("@/src/modules/public-retail/retail-cart-server", () => ({
  getRetailCartService: () => ({ getSummary: mocks.getSummary }),
}));

import { GET } from "../route";

describe("public retail cart summary route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTokenHash.mockResolvedValue("a".repeat(64));
    mocks.getSummary.mockResolvedValue({ distinctItemCount: 2, totalQuantity: 7 });
  });

  it("returns only the private cart summary without making catalog HTML private", async () => {
    const response = await GET();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ distinctItemCount: 2, totalQuantity: 7 });
    expect(mocks.getSummary).toHaveBeenCalledWith("a".repeat(64));
  });

  it("fails closed to an empty badge if the private summary is unavailable", async () => {
    mocks.getSummary.mockRejectedValue(new Error("temporary"));
    await expect((await GET()).json()).resolves.toEqual({ distinctItemCount: 0, totalQuantity: 0 });
  });
});
