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
});
