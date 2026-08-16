import { describe, expect, it, vi } from "vitest";

import type { RetailCartRepository } from "../repositories/retail-cart.repository";
import { RetailCartExpiredError, RetailCartInputError, RetailCartService } from "../services/retail-cart.service";
import { parsePublicRetailCart } from "../validation";

const hash = "a".repeat(64);
const productId = "10000000-0000-4000-8000-000000000001";
const secondProductId = "10000000-0000-4000-8000-000000000002";
const requestId = "20000000-0000-4000-8000-000000000001";
const mutation = { revision: 1, distinctItemCount: 1, totalQuantity: 1, repeated: false, bundleId: null };
const calculatorInput = { locale: "ru" as const, objectType: "warehouse" as const, indoorCameraCount: 2, outdoorCameraCount: 1, quality: "standard" as const, archiveDays: 30 as const, cableLength: 300, cameraInstallationRequested: true, cableLayingRequested: true, commissioningRequested: false, remoteViewingRequested: false, aiScenarioProgrammingRequested: false, backupPower: false };
const workScope = [{ kind: "camera_installation", quantity: 3, unitCode: "piece" as const }];
const installationPricing = { complete: true, tariffSetId: "30000000-0000-4000-8000-000000000001", tariffVersion: 1, currency: "MDL", vatTreatment: "included", lines: [], subtotal: 300 };

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
      calculatorInput,
      workScope,
      installationPricing,
      items: [
        { publicProductId: productId, quantity: 2, commercialGroup: "equipment", unitCode: "piece" },
        { publicProductId: productId, quantity: 3, commercialGroup: "equipment", unitCode: "piece" },
        { publicProductId: secondProductId, quantity: 10, commercialGroup: "materials", unitCode: "meter" },
      ],
      installationIntent: { cameraInstallation: true, cableLaying: true, commissioning: false, remoteViewing: false, aiScenarioProgramming: false },
    });
    expect(repo.addBundle).toHaveBeenCalledWith(hash, expect.objectContaining({ items: [
      { publicProductId: productId, quantity: 5, commercialGroup: "equipment", unitCode: "piece" },
      { publicProductId: secondProductId, quantity: 10, commercialGroup: "materials", unitCode: "meter" },
    ], installationPricing }));
  });

  it("preserves only the governed calculator variant for database tariff revalidation", async () => {
    const repo = repository();
    await new RetailCartService(repo).addCctvSystem(hash, {
      requestId,
      calculatorInput: { ...calculatorInput, selectedVariant: "economy" },
      workScope,
      installationPricing,
      items: [{ publicProductId: productId, quantity: 1, commercialGroup: "equipment", unitCode: "piece" }],
      installationIntent: { cameraInstallation: true, cableLaying: false, commissioning: false, remoteViewing: false, aiScenarioProgramming: false },
    });

    expect(repo.addBundle).toHaveBeenCalledWith(hash, expect.objectContaining({
      calculatorInput: expect.objectContaining({ selectedVariant: "economy" }),
    }));
  });

  it("accepts governed calculator material quantities above the standalone retail limit", async () => {
    const repo = repository();
    await new RetailCartService(repo).addCctvSystem(hash, {
      requestId,
      calculatorInput,
      workScope: [],
      items: [{ publicProductId: secondProductId, quantity: 300, commercialGroup: "materials", unitCode: "meter" }],
      installationIntent: null,
    });
    expect(repo.addBundle).toHaveBeenCalledWith(hash, expect.objectContaining({
      items: [{ publicProductId: secondProductId, quantity: 300, commercialGroup: "materials", unitCode: "meter" }],
    }));
  });

  it("preserves bounded provisional requirements with an explicit payment block", async () => {
    const repo = repository();
    const provisionalRequirements = [{ key: "product-1", requirementKind: "indoor_camera" as const, label: "Камера для помещения", quantity: 2, unitCode: "piece" as const, reason: "unresolved_identity" as const }];
    await new RetailCartService(repo).addCctvSystem(hash, {
      requestId,
      calculatorInput: { ...calculatorInput, provisionalRequirements, paymentEligibility: "blocked_unresolved_requirements" },
      workScope: [],
      items: [{ publicProductId: secondProductId, quantity: 1, commercialGroup: "equipment", unitCode: "piece" }],
      installationIntent: null,
    });
    expect(repo.addBundle).toHaveBeenCalledWith(hash, expect.objectContaining({
      calculatorInput: expect.objectContaining({ provisionalRequirements, paymentEligibility: "blocked_unresolved_requirements" }),
    }));
  });

  it("rejects malformed identities, unsafe quantities and unknown installation fields", async () => {
    const service = new RetailCartService(repository());
    await expect(service.addProduct(hash, { publicProductId: "SKU-1", quantity: 1, source: "catalog", requestId })).rejects.toBeInstanceOf(RetailCartInputError);
    await expect(service.addProduct(hash, { publicProductId: productId, quantity: 0, source: "catalog", requestId })).rejects.toBeInstanceOf(RetailCartInputError);
    await expect(service.addProduct(hash, { publicProductId: productId, quantity: 100, source: "catalog", requestId })).rejects.toBeInstanceOf(RetailCartInputError);
    await expect(service.addCctvSystem(hash, { items: [{ publicProductId: productId, quantity: 20_001, commercialGroup: "materials", unitCode: "meter" }], installationIntent: null, calculatorInput, workScope: [], requestId })).rejects.toBeInstanceOf(RetailCartInputError);
    await expect(service.addCctvSystem(hash, { items: [{ publicProductId: productId, quantity: 1, commercialGroup: "equipment", unitCode: "piece" }], installationIntent: { guessedPrice: true }, calculatorInput, workScope: [], requestId })).rejects.toBeInstanceOf(RetailCartInputError);
  });

  it("classifies only the explicit expired-cart SQLSTATE for governed token recovery", async () => {
    const repo = repository();
    vi.mocked(repo.addProduct).mockRejectedValueOnce({ code: "28000" });
    await expect(new RetailCartService(repo).addProduct(hash, { publicProductId: productId, quantity: 1, source: "catalog", requestId })).rejects.toBeInstanceOf(RetailCartExpiredError);
  });

  it("serializes only the strict Public Retail cart DTO", () => {
    const safe = {
      revision: 3, distinctItemCount: 1, totalQuantity: 2,
      items: [{ publicProductId: productId, bundleId: null, source: "catalog", commercialGroup: "equipment", slug: "camera-1", sku: "CAM-1", name: "Camera", image: null, quantity: 2, unitCode: "piece", price: { amount: 100, currency: "MDL", vatPresentation: "not_specified" }, availability: "in_stock", lineAmount: 200, stale: false, priceChanged: false }],
      bundles: [], totals: { equipment: 200, materials: 0, installation: 0, total: 200, currency: "MDL" },
    };
    expect(parsePublicRetailCart(safe)).toEqual(safe);
    expect(() => parsePublicRetailCart({ ...safe, companyId: "secret" })).toThrow();
    expect(() => parsePublicRetailCart({ ...safe, items: [{ ...safe.items[0], external1cId: "secret" }] })).toThrow();
  });
});
