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
      resolvePhone: vi.fn(async () => ({ source: "USER_PROFILE" as const, phoneE164: "+37360433603" })),
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
    vi.mocked(repository.resolvePhone).mockResolvedValue({ source: "USER_PROFILE", phoneE164: "+37368123456" });
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
    vi.mocked(repository.resolvePhone).mockResolvedValue({ source: "NONE", phoneE164: null });
    await expect(service().resolveCurrent()).resolves.toMatchObject({ state: "NOT_SET" });
    vi.mocked(repository.resolvePhone).mockResolvedValue({ source: "USER_PROFILE", phoneE164: "not-a-phone" });
    await expect(service().resolveCurrent()).resolves.toMatchObject({ state: "NOT_SET" });
  });

  it("resolves the MD-P-002 Agent-only regression without a user profile phone", async () => {
    vi.mocked(repository.resolvePhone).mockResolvedValue({ source: "COMMERCIAL_AGENT", phoneE164: "+37369256733" });
    vi.mocked(auth.currentUser).mockResolvedValue({ id: authUserId, phone: null, phoneConfirmed: false });
    await expect(service().resolveCurrent()).resolves.toMatchObject({ state: "VERIFICATION_REQUIRED", profilePhoneE164: "+37369256733" });
    expect(repository.resolvePhone).toHaveBeenCalledWith(authUserId);
  });

  it.each(["COMMERCIAL_AGENT", "MATCHING_MULTI_CONTEXT"] as const)("requires verified Auth evidence for %s", async (source) => {
    vi.mocked(repository.resolvePhone).mockResolvedValue({ source, phoneE164: "+37369256733" });
    vi.mocked(auth.currentUser).mockResolvedValue({ id: authUserId, phone: "37369256733", phoneConfirmed: true });
    await expect(service().resolveCurrent()).resolves.toMatchObject({ state: "VERIFIED" });
    vi.mocked(repository.resolvePhone).mockResolvedValue({ source, phoneE164: "+37368123456" });
    await expect(service().resolveCurrent()).resolves.toMatchObject({ state: "VERIFICATION_REQUIRED", profilePhoneE164: "+37368123456" });
  });

  it("fails closed for a context-source conflict even when Auth is already confirmed", async () => {
    vi.mocked(repository.resolvePhone).mockResolvedValue({ source: "CONFLICT", phoneE164: null });
    await expect(service().resolveCurrent()).resolves.toMatchObject({ state: "CONFLICT", profilePhoneE164: null });
    expect(repository.hasOperationalConflict).not.toHaveBeenCalled();
  });

  function service() {
    return new BusinessProfilePhoneStateService(repository, auth);
  }
});
