import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  decide: vi.fn(),
  redirect: vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/src/modules/auth/access-context", () => {
  class AccessContextAuthenticationError extends Error {}
  return {
    AccessContextAuthenticationError,
    resolveCurrentBusinessAccess: mocks.resolve,
    decidePostSignInBusinessRoute: mocks.decide,
  };
});
vi.mock("@/src/modules/auth/components", () => ({
  LocalizedAccessState: ({ kind }: { kind: string }) => <div>{kind}</div>,
}));

import BusinessAccessStatePage from "./page";

describe("business access-state self-healing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolve.mockResolvedValue({ contexts: [], preferredContext: null });
    mocks.decide.mockReturnValue({ kind: "ACCESS_STATE", targetRoute: "/auth/business-access-state" });
  });

  it.each([
    ["available Partner", "/cabinet"],
    ["available Agent", "/agent"],
    ["pending Agent", "/agent"],
    ["multiple available contexts", "/auth/select-context"],
  ])("server-redirects %s to %s", async (_case, targetRoute) => {
    mocks.decide.mockReturnValue({ kind: "ROUTE", targetRoute });
    await expect(BusinessAccessStatePage()).rejects.toThrow(`NEXT_REDIRECT:${targetRoute}`);
  });

  it("renders unavailable only when the canonical resolver has no supported workspace", async () => {
    render(await BusinessAccessStatePage());
    expect(screen.getByText("BUSINESS_UNAVAILABLE")).toBeInTheDocument();
  });
});
