import { describe, expect, it } from "vitest";

import {
  createMaibReviewSession,
  isMaibReviewAccessCodeValid,
  isMaibReviewAccessEnabled,
  MAIB_REVIEW_COOKIE_EXPIRES_AT,
  validateMaibReviewSession,
} from "../maib-review-session";
import {
  canInitiateRetailPaymentForAccess,
  resolveRetailCheckoutAccess,
} from "../retail-checkout-server";

const secret = "review-access-secret-with-32-bytes";
const environment = { MAIB_REVIEW_ACCESS_SECRET: secret };
describe("MAIB review access", () => {
  it("compares the server-only access code and rejects absent, short, or wrong values", () => {
    expect(isMaibReviewAccessCodeValid(secret, environment)).toBe(true);
    expect(isMaibReviewAccessCodeValid("wrong-review-access-secret-value", environment)).toBe(false);
    expect(isMaibReviewAccessCodeValid(secret, {})).toBe(false);
    expect(isMaibReviewAccessCodeValid("short", { MAIB_REVIEW_ACCESS_SECRET: "short" })).toBe(false);
  });

  it("issues a signed session without a business expiry and rejects tampering", () => {
    const session = createMaibReviewSession(environment, "a".repeat(22));
    const sessionParts = session.split(".");
    sessionParts[2] = `${sessionParts[2]?.startsWith("a") ? "b" : "a"}${sessionParts[2]?.slice(1)}`;

    expect(session).toMatch(/^v2\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/);
    expect(MAIB_REVIEW_COOKIE_EXPIRES_AT.toISOString()).toBe("9999-12-31T23:59:59.000Z");
    expect(validateMaibReviewSession(session, environment)).toBe(true);
    expect(validateMaibReviewSession(sessionParts.join("."), environment)).toBe(false);
  });

  it("invalidates issued sessions when the server-side credential is rotated or removed", () => {
    const session = createMaibReviewSession(environment, "b".repeat(22));

    expect(validateMaibReviewSession(session, environment)).toBe(true);
    expect(validateMaibReviewSession(session, { MAIB_REVIEW_ACCESS_SECRET: `${secret}-rotated` })).toBe(false);
    expect(validateMaibReviewSession(session, {})).toBe(false);
    expect(validateMaibReviewSession(session, { ...environment, MAIB_REVIEW_ACCESS_ENABLED: "false" })).toBe(false);
    expect(isMaibReviewAccessCodeValid(secret, { ...environment, MAIB_REVIEW_ACCESS_ENABLED: "false" })).toBe(false);
    expect(isMaibReviewAccessEnabled({ ...environment, MAIB_REVIEW_ACCESS_ENABLED: "false" })).toBe(false);
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
