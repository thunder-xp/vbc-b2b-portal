import { beforeEach, describe, expect, it, vi } from "vitest";

const { listAdmin, revalidatePath, searchAdmin, upsertAdmin, saveAdminConfiguration, requireAdminPermission } = vi.hoisted(() => ({
  listAdmin: vi.fn(), revalidatePath: vi.fn(), searchAdmin: vi.fn(), upsertAdmin: vi.fn(),
  saveAdminConfiguration: vi.fn(), requireAdminPermission: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("../../../admin/services", () => ({ requireAdminPermission }));
vi.mock("../../../cctv-calculation/cctv-camera-candidate.repository", () => ({
  SupabaseCctvCameraCandidateRepository: class {
    listAdmin = listAdmin;
    searchAdmin = searchAdmin;
    upsertAdmin = upsertAdmin;
  },
}));
vi.mock("../../../cctv-calculation/cctv-object-configuration.repository", () => ({
  SupabaseCctvObjectConfigurationRepository: class {
    saveAdminConfiguration = saveAdminConfiguration;
  },
}));

import { addCctvCameraCandidateByQueryAction, saveCctvServiceConfigurationAction,
  upsertCctvCameraPoolAction } from "../cctv-camera-pools.actions";

const candidate = {
  productId: "11111111-1111-1111-1111-111111111111", sku: "400540", name: "Camera",
  imageUrl: null, resolutionMp: 4, colorNight: false, anpr: false, videoAnalytics: false,
  technicalVerified: true, availableStock: 4, recentSalesQty: 2, retailPriceAmount: 100,
  retailPriceCurrency: "MDL", alreadyInPool: false, existingPoolVersion: null, existingPoolArchived: false,
};
const savedCandidate = {
  candidateId: "22222222-2222-2222-2222-222222222222", objectType: "warehouse", placement: "indoor",
  ...candidate, manualPriority: "normal", enabled: true, eligibleForRecommended: true,
  eligibleForEconomy: true, networkCamera: true, poeSupported: true, lastSaleAt: null,
  signalUpdatedAt: null, publicProduct: null, notes: null, version: 1, evidenceSource: "catalog",
  publicPublished: true,
};
const queryInput = { query: "400540", objectType: "warehouse", placement: "indoor" as const };

describe("CCTV camera pool actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("adds the sole governed candidate and returns a successful addition", async () => {
    searchAdmin.mockResolvedValue([candidate]);
    upsertAdmin.mockResolvedValue({ candidateId: savedCandidate.candidateId, version: 1 });
    listAdmin.mockResolvedValue([savedCandidate]);

    const result = await addCctvCameraCandidateByQueryAction(queryInput);

    expect(result).toEqual({ success: true, errorCode: null, message: "Кандидат камеры сохранён.", data: {
      status: "added", candidates: [{ ...candidate, alreadyInPool: true, existingPoolVersion: 1,
        existingPoolArchived: false }], saved: savedCandidate,
    } });
    expect(searchAdmin).toHaveBeenCalledOnce();
    expect(requireAdminPermission).toHaveBeenNthCalledWith(1, "admin.estimates.view");
    expect(requireAdminPermission).toHaveBeenNthCalledWith(2, "admin.integrations.manage");
    expect(upsertAdmin).toHaveBeenCalledOnce();
    expect(listAdmin).toHaveBeenCalledOnce();
    expect(revalidatePath).toHaveBeenCalledWith("/admin/commercial/proposal-generator");
  });

  it("returns a real not-found result without attempting persistence", async () => {
    searchAdmin.mockResolvedValue([]);

    await expect(addCctvCameraCandidateByQueryAction(queryInput)).resolves.toEqual({
      success: false, errorCode: "CCTV_CAMERA_NOT_FOUND", message: "Камера не найдена.", data: null,
    });
    expect(upsertAdmin).not.toHaveBeenCalled();
  });

  it("requires explicit selection when multiple candidates match", async () => {
    const candidates = [candidate, { ...candidate, productId: "33333333-3333-3333-3333-333333333333", sku: "400540-B" }];
    searchAdmin.mockResolvedValue(candidates);

    const result = await addCctvCameraCandidateByQueryAction(queryInput);

    expect(result).toEqual({ success: true, errorCode: null, message: "Найдено несколько камер. Выберите нужную.",
      data: { status: "requires_selection", candidates, saved: null } });
    expect(requireAdminPermission).toHaveBeenCalledOnce();
    expect(requireAdminPermission).toHaveBeenCalledWith("admin.estimates.view");
    expect(upsertAdmin).not.toHaveBeenCalled();
  });

  it("treats an existing pool candidate as a harmless idempotent result", async () => {
    searchAdmin.mockResolvedValue([{ ...candidate, alreadyInPool: true, existingPoolVersion: 3 }]);

    const result = await addCctvCameraCandidateByQueryAction(queryInput);

    expect(result).toEqual({ success: true, errorCode: null, message: "Камера уже добавлена в этот пул.", data: {
      status: "already_in_pool", candidates: [{ ...candidate, alreadyInPool: true, existingPoolVersion: 3 }], saved: null,
    } });
    expect(upsertAdmin).not.toHaveBeenCalled();
  });

  it("returns a persistence error only when the governed write fails", async () => {
    searchAdmin.mockResolvedValue([candidate]);
    upsertAdmin.mockRejectedValue(new Error("database unavailable"));

    await expect(addCctvCameraCandidateByQueryAction(queryInput)).resolves.toEqual({
      success: false, errorCode: "CCTV_CAMERA_PERSISTENCE_ERROR", message: "Не удалось добавить камеру в пул.", data: null,
    });
    expect(searchAdmin).toHaveBeenCalledOnce();
    expect(upsertAdmin).toHaveBeenCalledOnce();
    expect(listAdmin).not.toHaveBeenCalled();
  });

  it("returns an actionable domain conflict for a stale pool revision", async () => {
    upsertAdmin.mockRejectedValue(new Error("CCTV_CAMERA_POOL_CONFLICT"));

    await expect(upsertCctvCameraPoolAction({
      objectType: "apartment",
      placement: "indoor",
      productId: "11111111-1111-1111-1111-111111111111",
      manualPriority: "high",
      enabled: true,
      eligibleForRecommended: true,
      eligibleForEconomy: false,
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
