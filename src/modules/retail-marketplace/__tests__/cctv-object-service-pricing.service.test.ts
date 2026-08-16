import { describe, expect, it, vi } from "vitest";
import { CctvObjectServicePricingService } from "../services/cctv-object-service-pricing.service";

describe("CctvObjectServicePricingService", () => {
  it("prices object defaults with one bounded shared resolution", async () => {
    const resolve = vi.fn().mockResolvedValue([{ requestServiceType: "camera_installation", serviceCode: "equipment_installation_class_1",
      partnerServiceId: "10000000-0000-4000-8000-000000000001", unitCode: "piece", unitPrice: 600, currency: "MDL",
      vatTreatment: "included", tariffSetId: "20000000-0000-4000-8000-000000000001", tariffVersion: 2 }]);
    const result = await new CctvObjectServicePricingService({ resolve }).price("warehouse", [
      { serviceType: "camera_installation", quantity: 12, unitCode: "piece" },
    ]);
    expect(resolve).toHaveBeenCalledOnce();
    expect(resolve).toHaveBeenCalledWith("warehouse", ["camera_installation"]);
    expect(result).toMatchObject({ complete: true, subtotal: 7200, currency: "MDL", lines: [{ unitPrice: 600, amount: 7200 }] });
  });

  it("fails closed when the object binding or tariff is unavailable", async () => {
    const result = await new CctvObjectServicePricingService({ resolve: vi.fn().mockResolvedValue([]) }).price("office", [
      { serviceType: "commissioning", quantity: 1, unitCode: "service" },
    ]);
    expect(result).toMatchObject({ complete: false, subtotal: 0, missing: ["commissioning"] });
  });

  it("resolves recommended and economy tiers in one bounded call", async () => {
    const resolve = vi.fn();
    const resolveVariants = vi.fn().mockResolvedValue({
      recommended: [{ requestServiceType: "camera_installation", serviceCode: "equipment_installation_class_2",
        serviceLabel: "Монтаж оборудования II категории", complexityClass: 2,
        partnerServiceId: "10000000-0000-4000-8000-000000000002", unitCode: "piece", unitPrice: 600, currency: "MDL",
        vatTreatment: "included", tariffSetId: "20000000-0000-4000-8000-000000000001", tariffVersion: 13 }],
      economy: [{ requestServiceType: "camera_installation", serviceCode: "equipment_installation_class_1",
        serviceLabel: "Монтаж оборудования I категории", complexityClass: 1,
        partnerServiceId: "10000000-0000-4000-8000-000000000001", unitCode: "piece", unitPrice: 450, currency: "MDL",
        vatTreatment: "included", tariffSetId: "20000000-0000-4000-8000-000000000001", tariffVersion: 13 }],
    });

    const result = await new CctvObjectServicePricingService({ resolve, resolveVariants }).priceVariants("apartment", [
      { serviceType: "camera_installation", quantity: 4, unitCode: "piece" },
    ]);

    expect(resolveVariants).toHaveBeenCalledOnce();
    expect(resolve).not.toHaveBeenCalled();
    expect(result.recommended).toMatchObject({ subtotal: 2400, lines: [{ complexityClass: 2, unitPrice: 600 }] });
    expect(result.economy).toMatchObject({ subtotal: 1800, lines: [{ complexityClass: 1, unitPrice: 450 }] });
  });
});
