import { describe, expect, it } from "vitest";

import {
  createMaibReviewSession,
  isMaibReviewAccessCodeValid,
  MAIB_REVIEW_SESSION_MAX_AGE_SECONDS,
  validateMaibReviewSession,
} from "../maib-review-session";
import {
  canInitiateRetailPaymentForAccess,
  resolveRetailCheckoutAccess,
} from "../retail-checkout-server";

const secret = "review-access-secret-with-32-bytes";
const environment = { MAIB_REVIEW_ACCESS_SECRET: secret };
const now = Date.parse("2026-09-21T12:00:00Z");

describe("MAIB review access", () => {
  it("compares the server-only access code and rejects absent, short, or wrong values", () => {
    expect(isMaibReviewAccessCodeValid(secret, environment)).toBe(true);
    expect(isMaibReviewAccessCodeValid("wrong-review-access-secret-value", environment)).toBe(false);
    expect(isMaibReviewAccessCodeValid(secret, {})).toBe(false);
    expect(isMaibReviewAccessCodeValid("short", { MAIB_REVIEW_ACCESS_SECRET: "short" })).toBe(false);
  });

  it("issues a signed bounded session and rejects expiry or tampering", () => {
    const session = createMaibReviewSession(environment, now, "a".repeat(22));
    const sessionParts = session.split(".");
    sessionParts[3] = `${sessionParts[3]?.startsWith("a") ? "b" : "a"}${sessionParts[3]?.slice(1)}`;

    expect(validateMaibReviewSession(session, environment, now)).toBe(true);
    expect(validateMaibReviewSession(session, environment, now + MAIB_REVIEW_SESSION_MAX_AGE_SECONDS * 1_000)).toBe(false);
    expect(validateMaibReviewSession(sessionParts.join("."), environment, now)).toBe(false);
    expect(validateMaibReviewSession(session, { MAIB_REVIEW_ACCESS_SECRET: secret + "-other" }, now)).toBe(false);
  });

  it("keeps normal public gating unchanged and identifies review access centrally", () => {
    expect(resolveRetailCheckoutAccess({ publicEnabled: false, reviewSessionValid: false, pilotSessionValid: false })).toEqual({ allowed: false, source: "none" });
    expect(resolveRetailCheckoutAccess({ publicEnabled: false, reviewSessionValid: false, pilotSessionValid: true })).toEqual({ allowed: true, source: "pilot" });
    expect(resolveRetailCheckoutAccess({ publicEnabled: true, reviewSessionValid: false, pilotSessionValid: false })).toEqual({ allowed: true, source: "public" });
    expect(resolveRetailCheckoutAccess({ publicEnabled: false, reviewSessionValid: true, pilotSessionValid: false })).toEqual({ allowed: true, source: "maib_review" });
  });

  it("allows review payment only through the exact sandbox origin", () => {
    const review = { allowed: true, source: "maib_review" as const };
    expect(canInitiateRetailPaymentForAccess(review, { ready: true, sandbox: true, production: false, apiOrigin: "https://sandbox.maibmerchants.md" })).toBe(true);
    expect(canInitiateRetailPaymentForAccess(review, { ready: true, sandbox: false, production: true, apiOrigin: "https://api.maibmerchants.md" })).toBe(false);
    expect(canInitiateRetailPaymentForAccess(review, { ready: false, sandbox: false, production: false, apiOrigin: null })).toBe(false);
    expect(canInitiateRetailPaymentForAccess({ allowed: false, source: "none" }, { ready: true, sandbox: true, production: false, apiOrigin: "https://sandbox.maibmerchants.md" })).toBe(false);
  });
});
