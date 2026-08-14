import { beforeEach, describe, expect, it, vi } from "vitest";

const { upsertAdmin, saveAdminConfiguration, requireAdminPermission } = vi.hoisted(() => ({
  upsertAdmin: vi.fn(), saveAdminConfiguration: vi.fn(), requireAdminPermission: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../../admin/services", () => ({ requireAdminPermission }));
vi.mock("../../../cctv-calculation/cctv-camera-candidate.repository", () => ({
  SupabaseCctvCameraCandidateRepository: class {
    upsertAdmin = upsertAdmin;
  },
}));
vi.mock("../../../cctv-calculation/cctv-object-configuration.repository", () => ({
  SupabaseCctvObjectConfigurationRepository: class {
    saveAdminConfiguration = saveAdminConfiguration;
  },
}));

import { saveCctvServiceConfigurationAction, upsertCctvCameraPoolAction } from "../cctv-camera-pools.actions";

describe("CCTV camera pool actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an actionable domain conflict for a stale pool revision", async () => {
    upsertAdmin.mockRejectedValue(new Error("CCTV_CAMERA_POOL_CONFLICT"));

    await expect(upsertCctvCameraPoolAction({
      objectType: "apartment",
      placement: "indoor",
      productId: "11111111-1111-1111-1111-111111111111",
      manualPriority: "high",
      enabled: true,
      notes: "",
      expectedVersion: 1,
    })).resolves.toEqual({
      success: false,
      errorCode: "CCTV_CAMERA_POOL_CONFLICT",
      message: "Настройка изменилась. Обновите страницу и повторите действие.",
      data: null,
    });

    expect(upsertAdmin).toHaveBeenCalledOnce();
  });

  it("validates the inline tariff before reaching the repository", async () => {
    const result = await saveCctvServiceConfigurationAction({
      objectType: "apartment", serviceCode: "equipment_installation_class_1", unitPrice: "600.001",
      enabled: true, calculatorDefault: true, displayOrder: 40, notes: "", expectedBindingVersion: 1,
      expectedTariffSetId: "11111111-1111-1111-1111-111111111111", expectedTariffVersion: 1,
    });

    expect(result.success).toBe(false);
    expect(saveAdminConfiguration).not.toHaveBeenCalled();
  });

  it("requires both tariff and integration permissions and returns the canonical aggregate", async () => {
    saveAdminConfiguration.mockResolvedValue([{ objectType: "apartment", tariffSet: null, services: [] }]);

    const result = await saveCctvServiceConfigurationAction({
      objectType: "apartment", serviceCode: "equipment_installation_class_1", unitPrice: "650.00",
      enabled: true, calculatorDefault: true, displayOrder: 40, notes: "", expectedBindingVersion: 1,
      expectedTariffSetId: "11111111-1111-1111-1111-111111111111", expectedTariffVersion: 1,
    });

    expect(requireAdminPermission).toHaveBeenNthCalledWith(1, "admin.retail_marketplace.manage");
    expect(requireAdminPermission).toHaveBeenNthCalledWith(2, "admin.integrations.manage");
    expect(saveAdminConfiguration).toHaveBeenCalledWith(expect.objectContaining({ unitPrice: 650 }));
    expect(result.success).toBe(true);
  });

  it("returns a stable domain conflict for stale tariff versions", async () => {
    saveAdminConfiguration.mockRejectedValue(new Error("CCTV_TARIFF_CONFLICT"));

    const result = await saveCctvServiceConfigurationAction({
      objectType: "apartment", serviceCode: "cable_routing_class_1", unitPrice: "35.00",
      enabled: true, calculatorDefault: true, displayOrder: 10, notes: "", expectedBindingVersion: 1,
      expectedTariffSetId: "11111111-1111-1111-1111-111111111111", expectedTariffVersion: 1,
    });

    expect(result).toEqual({ success: false, errorCode: "CCTV_TARIFF_CONFLICT",
      message: "Настройка изменилась. Обновите страницу и повторите действие.", data: null });
  });
});
