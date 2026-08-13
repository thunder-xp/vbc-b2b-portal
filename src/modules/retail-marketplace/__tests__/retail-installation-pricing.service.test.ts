import { describe, expect, it, vi } from "vitest";

import { RetailInstallationPricingService } from "../services/retail-installation-pricing.service";

const tariffSet = {
  tariffSetId: "10000000-0000-4000-8000-000000000001",
  version: 2,
  systemType: "cctv" as const,
  currency: "MDL",
  vatTreatment: "included" as const,
  effectiveFrom: "2026-08-13T00:00:00Z",
  lines: [
    { serviceType: "camera_installation" as const, unitCode: "piece" as const, unitPrice: 125 },
    { serviceType: "cable_laying" as const, unitCode: "meter" as const, unitPrice: 10 },
  ],
};

describe("RetailInstallationPricingService", () => {
  it("prices a complete requirement set from one governed tariff read", async () => {
    const repository = { getCurrentTariffs: vi.fn().mockResolvedValue(tariffSet) };
    const result = await new RetailInstallationPricingService(repository).price([
      { serviceType: "camera_installation", quantity: 4, unitCode: "piece" },
      { serviceType: "cable_laying", quantity: 30, unitCode: "meter" },
    ]);
    expect(repository.getCurrentTariffs).toHaveBeenCalledOnce();
    expect(result).toEqual(expect.objectContaining({ complete: true, tariffSetId: tariffSet.tariffSetId, tariffVersion: 2, subtotal: 800 }));
  });

  it("fails closed when no published tariff exists", async () => {
    const result = await new RetailInstallationPricingService({ getCurrentTariffs: vi.fn().mockResolvedValue(null) }).price([
      { serviceType: "commissioning", quantity: 1, unitCode: "service" },
    ]);
    expect(result).toEqual(expect.objectContaining({ complete: false, subtotal: null, missing: ["commissioning"] }));
  });

  it("fails closed for a unit mismatch and does not partially price", async () => {
    const result = await new RetailInstallationPricingService({ getCurrentTariffs: vi.fn().mockResolvedValue(tariffSet) }).price([
      { serviceType: "camera_installation", quantity: 1, unitCode: "meter" },
    ]);
    expect(result).toEqual(expect.objectContaining({ complete: false, lines: [], subtotal: null }));
  });

  it("does not query tariffs when no installation work is requested", async () => {
    const repository = { getCurrentTariffs: vi.fn() };
    expect(await new RetailInstallationPricingService(repository).price([])).toEqual(expect.objectContaining({ complete: true, subtotal: 0 }));
    expect(repository.getCurrentTariffs).not.toHaveBeenCalled();
  });
});
