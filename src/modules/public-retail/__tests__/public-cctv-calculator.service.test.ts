import { describe, expect, it, vi } from "vitest";

import type { PublicRetailReadRepository } from "../repositories/public-retail.repository";
import {
  normalizePublicCctvInput,
  publicCctvInitialInputFromSearchParams,
  PublicCctvCalculatorService,
  type PublicCctvCalculatorInput,
} from "../services/public-cctv-calculator.service";
import type { PublicRetailProductSummaryDto } from "../types";

const publicId = "8d4fe3a1-3d8a-4fa0-9b0c-87df948fe07f";

function product(profileKey: string, availability: PublicRetailProductSummaryDto["availability"] = "in_stock"): PublicRetailProductSummaryDto {
  return {
    id: publicId,
    slug: profileKey.replaceAll(".", "-"),
    sku: `SKU-${profileKey}`,
    name: `Retail ${profileKey}`,
    shortDescription: null,
    image: null,
    brand: null,
    category: null,
    price: { amount: 100, currency: "MDL", vatPresentation: "included" },
    availability,
    highlights: [],
    calculatorEligible: true,
  };
}

function input(overrides: Partial<PublicCctvCalculatorInput> = {}): PublicCctvCalculatorInput {
  return {
    locale: "ru",
    objectType: "warehouse",
    indoorCameraCount: 2,
    outdoorCameraCount: 0,
    quality: "recommended",
    archiveDays: 14,
    cableLength: 100,
    cameraInstallationRequested: false,
    cableLayingRequested: false,
    commissioningRequested: false,
    remoteViewingRequested: false,
    aiScenarioProgrammingRequested: false,
    backupPower: false,
    ...overrides,
  };
}

function repository(options: { missing?: Set<string>; ambiguous?: Set<string>; availability?: PublicRetailProductSummaryDto["availability"] } = {}) {
  const resolveCalculatorProducts = vi.fn(async (profileKeys: string[]) => profileKeys.map((profileKey) => ({
    profileKey,
    matchCount: options.missing?.has(profileKey) ? 0 : options.ambiguous?.has(profileKey) ? 2 : 1,
    product: options.missing?.has(profileKey) || options.ambiguous?.has(profileKey) ? null : product(profileKey, options.availability),
  })));
  return {
    repository: {
      listCategories: vi.fn(), listProducts: vi.fn(), getShowcase: vi.fn(), getProduct: vi.fn(), listFacets: vi.fn(),
      resolveCalculatorProducts,
    } as PublicRetailReadRepository,
    resolveCalculatorProducts,
  };
}

describe("PublicCctvCalculatorService", () => {
  it.each([
    [2, 14, "cctv.nvr.4"],
    [6, 14, "cctv.nvr.8"],
    [12, 30, "cctv.nvr.32"],
    [20, 14, "cctv.nvr.32"],
  ])("uses deterministic governed sizing for %i cameras", async (cameraCount, archiveDays, recorderProfile) => {
    const fixture = repository();
    const result = await new PublicCctvCalculatorService(fixture.repository).calculate(input({
      indoorCameraCount: cameraCount,
      archiveDays: archiveDays as 14 | 30,
    }));

    expect(fixture.resolveCalculatorProducts).toHaveBeenCalledOnce();
    expect(fixture.resolveCalculatorProducts.mock.calls[0]?.[0]).toContain(recorderProfile);
    expect(result.cameraCount).toBe(cameraCount);
    expect(result.status).toBe("resolved");
  });

  it("resolves every unique product profile in one bounded repository call", async () => {
    const fixture = repository();
    await new PublicCctvCalculatorService(fixture.repository).calculate(input({
      indoorCameraCount: 12, outdoorCameraCount: 8, archiveDays: 30, cableLength: 300,
    }));

    const requested = fixture.resolveCalculatorProducts.mock.calls[0]?.[0] ?? [];
    expect(new Set(requested).size).toBe(requested.length);
    expect(requested.some((key) => key.startsWith("cctv.poe."))).toBe(true);
    expect(requested.length).toBeLessThanOrEqual(30);
  });

  it("uses only governed RETAIL prices for product totals", async () => {
    const fixture = repository();
    const result = await new PublicCctvCalculatorService(fixture.repository).calculate(input());
    const productLines = result.lines.filter((line) => line.kind === "product");

    expect(productLines.every((line) => line.unitPrice === 100 && line.currency === "MDL")).toBe(true);
    expect(result.totals.total).toBe(productLines.reduce((sum, line) => sum + (line.amount ?? 0), 0));
  });

  it("uses the shared governed camera policy and returns a cheaper public alternative without ranking internals", async () => {
    const fixture = repository();
    const recommended = { ...product("recommended"), id: uuid("6"), price: { amount: 120, currency: "MDL", vatPresentation: "included" as const } };
    const economy = { ...product("economy"), id: uuid("7"), price: { amount: 80, currency: "MDL", vatPresentation: "included" as const } };
    const cameraCandidates = { resolve: vi.fn().mockResolvedValue([
      candidate(uuid("2"), recommended, { availableStock: 80, recentSalesQty: 0 }),
      candidate(uuid("3"), economy, { availableStock: 20, recentSalesQty: 60 }),
    ]) };
    const result = await new PublicCctvCalculatorService(fixture.repository, undefined, cameraCandidates as never).calculate(input());
    expect(cameraCandidates.resolve).toHaveBeenCalledOnce();
    expect(result.lines.find((line) => line.requirementKind === "indoor_camera")?.product?.id).toBe(recommended.id);
    expect(result.economyLines?.find((line) => line.requirementKind === "indoor_camera")?.product?.id).toBe(economy.id);
    expect(result.cameraSelection).toEqual(expect.objectContaining({ policyVersion: "cctv_camera_selection_v1" }));
    expect(JSON.stringify(result)).not.toMatch(/priorityScore|slowSalesScore|recentSalesQty|availableStock/);
  });

  it("offers a genuinely cheaper Apartment economy result through one governed service-tier resolution", async () => {
    const fixture = repository();
    const camera = { ...product("apartment-camera"), id: uuid("6"), price: {
      amount: 1044, currency: "MDL", vatPresentation: "included" as const,
    } };
    const cameraCandidates = { resolve: vi.fn().mockResolvedValue([
      candidate(uuid("2"), camera, { objectType: "apartment", availableStock: 36 }),
    ]) };
    const price = vi.fn();
    const priceVariants = vi.fn().mockResolvedValue({
      recommended: installationPricing(600, 2, "equipment_installation_class_2"),
      economy: installationPricing(450, 1, "equipment_installation_class_1"),
    });

    const result = await new PublicCctvCalculatorService(
      fixture.repository,
      { price, priceVariants },
      cameraCandidates as never,
    ).calculate(input({ objectType: "apartment", indoorCameraCount: 4, cameraInstallationRequested: true }));

    expect(priceVariants).toHaveBeenCalledOnce();
    expect(price).not.toHaveBeenCalled();
    expect(cameraCandidates.resolve).toHaveBeenCalledOnce();
    expect(fixture.resolveCalculatorProducts).toHaveBeenCalledOnce();
    expect(result.economyTotals?.total).toBeLessThan(result.totals.total!);
    expect(result.installationPricing.lines[0]).toMatchObject({ complexityClass: 2, unitPrice: 600 });
    expect(result.economyInstallationPricing?.lines[0]).toMatchObject({ complexityClass: 1, unitPrice: 450 });
    expect(result.economyLines?.find((line) => line.requirementKind === "indoor_camera")?.product?.id).toBe(camera.id);
  });

  it("suppresses Economy when neither camera nor service pricing is cheaper", async () => {
    const fixture = repository();
    const samePricing = installationPricing(450, 1, "equipment_installation_class_1");
    const result = await new PublicCctvCalculatorService(fixture.repository, {
      price: vi.fn(),
      priceVariants: vi.fn().mockResolvedValue({ recommended: samePricing, economy: samePricing }),
    }).calculate(input({ objectType: "apartment", cameraInstallationRequested: true }));

    expect(result.economyLines).toBeNull();
    expect(result.economyTotals).toBeNull();
    expect(result.economyInstallationPricing).toBeNull();
  });

  it("keeps installation quantities unpriced and respects independent choices", async () => {
    const fixture = repository();
    const result = await new PublicCctvCalculatorService(fixture.repository).calculate(input({
      cameraInstallationRequested: true,
      cableLayingRequested: false,
      commissioningRequested: true,
      remoteViewingRequested: true,
    }));
    const works = result.lines.filter((line) => line.kind === "work");

    expect(works.some((line) => line.label === "Монтаж камер")).toBe(true);
    expect(works.some((line) => line.label === "Прокладка кабеля")).toBe(false);
    expect(works).toEqual(expect.arrayContaining([
      expect.objectContaining({ unitPrice: null, amount: null, currency: null }),
    ]));
    expect(result.totals.installation).toBeNull();
  });

  it("prices installation from one governed tariff set without changing the technical engine", async () => {
    const fixture = repository();
    const pricing = { price: vi.fn().mockResolvedValue({ complete: true, tariffSetId: "30000000-0000-4000-8000-000000000001", tariffVersion: 3, currency: "MDL", vatTreatment: "included", lines: [
      { serviceType: "camera_installation", quantity: 2, unitCode: "piece", unitPrice: 100, amount: 200 },
      { serviceType: "cable_laying", quantity: 100, unitCode: "meter", unitPrice: 5, amount: 500 },
    ], subtotal: 700, missing: [] }) };
    const result = await new PublicCctvCalculatorService(fixture.repository, pricing).calculate(input({ cameraInstallationRequested: true, cableLayingRequested: true }));
    expect(pricing.price).toHaveBeenCalledOnce();
    expect(result.totals.installation).toBe(700);
    expect(result.lines.filter((line) => line.kind === "work").every((line) => line.amount !== null)).toBe(true);
    expect(result.status).toBe("resolved");
  });

  it("prices AI scenario programming through the shared governed tariff", async () => {
    const fixture = repository();
    const pricing = { price: vi.fn().mockResolvedValue({ complete: true, tariffSetId: uuid("3"), tariffVersion: 10,
      currency: "MDL", vatTreatment: "included", lines: [{ serviceType: "ai_scenario_programming", quantity: 1,
        unitCode: "service", unitPrice: 1000, amount: 1000 }], subtotal: 1000, missing: [] }) };
    const result = await new PublicCctvCalculatorService(fixture.repository, pricing).calculate(input({ aiScenarioProgrammingRequested: true }));
    expect(pricing.price).toHaveBeenCalledWith("warehouse", [expect.objectContaining({ serviceType: "ai_scenario_programming" })]);
    expect(result.lines).toContainEqual(expect.objectContaining({ requirementKind: "ai_scenario_programming", amount: 1000 }));
  });

  it("keeps an unpriced installation requirement provisional without fabricating its tariff", async () => {
    const fixture = repository();
    const result = await new PublicCctvCalculatorService(fixture.repository, { price: vi.fn().mockResolvedValue({ complete: false, tariffSetId: null, tariffVersion: null, currency: null, vatTreatment: null, lines: [], subtotal: null, missing: ["commissioning"] }) }).calculate(input({ commissioningRequested: true }));
    expect(result.status).toBe("needs_review");
    expect(result.totals.total).toBeGreaterThan(0);
    expect(result.totals.isPartial).toBe(true);
    expect(result.provisionalRequirements).toContainEqual(expect.objectContaining({ reason: "price_pending", requirementKind: "commissioning" }));
  });

  it("keeps missing governed profiles explicit without blocking known-line totals", async () => {
    const fixture = repository({ missing: new Set(["cctv.indoor.6mp"]) });
    const result = await new PublicCctvCalculatorService(fixture.repository).calculate(input());

    expect(result.status).toBe("needs_review");
    expect(result.unresolved).toContain("Камера для помещения");
    expect(result.lines.find((line) => line.label === "Камера для помещения")?.product).toBeNull();
    expect(result.provisionalRequirements).toContainEqual(expect.objectContaining({
      label: "Камера для помещения", reason: "unresolved_identity", quantity: 2,
    }));
    expect(result.totals.isPartial).toBe(true);
    expect(result.totals.total).toBeGreaterThan(0);
  });

  it("keeps a governed out-of-stock product selectable without inventing availability", async () => {
    const fixture = repository({ availability: "unavailable" });
    const result = await new PublicCctvCalculatorService(fixture.repository).calculate(input());
    expect(result.status).toBe("resolved");
    expect(result.provisionalRequirements).toEqual([]);
    expect(result.lines.filter((line) => line.kind === "product").every((line) => line.product?.availability === "unavailable")).toBe(true);
    expect(result.totals.isPartial).toBe(false);
  });

  it("does not expose governed profile keys or internal commercial identifiers", async () => {
    const fixture = repository();
    const serialized = JSON.stringify(await new PublicCctvCalculatorService(fixture.repository).calculate(input()));

    expect(serialized).not.toContain("profileKey");
    expect(serialized).not.toContain("external_1c");
    expect(serialized).not.toContain("partner_price");
    expect(serialized).not.toContain("company_id");
  });

  it("rejects malformed and unbounded public input", () => {
    expect(() => normalizePublicCctvInput(input({ indoorCameraCount: 33 }))).toThrow();
    expect(() => normalizePublicCctvInput(input({ indoorCameraCount: 0, outdoorCameraCount: 0 }))).toThrow();
    expect(() => normalizePublicCctvInput(input({ cableLength: 20_001 }))).toThrow();
  });

  it("does not overwrite fresh-flow installation defaults with absent query flags", () => {
    expect(publicCctvInitialInputFromSearchParams({ lang: "ru", object: "warehouse" })).toBeUndefined();
    expect(publicCctvInitialInputFromSearchParams({
      lang: "ru", object: "warehouse", indoor: "2", outdoor: "2",
      quality: "recommended", archive: "14", cable: "100",
    })).toEqual(expect.objectContaining({
      cameraInstallationRequested: false,
      cableLayingRequested: false,
      commissioningRequested: false,
      remoteViewingRequested: false,
    }));
  });
});

function uuid(digit: string) { return `${digit.repeat(8)}-${digit.repeat(4)}-${digit.repeat(4)}-${digit.repeat(4)}-${digit.repeat(12)}`; }
function candidate(productId: string, publicProduct: PublicRetailProductSummaryDto, overrides: Record<string, unknown>) {
  return { candidateId: uuid("9"), objectType: "warehouse", placement: "indoor", productId,
    manualPriority: "normal", enabled: true, eligibleForRecommended: true, eligibleForEconomy: true,
    resolutionMp: 6, networkCamera: true, poeSupported: null,
    colorNight: null, anpr: null, videoAnalytics: null, technicalVerified: true, availableStock: 1,
    recentSalesQty: 0, lastSaleAt: null, signalUpdatedAt: null, sku: publicProduct.sku, name: publicProduct.name,
    imageUrl: null, publicProduct, ...overrides };
}

function installationPricing(unitPrice: number, complexityClass: number, resolvedServiceCode: string) {
  return { complete: true, tariffSetId: uuid("3"), tariffVersion: 13, currency: "MDL" as const,
    vatTreatment: "included" as const, lines: [{ serviceType: "camera_installation" as const, quantity: 4,
      unitCode: "piece" as const, unitPrice, amount: unitPrice * 4, complexityClass, resolvedServiceCode,
      serviceLabel: `Installation class ${complexityClass}` }], subtotal: unitPrice * 4, missing: [] };
}
