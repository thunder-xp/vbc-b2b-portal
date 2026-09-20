import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BusinessPhoneEnrollmentAuthGateway, BusinessPhoneEnrollmentRepository } from "../enrollment.repository";
import { BusinessPhoneEnrollmentService } from "../enrollment.service";
import {
  BusinessProfilePhoneStateService,
  type BusinessProfilePhoneStateRepository,
} from "../profile-phone-state";

const challengeId = "11111111-1111-4111-8111-111111111111";
const authUserId = "22222222-2222-4222-8222-222222222222";
const phoneHash = "a".repeat(64);

describe("BusinessPhoneEnrollmentService", () => {
  let repository: BusinessPhoneEnrollmentRepository;
  let stateRepository: BusinessProfilePhoneStateRepository;
  let auth: BusinessPhoneEnrollmentAuthGateway;

  beforeEach(() => {
    repository = {
      prepare: vi.fn(async () => ({ result: "READY" as const, challengeId, expiresAt: "2026-09-20T12:10:00.000Z", isPhoneChange: false })),
      reserveSend: vi.fn(async () => true),
      reserveVerification: vi.fn(async () => true),
      complete: vi.fn(async () => true),
      fail: vi.fn(async () => undefined),
    };
    stateRepository = {
      getProfilePhone: vi.fn(async () => "+37369982220"),
      hasOperationalConflict: vi.fn(async () => false),
    };
    auth = {
      currentUser: vi.fn(async () => ({ id: authUserId, phone: null, phoneConfirmed: false })),
      requestPhoneChange: vi.fn(async () => ({ authUserId })),
      resendPhoneChange: vi.fn(async () => undefined),
      verifyPhoneChange: vi.fn(async () => ({ authUserId, phone: "37369982220", phoneConfirmed: true })),
    };
  });

  it("uses only the saved server-side Profile phone as the enrollment target", async () => {
    await expect(service().start()).resolves.toEqual({
      ok: true,
      step: "OTP",
      challengeId,
      maskedPhone: "+373 ** *** 20",
    });
    expect(stateRepository.getProfilePhone).toHaveBeenCalledWith(authUserId);
    expect(repository.prepare).toHaveBeenCalledWith({ authUserId, phoneE164: "+37369982220", phoneKeyHash: phoneHash });
    expect(auth.requestPhoneChange).toHaveBeenCalledWith("+37369982220");
  });

  it("requires the authenticated same user", async () => {
    vi.mocked(auth.currentUser).mockResolvedValue(null);
    await expect(service().start()).resolves.toEqual({ ok: false, error: "AUTH_REQUIRED" });
    expect(repository.prepare).not.toHaveBeenCalled();
  });

  it("fails closed when the saved Profile phone conflicts with another operational identity", async () => {
    vi.mocked(stateRepository.hasOperationalConflict).mockResolvedValue(true);
    await expect(service().start()).resolves.toEqual({ ok: false, error: "PHONE_CONFLICT" });
    expect(repository.prepare).not.toHaveBeenCalled();
    expect(auth.requestPhoneChange).not.toHaveBeenCalled();
  });

  it("uses phone_change verification and completes only for the same confirmed Auth user", async () => {
    await expect(service().verify(challengeId, "123456")).resolves.toEqual({ ok: true, step: "CONFIRMED" });
    expect(repository.reserveVerification).toHaveBeenCalledWith({ challengeId, authUserId, phoneE164: "+37369982220", phoneKeyHash: phoneHash });
    expect(repository.complete).toHaveBeenCalledWith({ challengeId, authUserId, phoneE164: "+37369982220", phoneKeyHash: phoneHash });

    vi.mocked(auth.verifyPhoneChange).mockResolvedValue({
      authUserId: "33333333-3333-4333-8333-333333333333",
      phone: "+37369982220",
      phoneConfirmed: true,
    });
    await expect(service().verify(challengeId, "123456")).resolves.toEqual({ ok: false, error: "UNAVAILABLE" });
    expect(repository.fail).toHaveBeenCalled();
  });

  it("rejects unconfirmed or mismatched phones after provider verification", async () => {
    vi.mocked(auth.verifyPhoneChange).mockResolvedValue({ authUserId, phone: "+37369982220", phoneConfirmed: false });
    await expect(service().verify(challengeId, "123456")).resolves.toEqual({ ok: false, error: "UNAVAILABLE" });

    vi.mocked(auth.verifyPhoneChange).mockResolvedValue({ authUserId, phone: "+37368111111", phoneConfirmed: true });
    await expect(service().verify(challengeId, "123456")).resolves.toEqual({ ok: false, error: "UNAVAILABLE" });
    expect(repository.complete).not.toHaveBeenCalled();
  });

  it("bounds enrollment sends and verification attempts", async () => {
    vi.mocked(repository.reserveSend).mockResolvedValue(false);
    await expect(service().start()).resolves.toEqual({ ok: false, error: "RATE_LIMITED" });
    expect(auth.requestPhoneChange).not.toHaveBeenCalled();

    vi.mocked(repository.reserveVerification).mockResolvedValue(false);
    await expect(service().verify(challengeId, "123456")).resolves.toEqual({ ok: false, error: "RATE_LIMITED" });
    expect(auth.verifyPhoneChange).not.toHaveBeenCalled();
  });

  function service() {
    return new BusinessPhoneEnrollmentService(
      repository,
      auth,
      () => phoneHash,
      new BusinessProfilePhoneStateService(stateRepository, auth),
    );
  }
});
