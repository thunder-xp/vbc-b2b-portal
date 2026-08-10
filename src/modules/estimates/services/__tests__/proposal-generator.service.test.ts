import { describe, expect, it, vi } from "vitest";

import { ProposalGeneratorService } from "../proposal-generator.service";

const uuid = (digit: string) => `${digit.repeat(8)}-${digit.repeat(4)}-${digit.repeat(4)}-${digit.repeat(4)}-${digit.repeat(12)}`;

describe("ProposalGeneratorService", () => {
  it("resolves quick-calculation profiles and prices in bounded batches", async () => {
    const recordSession = vi.fn().mockResolvedValue(uuid("8"));
    const resolveCalculatorProfiles = vi.fn().mockResolvedValue([
      { profileKey: "cctv.indoor.standard", resolution: "catalog", resolvedId: uuid("2"), resolvedLabel: "CAM-1", defaultSellingUnitPrice: null, defaultSellingCurrencyCode: null, defaultSellingVatMode: null },
    ]);
    const companyAccess = { getOwnMemberships: vi.fn().mockResolvedValue([{ companyId: uuid("4"), status: "active" }]), getActiveCompanyContext: vi.fn().mockResolvedValue({ company: { id: uuid("4") } }) };
    const pricing = { getProductCommercialViews: vi.fn().mockResolvedValue([{ productId: uuid("2"), retailPrice: { amount: 150, currencyCode: "USD" } }]) };
    const service = new ProposalGeneratorService({ recordSession, resolveCalculatorProfiles } as never, companyAccess as never, { ensurePermission: vi.fn() } as never, {} as never, pricing as never);
    const result = await service.calculateCctv(uuid("1"), { requestKey: uuid("7"), currencyCode: "USD", parameters: {
      objectType: "apartment", indoorCameraCount: 1, outdoorCameraCount: 0, archiveDays: 7, cableLength: 0,
      installationRequested: false, commissioningRequested: false, remoteViewingRequested: false,
      colorNight: false, highResolution: false, licensePlateRecognition: false, videoAnalytics: false, backupPower: false,
    } });
    expect(resolveCalculatorProfiles).toHaveBeenCalledTimes(1);
    expect(pricing.getProductCommercialViews).toHaveBeenCalledTimes(1);
    expect(result.requirements.find((line) => line.profileKey === "cctv.indoor.standard")).toMatchObject({ resolution: "catalog", sellingUnitPrice: 150 });
    expect(recordSession).toHaveBeenCalledWith(expect.objectContaining({ generationMode: "quick_calculation", structuredFacts: expect.objectContaining({ systemType: "cctv" }) }));
  });

  it("uses the exact governed PFA-130E mapping and VAT-included camera installation default", async () => {
    const recordSession = vi.fn().mockResolvedValue(uuid("8"));
    const pfaId = "0a4a7f2f-3ac6-4429-b0ee-3a3a00749df5";
    const installId = "2f4fbba6-d228-4375-9fb7-8badf2ba7357";
    const resolveCalculatorProfiles = vi.fn().mockResolvedValue([
      { profileKey: "cctv.mounting", resolution: "catalog", resolvedId: pfaId, resolvedLabel: "100078 · DH-PFA130-E", defaultSellingUnitPrice: null, defaultSellingCurrencyCode: null, defaultSellingVatMode: null },
      { profileKey: "cctv.install.camera", resolution: "service", resolvedId: installId, resolvedLabel: "Монтаж видеокамеры", defaultSellingUnitPrice: 600, defaultSellingCurrencyCode: "MDL", defaultSellingVatMode: "included" },
    ]);
    const companyAccess = { getOwnMemberships: vi.fn().mockResolvedValue([{ companyId: uuid("4"), status: "active" }]), getActiveCompanyContext: vi.fn().mockResolvedValue({ company: { id: uuid("4") } }) };
    const pricing = { getProductCommercialViews: vi.fn().mockResolvedValue([{ productId: pfaId, retailPrice: { amount: 275, currencyCode: "MDL" } }]) };
    const service = new ProposalGeneratorService({ recordSession, resolveCalculatorProfiles } as never, companyAccess as never, { ensurePermission: vi.fn() } as never, {} as never, pricing as never);
    const result = await service.calculateCctv(uuid("1"), { requestKey: uuid("7"), currencyCode: "MDL", parameters: {
      objectType: "warehouse", indoorCameraCount: 8, outdoorCameraCount: 4, archiveDays: 30, cableLength: 300,
      installationRequested: true, commissioningRequested: false, remoteViewingRequested: false,
      colorNight: false, highResolution: false, licensePlateRecognition: false, videoAnalytics: false, backupPower: false,
    } });
    expect(result.requirements.find((line) => line.profileKey === "cctv.mounting")).toMatchObject({ resolvedId: pfaId, resolution: "catalog", quantity: 12, sellingUnitPrice: 275 });
    expect(result.requirements.find((line) => line.profileKey === "cctv.install.camera")).toMatchObject({ resolvedId: installId, resolution: "service", quantity: 12, sellingUnitPrice: 600, sellingCurrencyCode: "MDL", sellingVatMode: "included" });
    expect(pricing.getProductCommercialViews).toHaveBeenCalledTimes(1);
  });

  it("resolves catalog and external identities in bounded batches and initializes RETAIL selling price", async () => {
    const createEstimate = vi.fn().mockResolvedValue(uuid("9"));
    const resolveExternalNomenclature = vi.fn().mockResolvedValue([{ id: uuid("3"), name: "Монтаж камеры", unit: "service", itemType: "service" }]);
    const resolveServices = vi.fn().mockResolvedValue([{ id: uuid("4"), name: "Монтаж видеокамеры", unit: "pcs", defaultCost: null, defaultSellingPrice: null }]);
    const resolveCalculatorProfiles = vi.fn().mockResolvedValue([{ profileKey: "cctv.install.camera", resolution: "service", resolvedId: uuid("4"), defaultSellingUnitPrice: 600, defaultSellingCurrencyCode: "MDL", defaultSellingVatMode: "included" }]);
    const repository = { createEstimate, resolveExternalNomenclature, resolveServices, resolveCalculatorProfiles };
    const companyAccess = {
      getOwnMemberships: vi.fn().mockResolvedValue([{ companyId: uuid("4"), status: "active" }]),
      getActiveCompanyContext: vi.fn().mockResolvedValue({ company: { id: uuid("4") } }),
    };
    const permissions = {
      ensurePermission: vi.fn(),
      getEffectivePermissionContext: vi.fn().mockResolvedValue({ userId: uuid("1"), companyId: uuid("4"), effectivePermissionCodes: ["pricing.partner_price.view"] }),
    };
    const catalog = { getProductsByIds: vi.fn().mockResolvedValue([{ id: uuid("2"), sku: "CAM-1", name: "Камера" }]) };
    const pricing = { getProductCommercialViews: vi.fn().mockResolvedValue([{ productId: uuid("2"), retailPrice: { amount: 150, currencyCode: "MDL" }, partnerPrice: null }]) };
    const service = new ProposalGeneratorService(repository as never, companyAccess as never, permissions as never, catalog as never, pricing as never);
    const result = await service.createEstimate(uuid("1"), {
      sessionId: uuid("5"), sessionFingerprint: "a".repeat(64), finalCustomerId: uuid("6"), name: "Склад", currencyCode: "MDL", vatMode: "included", validityDays: 14, requestKey: uuid("7"),
      requirements: [
        { id: "one", sectionKey: "equipment", description: "Камера", quantity: 2, unit: "pcs", resolution: "catalog", resolvedId: uuid("2"), resolvedLabel: "CAM-1" },
        { id: "two", profileKey: "cctv.install.camera", sectionKey: "installation_works", description: "Монтаж", quantity: 2, unit: "pcs", resolution: "service", resolvedId: uuid("4"), resolvedLabel: "Монтаж видеокамеры" },
        { id: "three", sectionKey: "installation_works", description: "Внешняя работа", quantity: 1, unit: "service", resolution: "own_nomenclature", resolvedId: uuid("3"), resolvedLabel: "Монтаж камеры" },
        { id: "four", sectionKey: "equipment", description: "Архив 30 дней", quantity: 1, unit: "pcs", resolution: "unresolved", resolvedId: null, resolvedLabel: null },
      ],
    });
    expect(catalog.getProductsByIds).toHaveBeenCalledTimes(1);
    expect(pricing.getProductCommercialViews).toHaveBeenCalledTimes(1);
    expect(resolveExternalNomenclature).toHaveBeenCalledTimes(1);
    expect(resolveServices).toHaveBeenCalledTimes(1);
    const submitted = createEstimate.mock.calls[0][0];
    expect(submitted.vatMode).toBe("included");
    expect(submitted.lines[0]).toMatchObject({ lineType: "product", sellingUnitPrice: 150, sourceUnitPrice: null });
    expect(resolveCalculatorProfiles).toHaveBeenCalledTimes(1);
    expect(submitted.lines[1]).toMatchObject({ lineType: "service", serviceId: uuid("4"), profileKey: "cctv.install.camera", sellingUnitPrice: 600, unit: "pcs" });
    expect(submitted.lines[2]).toMatchObject({ lineType: "external", sellingUnitPrice: null, externalNomenclatureId: uuid("3") });
    expect(submitted.lines[3]).toMatchObject({ lineType: "custom", sellingUnitPrice: null });
    expect(result.counts).toEqual({ catalog: 1, service: 1, own: 1, shared: 0, unresolved: 1 });
  });
});
