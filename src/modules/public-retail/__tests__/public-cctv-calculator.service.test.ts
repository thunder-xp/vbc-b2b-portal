import { describe, expect, it, vi } from "vitest";

import type { PublicRetailReadRepository } from "../repositories/public-retail.repository";
import {
  normalizePublicCctvInput,
  PublicCctvCalculatorService,
  type PublicCctvCalculatorInput,
} from "../services/public-cctv-calculator.service";
import type { PublicRetailProductSummaryDto } from "../types";

const publicId = "8d4fe3a1-3d8a-4fa0-9b0c-87df948fe07f";

function product(profileKey: string): PublicRetailProductSummaryDto {
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
    availability: "in_stock",
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
    backupPower: false,
    ...overrides,
  };
}

function repository(options: { missing?: Set<string>; ambiguous?: Set<string> } = {}) {
  const resolveCalculatorProducts = vi.fn(async (profileKeys: string[]) => profileKeys.map((profileKey) => ({
    profileKey,
    matchCount: options.missing?.has(profileKey) ? 0 : options.ambiguous?.has(profileKey) ? 2 : 1,
    product: options.missing?.has(profileKey) || options.ambiguous?.has(profileKey) ? null : product(profileKey),
  })));
  return {
    repository: {
      listCategories: vi.fn(), listProducts: vi.fn(), getProduct: vi.fn(), listFacets: vi.fn(),
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

  it("fails closed for missing or ambiguous governed profiles", async () => {
    const fixture = repository({ missing: new Set(["cctv.indoor.6mp"]) });
    const result = await new PublicCctvCalculatorService(fixture.repository).calculate(input());

    expect(result.status).toBe("needs_review");
    expect(result.unresolved).toContain("Камера для помещения");
    expect(result.lines.find((line) => line.label === "Камера для помещения")?.product).toBeNull();
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
});
