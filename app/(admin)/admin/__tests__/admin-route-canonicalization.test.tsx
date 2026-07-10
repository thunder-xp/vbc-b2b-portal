import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

import AdminAccessRequestCompatibilityDetailPage from "../access-requests/[requestId]/page";
import AdminAccessRequestsCompatibilityPage from "../access-requests/page";

describe("admin route canonicalization", () => {
  it("redirects access request list compatibility route to partner requests", () => {
    expect(() => AdminAccessRequestsCompatibilityPage()).toThrow(
      "NEXT_REDIRECT:/admin/partner-requests",
    );
  });

  it("redirects access request detail compatibility route to partner request detail", async () => {
    await expect(
      AdminAccessRequestCompatibilityDetailPage({
        params: Promise.resolve({ requestId: "request-1" }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT:/admin/partner-requests/request-1");
  });
});
