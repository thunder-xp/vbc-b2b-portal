import { describe, expect, it, vi } from "vitest";

import { ProposalGeneratorService } from "../proposal-generator.service";

const uuid = (digit: string) => `${digit.repeat(8)}-${digit.repeat(4)}-${digit.repeat(4)}-${digit.repeat(4)}-${digit.repeat(12)}`;

describe("ProposalGeneratorService", () => {
  it("resolves quick-calculation profiles and prices in bounded batches", async () => {
    const recordSession = vi.fn().mockResolvedValue(uuid("8"));
    const resolveCalculatorProfiles = vi.fn().mockResolvedValue([
      { profileKey: "cctv.indoor.6mp", resolution: "catalog", resolvedId: uuid("2"), resolvedLabel: "CAM-1 · Camera", defaultSellingUnitPrice: null, defaultSellingCurrencyCode: null, defaultSellingVatMode: null },
    ]);
    const companyAccess = { getOwnMemberships: vi.fn().mockResolvedValue([{ companyId: uuid("4"), status: "active" }]), getActiveCompanyContext: vi.fn().mockResolvedValue({ company: { id: uuid("4") } }) };
    const pricing = { getProductCommercialViews: vi.fn().mockResolvedValue([{ productId: uuid("2"), retailPrice: { amount: 150, currencyCode: "USD" }, stock: { label: "Нет в наличии" } }]) };
    const service = new ProposalGeneratorService({ recordSession, resolveCalculatorProfiles } as never, companyAccess as never, { ensurePermission: vi.fn() } as never, {} as never, pricing as never);
    const result = await service.calculateCctv(uuid("1"), { requestKey: uuid("7"), currencyCode: "USD", parameters: {
      objectType: "apartment", indoorCameraCount: 1, outdoorCameraCount: 0, archiveDays: 7, cableLength: 0,
      installationRequested: false, commissioningRequested: false, remoteViewingRequested: false,
      indoorResolutionMp: 6, outdoorResolutionMp: 4, recorderSelection: "auto",
      colorNight: false, licensePlateRecognition: false, videoAnalytics: false, backupPower: false,
    } });
    expect(resolveCalculatorProfiles).toHaveBeenCalledTimes(1);
    expect(pricing.getProductCommercialViews).toHaveBeenCalledTimes(1);
    expect(result.requirements.find((line) => line.profileKey === "cctv.indoor.6mp")).toMatchObject({
      resolution: "catalog", resolvedLabel: "Camera", resolvedSku: "CAM-1", sellingUnitPrice: 150, resolvedStockLabel: "Нет в наличии",
    });
    expect(recordSession).toHaveBeenCalledWith(expect.objectContaining({
      generationMode: "quick_calculation",
      structuredFacts: expect.objectContaining({
        systemType: "cctv",
        storageIncompatibilityDetected: expect.any(Boolean),
        insufficientPoeWarning: expect.any(Boolean),
        automaticRecorderProfile: null,
        compatibleConfigurationFound: false,
      }),
    }));
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
      indoorResolutionMp: 6, outdoorResolutionMp: 4, recorderSelection: "auto",
      colorNight: false, licensePlateRecognition: false, videoAnalytics: false, backupPower: false,
    } });
    expect(result.requirements.find((line) => line.profileKey === "cctv.mounting")).toMatchObject({ resolvedId: pfaId, resolution: "catalog", quantity: 12, sellingUnitPrice: 275 });
    expect(result.requirements.find((line) => line.profileKey === "cctv.install.camera")).toMatchObject({ resolvedId: installId, resolution: "service", quantity: 12, sellingUnitPrice: 600, sellingCurrencyCode: "MDL", sellingVatMode: "included" });
    expect(pricing.getProductCommercialViews).toHaveBeenCalledTimes(1);
  });

  it("applies every approved VAT-included CCTV service tariff to its governed quantity", async () => {
    const resolveCalculatorProfiles = vi.fn().mockResolvedValue([
      { profileKey: "cctv.install.camera", resolution: "service", resolvedId: "2f4fbba6-d228-4375-9fb7-8badf2ba7357", resolvedLabel: "Монтаж видеокамеры", defaultSellingUnitPrice: 600, defaultSellingCurrencyCode: "MDL", defaultSellingVatMode: "included" },
      { profileKey: "cctv.install.cable", resolution: "service", resolvedId: "c95756dc-f217-42b0-bbee-8fd7a9c1b9d8", resolvedLabel: "Прокладка кабеля", defaultSellingUnitPrice: 50, defaultSellingCurrencyCode: "MDL", defaultSellingVatMode: "included" },
      { profileKey: "cctv.commissioning.system", resolution: "service", resolvedId: "a5dc22f4-8988-400d-a9c9-68405d2d72f2", resolvedLabel: "Пусконаладочные работы", defaultSellingUnitPrice: 250, defaultSellingCurrencyCode: "MDL", defaultSellingVatMode: "included" },
      { profileKey: "cctv.commissioning.remote", resolution: "service", resolvedId: "09a3d8d8-ced8-4b41-923f-f8c4ea69b1ca", resolvedLabel: "Настройка оборудования", defaultSellingUnitPrice: 150, defaultSellingCurrencyCode: "MDL", defaultSellingVatMode: "included" },
    ]);
    const service = new ProposalGeneratorService(
      { recordSession: vi.fn().mockResolvedValue(uuid("8")), resolveCalculatorProfiles } as never,
      { getOwnMemberships: vi.fn().mockResolvedValue([{ companyId: uuid("4"), status: "active" }]), getActiveCompanyContext: vi.fn().mockResolvedValue({ company: { id: uuid("4") } }) } as never,
      { ensurePermission: vi.fn() } as never,
      {} as never,
      { getProductCommercialViews: vi.fn().mockResolvedValue([]) } as never,
    );

    const result = await service.calculateCctv(uuid("1"), { requestKey: uuid("7"), currencyCode: "MDL", parameters: {
      objectType: "warehouse", indoorCameraCount: 8, outdoorCameraCount: 4, archiveDays: 30, cableLength: 300,
      installationRequested: true, commissioningRequested: true, remoteViewingRequested: true,
      indoorResolutionMp: 6, outdoorResolutionMp: 4, recorderSelection: "auto",
      colorNight: false, licensePlateRecognition: false, videoAnalytics: false, backupPower: false,
    } });

    expect(result.requirements.find((line) => line.profileKey === "cctv.install.camera")).toMatchObject({ quantity: 12, sellingUnitPrice: 600, sellingCurrencyCode: "MDL", sellingVatMode: "included" });
    expect(result.requirements.find((line) => line.profileKey === "cctv.install.cable")).toMatchObject({ quantity: 300, sellingUnitPrice: 50, sellingCurrencyCode: "MDL", sellingVatMode: "included" });
    expect(result.requirements.find((line) => line.profileKey === "cctv.commissioning.system")).toMatchObject({ quantity: 12, sellingUnitPrice: 250, sellingCurrencyCode: "MDL", sellingVatMode: "included" });
    expect(result.requirements.find((line) => line.profileKey === "cctv.commissioning.remote")).toMatchObject({ quantity: 1, sellingUnitPrice: 150, sellingCurrencyCode: "MDL", sellingVatMode: "included" });
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
    const catalog = { getProductOrderIdentities: vi.fn().mockResolvedValue([{ id: uuid("2"), external1cId: uuid("9"), sku: "CAM-1", name: "Камера" }]) };
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
    expect(catalog.getProductOrderIdentities).toHaveBeenCalledTimes(1);
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
