import { describe, expect, it, vi } from "vitest";

import type { RetailCartRepository } from "../repositories/retail-cart.repository";
import { RetailCartExpiredError, RetailCartInputError, RetailCartService } from "../services/retail-cart.service";
import { parsePublicRetailCart } from "../validation";

const hash = "a".repeat(64);
const productId = "10000000-0000-4000-8000-000000000001";
const secondProductId = "10000000-0000-4000-8000-000000000002";
const requestId = "20000000-0000-4000-8000-000000000001";
const mutation = { revision: 1, distinctItemCount: 1, totalQuantity: 1, repeated: false, bundleId: null };

function repository(): RetailCartRepository {
  return {
    getCart: vi.fn(), getSummary: vi.fn(), addProduct: vi.fn().mockResolvedValue(mutation),
    addBundle: vi.fn().mockResolvedValue({ ...mutation, bundleId: "30000000-0000-0000-0000-000000000001" }),
    updateQuantity: vi.fn().mockResolvedValue(mutation), removeItem: vi.fn().mockResolvedValue(mutation),
  };
}

describe("RetailCartService", () => {
  it("validates and delegates a standalone public product without accepting price", async () => {
    const repo = repository();
    const service = new RetailCartService(repo);
    await service.addProduct(hash, { publicProductId: productId, quantity: 1, source: "catalog", requestId });
    expect(repo.addProduct).toHaveBeenCalledWith(hash, expect.objectContaining({ publicProductId: productId, quantity: 1, source: "catalog", fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/) }));
  });

  it("aggregates duplicate calculator products and preserves commercial groups", async () => {
    const repo = repository();
    const service = new RetailCartService(repo);
    await service.addCctvSystem(hash, {
      requestId,
      items: [
        { publicProductId: productId, quantity: 2, commercialGroup: "equipment" },
        { publicProductId: productId, quantity: 3, commercialGroup: "equipment" },
        { publicProductId: secondProductId, quantity: 10, commercialGroup: "materials" },
      ],
      installationIntent: { cameraInstallation: true, cableLaying: true, commissioning: false, remoteViewing: false },
    });
    expect(repo.addBundle).toHaveBeenCalledWith(hash, expect.objectContaining({ items: [
      { publicProductId: productId, quantity: 5, commercialGroup: "equipment" },
      { publicProductId: secondProductId, quantity: 10, commercialGroup: "materials" },
    ] }));
  });

  it("rejects malformed identities, unsafe quantities and unknown installation fields", async () => {
    const service = new RetailCartService(repository());
    await expect(service.addProduct(hash, { publicProductId: "SKU-1", quantity: 1, source: "catalog", requestId })).rejects.toBeInstanceOf(RetailCartInputError);
    await expect(service.addProduct(hash, { publicProductId: productId, quantity: 0, source: "catalog", requestId })).rejects.toBeInstanceOf(RetailCartInputError);
    await expect(service.addProduct(hash, { publicProductId: productId, quantity: 100, source: "catalog", requestId })).rejects.toBeInstanceOf(RetailCartInputError);
    await expect(service.addCctvSystem(hash, { items: [{ publicProductId: productId, quantity: 1, commercialGroup: "equipment" }], installationIntent: { guessedPrice: true }, requestId })).rejects.toBeInstanceOf(RetailCartInputError);
  });

  it("classifies only the explicit expired-cart SQLSTATE for governed token recovery", async () => {
    const repo = repository();
    vi.mocked(repo.addProduct).mockRejectedValueOnce({ code: "28000" });
    await expect(new RetailCartService(repo).addProduct(hash, { publicProductId: productId, quantity: 1, source: "catalog", requestId })).rejects.toBeInstanceOf(RetailCartExpiredError);
  });

  it("serializes only the strict Public Retail cart DTO", () => {
    const safe = {
      revision: 3, distinctItemCount: 1, totalQuantity: 2,
      items: [{ publicProductId: productId, bundleId: null, source: "catalog", commercialGroup: "equipment", slug: "camera-1", sku: "CAM-1", name: "Camera", image: null, quantity: 2, price: { amount: 100, currency: "MDL", vatPresentation: "not_specified" }, availability: "in_stock", lineAmount: 200, stale: false, priceChanged: false }],
      bundles: [], totals: { equipment: 200, materials: 0, total: 200, currency: "MDL" },
    };
    expect(parsePublicRetailCart(safe)).toEqual(safe);
    expect(() => parsePublicRetailCart({ ...safe, companyId: "secret" })).toThrow();
    expect(() => parsePublicRetailCart({ ...safe, items: [{ ...safe.items[0], external1cId: "secret" }] })).toThrow();
  });
});
