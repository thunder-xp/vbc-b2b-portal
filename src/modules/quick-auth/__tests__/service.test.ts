import { beforeEach, describe, expect, it, vi } from "vitest";

import type { QuickAuthOtpGateway, QuickAuthRepository } from "../repository";
import { QuickAuthResolver } from "../service";
import type { QuickAuthChallenge, QuickAuthStart } from "../types";

const challengeId = "11111111-1111-4111-8111-111111111111";
const authUserId = "22222222-2222-4222-8222-222222222222";
const phoneHash = "a".repeat(64);
const requesterHash = "b".repeat(64);

describe("QuickAuthResolver", () => {
  let repository: QuickAuthRepository;
  let otp: QuickAuthOtpGateway;

  beforeEach(() => {
    repository = {
      start: vi.fn(),
      read: vi.fn(),
      getAuthUserEmail: vi.fn(async () => "business@example.com"),
      reserveBusinessEmailAttempt: vi.fn(async () => true),
      confirmBusinessEmail: vi.fn(async () => true),
      reserveOtpSend: vi.fn(async () => true),
      reserveOtpVerification: vi.fn(async () => true),
      completeOrphanRebind: vi.fn(async () => true),
      complete: vi.fn(async () => true),
      setStatus: vi.fn(async () => true),
    };
    otp = {
      preparePhoneEnrollment: vi.fn(async () => undefined),
      send: vi.fn(async () => undefined),
      verify: vi.fn(async () => ({ authUserId })),
      establishCanonicalSession: vi.fn(async (subjectAuthUserId) => ({ authUserId: subjectAuthUserId })),
      signOut: vi.fn(async () => undefined),
    };
  });

  it("normalizes Moldova phone input server-side and starts Customer OTP without creating an account", async () => {
    vi.mocked(repository.start).mockResolvedValue(start("CUSTOMER_OTP"));

    const result = await resolver().start("069 982 220", requesterHash);

    expect(repository.start).toHaveBeenCalledWith({
      phoneE164: "+37369982220",
      phoneKeyHash: phoneHash,
      requesterKeyHash: requesterHash,
      businessPhoneOtpEnabled: false,
    });
    expect(repository.reserveOtpSend).toHaveBeenCalledWith(challengeId, phoneHash);
    expect(otp.preparePhoneEnrollment).not.toHaveBeenCalled();
    expect(otp.send).toHaveBeenCalledWith("+37369982220");
    expect(result).toEqual({ ok: true, step: "OTP", challengeId, maskedPhone: "+373 ** *** 20" });
  });

  it("returns the governed not-registered state without sending OTP", async () => {
    vi.mocked(repository.start).mockResolvedValue(start("NOT_REGISTERED"));

    await expect(resolver().start("37369982220", requesterHash)).resolves.toEqual({ ok: true, step: "NOT_REGISTERED" });
    expect(otp.send).not.toHaveBeenCalled();
  });

  it("fails eligible Business identities closed while the production identity gate is disabled", async () => {
    vi.mocked(repository.start).mockResolvedValue(start("BLOCKED"));

    await expect(resolver().start("+37369982220", requesterHash)).resolves.toEqual({ ok: true, step: "BLOCKED" });
    expect(otp.send).not.toHaveBeenCalled();
  });

  it("requires Business email before OTP for a Customer plus Business identity", async () => {
    vi.mocked(repository.start).mockResolvedValue(start("MULTIPLE_CONTEXT_EDGE_CASE", { emailRequired: true }));

    await expect(resolver(true).start("69982220", requesterHash)).resolves.toEqual({
      ok: true,
      step: "EMAIL",
      challengeId,
      maskedPhone: "+373 ** *** 20",
    });
    expect(otp.send).not.toHaveBeenCalled();
  });

  it("requires a same-user email match before sending Business OTP", async () => {
    vi.mocked(repository.start).mockResolvedValue(start("BUSINESS_EMAIL_REQUIRED", { emailRequired: true }));
    vi.mocked(repository.read).mockResolvedValue(challenge("BUSINESS_EMAIL_REQUIRED", "OPEN", { emailRequired: true }));

    await expect(resolver(true).start("69982220", requesterHash)).resolves.toEqual({
      ok: true,
      step: "EMAIL",
      challengeId,
      maskedPhone: "+373 ** *** 20",
    });
    expect(otp.send).not.toHaveBeenCalled();

    await expect(resolver(true).submitBusinessEmail(challengeId, "69982220", "wrong@example.com")).resolves.toEqual({
      ok: false,
      error: "IDENTITY_MISMATCH",
    });
    expect(otp.send).not.toHaveBeenCalled();

    await expect(resolver(true).submitBusinessEmail(challengeId, "69982220", "Business@Example.com")).resolves.toEqual({
      ok: true,
      step: "OTP",
      challengeId,
      maskedPhone: "+373 ** *** 20",
    });
    expect(repository.reserveBusinessEmailAttempt).toHaveBeenCalledTimes(2);
    expect(repository.confirmBusinessEmail).toHaveBeenCalledWith(challengeId, phoneHash);
    expect(otp.send).toHaveBeenCalledTimes(1);
  });

  it("sends combined-context OTP only after the same-user Business email match", async () => {
    vi.mocked(repository.start).mockResolvedValue(start("MULTIPLE_CONTEXT_EDGE_CASE", { emailRequired: true }));
    vi.mocked(repository.read).mockResolvedValue(challenge("MULTIPLE_CONTEXT_EDGE_CASE", "OPEN", { emailRequired: true }));

    await resolver(true).start("69982220", requesterHash);
    await expect(resolver(true).submitBusinessEmail(challengeId, "69982220", "business@example.com")).resolves.toEqual({
      ok: true,
      step: "OTP",
      challengeId,
      maskedPhone: "+373 ** *** 20",
    });
    expect(otp.send).toHaveBeenCalledTimes(1);
  });

  it("prepares an unconfirmed phone on the canonical Business user before sending OTP", async () => {
    const business = start("BUSINESS_EMAIL_REQUIRED", { emailRequired: true, recoveryKind: "PHONE_ENROLLMENT" });
    vi.mocked(repository.start).mockResolvedValue(business);
    vi.mocked(repository.read).mockResolvedValue(challenge("BUSINESS_EMAIL_REQUIRED", "OPEN", {
      emailRequired: true,
      recoveryKind: "PHONE_ENROLLMENT",
    }));

    await resolver(true).start("69982220", requesterHash);
    await resolver(true).submitBusinessEmail(challengeId, "69982220", "business@example.com");

    expect(otp.preparePhoneEnrollment).toHaveBeenCalledWith(authUserId, "+37369982220");
    expect(otp.send).toHaveBeenCalledWith("+37369982220");
  });

  it("rejects forged or expired challenges before provider verification", async () => {
    vi.mocked(repository.read).mockResolvedValue(null);

    await expect(resolver().verify(challengeId, "69982220", "123456")).resolves.toEqual({ ok: false, error: "EXPIRED" });
    await expect(resolver().verify("not-a-uuid", "69982220", "123456")).resolves.toEqual({ ok: false, error: "EXPIRED" });
    expect(otp.verify).not.toHaveBeenCalled();
  });

  it("bounds OTP send and verification attempts in server-owned challenge state", async () => {
    vi.mocked(repository.start).mockResolvedValue(start("CUSTOMER_OTP"));
    vi.mocked(repository.reserveOtpSend).mockResolvedValue(false);

    await expect(resolver().start("69982220", requesterHash)).resolves.toEqual({ ok: false, error: "RATE_LIMITED" });
    expect(otp.send).not.toHaveBeenCalled();

    vi.mocked(repository.read).mockResolvedValue(challenge("CUSTOMER_OTP", "OTP_SENT"));
    vi.mocked(repository.reserveOtpVerification).mockResolvedValue(false);
    await expect(resolver().verify(challengeId, "69982220", "123456")).resolves.toEqual({ ok: false, error: "RATE_LIMITED" });
    expect(otp.verify).not.toHaveBeenCalled();
  });

  it("accepts OTP only when Supabase returns the exact challenge Auth user", async () => {
    vi.mocked(repository.read).mockResolvedValue(challenge("CUSTOMER_OTP", "OTP_SENT"));

    await expect(resolver().verify(challengeId, "69982220", "123456")).resolves.toEqual({
      ok: true,
      step: "OTP",
      challengeId,
      maskedPhone: "+373 ** *** 20",
    });
    expect(repository.complete).toHaveBeenCalledWith(challengeId, phoneHash, "+37369982220");
    expect(otp.signOut).not.toHaveBeenCalled();

    vi.mocked(otp.verify).mockResolvedValue({ authUserId: "33333333-3333-4333-8333-333333333333" });
    await expect(resolver().verify(challengeId, "69982220", "123456")).resolves.toEqual({ ok: false, error: "UNAVAILABLE" });
    expect(otp.signOut).toHaveBeenCalled();
    expect(repository.setStatus).toHaveBeenCalledWith(challengeId, phoneHash, "FAILED");
  });

  it("uses an orphan session only as phone-possession proof and establishes the canonical Partner session", async () => {
    const orphanUserId = "33333333-3333-4333-8333-333333333333";
    vi.mocked(repository.read).mockResolvedValue(challenge("BUSINESS_EMAIL_REQUIRED", "OTP_SENT", {
      emailRequired: true,
      recoveryKind: "ORPHAN_REBIND",
      otpSubjectAuthUserId: orphanUserId,
    }));
    vi.mocked(otp.verify).mockResolvedValue({ authUserId: orphanUserId });

    await expect(resolver(true).verify(challengeId, "69982220", "123456")).resolves.toEqual({
      ok: true,
      step: "OTP",
      challengeId,
      maskedPhone: "+373 ** *** 20",
    });

    expect(otp.signOut).toHaveBeenCalledTimes(1);
    expect(repository.completeOrphanRebind).toHaveBeenCalledWith({
      challengeId,
      phoneE164: "+37369982220",
      phoneKeyHash: phoneHash,
      proofAuthUserId: orphanUserId,
    });
    expect(otp.establishCanonicalSession).toHaveBeenCalledWith(authUserId);
    expect(repository.complete).toHaveBeenCalledWith(challengeId, phoneHash, "+37369982220");
  });

  it("never rebinds an orphan without successful OTP proof", async () => {
    const orphanUserId = "33333333-3333-4333-8333-333333333333";
    vi.mocked(repository.read).mockResolvedValue(challenge("BUSINESS_EMAIL_REQUIRED", "OTP_SENT", {
      emailRequired: true,
      recoveryKind: "ORPHAN_REBIND",
      otpSubjectAuthUserId: orphanUserId,
    }));
    vi.mocked(otp.verify).mockRejectedValue(new Error("invalid otp"));

    await expect(resolver(true).verify(challengeId, "69982220", "123456")).resolves.toEqual({
      ok: false,
      error: "INVALID_CODE",
    });
    expect(repository.completeOrphanRebind).not.toHaveBeenCalled();
    expect(otp.establishCanonicalSession).not.toHaveBeenCalled();
  });

  function resolver(businessPhoneOtpEnabled = false) {
    return new QuickAuthResolver(repository, otp, () => phoneHash, businessPhoneOtpEnabled);
  }
});

function start(
  resolution: QuickAuthStart["resolution"],
  overrides: Partial<QuickAuthStart> = {},
): QuickAuthStart {
  return {
    challengeId,
    resolution,
    subjectAuthUserId: authUserId,
    otpSubjectAuthUserId: authUserId,
    emailRequired: false,
    recoveryKind: "DIRECT",
    phoneRebound: false,
    expiresAt: "2026-09-20T12:10:00.000Z",
    maskedPhone: "+373 ** *** 20",
    ...overrides,
  };
}

function challenge(
  resolution: QuickAuthChallenge["resolution"],
  status: QuickAuthChallenge["status"],
  overrides: Partial<QuickAuthChallenge> = {},
): QuickAuthChallenge {
  return {
    challengeId,
    resolution,
    status,
    subjectAuthUserId: authUserId,
    otpSubjectAuthUserId: authUserId,
    emailRequired: false,
    recoveryKind: "DIRECT",
    phoneRebound: false,
    expiresAt: "2026-09-20T12:10:00.000Z",
    ...overrides,
  };
}
