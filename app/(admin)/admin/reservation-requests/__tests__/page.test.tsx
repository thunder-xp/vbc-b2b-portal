import { describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/src/modules/admin", () => ({
  requireAdminPagePermission: vi.fn().mockResolvedValue({}),
}));

import DateChangeCompatibilityPage from "../page";

describe("date-change compatibility route", () => {
  it("redirects to the canonical route", async () => {
    await DateChangeCompatibilityPage();
    expect(redirect).toHaveBeenCalledWith("/admin/date-change-requests");
  });
});
