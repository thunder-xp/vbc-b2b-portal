import { describe, expect, it, vi } from "vitest";

import { BusinessAccessResolver, CustomerAccessResolver, decideBusinessRoute, decidePostSignInBusinessRoute } from "../service";
import type { BusinessAccessContext, BusinessAccessResolution } from "../types";

const partnerA = context("PARTNER", "11111111-1111-4111-8111-111111111111", "Partner A", "AVAILABLE");
const partnerB = context("PARTNER", "22222222-2222-4222-8222-222222222222", "Partner B", "AVAILABLE");
const agent = context("AGENT", "33333333-3333-4333-8333-333333333333", "Commercial Agent", "AVAILABLE");

describe("BusinessAccessResolver routing", () => {
  it("routes a Partner-only user to the Partner cabinet", () => {
    expect(decideBusinessRoute(resolution([partnerA]))).toEqual({ kind: "ROUTE", targetRoute: "/cabinet" });
  });

  it("routes an Agent-only user to the Agent cabinet", () => {
    expect(decideBusinessRoute(resolution([agent]))).toEqual({ kind: "ROUTE", targetRoute: "/agent" });
  });

  it("requires selection for Partner plus Agent without a valid preference", () => {
    expect(decideBusinessRoute(resolution([partnerA, agent]))).toEqual({ kind: "SELECT_CONTEXT", targetRoute: "/auth/select-context" });
  });

  it("uses a revalidated last-used context when multiple contexts remain available", () => {
    expect(decideBusinessRoute(resolution([partnerA, agent], agent))).toEqual({ kind: "ROUTE", targetRoute: "/agent" });
  });

  it("keeps two Partner companies distinct", () => {
    expect(decideBusinessRoute(resolution([partnerA, partnerB]))).toEqual({ kind: "SELECT_CONTEXT", targetRoute: "/auth/select-context" });
  });

  it("ignores a stale preferred Partner context", () => {
    expect(decideBusinessRoute(resolution([partnerB, agent], partnerA))).toEqual({ kind: "SELECT_CONTEXT", targetRoute: "/auth/select-context" });
  });

  it("does not operationally route a suspended Agent", () => {
    const suspended = { ...agent, status: "BLOCKED" as const };
    expect(decideBusinessRoute(resolution([suspended]))).toEqual({ kind: "ACCESS_STATE", targetRoute: "/auth/business-access-state" });
  });

  it("routes a pending Agent to the status-only cabinet only during post-sign-in", () => {
    const pending = { ...agent, status: "PENDING" as const };
    expect(decideBusinessRoute(resolution([pending]))).toEqual({ kind: "ACCESS_STATE", targetRoute: "/auth/business-access-state" });
    expect(decidePostSignInBusinessRoute(resolution([pending]))).toEqual({ kind: "ROUTE", targetRoute: "/agent" });
  });

  it("keeps an available Partner authoritative when the Agent context is pending", () => {
    const pending = { ...agent, status: "PENDING" as const };
    expect(decidePostSignInBusinessRoute(resolution([partnerA, pending]))).toEqual({ kind: "ROUTE", targetRoute: "/cabinet" });
  });

  it("does not treat a pending Partner as a status-only Agent", () => {
    const pending = { ...partnerA, status: "PENDING" as const };
    expect(decidePostSignInBusinessRoute(resolution([pending]))).toEqual({ kind: "ACCESS_STATE", targetRoute: "/auth/business-access-state" });
  });

  it("delegates forged-context rejection to the server repository", async () => {
    const repository = {
      resolveOwn: vi.fn(),
      selectOwn: vi.fn().mockRejectedValue(new Error("42501")),
    };
    const resolver = new BusinessAccessResolver(repository);
    await expect(resolver.select("PARTNER", partnerB.contextId)).rejects.toThrow("42501");
    expect(repository.selectOwn).toHaveBeenCalledOnce();
  });
});

describe("CustomerAccessResolver", () => {
  it.each([
    [{ accountStatus: "ACTIVE", purchaseBacked: true, legacyCompatible: false }, "AVAILABLE", "PURCHASE_BACKED"],
    [{ accountStatus: "ACTIVE", purchaseBacked: false, legacyCompatible: true }, "AVAILABLE", "LEGACY_COMPATIBILITY"],
    [{ accountStatus: null, purchaseBacked: false, legacyCompatible: false }, "NOT_ACTIVE", null],
    [{ accountStatus: "IDENTITY_REVIEW_REQUIRED", purchaseBacked: true, legacyCompatible: true }, "BLOCKED", null],
    [{ accountStatus: "SUSPENDED", purchaseBacked: false, legacyCompatible: true }, "BLOCKED", null],
  ] as const)("maps entitlement evidence to %s", async (evidence, expected, basis) => {
    const repository = { resolveEntitlement: vi.fn().mockResolvedValue(evidence) };
    const resolver = new CustomerAccessResolver(repository);
    await expect(resolver.resolve("44444444-4444-4444-8444-444444444444")).resolves.toMatchObject({ status: expected, accessBasis: basis });
    expect(repository.resolveEntitlement).toHaveBeenCalledOnce();
    expect(Object.keys(repository)).toEqual(["resolveEntitlement"]);
  });

  it("allows only an existing active account through the explicit rollback compatibility gate", async () => {
    const repository = { resolveEntitlement: vi.fn().mockResolvedValue({ accountStatus: "ACTIVE", purchaseBacked: false, legacyCompatible: false }) };
    await expect(new CustomerAccessResolver(repository, false).resolve("44444444-4444-4444-8444-444444444444"))
      .resolves.toMatchObject({ status: "AVAILABLE", accessBasis: "ROLLBACK_COMPATIBILITY" });
    await expect(new CustomerAccessResolver(repository, true).resolve("44444444-4444-4444-8444-444444444444"))
      .resolves.toMatchObject({ status: "NOT_ACTIVE", accessBasis: null });
  });
});

function context(type: "PARTNER" | "AGENT", contextId: string, displayName: string, status: BusinessAccessContext["status"]): BusinessAccessContext {
  return { type, contextId, displayName, status, targetRoute: type === "PARTNER" ? "/cabinet" : "/agent" };
}
function resolution(contexts: readonly BusinessAccessContext[], preferredContext: BusinessAccessContext | null = null): BusinessAccessResolution {
  return { contexts, preferredContext };
}
