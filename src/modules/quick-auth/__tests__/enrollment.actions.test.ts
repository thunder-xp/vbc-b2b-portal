import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUserId: vi.fn(),
  getCurrentProfile: vi.fn(),
  updateOwnProfile: vi.fn(),
  start: vi.fn(),
}));

vi.mock("@/src/modules/access-control/actions/service-factory", () => ({
  getAuthenticatedUserId: mocks.getAuthenticatedUserId,
  createUserProfileService: () => ({
    getCurrentProfile: mocks.getCurrentProfile,
    updateOwnProfile: mocks.updateOwnProfile,
  }),
}));

vi.mock("../enrollment.factory", () => ({
  createBusinessPhoneEnrollmentService: () => ({ start: mocks.start }),
}));

import { saveBusinessProfileAction } from "../enrollment.actions";

const baseProfile = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "partner@example.test",
  fullName: "Old Name",
  phone: "+37369000266",
  status: "active",
  createdAt: "2026-09-20T10:00:00.000Z",
  updatedAt: "2026-09-20T10:00:00.000Z",
};

describe("saveBusinessProfileAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedUserId.mockResolvedValue(baseProfile.id);
    mocks.getCurrentProfile.mockResolvedValue(baseProfile);
    mocks.updateOwnProfile.mockImplementation(async (_userId: string, input: { fullName?: string | null; phone?: string | null }) => ({
      ...baseProfile,
      fullName: Object.hasOwn(input, "fullName") ? input.fullName ?? null : baseProfile.fullName,
      phone: Object.hasOwn(input, "phone") ? input.phone ?? null : baseProfile.phone,
    }));
    mocks.start.mockResolvedValue({
      ok: true,
      step: "OTP",
      challengeId: "22222222-2222-4222-8222-222222222222",
      maskedPhone: "+373*****717",
    });
  });

  it("saves ordinary profile fields without starting phone verification when the phone is unchanged", async () => {
    await expect(saveBusinessProfileAction({
      fullName: "New Name",
      targetPhone: "+373 69 000 266",
    })).resolves.toMatchObject({
      success: true,
      message: "PROFILE_SAVED",
      profile: { fullName: "New Name", phone: "+37369000266" },
      phoneVerification: null,
    });
    expect(mocks.updateOwnProfile).toHaveBeenCalledWith(baseProfile.id, { fullName: "New Name" });
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("passes the exact canonical submitted change target and keeps the old projection pending OTP", async () => {
    await expect(saveBusinessProfileAction({
      fullName: "New Name",
      targetPhone: "+373 69 000 717",
    })).resolves.toMatchObject({
      success: true,
      message: "PHONE_VERIFICATION_REQUIRED",
      profile: { fullName: "New Name", phone: "+37369000266" },
      phoneVerification: { ok: true, step: "OTP", maskedPhone: "+373*****717" },
    });
    expect(mocks.start).toHaveBeenCalledWith("+37369000717");
    expect(mocks.updateOwnProfile).toHaveBeenCalledTimes(1);
  });

  it("updates the profile projection only after the enrollment service proves confirmation", async () => {
    mocks.start.mockResolvedValue({ ok: true, step: "CONFIRMED" });
    await expect(saveBusinessProfileAction({
      fullName: "New Name",
      targetPhone: "+37369000717",
    })).resolves.toMatchObject({
      success: true,
      profile: { phone: "+37369000717" },
    });
    expect(mocks.updateOwnProfile).toHaveBeenNthCalledWith(1, baseProfile.id, { fullName: "New Name" });
    expect(mocks.updateOwnProfile).toHaveBeenNthCalledWith(2, baseProfile.id, { phone: "+37369000717" });
  });
});
