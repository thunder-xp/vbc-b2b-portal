import { describe, expect, it, vi } from "vitest";

import type { RetailCheckoutRepository } from "../repositories/retail-checkout.repository";
import { RetailCheckoutRepositoryError } from "../repositories/supabase/retail-checkout.supabase-repository";
import { isRetailCheckoutEnabled } from "../retail-checkout-server";
import { deriveRetailOrderAccessToken, hashRetailOrderAccessToken } from "../retail-order-token";
import { normalizeMoldovaPhone, RetailCheckoutConflictError, RetailCheckoutInputError, RetailCheckoutService } from "../services/retail-checkout.service";
import { parsePublicRetailOrder } from "../validation";

const hash = "a".repeat(64);
const fingerprint = "b".repeat(64);
const submissionKey = "20000000-0000-4000-8000-000000000001";
const created = { orderNumber: "R-2026-000001", status: "awaiting_payment" as const, repeated: false, accessExpiresAt: "2027-02-09T10:00:00.000Z" };

function repository(): RetailCheckoutRepository {
  return { getCheckout: vi.fn(), createOrder: vi.fn().mockResolvedValue(created), getOrder: vi.fn(), getInstallationStatus: vi.fn(), transitionInstallation: vi.fn() };
}
function input() { return { locale: "ru" as const, checkoutFingerprint: fingerprint, submissionKey, name: " Ivan Test ", phone: "060 123 456", email: "TEST@EXAMPLE.COM", deliveryAddress: { locality: "Chișinău", street: "Test", building: "1" }, installationSameAsDelivery: true, processingAcknowledged: true }; }

describe("RetailCheckoutService", () => {
  it("normalizes Moldova contact data and delegates no browser price fields", async () => {
    const repo = repository();
    await new RetailCheckoutService(repo).createOrder(hash, "c".repeat(64), input());
    expect(repo.createOrder).toHaveBeenCalledWith(hash, expect.objectContaining({
      checkoutFingerprint: fingerprint, submissionKey,
      customer: { name: "Ivan Test", phone: "+37360123456", email: "test@example.com", processingAcknowledged: true },
      deliveryAddress: { locality: "Chișinău", street: "Test", building: "1", unit: null, postalCode: null, instructions: null },
      requestFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
    expect(JSON.stringify(vi.mocked(repo.createOrder).mock.calls[0])).not.toContain("unitPrice");
  });

  it("accepts Moldova international/local forms and rejects malformed contact", () => {
    expect(normalizeMoldovaPhone("+373 60 123 456")).toBe("+37360123456");
    expect(normalizeMoldovaPhone("060123456")).toBe("+37360123456");
    expect(() => normalizeMoldovaPhone("123")).toThrow(RetailCheckoutInputError);
  });

  it("requires consent and rejects stale checkout conflicts safely", async () => {
    await expect(new RetailCheckoutService(repository()).createOrder(hash, "c".repeat(64), { ...input(), processingAcknowledged: false })).rejects.toBeInstanceOf(RetailCheckoutInputError);
    const repo = repository(); vi.mocked(repo.createOrder).mockRejectedValue(new RetailCheckoutRepositoryError("40001"));
    await expect(new RetailCheckoutService(repo).createOrder(hash, "c".repeat(64), input())).rejects.toBeInstanceOf(RetailCheckoutConflictError);
  });

  it("derives the same opaque order token for an idempotent retry", () => {
    const first = deriveRetailOrderAccessToken("x".repeat(43), submissionKey);
    const second = deriveRetailOrderAccessToken("x".repeat(43), submissionKey);
    expect(first).toEqual(second);
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashRetailOrderAccessToken(first.token)).toBe(first.hash);
    expect(hashRetailOrderAccessToken("R-2026-000001")).toBeNull();
  });

  it("keeps final submit behind an explicit pilot gate", () => {
    expect(isRetailCheckoutEnabled({})).toBe(false);
    expect(isRetailCheckoutEnabled({ RETAIL_CHECKOUT_ENABLED: "false" })).toBe(false);
    expect(isRetailCheckoutEnabled({ RETAIL_CHECKOUT_ENABLED: "true" })).toBe(true);
  });

  it("keeps the token-scoped public order DTO free of customer/database and 1C identities", () => {
    const safe = { orderNumber: "R-2026-000001", status: "awaiting_payment", createdAt: "2026-08-13T05:00:00+00:00", locale: "ru", customer: { name: "Test", phone: "+37360123456", email: null }, deliveryAddress: { locality: "Chisinau", street: "Test", building: "1", unit: null, postalCode: null, instructions: null }, installationAddress: null, installationIntent: [], calculatorEvidence: [], totals: { equipment: 100, materials: 0, total: 100, currency: "MDL", vatPresentation: "included" }, lines: [{ lineNumber: 1, publicProductId: "10000000-0000-4000-8000-000000000001", source: "catalog", commercialGroup: "equipment", slug: "camera", sku: "CAM-1", name: "Camera", imageUrl: null, quantity: 1, unitCode: "piece", unitPrice: 100, lineTotal: 100, currency: "MDL", vatPresentation: "included", availability: "in_stock" }] };
    expect(parsePublicRetailOrder(safe).orderNumber).toBe("R-2026-000001");
    expect(() => parsePublicRetailOrder({ ...safe, customerId: "secret" })).toThrow();
    expect(() => parsePublicRetailOrder({ ...safe, external1cId: "secret" })).toThrow();
  });

  it("validates and delegates token-scoped installation confirmation", async () => {
    const repo = repository();
    vi.mocked(repo.transitionInstallation).mockResolvedValue({ state: "customer_confirmed", revision: 4, repeated: false });
    const result = await new RetailCheckoutService(repo).transitionInstallation(hash, { command: "confirm", expectedRevision: 3, idempotencyKey: submissionKey });
    expect(result.state).toBe("customer_confirmed");
    expect(repo.transitionInstallation).toHaveBeenCalledWith({ accessTokenHash: hash, command: "confirm", expectedRevision: 3, category: null, note: null, idempotencyKey: submissionKey });
  });

  it("requires a governed issue category and preserves strict command validation", () => {
    const service = new RetailCheckoutService(repository());
    expect(() => service.transitionInstallation(hash, { command: "report_issue", expectedRevision: 3, category: null, idempotencyKey: submissionKey })).toThrow(RetailCheckoutInputError);
    expect(() => service.transitionInstallation(hash, { command: "confirm", expectedRevision: 3, category: "other", idempotencyKey: submissionKey })).toThrow(RetailCheckoutInputError);
  });
});
