import { beforeEach, describe, expect, it, vi } from "vitest";

const upsertAdmin = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../../admin/services", () => ({ requireAdminPermission: vi.fn() }));
vi.mock("../../../cctv-calculation/cctv-camera-candidate.repository", () => ({
  SupabaseCctvCameraCandidateRepository: class {
    upsertAdmin = upsertAdmin;
  },
}));
vi.mock("../../../cctv-calculation/cctv-object-configuration.repository", () => ({
  SupabaseCctvObjectConfigurationRepository: class {},
}));

import { upsertCctvCameraPoolAction } from "../cctv-camera-pools.actions";

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
});
