import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BusinessPhoneEnrollmentAuthGateway, BusinessPhoneEnrollmentRepository } from "../enrollment.repository";
import { BusinessPhoneEnrollmentService } from "../enrollment.service";

const challengeId = "11111111-1111-4111-8111-111111111111";
const authUserId = "22222222-2222-4222-8222-222222222222";
const phoneHash = "a".repeat(64);

describe("BusinessPhoneEnrollmentService", () => {
  let repository: BusinessPhoneEnrollmentRepository;
  let auth: BusinessPhoneEnrollmentAuthGateway;

  beforeEach(() => {
    repository = {
      prepare: vi.fn(async () => ({ result: "READY" as const, challengeId, expiresAt: "2026-09-20T12:10:00.000Z", isPhoneChange: false })),
      reserveSend: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0, reason: null })),
      readTarget: vi.fn(async () => ({
        status: "OTP_SENT" as const,
        phoneE164: "+37369000717",
        phoneKeyHash: phoneHash,
        targetPhoneSuffix: "717",
        isPhoneChange: false,
        expiresAt: "2026-09-25T13:00:00.000Z",
      })),
      reserveVerification: vi.fn(async () => true),
      complete: vi.fn(async () => true),
      fail: vi.fn(async () => undefined),
      recordVerification: vi.fn(async () => undefined),
    };
    auth = {
      currentUser: vi.fn(async () => ({ id: authUserId, phone: null, phoneConfirmed: false })),
      requestPhoneVerification: vi.fn(async () => ({ authUserId })),
      resendPhoneVerification: vi.fn(async () => undefined),
      verifyPhoneVerification: vi.fn(async () => ({ authUserId, phone: "37369000717", phoneConfirmed: true })),
    };
  });

  it("preserves the submitted target instead of re-reading Profile phone", async () => {
    await expect(service().start("+373 69 000 717")).resolves.toEqual({
      ok: true,
      step: "OTP",
      challengeId,
      maskedPhone: "+373*****717",
    });
    expect(repository.prepare).toHaveBeenCalledWith({ authUserId, phoneE164: "+37369000717", phoneKeyHash: phoneHash });
    expect(auth.requestPhoneVerification).toHaveBeenCalledWith("+37369000717");
  });

  it("requires the authenticated same user", async () => {
    vi.mocked(auth.currentUser).mockResolvedValue(null);
    await expect(service().start("+37369000717")).resolves.toEqual({ ok: false, error: "AUTH_REQUIRED" });
    expect(repository.prepare).not.toHaveBeenCalled();
  });

  it("fails closed when the submitted phone conflicts with another operational identity", async () => {
    vi.mocked(repository.prepare).mockResolvedValue({ result: "CONFLICT" });
    await expect(service().start("+37369000717")).resolves.toEqual({ ok: false, error: "PHONE_CONFLICT" });
    expect(repository.prepare).toHaveBeenCalledTimes(1);
    expect(auth.requestPhoneVerification).not.toHaveBeenCalled();
  });

  it("uses the phone-change verification contract and completes only for the same confirmed Auth user", async () => {
    await expect(service().verify(challengeId, "123456")).resolves.toEqual({ ok: true, step: "CONFIRMED" });
    expect(auth.verifyPhoneVerification).toHaveBeenCalledWith("+37369000717", "123456");
    expect(repository.reserveVerification).toHaveBeenCalledWith(expect.objectContaining({ challengeId, authUserId, phoneE164: "+37369000717", phoneKeyHash: phoneHash }));
    expect(repository.complete).toHaveBeenCalledWith(expect.objectContaining({ challengeId, authUserId, phoneE164: "+37369000717", phoneKeyHash: phoneHash }));
    expect(repository.recordVerification).toHaveBeenCalledWith({ challengeId, authUserId, phoneKeyHash: phoneHash, state: "VERIFIED", safeErrorCode: null });

    vi.mocked(auth.verifyPhoneVerification).mockResolvedValue({
      authUserId: "33333333-3333-4333-8333-333333333333",
      phone: "+37369000717",
      phoneConfirmed: true,
    });
    await expect(service().verify(challengeId, "123456")).resolves.toEqual({ ok: false, error: "UNAVAILABLE" });
    expect(repository.fail).toHaveBeenCalled();
  });

  it("uses the same phone-change contract for an already confirmed different phone", async () => {
    vi.mocked(repository.prepare).mockResolvedValue({
      result: "READY",
      challengeId,
      expiresAt: "2026-09-20T12:10:00.000Z",
      isPhoneChange: true,
    });
    await expect(service().start("+37369000717")).resolves.toMatchObject({ ok: true, step: "OTP" });
    expect(auth.requestPhoneVerification).toHaveBeenCalledWith("+37369000717");
  });

  it("uses explicit resend and never replays the phone update", async () => {
    await expect(service().resend(challengeId)).resolves.toMatchObject({ ok: true, step: "OTP" });
    expect(auth.resendPhoneVerification).toHaveBeenCalledWith("+37369000717");
    expect(auth.requestPhoneVerification).not.toHaveBeenCalled();
  });

  it("rejects unconfirmed or mismatched phones after provider verification", async () => {
    vi.mocked(auth.verifyPhoneVerification).mockResolvedValue({ authUserId, phone: "+37369000717", phoneConfirmed: false });
    await expect(service().verify(challengeId, "123456")).resolves.toEqual({ ok: false, error: "UNAVAILABLE" });

    vi.mocked(auth.verifyPhoneVerification).mockResolvedValue({ authUserId, phone: "+37368111111", phoneConfirmed: true });
    await expect(service().verify(challengeId, "123456")).resolves.toEqual({ ok: false, error: "UNAVAILABLE" });
    expect(repository.complete).not.toHaveBeenCalled();
  });

  it("bounds enrollment sends and verification attempts", async () => {
    vi.mocked(repository.reserveSend).mockResolvedValue({ allowed: false, retryAfterSeconds: 37, reason: "RATE_LIMITED" });
    await expect(service().start("+37369000717")).resolves.toEqual({ ok: false, error: "RATE_LIMITED", retryAfterSeconds: 37 });
    expect(auth.requestPhoneVerification).not.toHaveBeenCalled();

    vi.mocked(repository.reserveVerification).mockResolvedValue(false);
    await expect(service().verify(challengeId, "123456")).resolves.toEqual({ ok: false, error: "RATE_LIMITED" });
    expect(auth.verifyPhoneVerification).not.toHaveBeenCalled();
  });

  function service() {
    return new BusinessPhoneEnrollmentService(
      repository,
      auth,
      () => phoneHash,
    );
  }
});
