import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BusinessPhoneEnrollmentAuthGateway } from "../enrollment.repository";
import {
  BusinessProfilePhoneStateService,
  type BusinessProfilePhoneStateRepository,
} from "../profile-phone-state";

const authUserId = "22222222-2222-4222-8222-222222222222";

describe("BusinessProfilePhoneStateService", () => {
  let repository: BusinessProfilePhoneStateRepository;
  let auth: BusinessPhoneEnrollmentAuthGateway;

  beforeEach(() => {
    repository = {
      getProfilePhone: vi.fn(async () => "+37360433603"),
      hasOperationalConflict: vi.fn(async () => false),
    };
    auth = {
      currentUser: vi.fn(async () => ({ id: authUserId, phone: "37360433603", phoneConfirmed: true })),
      requestPhoneVerification: vi.fn(),
      resendPhoneVerification: vi.fn(),
      verifyPhoneVerification: vi.fn(),
    };
  });

  it("treats canonical +373 and historical 373 Auth storage as VERIFIED", async () => {
    await expect(service().resolveCurrent()).resolves.toMatchObject({
      state: "VERIFIED",
      profilePhoneE164: "+37360433603",
    });
    expect(repository.hasOperationalConflict).not.toHaveBeenCalled();
  });

  it("returns VERIFICATION_REQUIRED after the Profile phone changes", async () => {
    vi.mocked(repository.getProfilePhone).mockResolvedValue("+37368123456");
    await expect(service().resolveCurrent()).resolves.toMatchObject({
      state: "VERIFICATION_REQUIRED",
      profilePhoneE164: "+37368123456",
    });
  });

  it("returns VERIFICATION_REQUIRED when Auth phone is missing", async () => {
    vi.mocked(auth.currentUser).mockResolvedValue({ id: authUserId, phone: null, phoneConfirmed: false });
    await expect(service().resolveCurrent()).resolves.toMatchObject({ state: "VERIFICATION_REQUIRED" });
  });

  it("returns VERIFICATION_REQUIRED when the same Auth phone exists but is still unconfirmed", async () => {
    vi.mocked(auth.currentUser).mockResolvedValue({
      id: authUserId,
      phone: "37360433603",
      phoneConfirmed: false,
    });
    await expect(service().resolveCurrent()).resolves.toMatchObject({
      state: "VERIFICATION_REQUIRED",
      profilePhoneE164: "+37360433603",
    });
  });

  it("returns CONFLICT without exposing the conflicting identity", async () => {
    vi.mocked(auth.currentUser).mockResolvedValue({ id: authUserId, phone: null, phoneConfirmed: false });
    vi.mocked(repository.hasOperationalConflict).mockResolvedValue(true);
    const result = await service().resolveCurrent();
    expect(result).toMatchObject({ state: "CONFLICT" });
    expect(result).not.toHaveProperty("conflictingUserId");
  });

  it("returns NOT_SET for a missing or invalid Profile phone", async () => {
    vi.mocked(repository.getProfilePhone).mockResolvedValue(null);
    await expect(service().resolveCurrent()).resolves.toMatchObject({ state: "NOT_SET" });
    vi.mocked(repository.getProfilePhone).mockResolvedValue("not-a-phone");
    await expect(service().resolveCurrent()).resolves.toMatchObject({ state: "NOT_SET" });
  });

  function service() {
    return new BusinessProfilePhoneStateService(repository, auth);
  }
});
