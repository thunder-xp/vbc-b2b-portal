import { describe, expect, it, vi } from "vitest";

import type { RetailCheckoutRepository } from "../repositories/retail-checkout.repository";
import { RetailCheckoutInputError, RetailCheckoutService } from "../services/retail-checkout.service";

const hash = "a".repeat(64);
const offer = { id: "10000000-0000-4000-8000-000000000001", status: "active" as const, policyVersion: "retail_equipment_conversion_offer_v1" as const,
  discountPercent: 10 as const, scope: "equipment" as const, discountAmount: 2_000, expiresAt: "2026-08-15T12:00:00.000Z", currency: "MDL", resultingTotal: 28_050, repeated: false };
function repository(): RetailCheckoutRepository { return { getCheckout: vi.fn(), createCommercialOffer: vi.fn().mockResolvedValue(offer), getCommercialOffer: vi.fn(), createOrder: vi.fn(), getOrder: vi.fn(), getInstallationStatus: vi.fn(), transitionInstallation: vi.fn() }; }

describe("RetailCheckoutService commercial orchestration", () => {
  it("delegates a valid offer idempotency key without commercial input", async () => {
    const repo = repository();
    await expect(new RetailCheckoutService(repo).createCommercialOffer(hash, "20000000-0000-4000-8000-000000000002", "ru")).resolves.toEqual(offer);
    expect(repo.createCommercialOffer).toHaveBeenCalledWith(hash, "20000000-0000-4000-8000-000000000002", "ru");
  });

  it("rejects malformed offer commands before the repository", async () => {
    const repo = repository();
    expect(() => new RetailCheckoutService(repo).createCommercialOffer(hash, "bad", "ru")).toThrow(RetailCheckoutInputError);
    expect(repo.createCommercialOffer).not.toHaveBeenCalled();
  });

  it("requires a provider only for customer-selected installation", async () => {
    const repo = repository();
    const base = { locale: "ru" as const, checkoutFingerprint: "b".repeat(64), submissionKey: "30000000-0000-4000-8000-000000000003",
      name: "Test Customer", phone: "+37360123456", deliveryAddress: { locality: "Chișinău", street: "Test", building: "1" },
      installationSameAsDelivery: true, processingAcknowledged: true };
    await expect(new RetailCheckoutService(repo).createOrder(hash, "c".repeat(64), { ...base, installationSelectionMode: "automatic", installationRegionCode: "MD-C" })).resolves.toBeUndefined();
    await expect(new RetailCheckoutService(repo).createOrder(hash, "c".repeat(64), { ...base, installationSelectionMode: "customer_selected", installationRegionCode: "MD-C" })).rejects.toBeInstanceOf(RetailCheckoutInputError);
  });
});
